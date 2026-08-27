"""Treasury International Capital: Major Foreign Holders of Treasury Securities.

TIC publishes the country-level holdings table as a tab-separated text file, one
twelve-month block per year, most recent year first. That makes it a PRIMARY
source the pipeline can read directly -- which matters, because the figures it
supplies reached the site through a news outlet's paraphrase of the same release
until #54, and the paraphrase had already drifted from the release ($889B for
the UK matches no TIC month in 2025).

Two rules this module exists to enforce:

1. The release month is PINNED by curated YAML and DISCOVERED as a column, never
   taken as "whatever is newest". TIC revises monthly, so auto-adopting the
   latest release turns every upstream publication into an unreviewed editorial
   change to a published figure. `major_foreign_holders` is asked for a month
   and fails if the file does not carry it.
2. Nothing is skipped silently. A missing month, a missing country row, a
   missing Grand Total or a cell that is not a number all raise
   SourceUnavailable -- `fetch.py`'s rule 1 posture, applied to the parser. An
   empty parse is a failure, never "no rows".

Deliberately narrow: it returns three countries and the grand total and nothing
else. `mfhhis01.txt` carries no Federal Reserve row and this module gives no
code path by which one could reach an output, so the deliberate omission
recorded in curated/discrepancies.yaml -> federal_reserve_holdings is safe from
the fetch that #54 introduces.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import SourceUnavailable
from .fetch import fetch

SOURCE = "Treasury International Capital, Major Foreign Holders of Treasury Securities"
MFH_URL = "https://ticdata.treasury.gov/Publish/mfhhis01.txt"

# The observed body is ~99.5 kB. A truncated response that lopped off the most
# recent year's block would parse cleanly as "the pinned month is not published
# yet", so the floor is set from the observed size rather than left at 1
# (fetch.py rule 2). Half the body is generous enough to survive an ordinary
# month being added and strict enough to catch a truncation.
MIN_BYTES = 50_000

# NOT `mfh.txt`. Both `ticdata.treasury.gov/Publish/mfh.txt` and the
# resource-center copy of it serve a January-2023 vintage, so a fetcher pointed
# at either would publish three-year-old figures while reporting success.

# TIC's row label -> the country name this site publishes. A closed set of
# three: no other row in the file can reach an output.
COUNTRIES = {
    "Japan": "Japan",
    "United Kingdom": "United Kingdom",
    "China, Mainland": "China",
}
GRAND_TOTAL = "Grand Total"

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        start=1,
    )
}
_YEAR = re.compile(r"^(?:19|20)\d{2}$")
VINTAGE_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


@dataclass(frozen=True)
class TicRelease:
    """One month's column of the Major Foreign Holders table."""

    vintage: str  # "2025-11"
    holdings: dict[str, float]  # published country name -> $ billions
    grand_total_b: float
    retrieved_at: str


def _cells(line: str) -> list[str]:
    """One line as trimmed cells. `"China, Mainland"` is quoted in the file
    because the label contains the delimiter's neighbour, a comma; the quotes
    are the file's, not the value's."""
    return [c.strip().strip('"').strip() for c in line.split("\t")]


def _blocks(text: str) -> list[tuple[dict[str, int], dict[str, list[str]]]]:
    """Every year block as (month -> column index, row label -> cells).

    A block opens on a line whose first cell is `Country`; the rest of that line
    repeats the year, and the line ABOVE it carries the month abbreviations in
    the same column order. Both are read rather than assumed, so a file that
    reorders its months or adds a year keeps working and a file that stops
    carrying them fails to resolve any vintage at all.
    """
    lines = text.splitlines()
    blocks: list[tuple[dict[str, int], dict[str, list[str]]]] = []
    columns: dict[str, int] | None = None
    rows: dict[str, list[str]] = {}

    for i, line in enumerate(lines):
        cells = _cells(line)
        if cells and cells[0] == "Country":
            months = _cells(lines[i - 1]) if i else []
            columns = {}
            for idx in range(1, len(cells)):
                month = months[idx] if idx < len(months) else ""
                if _YEAR.match(cells[idx]) and month in _MONTHS:
                    columns[f"{cells[idx]}-{_MONTHS[month]:02d}"] = idx
            rows = {}
            blocks.append((columns, rows))
            continue
        if columns is None or not cells or not cells[0]:
            continue
        # First occurrence wins: a label repeated within one block would
        # otherwise let a later, differently-scoped row overwrite the real one.
        rows.setdefault(cells[0], cells)

    return blocks


def _amount(rows: dict[str, list[str]], label: str, col: int, vintage: str, url: str) -> float:
    row = rows.get(label)
    if row is None:
        raise SourceUnavailable(
            SOURCE, url,
            f"the {vintage} block has no {label!r} row; refusing to publish a holdings "
            f"table with a country silently missing",
        )
    cell = row[col] if col < len(row) else ""
    if not cell:
        raise SourceUnavailable(
            SOURCE, url, f"{label!r} has no value for {vintage}; an empty cell is not a zero",
        )
    try:
        return float(cell.replace(",", ""))
    except ValueError as exc:
        raise SourceUnavailable(
            SOURCE, url, f"{label!r} reads {cell!r} for {vintage}, which is not a number",
        ) from exc


def read_release(text: str, vintage: str, *, retrieved_at: str, url: str = MFH_URL) -> TicRelease:
    """Select one month's column from an already-fetched MFH table.

    Split from `major_foreign_holders` so the parser is exercised by unit tests
    without a network call or a builder -- the shape `lib/xlsx.py` establishes.
    """
    if not VINTAGE_RE.match(vintage):
        raise ValueError(f"tic: vintage must be YYYY-MM, got {vintage!r}")

    blocks = _blocks(text)
    if not blocks:
        raise SourceUnavailable(
            SOURCE, url,
            "no 'Country' header row was found; the file's shape has changed and nothing "
            "was parsed. An empty parse is a failure, never 'no rows'",
        )

    matched = [(cols, rows) for cols, rows in blocks if vintage in cols]
    if not matched:
        published = sorted({v for cols, _ in blocks for v in cols})
        span = f"{published[0]} to {published[-1]}" if published else "no months at all"
        raise SourceUnavailable(
            SOURCE, url,
            f"no column for {vintage}; the file publishes {span}. The release month is "
            f"pinned in curated/snapshots.yaml (debt_holders.tic_vintage) and moving it "
            f"is an editorial act, so this is not auto-corrected",
        )

    columns, rows = matched[0]
    col = columns[vintage]
    holdings = {
        published: _amount(rows, label, col, vintage, url)
        for label, published in COUNTRIES.items()
    }
    return TicRelease(
        vintage=vintage,
        holdings=holdings,
        grand_total_b=_amount(rows, GRAND_TOTAL, col, vintage, url),
        retrieved_at=retrieved_at,
    )


def major_foreign_holders(vintage: str, *, use_cache: bool = True) -> TicRelease:
    """Fetch the MFH table and return the pinned month's column, or raise.

    Goes through `lib.fetch.fetch` -- the one HTTP core (#40). No second client,
    no retry loop, no fallback to a stale mirror.
    """
    resp = fetch(MFH_URL, source=SOURCE, min_bytes=MIN_BYTES, use_cache=use_cache)
    return read_release(resp.text, vintage, retrieved_at=resp.retrieved_at, url=resp.url)
