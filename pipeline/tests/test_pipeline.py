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


# ---- by state -------------------------------------------------------------

@pytest.fixture(scope="module")
def balance() -> dict:
    return load("states_balance")["data"]


@pytest.fixture(scope="module")
def tax_mix() -> dict:
    return load("states_tax_mix")["data"]


def test_states_balance_has_51_in_grid_jurisdictions(balance):
    """The tile-grid cartogram draws the 50 states plus DC, nothing else."""
    in_grid = [j for j in balance["jurisdictions"] if j["in_grid"]]
    assert len(in_grid) == 51


def test_states_dc_is_flagged_and_excluded_from_the_colour_domain(balance):
    """DC is not a state, is an extreme outlier by construction, and must not
    flatten the 50-state colour range."""
    dc = next(j for j in balance["jurisdictions"] if j["code"] == "DC")
    assert dc["in_grid"] is True
    assert "DC" in balance["color_domain"]["excludes"]
    assert balance["color_domain"]["min"] < 0 < balance["color_domain"]["max"]


def test_states_territories_have_get_but_not_give(balance):
    """USASpending covers PR/GU/VI/MP/AS; IRS Table 5 does not. The asymmetry
    must be recorded as null, never dropped or zero-filled."""
    territories = [j for j in balance["jurisdictions"] if not j["in_grid"]]
    assert territories, "no territory rows: coverage was silently dropped"
    for j in territories:
        assert j["give_b"] is None
        assert j["get_b"] is not None


def test_states_no_derived_field_is_silently_zero(balance):
    """Missing is missing; a genuine zero this small is implausible for any of
    these series, so a 0 here means a null slipped through the join as a zero."""
    for j in balance["jurisdictions"]:
        for k in ("give_b", "get_b", "balance_pc", "ratio"):
            assert j[k] is None or j[k] != 0, (j["code"], k)


def test_states_give_and_get_are_the_same_fiscal_year(balance):
    """Give (IRS) and get (USASpending) are deliberately fetched for the same
    FY window; this is a join invariant, not a coincidence."""
    assert balance["fy_give"] == balance["fy_get"]


def test_states_jurisdiction_give_sums_within_national_total(balance):
    """A join that silently dropped a state would undercount here by more than
    the International/Undistributed/overseas remainder."""
    total = sum(j["give_b"] for j in balance["jurisdictions"] if j["give_b"] is not None)
    national = balance["national"]["give_b"]
    assert total <= national + 1e-6
    assert abs(total - national) / national <= 0.02


def test_states_ratio_is_null_or_positive(balance):
    for j in balance["jurisdictions"]:
        assert j["ratio"] is None or j["ratio"] > 0, j["code"]


def test_states_tax_mix_shares_are_percentages_or_null(tax_mix):
    for j in tax_mix["jurisdictions"]:
        for k, v in j["shares"].items():
            assert v is None or 0 <= v <= 100, (j["code"], k, v)


def test_states_tax_mix_not_levied_is_distinct_from_missing(tax_mix):
    """A Census 'X' means the state does not levy that tax, which is a FACT and
    must never collapse into the same rendering as a genuinely missing figure."""
    alaska = next(j for j in tax_mix["jurisdictions"] if j["code"] == "AK")
    assert "income_ind" in alaska["not_levied"]
    assert "sales_general" in alaska["not_levied"]
    assert alaska["shares"]["income_ind"] is None
    for j in tax_mix["jurisdictions"]:
        for k, v in j["shares"].items():
            if v is None:
                assert k in j["not_levied"] or j.get("partial"), (j["code"], k)


def test_no_party_colour_token_in_the_state_section_source():
    """BRIEF.md: no party colours in non-partisan data. Checked here as well as
    structurally in the frontend, so a regression fails in two places."""
    src = ROOT.parent / "src"
    for f in ("components/islands/StateGiveGet.tsx", "components/islands/StateTaxMix.tsx",
              "components/charts/stateGrid.ts"):
        text = (src / f).read_text()
        for token in ("--dem", "--gop", "--mix"):
            assert token not in text, f"{f} references partisan token {token}"
