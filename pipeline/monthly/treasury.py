"""Debt series from Treasury fiscaldata.

Two distinct things, which the site must never conflate:
  - GROSS debt outstanding at fiscal year end (debt_outstanding)
  - the public / intragovernmental split of gross debt (debt_to_penny)

SOURCES.md is emphatic that share-of-gross and share-of-public are different
denominators. Both are recorded here with the denominator named in the field.
"""

from __future__ import annotations

from typing import Any

from lib import curated, emit
from lib.errors import SourceUnavailable
from lib.fetch import fetch, fetch_json
from lib.normalize import parse_cbo
from lib.sources import latest_cbo_vintage

GEN = "monthly/treasury.py"
API = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
FIRST_FY = 1995
THRESHOLD_T = 40.0


def _paged(endpoint: str, *, fields: str, sort: str, source: str, page_size: int = 10000) -> list[dict]:
    url = f"{API}{endpoint}?fields={fields}&sort={sort}&page[size]={page_size}"
    payload = fetch_json(url, source=source, min_bytes=200)
    if not isinstance(payload, dict) or "data" not in payload:
        raise SourceUnavailable(source, url, "unexpected payload shape")
    rows = payload["data"]
    if not rows:
        raise SourceUnavailable(source, url, "zero rows returned; refusing to emit empty data")
    return rows


def build(dry_run: bool = False) -> list[str]:
    # ---- gross debt at fiscal year end ----------------------------------
    fy_rows = _paged(
        "v2/accounting/od/debt_outstanding",
        fields="record_date,record_fiscal_year,debt_outstanding_amt",
        sort="-record_date", source="Treasury historical debt outstanding",
    )
    fy_debt: dict[int, float] = {}
    for r in fy_rows:
        try:
            fy = int(r["record_fiscal_year"])
            fy_debt[fy] = float(r["debt_outstanding_amt"]) / 1e12
        except (TypeError, ValueError, KeyError):
            continue
    if not fy_debt:
        raise SourceUnavailable("Treasury debt outstanding", API, "no parseable fiscal-year rows")

    # ---- daily series, for the current split and the $40T crossing -------
    daily = _paged(
        "v2/accounting/od/debt_to_penny",
        fields="record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt",
        sort="-record_date", source="Treasury Debt to the Penny",
    )
    parsed = []
    for r in daily:
        try:
            parsed.append((r["record_date"], float(r["tot_pub_debt_out_amt"]) / 1e12,
                           float(r["debt_held_public_amt"]) / 1e12,
                           float(r["intragov_hold_amt"]) / 1e12))
        except (TypeError, ValueError, KeyError):
            continue
    parsed.sort()
    latest = parsed[-1]

    crossing = next(((d, tot) for d, tot, _, _ in parsed if tot >= THRESHOLD_T), None)

    # ---- GDP denominator, from the same CBO vintage the rest of the site uses
    v = latest_cbo_vintage("historical_budget")
    budget, _ = parse_cbo(fetch(v.url, source="CBO historical_budget", min_bytes=50_000).text,
                          source="CBO historical_budget", url=v.url)
    gdp_by_fy = {}
    for y, vars_ in budget.items():
        # Recover GDP from any level and its share, avoiding a second fetch.
        if vars_.get("outlays_total") and vars_.get("outlays_total_gdp_share"):
            gdp_by_fy[y] = vars_["outlays_total"] / (vars_["outlays_total_gdp_share"] / 100) / 1000
    last_actual = max(gdp_by_fy)

    rows: list[dict[str, Any]] = []
    for fy in sorted(f for f in fy_debt if f >= FIRST_FY):
        gdp = gdp_by_fy.get(fy)
        rows.append({
            "y": fy,
            "debt": round(fy_debt[fy], 3),
            # null, not zero: FY beyond the CBO actuals has no final GDP.
            "gdp_share": round(100 * fy_debt[fy] / gdp, 1) if gdp else None,
            "year_end": True,
        })

    # The current-year point is not a year-end close and must be labelled so.
    if crossing:
        rows.append({
            "y": int(crossing[0][:4]) + 1 if crossing[0][5:7] >= "10" else int(crossing[0][:4]),
            "debt": round(crossing[1], 3),
            "gdp_share": None,
            "year_end": False,
            "as_of": crossing[0],
            "note": f"first close at or above ${THRESHOLD_T:.0f}T; not a fiscal year-end value",
        })

    meta = emit.build_meta(
        "debt", generator=GEN, retrieved_at=latest[0],
        coverage={"start": FIRST_FY, "end": rows[-1]["y"],
                  "gdp_share_available_through": last_actual},
        extra={
            "current": {
                "as_of": latest[0], "total_t": round(latest[1], 3),
                "held_by_public_t": round(latest[2], 3),
                "intragovernmental_t": round(latest[3], 3),
                "public_share_of_gross_pct": round(100 * latest[2] / latest[1], 1),
            },
            "threshold_crossing": (
                {
                    "threshold_t": THRESHOLD_T,
                    "record_date": crossing[0],
                    # Debt to the Penny publishes a date's CLOSING balance on the
                    # next business day, which is why press coverage dates the
                    # crossing one day later. Both dates are carried so the UI
                    # never has to hardcode the reported date. See discrepancies.yaml.
                    "reported_date": curated.discrepancies()["forty_trillion_crossing_date"]["use"]["reported_date"],
                    "value_t": round(crossing[1], 3),
                    "rule": curated.discrepancies()["forty_trillion_crossing_date"]["rule"],
                }
                if crossing else None
            ),
            "denominator_warning": curated.discrepancies()["foreign_share_of_debt"]["rule"],
        },
    )
    emit.write("debt", meta, rows, dry_run=dry_run)
    return ["debt"]
