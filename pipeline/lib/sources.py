"""Source discovery.

CBO publishes each vintage as a NEW FILENAME (annual_fy_2026-02.csv), it does not
update the old one. Hardcoding a path means the pipeline quietly serves stale
data forever while reporting success, so the vintage is always discovered and
always recorded in the output's _meta.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import SourceUnavailable
from .fetch import fetch_json

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
