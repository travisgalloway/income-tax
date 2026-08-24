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


# ---- economy route --------------------------------------------------------

def test_real_gdp_is_positive_in_every_fiscal_year():
    """Section 1 uses a log axis. A zero or negative rgdp makes the scale undefined."""
    rows = load("economy")["data"]
    for r in rows:
        assert r["rgdp"] is not None and r["rgdp"] > 0, f"FY{r['y']}: rgdp={r['rgdp']}"


def test_nominal_gdp_fy1995_matches_the_budget_route_denominator(budget):
    """The issue's cross-check: economy gdp FY1995 == 7.56, and budget.json's implied
    denominator 100 * n_ot / g_ot agrees within 0.02."""
    economy_gdp = {r["y"]: r["gdp"] for r in load("economy")["data"]}[1995]
    implied = 100 * budget[1995]["n_ot"] / budget[1995]["g_ot"]
    assert abs(economy_gdp - 7.56) <= 0.005
    assert abs(economy_gdp - implied) <= 0.02


def test_output_per_hour_and_median_income_share_1984_to_2024():
    """Section 2's shared window is stated, not silently truncated: mhi is null at
    1983 and 2025, non-null across 1984-2024, and prod is non-null on every actual
    row in that window."""
    economy_rows = {r["y"]: r for r in load("economy")["data"] if r["actual"]}
    mhi = {r["y"]: r["mhi"] for r in load("income_inequality")["data"]}
    assert mhi[1983] is None and mhi[2025] is None
    for y in range(1984, 2025):
        assert mhi[y] is not None, f"{y}: mhi is null inside the claimed window"
        assert economy_rows[y]["prod"] is not None, f"FY{y}: prod is null inside the claimed window"
