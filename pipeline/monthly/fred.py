"""Household income and inequality, from Census via FRED.

Two series with different starts and different UNITS OF OBSERVATION, which is the
trap SOURCES.md flags: the Gini here is for FAMILIES (GINIALLRF, 1947 onward),
not households. Household Ginis run 0.47-0.49 and a chart that omits the word
"families" will be corrected by the first reader who knows that.
"""

from __future__ import annotations

import csv
import io
from typing import Any

from lib import curated, emit
from lib.errors import SourceUnavailable
from lib.fetch import fetch

GEN = "monthly/fred.py"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="

SERIES = {
    "mhi": ("MEHOINUSA672N", "real median household income, 2024 dollars"),
    "gini": ("GINIALLRF", "family Gini index, ratio"),
}


def _series(series_id: str, label: str) -> dict[int, float]:
    resp = fetch(FRED + series_id, source=f"FRED {series_id}", min_bytes=300)
    rows = list(csv.reader(io.StringIO(resp.text)))
    if len(rows) < 2:
        raise SourceUnavailable(f"FRED {series_id}", FRED + series_id, "no observations")
    out: dict[int, float] = {}
    for r in rows[1:]:
        if len(r) < 2:
            continue
        try:
            out[int(r[0][:4])] = float(r[1])
        except ValueError:
            continue  # FRED writes "." for missing observations
    if not out:
        raise SourceUnavailable(
            f"FRED {series_id}", FRED + series_id,
            "parsed zero observations; refusing to emit an empty series",
        )
    return out


def build(dry_run: bool = False) -> list[str]:
    mhi = _series(*SERIES["mhi"])
    gini = _series(*SERIES["gini"])
    top = {int(k): v for k, v in curated._load("top_rates")["top_marginal_rate"].items()}

    years = sorted(set(mhi) | set(gini) | set(top))
    rows: list[dict[str, Any]] = [
        {
            "y": y,
            # None means "this series does not cover this year", never zero.
            "mhi": mhi.get(y),
            "gini": gini.get(y),
            "top": top.get(y),
        }
        for y in years
    ]

    res = curated.discrepancies()["gini_series"]
    meta = emit.build_meta(
        "income_inequality", generator=GEN,
        coverage={
            "start": years[0], "end": years[-1],
            "mhi": {"start": min(mhi), "end": max(mhi)},
            "gini": {"start": min(gini), "end": max(gini)},
            "top": {"start": min(top), "end": max(top)},
        },
        extra={"gini_basis": res["use"]["basis"], "gini_rule": res["rule"]},
    )
    emit.write("income_inequality", meta, rows, dry_run=dry_run)
    return ["income_inequality"]
