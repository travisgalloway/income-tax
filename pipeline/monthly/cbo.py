"""CBO-derived outputs: the budget series, the macro series and revenue by source.

All three come from the CBO data repo, whose vintages are discovered rather than
hardcoded (see lib/sources.py for why).
"""

from __future__ import annotations

from typing import Any

from lib import curated, emit
from lib.fetch import fetch
from lib.normalize import parse_cbo, require, t
from lib.sources import latest_cbo_vintage

GEN = "monthly/cbo.py"

# Curated field name -> CBO variable. `ma` is deliberately the GROSS mandatory
# series: BRIEF.md and SOURCES.md both require ma + or + di + ni = ot, which only
# holds with gross mandatory plus negative offsetting receipts.
BUDGET_MAP = {
    "ma": "outlays_mandatory_programmatic",
    "or": "outlays_offsetting_receipts",
    "di": "outlays_discretionary",
    "ni": "outlays_net_interest",
    "re": "revenues",
    "de": "deficit_total",
    "ot": "outlays_total",
}
GDP_SHARE_MAP = {k: f"{v}_gdp_share" for k, v in BUDGET_MAP.items()}

REVENUE_MAP = {
    "ii": "rev_individual_income",
    "pr": "rev_payroll",
    "ci": "rev_corporate_income",
    "ex": "rev_excise",
    "cu": "rev_customs",
    "eg": "rev_estate_gift",
    "mi": "rev_miscellaneous",
    "tot": "rev_total",
}

ECON_MAP = {
    "gdp": "gdp", "rgdp": "real_gdp", "potential_rgdp": "real_potential_gdp",
    "output_gap": "output_gap", "unemp": "unemployment_rate",
    "nairu": "noncyclical_rate_of_unemployment", "lfpr": "lfpr_16yo",
    "cpi": "cpiu", "chained_cpiu": "chained_cpiu", "core_cpiu": "core_cpiu",
    "core_pce": "core_pce_price_index",
    "ff": "fed_funds_rate", "t10": "treasury_note_rate_10yr", "t3m": "treasury_bill_rate_3mo",
    "prod": "output_per_hr_nfb",
}


def _load(dataset: str, prefix: str = "annual_fy_") -> tuple[dict, str, str]:
    v = latest_cbo_vintage(dataset, prefix=prefix)
    resp = fetch(v.url, source=f"CBO {dataset}", min_bytes=50_000)
    table, _ = parse_cbo(resp.text, source=f"CBO {dataset}", url=v.url)
    return table, v.vintage, resp.retrieved_at


def build(dry_run: bool = False) -> list[str]:
    budget, b_vintage, b_at = _load("historical_budget")
    econ, e_vintage, e_at = _load("historical_economic")

    budget_years = sorted(budget)
    last_actual = budget_years[-1]  # CBO historical budget ends at the last actual FY
    src_b = "CBO historical_budget"
    src_e = "CBO historical_economic"

    # Deflator rebased so the latest actual year = 1.0, giving real FY<last> dollars.
    base_p = require(econ, last_actual, "gdp_price_index", source=src_e)

    def deflate(year: int, nominal_t: float) -> float:
        p = require(econ, year, "gdp_price_index", source=src_e)
        return round(nominal_t * base_p / p, 3)

    control = {c["fy"]: c for c in curated._load("control")["years"]}

    # ---- budget ----------------------------------------------------------
    rows: list[dict[str, Any]] = []
    for y in budget_years:
        row: dict[str, Any] = {"y": y}
        for key, var in BUDGET_MAP.items():
            n = t(require(budget, y, var, source=src_b))
            row[f"n_{key}"] = round(n, 3)
            row[f"r_{key}"] = deflate(y, n)
            row[f"g_{key}"] = round(require(budget, y, GDP_SHARE_MAP[key], source=src_b), 2)
        c = control.get(y)
        row["ctl"] = (
            {"p": c["president"], "pp": c["president_party"], "h": c["house"],
             "s": c["senate"], "ctl": c["control"], "t": c["handoff"]}
            if c else None
        )
        row["L"] = [
            {k: v for k, v in law.items() if k not in ("fy",)}
            for law in curated.laws() if law["fy"] == y
        ]
        rows.append(row)

    meta = emit.build_meta(
        "budget", generator=GEN, vintage=b_vintage, retrieved_at=b_at,
        coverage={"start": budget_years[0], "end": last_actual,
                  "control_start": min(control), "control_end": max(control)},
    )
    emit.write("budget", meta, rows, dry_run=dry_run)

    # ---- revenue by source -----------------------------------------------
    rev_rows = []
    for y in budget_years:
        total = t(require(budget, y, "rev_total", source=src_b))
        r: dict[str, Any] = {"y": y}
        for key, var in REVENUE_MAP.items():
            n = t(require(budget, y, var, source=src_b))
            r[f"n_{key}"] = round(n, 4)
            r[f"g_{key}"] = round(require(budget, y, f"{var}_gdp_share", source=src_b), 3)
            r[f"s_{key}"] = round(100 * n / total, 2) if total else None
        rev_rows.append(r)

    emit.write(
        "revenue_sources",
        emit.build_meta("revenue_sources", generator=GEN, vintage=b_vintage,
                        retrieved_at=b_at,
                        coverage={"start": budget_years[0], "end": last_actual}),
        rev_rows, dry_run=dry_run,
    )

    # ---- macro ------------------------------------------------------------
    econ_rows = []
    for y in sorted(econ):
        e: dict[str, Any] = {"y": y, "actual": y <= last_actual}
        for key, var in ECON_MAP.items():
            val = econ[y].get(var)
            if val is None:
                e[key] = None
                continue
            e[key] = round(val / 1_000, 3) if key in ("gdp", "rgdp", "potential_rgdp") else round(val, 3)
        gdp_m = econ[y].get("gdp")
        e["gdp_deflator"] = round(100 * econ[y]["gdp_price_index"] / base_p, 3)
        for key, var in (("wage_share", "wages_and_salaries"), ("profit_share", "corp_profits_adj")):
            v = econ[y].get(var)
            e[key] = round(100 * v / gdp_m, 3) if (v is not None and gdp_m) else None
        econ_rows.append(e)

    econ_years = sorted(econ)
    emit.write(
        "economy",
        emit.build_meta("economy", generator=GEN, vintage=e_vintage, retrieved_at=e_at,
                        coverage={"start": econ_years[0], "end": econ_years[-1]},
                        estimate_boundary={"last_actual_fy": last_actual,
                                           "note": "Values after this year are CBO baseline "
                                                   "projections, not actuals."}),
        econ_rows, dry_run=dry_run,
    )

    return ["budget", "revenue_sources", "economy"]
