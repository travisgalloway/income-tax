"""The validation gate.

build.py writes NOTHING if any check here fails. These assertions encode the
traps already documented in BRIEF.md and SOURCES.md, so that a source revision
cannot quietly violate one.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import curated
from .errors import ValidationFailed

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "data"


class Checks:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passed = 0

    def ok(self, condition: bool, message: str) -> None:
        if condition:
            self.passed += 1
        else:
            self.failures.append(message)

    def close(self, near: float, target: float, tol: float, label: str) -> None:
        self.ok(abs(near - target) <= tol, f"{label}: got {near:.4f}, expected {target} +/- {tol}")


def _load(name: str) -> dict[str, Any]:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        raise ValidationFailed([f"{name}.json was not produced"])
    return json.loads(path.read_text())


def check_meta(c: Checks, names: list[str]) -> None:
    for n in names:
        doc = _load(n)
        m = doc.get("_meta", {})
        c.ok(bool(m.get("source")), f"{n}: _meta.source is missing or empty")
        c.ok(bool(m.get("title")), f"{n}: _meta.title is missing")
        c.ok("provenance" in m, f"{n}: _meta.provenance is missing")
        c.ok(
            "CBO data" != m.get("source"),
            f"{n}: _meta.source was summarised; BRIEF.md rule 1 forbids this",
        )


def check_budget(c: Checks) -> None:
    rows = _load("budget")["data"]
    by = {r["y"]: r for r in rows}

    for r in rows:
        y = r["y"]
        # SOURCES.md: mandatory is gross; ma + or + di + ni = ot.
        c.ok(
            abs((r["n_ma"] + r["n_or"] + r["n_di"] + r["n_ni"]) - r["n_ot"]) <= 0.002,
            f"FY{y}: outlay components do not sum to total (gross mandatory + offsetting "
            f"receipts + discretionary + net interest != outlays)",
        )
        c.ok(
            abs((r["n_re"] - r["n_ot"]) - r["n_de"]) <= 0.002,
            f"FY{y}: revenue - outlays != deficit",
        )
        c.ok(r["n_or"] <= 0, f"FY{y}: offsetting receipts should be negative, got {r['n_or']}")

    span = [y for y in by if 1995 <= y <= 2025]
    c.ok(len(span) == 31, f"expected 31 fiscal years FY1995-FY2025, got {len(span)}")

    # Headline figures quoted in sections.md.
    c.close(sum(-by[y]["n_de"] for y in span), 24.15, 0.05, "cumulative deficits FY1995-2025 $T")
    c.close(sum(by[y]["n_ni"] for y in span), 9.4, 0.08, "net interest FY1995-2025 $T")
    c.close(by[2025]["n_ot"], 7.01, 0.01, "FY2025 outlays $T")
    c.close(by[2025]["n_re"], 5.235, 0.01, "FY2025 revenue $T")
    c.close(by[1995]["n_ni"], 0.232, 0.002, "FY1995 net interest $T")
    c.close(by[2025]["n_ni"], 0.970, 0.002, "FY2025 net interest $T")

    # SOURCES.md: FY2015 is a TROUGH, FY2003 is the series low. If a revision ever
    # makes FY2015 the true minimum, section 7's wording must change.
    low = min(span, key=lambda y: by[y]["n_ni"])
    c.ok(low == 2003, f"series-low net interest year is FY{low}, not FY2003; section 7 says "
                      f"'trough' for FY2015 on the assumption FY2003 is lower")

    surplus = sorted(y for y in span if by[y]["n_de"] > 0)
    c.ok(surplus == [1998, 1999, 2000, 2001],
         f"surplus years are {surplus}, but sections.md section 5 says 1998-2001")

    # Control coverage must not silently shrink.
    with_ctl = [r["y"] for r in rows if r.get("ctl")]
    c.ok(min(with_ctl) == 1995 and max(with_ctl) == 2025,
         f"party control covers FY{min(with_ctl)}-FY{max(with_ctl)}, expected FY1995-FY2025")


def check_laws(c: Checks) -> None:
    rows = _load("budget")["data"]
    laws = [l for r in rows for l in r["L"]]
    totals = curated.law_totals()

    c.ok(len(laws) == 23, f"expected 23 major laws, found {len(laws)}")

    scored = [l["score_t"] for l in laws if l["score_t"] is not None]
    c.ok(len(scored) == 21, f"expected 21 scored laws (2 x 1997 predate the convention), "
                            f"got {len(scored)}")
    c.close(sum(scored), totals["net_scored_t"], 0.02, "net scored legislative cost $T")
    c.close(sum(s for s in scored if s > 0), totals["gross_increases_t"], 0.02,
            "gross legislative increases $T")

    for l in laws:
        c.ok(bool(l.get("date")), f"law {l['name']!r} has no enactment date")
        c.ok(bool(l.get("president")), f"law {l['name']!r} has no signing president")


def check_revenue(c: Checks) -> None:
    rows = _load("revenue_sources")["data"]
    parts = ["ii", "pr", "ci", "ex", "cu", "eg", "mi"]
    for r in rows:
        s_n = sum(r[f"n_{p}"] for p in parts)
        c.ok(abs(s_n - r["n_tot"]) <= 0.003,
             f"FY{r['y']}: revenue components sum to {s_n:.3f}, total is {r['n_tot']:.3f}")

        # GOV-10 (#7): the g_ and s_ families carry the same sum-to-total
        # invariant as n_. Left unchecked before this issue.
        s_g = sum(r[f"g_{p}"] for p in parts)
        c.ok(abs(s_g - r["g_tot"]) <= 0.01,
             f"FY{r['y']}: % of GDP components sum to {s_g:.3f}, total is {r['g_tot']:.3f}")

        s_s = sum(r[f"s_{p}"] for p in parts)
        c.ok(abs(s_s - 100.0) <= 0.05,
             f"FY{r['y']}: % of total revenue components sum to {s_s:.3f}, expected 100.0")

        # Miscellaneous must never silently drop to zero or disappear.
        c.ok(r["n_mi"] > 0 and r["g_mi"] > 0,
             f"FY{r['y']}: miscellaneous revenue is not positive (n_mi={r['n_mi']}, "
             f"g_mi={r['g_mi']}); it must never be silently dropped")
    by = {r["y"]: r for r in rows}
    c.close(by[1995]["n_tot"], 1.352, 0.002, "FY1995 total revenue $T")
    c.close(by[2025]["n_tot"], 5.235, 0.002, "FY2025 total revenue $T")
    c.close(by[2025]["g_ii"], 8.75, 0.02, "FY2025 individual income tax, % of GDP")
    c.close(by[2025]["g_pr"], 5.76, 0.02, "FY2025 payroll tax, % of GDP")
    c.close(by[2025]["s_pr"], 33.4, 0.15, "FY2025 payroll tax, % of total revenue")


def check_economy(c: Checks) -> None:
    doc = _load("economy")
    rows = doc["data"]
    boundary = doc["_meta"].get("estimate_boundary", {}).get("last_actual_fy")
    c.ok(boundary is not None, "economy: _meta.estimate_boundary.last_actual_fy is missing; "
                               "charts cannot separate actuals from projections without it")
    if boundary:
        actual = [r["y"] for r in rows if r["actual"]]
        c.ok(max(actual) == boundary,
             f"economy: rows flagged actual run to FY{max(actual)} but boundary says {boundary}")
        c.ok(any(not r["actual"] for r in rows),
             "economy: no rows flagged as projections, but CBO publishes them; "
             "the actual/projected split may have broken")
    # The deflator is the basis for every real-dollar figure on the site.
    base = [r for r in rows if r["y"] == boundary]
    c.close(base[0]["gdp_deflator"], 100.0, 0.001, "GDP deflator at base year")


def check_debt(c: Checks) -> None:
    doc = _load("debt")
    rows = doc["data"]
    by = {r["y"]: r for r in rows if r.get("year_end")}
    c.close(by[1995]["debt"], 4.97, 0.01, "FY1995 gross debt $T")
    c.ok(all(r["debt"] > 0 for r in rows), "debt: a non-positive value appeared")

    years = sorted(by)
    c.ok(years == list(range(years[0], years[-1] + 1)),
         "debt: fiscal year-end series has gaps")

    cur = doc["_meta"]["current"]
    c.close(cur["held_by_public_t"] + cur["intragovernmental_t"], cur["total_t"], 0.01,
            "debt: public + intragovernmental != total")
    c.ok(60 <= cur["public_share_of_gross_pct"] <= 95,
         f"debt: public share of gross is {cur['public_share_of_gross_pct']}%, outside a "
         "plausible range; the denominator may have been swapped")

    # A year-end value must never be silently replaced by a mid-year reading.
    c.ok(all(r.get("as_of") for r in rows if not r.get("year_end")),
         "debt: a non-year-end row has no as_of date")

    # $40T crossing: record_date and reported_date must both be present and
    # distinct, and the non-year-end row's as_of must equal record_date, so the
    # note and the row can never drift apart. See discrepancies.yaml ->
    # forty_trillion_crossing_date.
    crossing = doc["_meta"].get("threshold_crossing")
    if crossing:
        c.ok(bool(crossing.get("record_date")) and bool(crossing.get("reported_date")),
             "debt: threshold_crossing is missing record_date or reported_date")
        c.ok(crossing.get("record_date") != crossing.get("reported_date"),
             "debt: threshold_crossing record_date and reported_date must be distinct")
        non_year_end = [r for r in rows if not r.get("year_end")]
        c.ok(len(non_year_end) == 1 and non_year_end[0].get("as_of") == crossing.get("record_date"),
             "debt: the non-year-end row's as_of does not match threshold_crossing.record_date")


def check_income(c: Checks) -> None:
    doc = _load("income_inequality")
    rows = {r["y"]: r for r in doc["data"]}
    c.ok(doc["_meta"].get("gini_basis") == "families",
         "income_inequality: gini_basis is not 'families'; SOURCES.md requires the family "
         "series be labelled, or readers will correct it with the household figure")
    c.close(rows[1995]["mhi"], 65380, 1, "FY1995 real median household income")
    c.close(rows[2024]["mhi"], 83730, 1, "2024 real median household income")
    c.close(rows[2024]["gini"], 0.456, 0.001, "2024 family Gini")
    c.close(rows[2024]["top"], 37.0, 0.01, "2024 top statutory marginal rate")
    c.close(rows[1944]["top"], 94.0, 0.01, "1944 top statutory marginal rate")

    # Missing must stay missing. A zero here would chart as a real observation.
    c.ok(rows[1913]["mhi"] is None and rows[1913]["gini"] is None,
         "income_inequality: 1913 has a value for a series that does not start until later; "
         "absent data must be null, never zero")
    for y, r in rows.items():
        for k in ("mhi", "gini", "top"):
            c.ok(r[k] is None or r[k] > 0, f"income_inequality: {k} is non-positive in {y}")


def check_snapshots(c: Checks) -> None:
    holders = _load("debt_holders")
    d = holders["data"]
    split = {s["k"]: s for s in d["split"]}
    c.close(split["public"]["amount_t"] + split["intragov"]["amount_t"], d["total_debt_t"], 0.02,
            "debt_holders: split does not sum to total")
    c.close(sum(s["share_pct"] for s in d["split"]), 100.0, 0.2,
            "debt_holders: shares do not sum to 100")
    c.ok(sum(s["share_of_public_pct"] for s in d["public_split"]) == 100,
         "debt_holders: public split shares do not sum to 100")
    # SOURCES.md: omit the Fed rather than pick between $4.53T and $4.9T.
    blob = json.dumps(d).lower()
    c.ok("federal reserve" not in blob and "fed_holdings" not in blob,
         "debt_holders: Federal Reserve holdings appeared; SOURCES.md requires they be "
         "OMITTED rather than picked between conflicting figures")

    # discrepancies.yaml -> foreign_share_of_debt: a foreign share is never
    # presented without naming which debt it is a share OF. The field name
    # itself (share_of_public_pct, not share_pct) makes the denominator
    # explicit, so a renderer cannot flatten it to a bare percentage.
    c.ok(all("share_of_public_pct" in s and "share_pct" not in s for s in d["public_split"]),
         "debt_holders: public_split must use share_of_public_pct, never a bare share_pct")
    c.ok(all("share_of_gross_pct" in h for h in d["foreign_share_history"]),
         "debt_holders: foreign_share_history must name share_of_gross_pct on every point")
    latest_foreign = next((h for h in d["foreign_share_history"] if h["year"] == 2025), None)
    c.ok(latest_foreign is not None and latest_foreign["share_of_gross_pct"] == 24,
         "debt_holders: no 2025 foreign_share_history point at 24% of gross debt")

    maturity = _load("debt_maturity")["data"]
    comp = {row["k"]: row for row in maturity["composition"]}
    total_amt = sum(row["amount_t"] for row in maturity["composition"])
    # EC2: bills/notes/bonds are NOT an exhaustive partition of the marketable
    # total, and must never be presented as one.
    c.ok(abs(total_amt - maturity["marketable_total_t"]) > 0.01,
         "debt_maturity: composition now sums to the marketable total; if this is no "
         "longer true the 'not an exhaustive partition' note and test are stale")
    # EC3: bills.share_pct (curated) disagrees with amount_t / total on purpose;
    # only bills carries a curated share, and it must never be silently derived
    # for notes or bonds from amount_t / marketable_total_t.
    c.ok("share_pct" in comp["bills"] and "share_pct" not in comp["notes"]
         and "share_pct" not in comp["bonds"],
         "debt_maturity: share_pct must be present on bills only")

    oecd = _load("oecd")["data"]
    c.ok(oecd["us_pct_gdp"] == 25.6 and oecd["oecd_average_pct_gdp"] == 34.1,
         "oecd: headline figures moved; sections.md quotes 25.6% and 34.1%")
    us = [x for x in oecd["countries"] if x.get("is_us")]
    c.ok(len(us) == 1 and us[0]["v"] == oecd["us_pct_gdp"],
         "oecd: the US row disagrees with us_pct_gdp")

    # GOV-10 (#7): the average must be flagged exactly once (a chart must be
    # able to pull it out of the country rows), and the country list must be
    # provably a selection, never the full membership rendered as if it were.
    avg = [x for x in oecd["countries"] if x.get("is_average")]
    c.ok(len(avg) == 1 and avg[0]["v"] == oecd["oecd_average_pct_gdp"],
         "oecd: the average row disagrees with oecd_average_pct_gdp")
    c.ok(len(oecd["countries"]) < oecd["of_countries"],
         f"oecd: countries list has {len(oecd['countries'])} rows, of_countries is "
         f"{oecd['of_countries']}; the plot is a selection and must be labelled as one")

    grp = _load("income_tax_by_group")["data"]
    top1 = [g for g in grp["groups"] if g["g"] == "Top 1%"][0]
    c.close(top1["tax_share_pct"], 38.4, 0.05, "income_tax_by_group: top 1% tax share")
    c.ok(top1["income_share_pct"] is not None,
         "income_tax_by_group: the top 1% income share is missing. Showing the tax share "
         "without it misleads, per the curated note.")

    c.ok(grp["tax_year"] == 2023,
         f"income_tax_by_group: tax year moved to {grp['tax_year']}; sections 5-7 state 2023")

    by_g = {g["g"]: g for g in grp["groups"]}
    # NESTED, not a partition: each wider group must contain the narrower one.
    ladder = ["Top 1%", "Top 5%", "Top 10%", "Top 25%", "Top 50%"]
    for narrow, wide in zip(ladder, ladder[1:]):
        c.ok(by_g[narrow]["tax_share_pct"] <= by_g[wide]["tax_share_pct"],
             f"income_tax_by_group: {narrow} tax share exceeds {wide}; the groups are "
             f"nested, and a chart that stacked them would double-count")

    # Partial BY DESIGN. If the IRS series gains these, the chart must be revisited
    # rather than silently filling cells the prose says are unpublished.
    for g in ("Top 5%", "Top 25%", "Bottom 50%"):
        c.ok(by_g[g].get("income_share_pct") is None,
             f"income_tax_by_group: {g} gained an income share; section 5 renders it as "
             f"unpublished and its note says so")

    hist = grp["top1_tax_share_history"]
    years = [p["year"] for p in hist]
    c.ok(max(b - a for a, b in zip(years, years[1:])) > 1,
         "income_tax_by_group: top1_tax_share_history became annual; section 5 draws it as "
         "discrete published years and must be revisited if it is now a continuous series")


def check_bracket_history(c: Checks) -> None:
    doc = _load("bracket_history")
    rows = doc["data"]
    by = {r["y"]: r for r in rows}
    top_rates = curated._load("top_rates")["top_marginal_rate"]

    years = sorted(by)
    c.ok(years == list(range(1913, 2026)), f"bracket_history: expected 1913-2025 with no gaps, "
                                            f"got {years[0]}-{years[-1]} ({len(years)} years)")

    for y, want in top_rates.items():
        c.ok(abs(by[int(y)]["top"] - want) < 0.001,
             f"bracket_history: {y} top {by[int(y)]['top']} != curated top_rates {want}")

    spot = {1913: 7.0, 1944: 94.0, 1965: 70.0, 1988: 28.0, 1993: 39.6, 1981: 69.125,
            2018: 37.0, 2019: 37.0, 2020: 37.0, 2021: 37.0, 2022: 37.0, 2023: 37.0,
            2024: 37.0, 2025: 37.0}
    for y, want in spot.items():
        c.ok(abs(by[y]["top"] - want) < 0.001, f"bracket_history: {y} top is {by[y]['top']}, expected {want}")
    c.ok(bool(by[1981]["adj"] and by[1981]["adj"]["why"].strip()),
         "bracket_history: 1981 has no documented adjustment reason")

    nb = {y: r["nb"] for y, r in by.items()}
    c.ok(min(nb.values()) == 2 and nb[1988] == 2, "bracket_history: minimum bracket count is not 2 at 1988")
    c.ok(max(nb.values()) == 56 and nb[1918] == 56, "bracket_history: maximum bracket count is not 56 at 1918")

    for y, r in by.items():
        c.ok((r["s"]["mfj"] is None) == (y < 1949), f"bracket_history: {y} mfj null-ness is wrong")
        c.ok((r["s"]["mfs"] is None) == (y < 1949), f"bracket_history: {y} mfs null-ness is wrong")
        c.ok((r["s"]["hoh"] is None) == (y < 1952), f"bracket_history: {y} hoh null-ness is wrong")
        for status, ladder in r["s"].items():
            if ladder is None:
                continue
            for i, b in enumerate(ladder):
                is_top = i == len(ladder) - 1
                c.ok((b["hi"] is None) == is_top, f"bracket_history: {y} {status} bracket {i} "
                     f"hi-nullness disagrees with being the top bracket")
                c.ok((b["rhi"] is None) == is_top, f"bracket_history: {y} {status} bracket {i} "
                     f"rhi-nullness disagrees with being the top bracket")

    top_1913 = by[1913]["s"]["single"][-1]
    c.ok(top_1913["lo"] == 500000, f"bracket_history: 1913 top bracket floor is {top_1913['lo']}, expected $500,000")
    c.ok(12_000_000 <= top_1913["rlo"] <= 20_000_000,
         f"bracket_history: 1913 top bracket in constant 2024 dollars is {top_1913['rlo']}, "
         "expected between $12M and $20M")

    top_2024 = by[2024]["s"]["single"][-1]
    c.close(top_2024["rlo"], top_2024["lo"], top_2024["lo"] * 0.005,
            "bracket_history: 2024 top bracket real vs nominal (base-year fixed point)")


def check_cbo_effective_rates(c: Checks) -> None:
    doc = _load("cbo_effective_rates")
    rows = doc["data"]["rows"]
    basis = doc["data"]["basis"]

    for r in rows:
        for g, v in r["v"].items():
            c.ok(0 < v < 45, f"cbo_effective_rates: {r['year']} {g} rate {v} outside (0, 45)")
        c.ok(r["v"]["highest"] > r["v"]["lowest"],
             f"cbo_effective_rates: {r['year']} highest quintile is not above lowest")
        c.ok(r["v"]["top1"] >= r["v"]["highest"],
             f"cbo_effective_rates: {r['year']} top 1% rate is below the highest quintile")
        c.ok(bool(r.get("source_table")),
             f"cbo_effective_rates: {r['year']} has no source_table")

    years = {r["year"] for r in rows}
    c.ok(1979 in years and 2022 in years,
         "cbo_effective_rates: the two endpoint years 1979 and 2022 are not both present")
    c.ok("payroll" in basis.lower(),
         "cbo_effective_rates: basis does not name payroll tax; the comparability trap must be "
         "structural, not editorial")


def check_party_splits(c: Checks) -> None:
    doc = _load("party_splits")
    rows = doc["data"]
    c.ok(len(rows) == 23, f"party_splits: expected 23 laws, got {len(rows)}")

    # The one independently verified split. If this drifts, the join is wrong.
    tcja = next((r for r in rows if r["public_law"] == "115-97"), None)
    c.ok(tcja is not None, "party_splits: PL 115-97 is missing; the regression cannot run")
    if tcja:
        c.ok((tcja["house"]["r"]["yea"], tcja["house"]["r"]["nay"]) == (224, 12),
             "party_splits: TCJA House Republicans do not reproduce 224-12")
        c.ok((tcja["house"]["d_caucus"]["yea"], tcja["house"]["d_caucus"]["nay"]) == (0, 189),
             "party_splits: TCJA House Democrats do not reproduce 0-189")
        c.ok((tcja["senate"]["r"]["yea"], tcja["senate"]["r"]["nay"]) == (51, 0),
             "party_splits: TCJA Senate Republicans do not reproduce 51-0")
        c.ok((tcja["senate"]["d_caucus"]["yea"], tcja["senate"]["d_caucus"]["nay"]) == (0, 48),
             "party_splits: TCJA Senate Democrats do not reproduce 0-48 on the caucus basis")

    for r in rows:
        for ch in ("house", "senate"):
            v = r[ch]
            if v is None:
                # A missing chamber must say why. Silence would read as unanimity.
                c.ok(bool(r.get("note")),
                     f"party_splits: {r['public_law']} has no {ch} vote and no note explaining "
                     "why. An absent roll call must never render as agreement.")
                continue
            c.ok(v["yea"] == v["r"]["yea"] + v["d"]["yea"] + v["i"]["yea"],
                 f"party_splits: {r['public_law']} {ch} yea total does not match its parts")
            c.ok(v["d_caucus"]["yea"] == v["d"]["yea"] + v["i"]["yea"],
                 f"party_splits: {r['public_law']} {ch} caucus total is not party + independents")
            # A 50-50 Senate vote PASSES on the Vice President's tiebreak, which is
            # not in the roll call. JGTRRA, the IRA and the OBBBA all cleared this
            # way, so a tie is a pass in the Senate and a failure in the House.
            floor = v["nay"] if ch == "senate" else v["nay"] + 1
            c.ok(v["yea"] >= floor,
                 f"party_splits: {r['public_law']} {ch} records {v['yea']}-{v['nay']}, a failed "
                 "vote; the curated mapping should point at final passage")
            if ch == "senate" and v["yea"] == v["nay"]:
                c.ok(v["yea"] == 50,
                     f"party_splits: {r['public_law']} senate is tied at {v['yea']} but a "
                     "tiebreak only applies at 50-50")

    chars = [r["character"] for r in rows]
    c.ok(chars.count("cross-party") == 16,
         f"party_splits: {chars.count('cross-party')} cross-party laws, sections.md says 16")
    c.ok(chars.count("party-line") == 7,
         f"party_splits: {chars.count('party-line')} party-line laws, sections.md says 7")


def run(outputs: list[str]) -> Checks:
    c = Checks()
    check_meta(c, outputs)
    if "budget" in outputs:
        check_budget(c)
        check_laws(c)
    if "revenue_sources" in outputs:
        check_revenue(c)
    if "economy" in outputs:
        check_economy(c)
    if "debt" in outputs:
        check_debt(c)
    if "income_inequality" in outputs:
        check_income(c)
    if "debt_holders" in outputs:
        check_snapshots(c)
    if "party_splits" in outputs:
        check_party_splits(c)
    if "cbo_effective_rates" in outputs:
        check_cbo_effective_rates(c)
    if "bracket_history" in outputs:
        check_bracket_history(c)
    return c
