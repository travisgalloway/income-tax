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
