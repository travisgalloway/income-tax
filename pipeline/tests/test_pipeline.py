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
    src = (ISLANDS / "DebtHolders.tsx").read_text()
    for tok in ("--dem", "--gop", "--mix"):
        assert tok not in src, f"DebtHolders.tsx uses the partisan token {tok}"


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
