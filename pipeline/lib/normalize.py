"""Parsing helpers for the CBO long-format CSVs.

Every CBO file is (date, variable, value[, estimate_type][, section]). The date
is "FY1995" or "CY2022". Values are $ millions or index points or percent
depending on the variable, which is why nothing here guesses units: callers name
the variables they want and state what they are.
"""

from __future__ import annotations

import csv
import io
from typing import Any

from .errors import SourceUnavailable

Table = dict[int, dict[str, float]]


def parse_cbo(text: str, *, source: str, url: str) -> tuple[Table, dict[int, str]]:
    """Return {year: {variable: value}} plus {year: estimate_type} when present."""
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise SourceUnavailable(source, url, "CSV parsed to zero rows")
    if "date" not in rows[0] or "variable" not in rows[0]:
        raise SourceUnavailable(
            source, url, f"unexpected columns {list(rows[0])}; CBO layout may have changed"
        )

    table: Table = {}
    estimates: dict[int, str] = {}
    for r in rows:
        raw_date = r["date"]
        if len(raw_date) < 6 or not raw_date[2:].isdigit():
            continue
        year = int(raw_date[2:])
        try:
            value = float(r["value"])
        except (TypeError, ValueError):
            continue  # genuinely blank cells; not a fetch failure
        table.setdefault(year, {})[r["variable"]] = value
        if r.get("estimate_type"):
            estimates[year] = r["estimate_type"]

    if not table:
        raise SourceUnavailable(source, url, "no parseable rows; refusing to emit empty data")
    return table, estimates


def require(table: Table, year: int, variable: str, *, source: str) -> float:
    """Read a variable, or fail. A missing series is never treated as zero."""
    try:
        return table[year][variable]
    except KeyError as exc:
        raise SourceUnavailable(
            source, "(parsed table)",
            f"{source} has no {variable!r} for {year}; a renamed or dropped series "
            "must fail the run rather than chart as zero",
        ) from exc


def t(billions: float) -> float:
    """CBO dollar series are $ BILLIONS. The site works in $ trillions.

    Verified against FY1995: outlays_mandatory_programmatic = 817.507 -> $0.818T,
    which matches the hand-checked legacy value.
    """
    return round(billions / 1_000, 6)


def r3(x: float) -> float:
    return round(x, 3)


def r2(x: float) -> float:
    return round(x, 2)


def clean(x: Any) -> Any:
    return x
