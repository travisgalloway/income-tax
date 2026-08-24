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
