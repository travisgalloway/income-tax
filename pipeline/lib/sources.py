"""Source discovery.

CBO publishes each vintage as a NEW FILENAME (annual_fy_2026-02.csv), it does not
update the old one. Hardcoding a path means the pipeline quietly serves stale
data forever while reporting success, so the vintage is always discovered and
always recorded in the output's _meta.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from .errors import SourceUnavailable
from .fetch import TIMEOUT, USER_AGENT, fetch, fetch_json

CBO_REPO = "US-CBO/cbo-data"
CBO_RAW = f"https://raw.githubusercontent.com/{CBO_REPO}/main/"
_TREE_URL = f"https://api.github.com/repos/{CBO_REPO}/git/trees/main?recursive=1"

# dataset key -> directory within the CBO repo
CBO_DATASETS = {
    "historical_budget": "data/budget/historical_budget",
    "historical_economic": "data/economic/historical_economic",
    "revenue_detail_fy": "data/budget/revenue_detail",
    "tax_parameters": "data/budget/tax_parameters",
}

_VINTAGE_RE = re.compile(r"_(\d{4})-(\d{2})\.csv$")


@dataclass(frozen=True)
class Vintage:
    dataset: str
    path: str
    vintage: str  # "2026-02"

    @property
    def url(self) -> str:
        return CBO_RAW + self.path


def _tree() -> list[str]:
    data = fetch_json(_TREE_URL, source="CBO repo tree", min_bytes=1000)
    if not isinstance(data, dict) or "tree" not in data:
        raise SourceUnavailable("CBO repo tree", _TREE_URL, "unexpected payload shape")
    paths = [e["path"] for e in data["tree"] if e.get("type") == "blob"]
    if not paths:
        raise SourceUnavailable("CBO repo tree", _TREE_URL, "tree contained no files")
    return paths


def latest_cbo_vintage(dataset: str, *, prefix: str = "annual_fy_") -> Vintage:
    """Return the newest vintage for a CBO dataset, or raise."""
    if dataset not in CBO_DATASETS:
        raise KeyError(f"unknown CBO dataset {dataset!r}")
    directory = CBO_DATASETS[dataset]

    candidates: list[tuple[str, str]] = []
    for path in _tree():
        if not path.startswith(directory + "/"):
            continue
        name = path.rsplit("/", 1)[-1]
        if not name.startswith(prefix):
            continue
        m = _VINTAGE_RE.search(name)
        if m:
            candidates.append((f"{m.group(1)}-{m.group(2)}", path))

    if not candidates:
        raise SourceUnavailable(
            f"CBO {dataset}",
            CBO_RAW + directory,
            f"no files matching {prefix}*_YYYY-MM.csv; the repo layout may have changed",
        )

    vintage, path = max(candidates)
    return Vintage(dataset=dataset, path=path, vintage=vintage)


# ---- IRS SOI Data Book Table 5, gross collections by state ------------------
#
# The basename convention changed between vintages (FY2024 "24dbs01t05co.xlsx",
# FY2025 "25db-1-05-co.xlsx"). A hardcoded path would silently keep serving a
# stale vintage the day IRS renames the file again, exactly the failure
# `latest_cbo_vintage` already guards against for CBO. So this scrapes the
# landing page for every linked `.xlsx` and picks the newest by the leading
# two-digit fiscal year in the basename. Only `.xlsx` is considered: openpyxl
# cannot read the legacy `.xls` binary format older vintages use.

IRS_TABLE5_LANDING = (
    "https://www.irs.gov/statistics/soi-tax-stats-gross-collections-by-type-of-tax-and-state-irs-data-book-table-5"
)
IRS_PUB_BASE = "https://www.irs.gov"
_IRS_XLSX_RE = re.compile(r'href="(/pub/irs-soi/(\d{2})db[^"]*\.xlsx)"')


@dataclass(frozen=True)
class FileVintage:
    """A discovered file plus the fiscal (or survey) year it belongs to."""

    url: str
    fy: int


def latest_irs_table5() -> FileVintage:
    resp = fetch(IRS_TABLE5_LANDING, source="IRS SOI Table 5 landing page", min_bytes=10_000)
    matches = _IRS_XLSX_RE.findall(resp.text)
    if not matches:
        raise SourceUnavailable(
            "IRS SOI Table 5", IRS_TABLE5_LANDING,
            "no linked .xlsx found; the landing page layout may have changed",
        )
    candidates = [(2000 + int(yy), path) for path, yy in matches]
    fy, path = max(candidates)
    return FileVintage(url=IRS_PUB_BASE + path, fy=fy)


# ---- Census Annual Survey of State Government Tax Collections (STC) ---------
#
# Published as one directory per survey year under .../stc/tables/. A new year
# lands as a new directory; the transposed detailed table's filename embeds the
# year it covers. Discovery walks the index newest-first and takes the first
# year whose transposed workbook actually fetches, rather than assuming the
# newest directory listed is populated.

CENSUS_STC_INDEX = "https://www2.census.gov/programs-surveys/stc/tables/"
_CENSUS_YEAR_DIR_RE = re.compile(r'href="(\d{4})/"')


def latest_census_stc() -> FileVintage:
    resp = fetch(CENSUS_STC_INDEX, source="Census STC table index", min_bytes=500)
    years = sorted({int(y) for y in _CENSUS_YEAR_DIR_RE.findall(resp.text)}, reverse=True)
    if not years:
        raise SourceUnavailable(
            "Census STC table index", CENSUS_STC_INDEX,
            "no year directories found; the index layout may have changed",
        )

    for year in years:
        url = f"{CENSUS_STC_INDEX}{year}/FY{year}-STC-Detailed-Table-Transposed.xlsx"
        try:
            with httpx.Client(
                timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT},
            ) as client:
                r = client.head(url)
            if r.status_code == 200:
                return FileVintage(url=url, fy=year)
        except httpx.HTTPError:
            continue

    raise SourceUnavailable(
        "Census STC table index", CENSUS_STC_INDEX,
        f"none of the listed years {years[:5]}... has a fetchable transposed table",
    )
