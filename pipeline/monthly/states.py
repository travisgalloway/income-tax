"""State give-and-get: IRS gross collections against USASpending award spending,
plus the Census state tax mix.

issue #14. This is narrower than a balance of payments on both sides: give is
gross federal COLLECTIONS classified by filer address, get is federal AWARD
SPENDING classified by place of performance. Neither is complete, and the two
are never described as opposite sides of one ledger — see SOURCES.md and the
trap paragraphs in src/pages/government/index.astro.

Three fetches, three independent vintages, one join:

  give  = _irs_gross_collections()   # IRS SOI Data Book Table 5, discovered vintage
  get   = _usaspending_by_state()    # USASpending spending_by_geography, same FY window as `give`
  mix   = _census_state_tax_mix()    # Census STC detailed transposed table, discovered vintage

`give` and `get` are joined into `states_balance`; `mix` stands alone as
`states_tax_mix`. Both outputs are OBJECTS, not bare arrays: `lib/report.py`'s
`_dig` walks dotted paths and `_rows` requires a `y` key these rows do not have.
"""

from __future__ import annotations

from typing import Any

from lib import emit
from lib.errors import SourceUnavailable
from lib.fetch import fetch_bytes, post_json
from lib.sources import latest_census_stc, latest_irs_table5
from lib.xlsx import sheet_rows

GEN = "monthly/states.py"

# The 50 states plus DC, exactly as IRS Table 5 spells them. Order is the
# canonical alphabetical order both sources use; the dict's insertion order is
# not relied upon anywhere, only membership and the name -> code lookup.
STATE_NAME_TO_CODE: dict[str, str] = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
CODE_TO_NAME = {v: k for k, v in STATE_NAME_TO_CODE.items()}
STATE_CODES = set(CODE_TO_NAME) - {"DC"}  # the 50 states, DC handled separately

USASPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_geography/"

# Census item codes this section reads. `other` is derived, not a Census code.
TAX_MIX_CATEGORIES = [
    {"k": "income_ind", "label": "Individual income tax", "item": "T40"},
    {"k": "income_corp", "label": "Corporate income tax", "item": "T41"},
    {"k": "sales_general", "label": "General sales tax", "item": "T09"},
    {"k": "property", "label": "Property tax", "item": "T01"},
    {"k": "other", "label": "All other taxes", "item": "derived"},
]


def _b(thousands: float) -> float:
    """IRS and Census dollar amounts are $ THOUSANDS. The site works in $ billions."""
    return round(thousands / 1_000_000, 3)


def _irs_gross_collections() -> tuple[dict[str, dict[str, Any]], float, int, str, str, dict[str, float]]:
    """Return (states, national_total_b, fy, source_url, retrieved_at, unallocated)."""
    v = latest_irs_table5()
    resp = fetch_bytes(v.url, source="IRS SOI Table 5", min_bytes=20_000)
    rows = sheet_rows(resp.content, source="IRS SOI Table 5", url=v.url)

    total_idx = next(
        (i for i, r in enumerate(rows) if r and isinstance(r[0], str) and r[0].strip() == "United States, total"),
        None,
    )
    if total_idx is None:
        raise SourceUnavailable(
            "IRS SOI Table 5", v.url, "'United States, total' row not found; layout may have changed"
        )
    national_total = _b(rows[total_idx][1])

    states: dict[str, dict[str, Any]] = {}
    unallocated: dict[str, float] = {}
    i = total_idx + 1
    while i < len(rows) and len(states) < 51:
        name_raw = rows[i][0]
        name = name_raw.strip() if isinstance(name_raw, str) else None
        if name in STATE_NAME_TO_CODE:
            code = STATE_NAME_TO_CODE[name]
            states[code] = {"name": name, "total_b": _b(rows[i][1])}
            i += 1
        else:
            break

    if len(states) != 51:
        raise SourceUnavailable(
            "IRS SOI Table 5", v.url,
            f"expected 51 contiguous state+DC rows after the US total, got {len(states)}; "
            "a layout change must fail the run rather than chart a short list",
        )

    # Everything after the 51 states+DC (armed forces/territories, Puerto Rico,
    # International, Undistributed) is real money the US total includes but
    # this section cannot attribute to a single jurisdiction. Record it rather
    # than silently drop it.
    for j in range(i, len(rows)):
        label = rows[j][0]
        if not isinstance(label, str) or not label.strip():
            continue
        if rows[j][1] is None or not isinstance(rows[j][1], (int, float)):
            continue
        unallocated[label.strip().split("\n")[0]] = _b(rows[j][1])

    return states, national_total, v.fy, v.url, resp.retrieved_at, unallocated


def _usaspending_by_state(fy: int) -> tuple[dict[str, dict[str, Any]], float, str]:
    """Return ({code: {name, amount_b, population, per_capita}}, unattributed_b, retrieved_at)."""
    window = {"start_date": f"{fy - 1}-10-01", "end_date": f"{fy}-09-30"}
    payload = {
        "scope": "place_of_performance",
        "geo_layer": "state",
        "filters": {"time_period": [window]},
    }
    data = post_json(USASPENDING_URL, payload, source="USASpending spending_by_geography", min_bytes=100)
    if not isinstance(data, dict) or "results" not in data:
        raise SourceUnavailable(USASPENDING_URL, USASPENDING_URL, "unexpected payload shape")
    results = data["results"]
    if not results:
        raise SourceUnavailable(USASPENDING_URL, USASPENDING_URL, "spending_by_geography returned zero rows")

    from time import strftime, gmtime
    retrieved_at = strftime("%Y-%m-%dT%H:%M:%SZ", gmtime())

    out: dict[str, dict[str, Any]] = {}
    unattributed_b = 0.0
    for row in results:
        code = (row.get("shape_code") or "").strip()
        amount_b = round(row["aggregated_amount"] / 1_000_000_000, 3)
        if not code:
            unattributed_b += amount_b
            continue
        out[code] = {
            "name": row.get("display_name") or code,
            "amount_b": amount_b,
            "population": row.get("population"),
            "per_capita": row.get("per_capita"),
        }

    return out, round(unattributed_b, 3), retrieved_at


def _census_state_tax_mix() -> tuple[dict[str, dict[str, Any]], bool, int, str, str]:
    v = latest_census_stc()
    resp = fetch_bytes(v.url, source="Census STC detailed table", min_bytes=10_000)
    rows = sheet_rows(resp.content, source="Census STC detailed table", url=v.url)

    header_idx = next(
        (i for i, r in enumerate(rows) if r and r[0] == "Tax Type" and r[1] == "Item"), None
    )
    if header_idx is None:
        raise SourceUnavailable(
            "Census STC detailed table", v.url, "header row ('Tax Type', 'Item', ...) not found"
        )
    header = rows[header_idx]

    # Column 2 is the US total (which the sheet's own header says excludes DC);
    # columns 3+ are jurisdictions. Read whether DC has its own column from the
    # actual header rather than assuming it.
    col_names: dict[int, str] = {}
    for col in range(3, len(header)):
        cell = header[col]
        if not isinstance(cell, str) or not cell.strip():
            continue
        col_names[col] = " ".join(cell.split())  # collapse embedded newlines
    stc_includes_dc = "DC" in col_names.values()

    by_item: dict[str, list[Any]] = {}
    for r in rows[header_idx + 1 :]:
        if not r or not isinstance(r[1], str) or not r[1].strip():
            continue
        by_item[r[1].strip()] = r

    needed = {c["item"] for c in TAX_MIX_CATEGORIES if c["item"] != "derived"} | {"T00"}
    missing = needed - set(by_item)
    if missing:
        raise SourceUnavailable(
            "Census STC detailed table", v.url, f"item code(s) {sorted(missing)} not found"
        )

    jurisdictions: dict[str, dict[str, Any]] = {}
    for col, raw_name in col_names.items():
        code = "DC" if raw_name == "DC" else STATE_NAME_TO_CODE.get(raw_name)
        if code is None:
            raise SourceUnavailable(
                "Census STC detailed table", v.url,
                f"column {raw_name!r} did not match a known state or DC",
            )
        name = CODE_TO_NAME.get(code, raw_name)
        total_cell = by_item["T00"][col]
        if not isinstance(total_cell, (int, float)):
            # Defensive: every observed FY has a numeric T00 for every column, but
            # a state with no readable total means no share can be computed, and
            # that is a different fact than "does not levy this tax".
            jurisdictions[code] = {
                "name": name, "total_b": None, "shares": {c["k"]: None for c in TAX_MIX_CATEGORIES},
                "not_levied": [], "partial": True,
            }
            continue
        total_b = _b(total_cell)
        shares: dict[str, float | None] = {}
        not_levied: list[str] = []
        component_sum = 0.0
        for cat in TAX_MIX_CATEGORIES:
            if cat["item"] == "derived":
                continue
            cell = by_item[cat["item"]][col]
            if cell == "X":
                shares[cat["k"]] = None
                not_levied.append(cat["k"])
            elif isinstance(cell, (int, float)):
                pct = round(100 * cell / total_cell, 2) if total_cell else None
                shares[cat["k"]] = pct
                component_sum += cell
            else:
                shares[cat["k"]] = None
        other_val = total_cell - component_sum
        shares["other"] = round(100 * other_val / total_cell, 2) if total_cell else None
        jurisdictions[code] = {
            "name": name, "total_b": total_b, "shares": shares,
            "not_levied": not_levied, "partial": False,
        }

    return jurisdictions, stc_includes_dc, v.fy, v.url, resp.retrieved_at


def build(dry_run: bool = False) -> list[str]:
    give, national_give_b, irs_fy, irs_url, irs_at, irs_unallocated = _irs_gross_collections()
    get, unattributed_get_b, usa_at = _usaspending_by_state(irs_fy)
    mix, stc_includes_dc, census_fy, census_url, census_at = _census_state_tax_mix()

    # ---- states_balance ----------------------------------------------------
    territories = sorted(set(get) - set(CODE_TO_NAME))
    all_codes = sorted(set(CODE_TO_NAME) | set(get))

    rows: list[dict[str, Any]] = []
    for code in all_codes:
        is_state = code in STATE_CODES
        is_dc = code == "DC"
        in_grid = is_state or is_dc
        g = give.get(code)
        u = get.get(code)
        name = (g["name"] if g else None) or (u["name"] if u else None) or code
        give_b = g["total_b"] if g else None
        get_b = u["amount_b"] if u else None
        pop = u["population"] if u else None

        # give_b/get_b are $ BILLIONS; per-capita is dollars per person, so *1e9.
        give_pc = round(give_b * 1_000_000_000 / pop, 2) if (give_b is not None and pop) else None
        # get_pc is read from USASpending's own per_capita rather than
        # re-derived, so it matches the source's own arithmetic exactly.
        get_pc = round(u["per_capita"], 2) if (u and u.get("per_capita") is not None) else (
            round(get_b * 1_000_000_000 / pop, 2) if (get_b is not None and pop) else None
        )
        balance_b = round(get_b - give_b, 3) if (give_b is not None and get_b is not None) else None
        balance_pc = (
            round(get_pc - give_pc, 2) if (give_pc is not None and get_pc is not None) else None
        )
        ratio = round(get_b / give_b, 4) if (give_b is not None and get_b is not None and give_b > 0) else None

        rows.append({
            # is_state is true ONLY for the 50 actual states: DC is not a
            # state (and is flagged false here) even though it IS on the
            # grid; in_grid covers both (51 total) and excludes territories.
            "code": code, "name": name, "is_state": is_state, "in_grid": in_grid,
            "give_b": give_b, "get_b": get_b, "pop": pop,
            "give_pc": give_pc, "get_pc": get_pc, "balance_b": balance_b,
            "balance_pc": balance_pc, "ratio": ratio,
        })

    rows.sort(key=lambda r: r["code"])

    # Colour domain over the 50 actual states only: DC is on the grid
    # (in_grid) but excluded from the domain itself (is_state is false for
    # it) so one outlier does not flatten the 50-state range, symmetric
    # about zero.
    domain_vals = [r["balance_pc"] for r in rows if r["is_state"] and r["balance_pc"] is not None]
    bound = max(abs(min(domain_vals)), abs(max(domain_vals))) if domain_vals else 0.0

    n_with_both = sum(1 for r in rows if r["give_b"] is not None and r["get_b"] is not None)
    n_get_more = sum(1 for r in rows if r["balance_b"] is not None and r["balance_b"] > 0)
    n_give_more = sum(1 for r in rows if r["balance_b"] is not None and r["balance_b"] < 0)

    total_pop = sum(r["pop"] for r in rows if r["pop"])

    balance_data = {
        "fy_give": irs_fy,
        "fy_get": irs_fy,
        "national": {"give_b": national_give_b, "get_b": round(sum(u["amount_b"] for u in get.values()), 3),
                     "population": total_pop},
        "color_domain": {"basis": "balance_pc", "min": round(-bound, 2), "max": round(bound, 2),
                          "mid": 0, "excludes": ["DC"]},
        "summary": {"n_get_more": n_get_more, "n_give_more": n_give_more, "n_with_both": n_with_both},
        "jurisdictions": rows,
    }

    emit.write(
        "states_balance",
        emit.build_meta(
            "states_balance", generator=GEN, vintage=f"FY{irs_fy}", retrieved_at=irs_at,
            coverage={
                "give_covers": "50 states + DC only; territories and overseas military have give_b: null",
                "get_covers": "50 states, DC, PR, GU, VI, MP, AS",
                "unallocated_give_b": irs_unallocated,
                "unattributed_get_b": unattributed_get_b,
                "territories": territories,
            },
        ),
        balance_data, dry_run=dry_run,
    )

    # ---- states_tax_mix -----------------------------------------------------
    mix_rows = []
    for code in sorted(mix):
        m = mix[code]
        row = {"code": code, "name": m["name"], "total_b": m["total_b"], "shares": m["shares"],
               "not_levied": m["not_levied"]}
        if m["partial"]:
            row["partial"] = True
        mix_rows.append(row)

    mix_data = {"fy": census_fy, "categories": TAX_MIX_CATEGORIES, "jurisdictions": mix_rows}

    emit.write(
        "states_tax_mix",
        emit.build_meta(
            "states_tax_mix", generator=GEN, vintage=f"FY{census_fy}", retrieved_at=census_at,
            coverage={"stc_includes_dc": stc_includes_dc,
                      "note": "US total column in the source excludes DC regardless of whether DC has its own column"},
        ),
        mix_data, dry_run=dry_run,
    )

    return ["states_balance", "states_tax_mix"]
