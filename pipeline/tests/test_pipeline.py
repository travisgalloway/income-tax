"""Regression tests for the pipeline.

These lock down the invariants that a source revision could silently break.
They read the PUBLISHED outputs in src/data, so `uv run pytest` checks what the
site will actually ship, not what a builder would produce in isolation.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from lib import curated
from lib.errors import SourceUnavailable
from lib.fetch import fetch

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT.parent / "src" / "data"
LEGACY = ROOT.parent


def load(name: str) -> dict:
    return json.loads((DATA / f"{name}.json").read_text())


@pytest.fixture(scope="module")
def budget() -> dict[int, dict]:
    return {r["y"]: r for r in load("budget")["data"]}


# ---- reconciliation ------------------------------------------------------

def test_outlay_components_sum_to_total(budget):
    """SOURCES.md: mandatory is GROSS, so ma + or + di + ni = ot."""
    for y, r in budget.items():
        got = r["n_ma"] + r["n_or"] + r["n_di"] + r["n_ni"]
        assert abs(got - r["n_ot"]) <= 0.002, f"FY{y}: {got:.3f} != {r['n_ot']:.3f}"


def test_outlay_components_sum_to_total_in_every_unit_family(budget):
    """The chart layer stacks ma+or+di+ni against ot in nominal, real and GDP
    units (docs/contracts/interfaces/budget-data.md). This is issue #2
    criterion 1's real guarantee: the net stack never silently misses the top
    of the axis in any of the three views a reader can switch to."""
    tolerances = {"n_": 0.002, "r_": 0.004, "g_": 0.02}
    for y, r in budget.items():
        for prefix, tol in tolerances.items():
            got = r[f"{prefix}ma"] + r[f"{prefix}or"] + r[f"{prefix}di"] + r[f"{prefix}ni"]
            want = r[f"{prefix}ot"]
            assert abs(got - want) <= tol, f"FY{y} {prefix}: {got:.3f} != {want:.3f}"


def test_party_control_is_null_outside_fy1995_2025(budget):
    """Issue #2 criterion 2: the control strip must render for exactly
    FY1995-2025 and nowhere else, matching _meta.coverage."""
    curated = {y: r for y, r in budget.items() if r["ctl"] is not None}
    assert len(curated) == 31
    assert min(curated) == 1995
    assert max(curated) == 2025
    for y, r in budget.items():
        if y < 1995 or y > 2025:
            assert r["ctl"] is None, f"FY{y} should carry ctl: null"


def test_net_mandatory_is_positive_in_every_year(budget):
    """The stack this section draws never inverts: net mandatory (ma + or) is
    positive in nominal, real and GDP terms for all 64 fiscal years."""
    for y, r in budget.items():
        assert r["n_ma"] + r["n_or"] > 0, f"FY{y} nominal"
        assert r["r_ma"] + r["r_or"] > 0, f"FY{y} real"
        assert r["g_ma"] + r["g_or"] > 0, f"FY{y} % of GDP"


def test_every_unit_family_covers_the_full_span(budget):
    """Switching units must not change which years are shown: all three
    families are present and finite for every fiscal year, FY1962-2025."""
    assert min(budget) == 1962
    assert max(budget) == 2025
    assert len(budget) == 64
    fields = [f"{p}{k}" for p in ("n_", "r_", "g_") for k in ("ma", "or", "di", "ni", "re", "de", "ot")]
    for y, r in budget.items():
        for f in fields:
            v = r[f]
            assert v is not None and v == v, f"FY{y} {f} is missing or NaN"  # v == v excludes NaN


def test_surplus_years_are_positive_deficit_values(budget):
    """Edge case: FY1969, 1998-2001 are surplus years and must read as
    positive `de`, not a negated 'deficit'."""
    surplus_years = {1969, 1998, 1999, 2000, 2001}
    for y in surplus_years:
        assert budget[y]["n_de"] > 0, f"FY{y} should be a surplus"
    for y, r in budget.items():
        if y not in surplus_years:
            assert r["n_de"] <= 0, f"FY{y} unexpectedly reads as a surplus"


def test_deficit_is_revenue_minus_outlays(budget):
    for y, r in budget.items():
        assert abs((r["n_re"] - r["n_ot"]) - r["n_de"]) <= 0.002, f"FY{y}"


def test_offsetting_receipts_are_negative(budget):
    assert all(r["n_or"] <= 0 for r in budget.values())


def test_revenue_components_sum_to_total():
    parts = ["ii", "pr", "ci", "ex", "cu", "eg", "mi"]
    for r in load("revenue_sources")["data"]:
        got = sum(r[f"n_{p}"] for p in parts)
        assert abs(got - r["n_tot"]) <= 0.003, f"FY{r['y']}"


# ---- parity with the hand-checked source of truth -------------------------

def test_generated_budget_matches_hand_checked_legacy(budget):
    """The migration must not have altered a single published figure."""
    legacy = {r["y"]: r for r in json.loads((LEGACY / "budget-fy1995-2025.json").read_text())["data"]}
    fields = [f"{p}_{k}" for p in ("n", "r", "g") for k in ("ma", "or", "di", "ni", "re", "de", "ot")]
    for y, old in legacy.items():
        for f in fields:
            tol = 0.011 if f.startswith("g_") else 0.0011
            assert abs(old[f] - budget[y][f]) <= tol, f"FY{y} {f}: {old[f]} vs {budget[y][f]}"


def test_law_totals_reconcile(budget):
    laws = [l for r in budget.values() for l in r["L"]]
    scored = [l["score_t"] for l in laws if l["score_t"] is not None]
    totals = curated.law_totals()
    assert len(laws) == 23
    assert len(scored) == 21, "two 1997 laws predate ten-year scoring and must stay unscored"
    assert abs(sum(scored) - totals["net_scored_t"]) <= 0.02
    assert abs(sum(s for s in scored if s > 0) - totals["gross_increases_t"]) <= 0.02


# ---- the traps -----------------------------------------------------------

def test_federal_reserve_holdings_stay_omitted():
    """SOURCES.md resolves the $4.53T/$4.9T conflict by OMITTING, not picking.

    Scoped to `data` deliberately: _meta legitimately explains the omission, and
    matching that note would be a false positive.
    """
    blob = json.dumps(load("debt_holders")["data"]).lower()
    assert "federal reserve" not in blob
    assert "4.53" not in blob and "4.9t" not in blob
    assert curated.discrepancies()["federal_reserve_holdings"]["use"] is None


def test_gini_is_labelled_as_families():
    assert load("income_inequality")["_meta"]["gini_basis"] == "families"


def test_absent_observations_are_null_not_zero():
    """A zero would chart as a real observation. 1913 has a top rate but no Gini."""
    rows = {r["y"]: r for r in load("income_inequality")["data"]}
    assert rows[1913]["gini"] is None and rows[1913]["mhi"] is None
    assert rows[1913]["top"] == 7.0


def test_median_income_reproduces_the_published_figures():
    """Households §1's finding sentence: $65,380 in 1995 to $83,730 in 2024, +28.1%."""
    rows = {r["y"]: r for r in load("income_inequality")["data"]}
    assert rows[1995]["mhi"] == 65380.0
    assert rows[2024]["mhi"] == 83730.0
    pct = (rows[2024]["mhi"] / rows[1995]["mhi"] - 1) * 100
    assert abs(pct - 28.1) <= 0.05


def test_1947_has_a_gini_but_no_median_income():
    """The Gini runs back to 1947; the median income series does not start until 1984."""
    rows = {r["y"]: r for r in load("income_inequality")["data"]}
    assert rows[1947]["gini"] == 0.376
    assert rows[1947]["mhi"] is None


def test_series_start_years_match_the_declared_coverage():
    """The start/end year each chart derives and prints must not drift from _meta.coverage."""
    doc = load("income_inequality")
    rows = doc["data"]
    coverage = doc["_meta"]["coverage"]
    for key in ("mhi", "gini"):
        years = [r["y"] for r in rows if r[key] is not None]
        assert min(years) == coverage[key]["start"], key
        assert max(years) == coverage[key]["end"], key


def test_family_gini_reproduces_the_published_figures():
    """Households §2's finding sentence: 0.421 in 1995 to 0.456 in 2024."""
    rows = {r["y"]: r for r in load("income_inequality")["data"]}
    assert rows[1995]["gini"] == 0.421
    assert rows[2024]["gini"] == 0.456


def test_cbo_top1_share_is_two_published_points_not_a_series():
    """9% in 1979, 18% in 2022 -- exactly these two points, nothing in between."""
    data = load("income_tax_by_group")["data"]
    points = [(p["year"], p["v"]) for p in data["cbo_top1_income_share"]]
    assert points == [(1979, 9), (2022, 18)]


def test_economy_separates_actuals_from_projections():
    doc = load("economy")
    boundary = doc["_meta"]["estimate_boundary"]["last_actual_fy"]
    rows = doc["data"]
    assert max(r["y"] for r in rows if r["actual"]) == boundary
    assert any(not r["actual"] for r in rows), "CBO publishes projections; none were flagged"


def test_every_output_carries_a_verbatim_source():
    for path in DATA.glob("*.json"):
        meta = json.loads(path.read_text())["_meta"]
        assert meta.get("source"), f"{path.name} has no _meta.source"
        assert meta["source"] != "CBO data", f"{path.name} summarised its source"
        assert "provenance" in meta, f"{path.name} has no provenance block"


def test_net_interest_series_low_is_fy2003(budget):
    """Section 7 says FY2015 is a 'trough', which only holds if FY2003 is lower."""
    span = {y: r["n_ni"] for y, r in budget.items() if 1995 <= y <= 2025}
    assert min(span, key=span.get) == 2003


# ---- sections 5-7 (issue #5) ----------------------------------------------

def test_section5_revenue_and_outlay_means_hold(budget):
    """sections.md section 5: revenue averaged 17.2% of GDP, outlays 21.1%."""
    span = [budget[y] for y in range(1995, 2026)]
    re_mean = sum(r["g_re"] for r in span) / len(span)
    ot_mean = sum(r["g_ot"] for r in span) / len(span)
    assert abs(re_mean - 17.2) <= 0.06, f"revenue mean {re_mean:.2f}"
    assert abs(ot_mean - 21.1) <= 0.06, f"outlays mean {ot_mean:.2f}"


def test_section5_surplus_band_is_exactly_fy1998_2001(budget):
    """The surplus band section 5 shades must be the SET {1998..2001}, not
    merely a count of four -- and it must not depend on which unit is shown,
    so this checks the sign of the nominal deficit only."""
    span = range(1995, 2026)
    surplus = sorted(y for y in span if budget[y]["n_de"] > 0)
    assert surplus == [1998, 1999, 2000, 2001]


def test_section6_mandatory_growth_is_quoted_on_the_net_basis(budget):
    """sections.md section 6 quotes mandatory growth net of offsetting
    receipts (194%). Also assert gross is materially different, so the two
    bases can never be silently swapped back."""
    a, b = budget[1995], budget[2025]
    net = 100 * ((b["r_ma"] + b["r_or"]) / (a["r_ma"] + a["r_or"]) - 1)
    gross = 100 * (b["r_ma"] / a["r_ma"] - 1)
    assert abs(net - 194) <= 1.0, f"net growth {net:.2f}"
    assert abs(net - gross) > 3, "net and gross bases have converged; re-check which one sections.md quotes"


def test_section7_net_interest_share_of_deficits_is_39_percent(budget):
    """sections.md section 7: $9.4T in net interest is 39% of all deficits
    across the same 31 years."""
    span = [budget[y] for y in range(1995, 2026)]
    total_ni = sum(r["n_ni"] for r in span)
    total_deficits = sum(-r["n_de"] for r in span)
    share = 100 * total_ni / total_deficits
    assert abs(share - 39) <= 1.0, f"net interest is {share:.1f}% of deficits"


def test_section7_series_low_is_not_the_fy2015_trough(budget):
    """FY2003 must be strictly lower than FY2015 in both nominal and real
    dollars, or section 7's "trough, not the series low" wording is wrong."""
    assert budget[2003]["n_ni"] < budget[2015]["n_ni"]
    assert budget[2003]["r_ni"] < budget[2015]["r_ni"]


# ---- failure behaviour ---------------------------------------------------

def test_unreachable_source_raises_rather_than_returning_empty():
    with pytest.raises(SourceUnavailable):
        fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=NOT_A_SERIES",
              source="test", min_bytes=500, use_cache=False)


def test_truncated_body_is_treated_as_failure():
    """A short body must fail, not parse cleanly as 'no rows'."""
    with pytest.raises(SourceUnavailable):
        fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=GINIALLRF",
              source="test", min_bytes=10_000_000, use_cache=False)


# ---- counted party splits ------------------------------------------------

@pytest.fixture(scope="module")
def splits() -> dict[str, dict]:
    return {r["public_law"]: r for r in load("party_splits")["data"]}


def test_tcja_reproduces_the_published_record(splits):
    """The one law with an independently verified split. If this drifts, the
    Voteview join is wrong and every other split is suspect."""
    t = splits["115-97"]
    assert (t["house"]["r"]["yea"], t["house"]["r"]["nay"]) == (224, 12)
    assert (t["house"]["d_caucus"]["yea"], t["house"]["d_caucus"]["nay"]) == (0, 189)
    assert (t["senate"]["r"]["yea"], t["senate"]["r"]["nay"]) == (51, 0)
    assert (t["senate"]["d_caucus"]["yea"], t["senate"]["d_caucus"]["nay"]) == (0, 48)


def test_senate_caucus_differs_from_party_membership(splits):
    """Two independents caucus with the Democrats; published tallies fold them in.
    Both bases must be available or a chart cannot say which it is showing."""
    s = splits["115-97"]["senate"]
    assert s["d"]["nay"] == 46 and s["i"]["nay"] == 2
    assert s["d_caucus"]["nay"] == 48


def test_cares_house_vote_is_absent_not_unanimous(splits):
    """The House passed the CARES Act by voice vote. No roll call exists."""
    c = splits["116-136"]
    assert c["house"] is None
    assert "voice vote" in c["note"].lower()
    assert c["senate"]["yea"] == 96


def test_counted_character_matches_the_hand_classification(splits):
    """Independent check: the counted splits should reproduce the classification
    SOURCES.md derived from published vote character, for all 23 laws."""
    legacy = {"XP": "cross-party", "PLR": "party-line", "PLD": "party-line"}
    for pl, r in splits.items():
        assert r["character"] == legacy[r["legacy_classification"]], pl


def test_cross_party_and_party_line_totals(splits):
    """sections.md section 8: 16 cross-party laws at $9.24T against 7 at $7.52T."""
    laws = [l for r in load("budget")["data"] for l in r["L"]]
    cost = {"cross-party": 0.0, "party-line": 0.0}
    count = {"cross-party": 0, "party-line": 0}
    for l in laws:
        ch = splits[l["public_law"]]["character"]
        count[ch] += 1
        cost[ch] += l["score_t"] or 0
    assert count["cross-party"] == 16 and count["party-line"] == 7
    assert abs(cost["cross-party"] - 9.24) <= 0.02
    assert abs(cost["party-line"] - 7.52) <= 0.02


def test_every_mapped_rollcall_passed(splits):
    """A tie is a pass in the Senate (VP tiebreak) and a failure in the House."""
    for pl, r in splits.items():
        for ch in ("house", "senate"):
            v = r[ch]
            if v is None:
                continue
            assert v["yea"] >= (v["nay"] if ch == "senate" else v["nay"] + 1), f"{pl} {ch}"


# ---- CBO effective rates (issue #10, Households §4) ----------------------

def test_cbo_effective_rates_are_anchor_points_not_a_series():
    """Published anchor years only. 1979 and 2022 are the hard floor the issue
    names; charting a connecting line between years would assert an annual
    series that was never observed."""
    doc = load("cbo_effective_rates")
    years = {r["year"] for r in doc["data"]["rows"]}
    assert {1979, 2022} <= years
    assert "not_an_annual_series" in doc["data"] or "not_an_annual_series" in doc["_meta"]
    for r in doc["data"]["rows"]:
        assert r["v"]["top1"] >= r["v"]["highest"] >= r["v"]["lowest"]


def test_cbo_effective_rates_basis_names_payroll_tax():
    """The comparability trap against income_tax_by_group must be structural,
    not editorial: the basis text itself must say 'payroll'."""
    doc = load("cbo_effective_rates")
    assert "payroll" in doc["data"]["basis"].lower()


# ---- Bracket history (issue #10, Households §3) ---------------------------

@pytest.fixture(scope="module")
def brackets() -> dict[int, dict]:
    return {r["y"]: r for r in load("bracket_history")["data"]}


def test_bracket_history_reproduces_curated_top_rates(brackets):
    top_rates = curated._load("top_rates")["top_marginal_rate"]
    assert len(brackets) == 113
    for y, want in top_rates.items():
        assert abs(brackets[y]["top"] - want) < 0.001, f"{y}: {brackets[y]['top']} != {want}"


def test_bracket_history_adjustment_years_are_documented(brackets):
    adj_years = sorted(y for y, r in brackets.items() if r["adj"])
    assert adj_years == [1923, 1929, 1940, 1946, 1947, 1948, 1949, 1950, 1968, 1969, 1970, 1981]
    for y in adj_years:
        r = brackets[y]
        assert abs(r["adj"]["schedule"] - r["sched_top"]) < 0.001
        assert abs(r["adj"]["published"] - r["top"]) < 0.001
        assert r["adj"]["why"].strip()
        assert r["adj"]["source"].strip()
    for y, r in brackets.items():
        if y not in adj_years:
            assert abs(r["sched_top"] - r["top"]) < 0.001, f"{y}: undocumented divergence"


def test_bracket_thresholds_carry_both_nominal_and_constant_dollars(brackets):
    for y, r in brackets.items():
        for status, ladder in r["s"].items():
            if ladder is None:
                continue
            for b in ladder:
                assert "lo" in b and "rlo" in b and "hi" in b and "rhi" in b
                assert b["rlo"] >= 0  # the lowest bracket in every schedule starts at $0
                assert (b["hi"] is None) == (b["rhi"] is None)


def test_filing_statuses_are_not_projected_backwards(brackets):
    for y, r in brackets.items():
        if y < 1949:
            assert r["s"]["mfj"] is None and r["s"]["mfs"] is None
        else:
            assert r["s"]["mfj"] is not None and r["s"]["mfs"] is not None
        if y < 1952:
            assert r["s"]["hoh"] is None
        else:
            assert r["s"]["hoh"] is not None


def test_bracket_count_runs_from_two_in_1988_to_fiftysix_in_1918(brackets):
    nb = {y: r["nb"] for y, r in brackets.items()}
    lo_year = min(nb, key=lambda y: nb[y])
    hi_year = max(nb, key=lambda y: nb[y])
    assert (lo_year, nb[lo_year]) == (1988, 2)
    assert (hi_year, nb[hi_year]) == (1918, 56)


def test_bracket_history_absent_values_are_null_not_zero(brackets):
    for y, r in brackets.items():
        if y < 1949:
            assert r["s"]["mfj"] is None
        top_bracket = r["s"]["single"][-1]
        assert top_bracket["hi"] is None and top_bracket["rhi"] is None


# ---- GOV-10 (#7): revenue by source and the OECD comparison --------------

REVENUE_PARTS = ["ii", "pr", "ci", "ex", "cu", "eg", "mi"]


def test_revenue_components_sum_in_the_gdp_and_share_families():
    """test_revenue_components_sum_to_total above covers n_ only; the g_ and
    s_ families carry the same invariant and were previously unchecked."""
    for r in load("revenue_sources")["data"]:
        got_g = sum(r[f"g_{p}"] for p in REVENUE_PARTS)
        assert abs(got_g - r["g_tot"]) <= 0.01, f"FY{r['y']} g_: {got_g:.3f} vs {r['g_tot']:.3f}"

        got_s = sum(r[f"s_{p}"] for p in REVENUE_PARTS)
        assert abs(got_s - 100.0) <= 0.05, f"FY{r['y']} s_: sums to {got_s:.3f}"


def test_miscellaneous_revenue_is_never_zero():
    for r in load("revenue_sources")["data"]:
        assert r["n_mi"] > 0, f"FY{r['y']}: n_mi is not positive"
        assert r["g_mi"] > 0, f"FY{r['y']}: g_mi is not positive"


def test_revenue_series_is_contiguous_and_has_no_null_fields():
    rows = load("revenue_sources")["data"]
    years = sorted(r["y"] for r in rows)
    assert years == list(range(1962, 2026)), "revenue_sources: expected FY1962-FY2025, contiguous"
    assert len(rows) == 64
    for r in rows:
        for k, v in r.items():
            assert v is not None, f"FY{r['y']}: {k} is null"


def test_customs_is_the_fastest_growing_revenue_line():
    """The section's callout: customs grew faster, as a share of GDP, than
    every other revenue component from FY1995 to FY2025."""
    by = {r["y"]: r for r in load("revenue_sources")["data"]}
    ratios = {p: by[2025][f"g_{p}"] / by[1995][f"g_{p}"] for p in REVENUE_PARTS}
    assert max(ratios, key=ratios.get) == "cu", ratios


def test_oecd_average_is_flagged_and_the_country_list_is_a_selection():
    oecd = load("oecd")["data"]
    avg = [c for c in oecd["countries"] if c.get("is_average")]
    us = [c for c in oecd["countries"] if c.get("is_us")]
    assert len(avg) == 1 and avg[0]["v"] == oecd["oecd_average_pct_gdp"]
    assert len(us) == 1 and us[0]["v"] == oecd["us_pct_gdp"]
    assert len(oecd["countries"]) < oecd["of_countries"], "the country list must be a selection"


def test_oecd_and_federal_revenue_are_marked_as_different_scopes():
    """BRIEF.md rule 3: the OECD 25.6% counts federal+state+local; CBO's
    17.2% is federal only. Both _meta.notes must keep saying so, or a chart
    could silently start treating them as comparable."""
    oecd_notes = " ".join(load("oecd")["_meta"]["notes"]).lower()
    revenue_notes = " ".join(load("revenue_sources")["_meta"]["notes"]).lower()
    assert "state and local" in oecd_notes
    assert "federal" in oecd_notes
    assert "federal" in revenue_notes and "oecd" in revenue_notes
# ---- issue #6: debt holders and repricing ---------------------------------

def test_crossing_date_is_reconciled_not_competing():
    """discrepancies.yaml -> forty_trillion_crossing_date: both dates are right
    and must never be presented as competing figures."""
    crossing = load("debt")["_meta"]["threshold_crossing"]
    assert crossing["record_date"] == "2026-08-18"
    assert crossing["reported_date"] == "2026-08-19"

    rows = load("debt")["data"]
    non_year_end = [r for r in rows if not r.get("year_end")]
    assert len(non_year_end) == 1
    assert non_year_end[0]["as_of"] == crossing["record_date"]

    for path in (LEGACY / "SOURCES.md", LEGACY / "sections.md"):
        # Collapse to one line first: prose wraps across source lines, and the
        # rule is about the sentence, not the raw line.
        blob = " ".join(path.read_text().split())
        for sentence in blob.split(". "):
            if "19 August 2026" in sentence:
                assert "18 August 2026" in sentence, f"{path.name}: {sentence!r} names " \
                    "19 August without 18 August in the same sentence"


ISLANDS = LEGACY / "src" / "components" / "islands"
GOV_PAGE = LEGACY / "src" / "pages" / "government" / "index.astro"


def _rendered_section(section_id: str) -> str:
    """The literal source of one hardcoded <section id="..."> block in
    index.astro, from its opening tag to its first closing </section>."""
    page = GOV_PAGE.read_text()
    start = page.index(f'id="{section_id}"')
    end = page.index("</section>", start)
    return page[start:end]


def test_foreign_share_always_carries_its_denominator():
    """discrepancies.yaml -> foreign_share_of_debt: 30% of publicly held debt
    and 24% of gross debt are different quantities and must never read as one."""
    resolution = curated.discrepancies()["foreign_share_of_debt"]["use"]
    assert resolution["share_of_public_pct"] == 30
    assert resolution["share_of_gross_pct"] == 24

    notes = " ".join(load("debt_holders")["_meta"]["notes"]).lower()
    assert "publicly held" in notes and "gross" in notes

    src = (ISLANDS / "DebtHolders.tsx").read_text()
    fn_start = src.index("const foreignShare")
    fn_end = src.index("\n\n", fn_start)
    outside = src[:fn_start] + src[fn_end:]
    assert "30%" not in outside and "24%" not in outside, \
        "DebtHolders.tsx: a bare 30%/24% literal exists outside the foreignShare formatter"


def test_public_split_is_keyed_to_its_denominator():
    """Every public_split entry uses share_of_public_pct; none carries a bare
    share_pct a renderer could mistake for a share of gross debt."""
    for s in load("debt_holders")["data"]["public_split"]:
        assert "share_of_public_pct" in s
        assert "share_pct" not in s


def test_section_2_uses_no_party_colours():
    for name in ("DebtHolders.tsx", "DebtMaturity.tsx"):
        src = (ISLANDS / name).read_text()
        for tok in ("--dem", "--gop", "--mix"):
            assert tok not in src, f"{name} uses the partisan token {tok}"


def test_federal_reserve_absent_from_rendered_section_2():
    """Scoped like test_federal_reserve_holdings_stay_omitted: the string is a
    legitimate, sections.md-verbatim trap in the §2 STANDFIRST, but must not
    reach the data, the island, or the rest of the rendered section."""
    assert "federal reserve" not in json.dumps(load("debt_holders")["data"]).lower()
    assert "federal reserve" not in (ISLANDS / "DebtHolders.tsx").read_text().lower()

    section2 = _rendered_section("who-holds-it").lower()
    assert section2.count("federal reserve") == 1, \
        "section 2 should name the Federal Reserve exactly once, in its standfirst"
    standfirst_end = section2.index("</p>", section2.index("standfirst"))
    assert "federal reserve" in section2[:standfirst_end]


def test_tic_revision_note_is_carried():
    notes = " ".join(load("debt_holders")["_meta"]["notes"])
    assert "683" in notes and "760" in notes and "monthly" in notes.lower()
    section2 = _rendered_section("who-holds-it")
    assert "683 billion" in section2 and "monthly" in section2.lower()


def test_maturity_instruments_are_not_an_exhaustive_partition():
    """EC2: 6.8 + 15.9 + 5.4 = 28.1 against a curated marketable_total_t of
    28.0. This must stay true and must stay stated in words, or a reader could
    mistake the three instrument families for an exhaustive partition."""
    d = load("debt_maturity")["data"]
    total = sum(c["amount_t"] for c in d["composition"])
    assert abs(total - d["marketable_total_t"]) > 0.01
    notes = " ".join(load("debt_maturity")["_meta"]["notes"]).lower()
    assert "not an exhaustive partition" in notes or "do not sum" in notes


def test_maturity_percentages_are_never_derived_from_amounts():
    """EC3: bills.share_pct (22) disagrees with amount_t / marketable_total_t
    (24.3%) on purpose. Only bills carries a curated share; DebtMaturity.tsx
    must never compute one from amount_t / marketable_total_t."""
    d = load("debt_maturity")["data"]
    comp = {c["k"]: c for c in d["composition"]}
    assert "share_pct" in comp["bills"]
    assert "share_pct" not in comp["notes"] and "share_pct" not in comp["bonds"]

    derived = round(100 * comp["bills"]["amount_t"] / d["marketable_total_t"], 1)
    assert derived != comp["bills"]["share_pct"], \
        "the curated bills share and the derived amount now agree; the EC3 trap may be stale"

    src = (ISLANDS / "DebtMaturity.tsx").read_text()
    assert "marketable_total_t" not in src or "amount_t /" not in src, \
        "DebtMaturity.tsx appears to divide an amount by marketable_total_t"


def test_maturity_history_is_not_charted():
    """sections.md §3: 'Do not build this as a time series.' The field stays in
    the data (deleting curated data is a separate editorial act) but no
    component may reference it."""
    assert "history_months" not in (ISLANDS / "DebtMaturity.tsx").read_text()
    notes = " ".join(load("debt_maturity")["_meta"]["notes"]).lower()
    assert "history_months" in notes and "not" in notes


def test_curated_snapshots_expose_their_as_of():
    """E1: a curated snapshot carries no vintage/retrieved_at, so vintageOf()
    returns null and a figure could ship with no freshness stamp at all.
    curatedVintage() must be used instead, and the page must call it."""
    for name in ("debt_holders", "debt_maturity"):
        meta = load(name)["_meta"]
        assert meta.get("refresh", {}).get("mode") == "curated"

    page = GOV_PAGE.read_text()
    assert page.count("curatedVintage(") >= 2, \
        "index.astro should call curatedVintage() for both debtHolders and debtMaturity"
# ---- section 8: the law explorer ----

def _laws() -> list[dict]:
    return [l for r in load("budget")["data"] for l in r["L"]]


def _enactment_fy(date: str) -> int:
    """Mirrors `enactmentFy` in src/components/laws/derive.ts: the federal
    fiscal year starts 1 October of the prior calendar year."""
    y, m, _ = (int(p) for p in date.split("-"))
    return y + 1 if m >= 10 else y


def _margin(split: dict) -> int | None:
    """Mirrors `margin` in src/components/laws/derive.ts: the narrowest
    passage margin across chambers that HAVE a roll call."""
    chambers = [split[ch] for ch in ("house", "senate") if split[ch] is not None]
    if not chambers:
        return None
    return min(v["yea"] - v["nay"] for v in chambers)


def test_every_law_joins_to_a_counted_split(splits):
    """D1: every law's vote data comes from the counted party_splits.json join
    on public_law, not from vote_character or legacy_comp."""
    laws = _laws()
    assert len(splits) == 23
    for l in laws:
        assert l["public_law"] in splits, f"{l['public_law']} has no counted split"


def test_filter_totals_render_to_the_published_two_places(splits):
    """D5: the EXACT strings the UI prints, not a tolerance. Pins the
    7.51/7.52 resolution — the true sum is 7.512, which the UI's toFixed(2)
    renders as 7.51, and sections.md section 8 must agree."""
    laws = _laws()
    cost = {"cross-party": 0.0, "party-line": 0.0}
    count = {"cross-party": 0, "party-line": 0}
    for l in laws:
        ch = splits[l["public_law"]]["character"]
        count[ch] += 1
        cost[ch] += l["score_t"] or 0
    assert count["party-line"] == 7 and count["cross-party"] == 16
    assert f"{cost['party-line']:.2f}" == "7.51"
    assert f"{cost['cross-party']:.2f}" == "9.24"


def test_the_two_1997_laws_carry_no_score_but_do_carry_votes(splits):
    """D4/E2: the two 1997 laws predate the ten-year scoring convention and
    are excluded from totals, but still carry a countable vote in both
    chambers."""
    laws = {l["public_law"]: l for l in _laws()}
    for pl in ("105-33", "105-34"):
        assert laws[pl]["score_t"] is None
        assert splits[pl]["house"] is not None
        assert splits[pl]["senate"] is not None


def test_cares_house_cell_has_no_countable_vote(splits):
    """D3: extends test_cares_house_vote_is_absent_not_unanimous with the
    exact fields the House table cell and its footnote depend on."""
    c = splits["116-136"]
    assert c["house"] is None
    assert c.get("note")


def test_vp_tiebreak_laws_are_exactly_the_three_named(splits):
    """E3: fails loudly if a fourth 50-50 Senate vote appears uncounted for."""
    tied = {pl for pl, r in splits.items() if r["senate"] and r["senate"]["yea"] == r["senate"]["nay"]}
    assert tied == {"108-27", "117-169", "119-21"}


def test_narrowest_chamber_margin_is_defined_for_every_law(splits):
    """D6: the counted margin (min over chambers with a roll call of
    yea - nay) is a total function over all 23 laws, including CARES, which
    has no House roll call but does have a Senate margin."""
    for pl, r in splits.items():
        m = _margin(r)
        assert m is not None, f"{pl} has no margin"
        assert m >= 0, f"{pl} margin is negative: {m}"


def test_deficit_share_exists_for_every_enactment_fiscal_year(budget):
    """E6: no enactment marker lands on a fiscal year missing from the
    deficit series."""
    for l in _laws():
        fy = _enactment_fy(l["date"])
        assert fy in budget, f"{l['public_law']} enacted in FY{fy}, missing from budget"
        assert budget[fy]["g_de"] is not None, f"FY{fy} has no deficit share"


def test_section_8_no_longer_claims_classified_composition():
    """S4/D9: the shipped section states the splits are counted, not
    classified, and stops the earlier claim from regressing."""
    sections = (LEGACY / "sections.md").read_text()
    start = sections.index("## 8 / The laws")
    end = sections.index("## 9 /", start)
    section_8 = sections[start:end]
    assert "classified from published vote character" not in section_8
    assert "Voteview" in section_8

    sources = (LEGACY / "SOURCES.md").read_text()
    vstart = sources.index("## The counted vote splits")
    vend = sources.index("\n## ", vstart + 1)
    vote_section = sources[vstart:vend]
    assert "classified from published vote character" not in vote_section
    assert "Voteview" in vote_section
# ---- §9 attribution: the same $16.75T two ways ----------------------------
#
# These reproduce, independently of src/components/attribution/aggregate.ts,
# the arithmetic that module performs: bucket by counted coalition and by
# signing president, sum in integer thousandths of a trillion, and check both
# breakdowns reconcile to the cent. All names are prefixed `test_attribution_`
# so they cannot collide with #2's or #3's additions to this file.

def _all_laws() -> list[dict]:
    return [l for r in load("budget")["data"] for l in r["L"]]


def _scored_laws() -> list[dict]:
    return [l for l in _all_laws() if l["score_t"] is not None]


def _counted_coalition(law: dict, splits: dict[str, dict]) -> str:
    """The counted (not classified) coalition key: reads only `character` and
    the yea counts, exactly as aggregate.ts does. A null chamber (no roll
    call) contributes nothing to either side."""
    s = splits[law["public_law"]]
    if s["character"] == "cross-party":
        return "cross-party"
    r = d = 0
    for chamber in ("house", "senate"):
        v = s[chamber]
        if v is None:
            continue
        r += v["r"]["yea"]
        d += v["d_caucus"]["yea"]
    return "party-line-r" if r > d else "party-line-d"


def test_attribution_both_breakdowns_reconcile_to_the_same_total(splits):
    """sections.md §9: both breakdowns net to $16.75T. Compared as exact
    integer thousandths, not pytest.approx — this is the reconciliation
    invariant aggregate.ts throws on at import time."""
    by_coalition: dict[str, int] = {}
    by_president: dict[str, int] = {}
    for l in _scored_laws():
        thou = round(l["score_t"] * 1000)
        key = _counted_coalition(l, splits)
        by_coalition[key] = by_coalition.get(key, 0) + thou
        by_president[l["president"]] = by_president.get(l["president"], 0) + thou
    assert sum(by_coalition.values()) == sum(by_president.values()) == 16750


def test_attribution_coalition_totals_match_the_published_finding(splits):
    """cross-party +$9.24T (14 scored of 16 in the coalition), party-line
    Republican +$5.21T (3), party-line Democratic +$2.31T (4)."""
    net = {"cross-party": 0, "party-line-r": 0, "party-line-d": 0}
    count = {"cross-party": 0, "party-line-r": 0, "party-line-d": 0}
    for l in _scored_laws():
        key = _counted_coalition(l, splits)
        net[key] += round(l["score_t"] * 1000)
        count[key] += 1
    assert net["cross-party"] == 9238 and count["cross-party"] == 14
    assert net["party-line-r"] == 5206 and count["party-line-r"] == 3
    assert net["party-line-d"] == 2306 and count["party-line-d"] == 4
    coalition_count = {"cross-party": 0, "party-line-r": 0, "party-line-d": 0}
    for l in _all_laws():
        coalition_count[_counted_coalition(l, splits)] += 1
    assert coalition_count["cross-party"] == 16


def test_attribution_president_totals_match_the_published_finding():
    """Trump I +$6.08T (5), Obama +$3.98T (6), Trump II +$3.40T (1),
    G.W. Bush +$2.79T (4), Biden +$0.50T (5)."""
    net: dict[str, int] = {}
    count: dict[str, int] = {}
    for l in _scored_laws():
        net[l["president"]] = net.get(l["president"], 0) + round(l["score_t"] * 1000)
        count[l["president"]] = count.get(l["president"], 0) + 1
    assert net["Trump I"] == 6076 and count["Trump I"] == 5
    assert net["Obama"] == 3982 and count["Obama"] == 6
    assert net["Trump II"] == 3400 and count["Trump II"] == 1
    assert net["G.W. Bush"] == 2795 and count["G.W. Bush"] == 4
    assert net["Biden"] == 497 and count["Biden"] == 5


def test_attribution_gross_and_net_differ_by_the_reductions():
    """Gross $20.73T, net $16.75T, reductions $3.98T. Obama specifically:
    $6.22T gross against $2.24T of reductions, the pair sections.md §9's
    body cites."""
    laws = _scored_laws()
    inc = sum(round(l["score_t"] * 1000) for l in laws if l["score_t"] >= 0)
    red = sum(round(l["score_t"] * 1000) for l in laws if l["score_t"] < 0)
    assert inc == 20731
    assert inc + red == 16750
    assert -red == 3981

    obama = [l for l in laws if l["president"] == "Obama"]
    obama_inc = sum(round(l["score_t"] * 1000) for l in obama if l["score_t"] >= 0)
    obama_red = sum(round(l["score_t"] * 1000) for l in obama if l["score_t"] < 0)
    assert obama_inc == 6225
    assert -obama_red == 2243


def test_attribution_excludes_the_two_1997_laws():
    """105-33 and 105-34 predate the ten-year scoring convention and carry
    score_t: null. Excluded from every bucket; 21 scored laws remain."""
    laws = _all_laws()
    excluded = [l for l in laws if l["public_law"] in ("105-33", "105-34")]
    assert len(excluded) == 2
    assert all(l["score_t"] is None for l in excluded)
    assert len(_scored_laws()) == 21


def test_attribution_party_line_side_is_counted_not_classified(splits):
    """The party-line R/D assignment, derived purely from counted yeas, must
    equal the expected public-law sets. Computed without ever reading
    legacy_comp, legacy_classification or vote_character."""
    party_line = [l for l in _all_laws() if splits[l["public_law"]]["character"] == "party-line"]
    r_side = {l["public_law"] for l in party_line if _counted_coalition(l, splits) == "party-line-r"}
    d_side = {l["public_law"] for l in party_line if _counted_coalition(l, splits) == "party-line-d"}
    assert r_side == {"108-27", "115-97", "119-21"}
    assert d_side == {"111-5", "111-148 / 111-152", "117-2", "117-169"}


def test_attribution_every_law_joins_to_a_counted_split(splits):
    """All 23 public_law values resolve in party_splits, and no bucketed law
    carries character == 'no recorded vote' (aggregate.ts throws if one ever
    does rather than silently bucketing it)."""
    for l in _all_laws():
        assert l["public_law"] in splits, l["public_law"]
        assert splits[l["public_law"]]["character"] != "no recorded vote"


# ---- section 11/12 limits -------------------------------------------------

def test_crisis_years_are_a_third_of_all_borrowing(budget):
    """sections.md section 11 concentration item: FY2008-09 and FY2020-21 against
    the other 27 years of the FY1995-FY2025 span."""
    crisis = [2008, 2009, 2020, 2021]
    span = [y for y in range(1995, 2026) if y in budget]
    crisis_total = -sum(budget[y]["n_de"] for y in crisis)
    whole_total = -sum(budget[y]["n_de"] for y in span)
    other = [y for y in span if y not in crisis]
    other_avg = -sum(budget[y]["n_de"] for y in other) / len(other)

    assert abs(crisis_total - 7.78) <= 0.02
    assert abs(100 * crisis_total / whole_total - 32) <= 0.6
    assert abs(other_avg - 0.61) <= 0.01


def test_deficit_debt_gap_matches_the_curated_resolution(budget):
    """discrepancies.yaml locks the $24.15T/$26.74T gap; the deficit side must
    still agree with what the pipeline actually recomputes."""
    gap = curated.discrepancies()["deficit_vs_debt_gap"]["use"]
    assert gap["cumulative_deficits_t"] == 24.15
    assert gap["debt_held_by_public_rise_t"] == 26.74

    span = [y for y in range(1995, 2026) if y in budget]
    recomputed = -sum(budget[y]["n_de"] for y in span)
    assert abs(recomputed - gap["cumulative_deficits_t"]) <= 0.05


def test_limits_section_quotes_the_curated_deficit_debt_gap():
    """$26.74T has no output field to resolve against, so it is locked here
    instead of in prose_figures.yaml."""
    html = (LEGACY / "src" / "pages" / "government" / "index.astro").read_text()
    assert "$24.15 trillion" in html
    assert "$26.74 trillion" in html


def test_limits_section_does_not_call_the_votes_classified():
    """Limit 4 must describe the counted splits, not the retired classification."""
    src = (LEGACY / "src" / "pages" / "government" / "index.astro").read_text()
    limits = src[src.index('id="limits"'):]
    assert "classif" not in limits.lower()


def test_sources_doc_describes_counted_splits():
    """SOURCES.md's 'vote composition limitation' section must match the shipped
    reality: counted, not classified, with all four remaining limits named."""
    doc = (LEGACY / "SOURCES.md").read_text()
    assert "classified from published vote character" not in doc
    assert "Voteview" in doc
    assert "final-passage" in doc
    assert "voice" in doc.lower() and "27 March 2020" in doc
    assert "10%" in doc
    assert "caucus" in doc.lower()


def test_exactly_one_chamber_vote_is_absent(splits):
    """Guards limit 4's CARES Act clause against a future Voteview vintage
    quietly acquiring a roll call that today does not exist."""
    absent = [(pl, ch) for pl, r in splits.items() for ch in ("house", "senate") if r[ch] is None]
    assert absent == [("116-136", "house")]
