"""Regression tests for the pipeline.

These lock down the invariants that a source revision could silently break.
They read the PUBLISHED outputs in src/data, so `uv run pytest` checks what the
site will actually ship, not what a builder would produce in isolation.
"""

from __future__ import annotations

import base64
import copy
import json
import re
import shutil
from collections.abc import Callable
from pathlib import Path

import jsonschema
import pytest

from lib import curated, emit, tic, validate
from lib import fetch as lib_fetch
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


# ---- the on-disk cache contract ------------------------------------------
#
# Offline by construction: each test points CACHE_DIR at a tmp_path, primes it
# by hand in the exact shape lib/fetch.py writes, and aims the call at an
# unroutable host. A cache hit therefore returns; a cache miss can only raise.
# That is what makes them able to prove "no request happened" rather than
# merely "the right value came back".

UNROUTABLE = "https://no-such-host.invalid/never-resolves.csv"


def _prime_cache(cache_dir: Path, key: str, body: dict) -> Path:
    """Write a cache entry exactly as lib/fetch.py would, under `key`.

    The path actually written is derived from `lib_fetch.CACHE_DIR` (a module
    global), not from `cache_dir` -- callers must monkeypatch `CACHE_DIR` to
    `cache_dir` first. The assertion below keeps that requirement honest
    instead of letting a caller that forgot to monkeypatch write silently to
    the real cache directory.
    """
    assert lib_fetch.CACHE_DIR == cache_dir, (
        "cache_dir must equal lib_fetch.CACHE_DIR -- monkeypatch it before calling _prime_cache"
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = lib_fetch._cache_path(key)
    path.write_text(json.dumps(body))
    return path


def test_warm_text_cache_is_served_without_a_request(tmp_path, monkeypatch):
    """The text cache shape is `{url, text, retrieved_at}`. A change to it
    would silently invalidate every warm entry on disk and turn a warm run
    into a full refetch -- which looks like success."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)
    _prime_cache(tmp_path, UNROUTABLE, {
        "url": UNROUTABLE,
        "text": "year,value\n2024,1\n",
        "retrieved_at": "2026-08-26T00:00:00Z",
    })

    resp = lib_fetch.fetch(UNROUTABLE, source="test")

    assert resp.from_cache is True
    assert resp.text == "year,value\n2024,1\n"
    assert resp.retrieved_at == "2026-08-26T00:00:00Z"


def test_binary_cache_round_trips_through_base64(tmp_path, monkeypatch):
    """The binary cache shape is `{url, b64, retrieved_at}` -- a distinct key
    from the text shape, and the bytes must come back byte-for-byte."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)
    payload = b"PK\x03\x04\x00\x01\xff\xfe not utf-8"
    _prime_cache(tmp_path, UNROUTABLE, {
        "url": UNROUTABLE,
        "b64": base64.b64encode(payload).decode("ascii"),
        "retrieved_at": "2026-08-26T00:00:00Z",
    })

    resp = lib_fetch.fetch_bytes(UNROUTABLE, source="test")

    assert resp.from_cache is True
    assert resp.content == payload


def test_post_json_cache_key_includes_the_payload(tmp_path, monkeypatch):
    """USASpending is one URL serving many fiscal-year windows. If the key were
    the bare URL, window B would be served window A's body."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)
    payload_a = {"fiscal_year": 2023, "scope": "state"}
    payload_b = {"fiscal_year": 2024, "scope": "state"}
    key_a = UNROUTABLE + "|" + json.dumps(payload_a, sort_keys=True)
    _prime_cache(tmp_path, key_a, {
        "url": key_a,
        "text": json.dumps({"results": ["fy2023"]}),
        "retrieved_at": "2026-08-26T00:00:00Z",
    })

    # Payload A is served from the cache, so the key derivation is intact...
    assert lib_fetch.post_json(UNROUTABLE, payload_a, source="test") == {"results": ["fy2023"]}

    # ...and payload B misses it, reaching the (unroutable) network instead of
    # quietly returning payload A's body.
    with pytest.raises(SourceUnavailable):
        lib_fetch.post_json(UNROUTABLE, payload_b, source="test")


def test_a_binary_cache_entry_does_not_crash_a_text_fetch(tmp_path, monkeypatch):
    """The one intentional behaviour change in #40. Both cache shapes share
    `_cache_path`, so a URL cached as bytes and later fetched as text used to
    raise KeyError out of `cached["text"]`. It must be a cache miss -- and
    therefore SourceUnavailable here -- exactly as the reverse case already
    was."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)
    _prime_cache(tmp_path, UNROUTABLE, {
        "url": UNROUTABLE,
        "b64": base64.b64encode(b"binary body").decode("ascii"),
        "retrieved_at": "2026-08-26T00:00:00Z",
    })

    with pytest.raises(SourceUnavailable):
        lib_fetch.fetch(UNROUTABLE, source="test")


def test_retrieve_rejects_an_unrecognized_method(tmp_path, monkeypatch):
    """A typo like "post" must fail loudly, not silently fall through to GET."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)

    with pytest.raises(ValueError):
        lib_fetch._retrieve(UNROUTABLE, source="test", cache_key=UNROUTABLE, method="post")


def test_retrieve_rejects_post_without_a_payload(tmp_path, monkeypatch):
    """POST without a payload is a programming error, not a request to send."""
    monkeypatch.setattr(lib_fetch, "CACHE_DIR", tmp_path)

    with pytest.raises(ValueError):
        lib_fetch._retrieve(UNROUTABLE, source="test", cache_key=UNROUTABLE, method="POST")


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
    """sections.md section 8: 16 cross-party laws at $9.24T against 7 at $7.51T."""
    laws = [l for r in load("budget")["data"] for l in r["L"]]
    cost = {"cross-party": 0.0, "party-line": 0.0}
    count = {"cross-party": 0, "party-line": 0}
    for l in laws:
        ch = splits[l["public_law"]]["character"]
        count[ch] += 1
        cost[ch] += l["score_t"] or 0
    assert count["cross-party"] == 16 and count["party-line"] == 7
    assert abs(cost["cross-party"] - 9.24) <= 0.02
    assert abs(cost["party-line"] - 7.51) <= 0.02


def test_law_split_totals_round_the_sum_not_the_displays():
    """E1: half-up on the summed thousandths. Rounding the per-law displays first
    (5.21 + 2.31) gives 7.52; the sum 5.206 + 2.306 = 7.512 gives 7.51."""
    laws = [l for r in load("budget")["data"] for l in r["L"]]
    assert validate._composition_total_t(laws, ("PLR", "PLD")) == 7.51
    assert validate._composition_total_t(laws, ("XP",)) == 9.24
    assert round(5.21 + 2.31, 2) == 7.52  # the wrong order, for the record


def test_check_laws_rejects_a_drifted_split_total(monkeypatch):
    """#32: the constant was 7.52 against a true 7.512 and NOTHING failed.
    Perturb each curated split total and see check_laws fail."""
    good = curated.law_totals()
    clean = validate.Checks()
    validate.check_laws(clean)
    assert clean.failures == [], clean.failures
    for key, bad, needle in (("party_line_t", 7.52, "party-line"),
                             ("cross_party_t", 9.23, "cross-party")):
        monkeypatch.setattr(curated, "law_totals", lambda k=key, b=bad: {**good, k: b})
        c = validate.Checks()
        validate.check_laws(c)
        assert any(needle in f for f in c.failures), (key, c.failures)


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


# ---- income_tax_by_group --------------------------------------------------

def test_top1_income_share_is_present_and_paired():
    """This is the pytest guarding validate.py's criterion-1 check, which
    previously had none. Showing the tax share without the income share beside
    it misleads about who "pays the most" versus who "earns the most"."""
    top1 = next(g for g in load("income_tax_by_group")["data"]["groups"] if g["g"] == "Top 1%")
    assert top1["income_share_pct"] == 20.6
    assert top1["tax_share_pct"] == 38.4


def test_percentile_groups_are_nested_not_a_partition():
    """Top 1% sits inside Top 5%, inside Top 10%, and so on. The six groups'
    tax shares sum well past 100, so they cannot be stacked or summed."""
    groups = load("income_tax_by_group")["data"]["groups"]
    by_g = {g["g"]: g for g in groups}
    ladder = ["Top 1%", "Top 5%", "Top 10%", "Top 25%", "Top 50%"]
    for narrow, wide in zip(ladder, ladder[1:]):
        assert by_g[narrow]["tax_share_pct"] <= by_g[wide]["tax_share_pct"], (narrow, wide)
    assert sum(g["tax_share_pct"] for g in groups) > 100


def test_unpublished_group_cells_are_absent_not_zero():
    """Top 5%, Top 25% and Bottom 50% have no income_share_pct key at all.
    A zero here would chart as a real, published observation."""
    groups = load("income_tax_by_group")["data"]["groups"]
    by_g = {g["g"]: g for g in groups}
    for g in ("Top 5%", "Top 25%", "Bottom 50%"):
        assert "income_share_pct" not in by_g[g]
    for g in groups:
        assert g.get("income_share_pct") != 0
        assert g.get("tax_share_pct") != 0
        assert g.get("avg_rate_pct") != 0


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
FIGURES_MANIFEST = LEGACY / "src" / "data" / "figures.ts"


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
    """TIC is revised monthly and published with a lag, so a country figure
    without its RELEASE MONTH is unreadable. Since #54 the note names the month
    and both endpoints of the apparent conflict, which are one series ten months
    apart rather than two sources disagreeing. `684 billion` is the November
    2025 release rounded to the site's precision; it was `683` while the figure
    came through a news paraphrase."""
    notes = " ".join(load("debt_holders")["_meta"]["notes"])
    assert "683.9" in notes and "760.8" in notes and "monthly" in notes.lower()
    assert "November 2025" in notes
    section2 = _rendered_section("who-holds-it")
    assert "684 billion" in section2 and "monthly" in section2.lower()
    assert "November 2025" in section2


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
    curatedVintage() must be used instead, wherever the figure's source line is
    composed. Since #49 that place is the figure manifest, not the page: the
    call sites take `title`/`source`/`vintage` from `src/data/figures.ts`, which
    /contents reads too.

    Since #54, `debt_holders` is no longer in that set: its foreign holdings are
    fetched, so it carries `mode: "mixed"` and TWO dates, and `mixedVintage()`
    renders both. The distinction is load-bearing rather than cosmetic --
    `curatedVintage` THROWS at build time on a non-curated dataset, which is
    what makes "this output is honestly described" un-skippable."""
    assert load("debt_maturity")["_meta"].get("refresh", {}).get("mode") == "curated"

    holders = load("debt_holders")["_meta"]
    assert holders.get("refresh", {}).get("mode") == "mixed"
    assert holders["refresh"]["reason"], "a mixed dataset must say what is fetched and what is not"
    assert holders["provenance"]["vintage"] and holders["provenance"]["retrieved_at"]

    manifest = FIGURES_MANIFEST.read_text()
    assert manifest.count("curatedVintage(") >= 1, \
        "figures.ts should call curatedVintage() for debtMaturity"
    assert manifest.count("mixedVintage(") == 1, \
        "figures.ts should call mixedVintage() for debtHolders, and for nothing else yet"
    assert GOV_PAGE.read_text().count("curatedVintage(") == 0, \
        "the government page should take its vintages from the manifest, not compose its own"
    assert GOV_PAGE.read_text().count("mixedVintage(") == 0


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


def test_the_laws_to_splits_join_has_exactly_one_implementation():
    """#33: the laws-to-party_splits join lived in two places (aggregate.ts
    threw on an unmatched law, LawExplorer.tsx silently dropped it). It is now
    src/components/laws/join.ts alone. A source-level guard, the same shape as
    test_no_document_still_calls_vote_composition_classified: the JS unit runner
    added in #34 (`npm run test:unit`) does not cover this module and is not wired
    into CI, so this is the only automated way to hold the rule."""
    owner = LEGACY / "src/components/laws/join.ts"
    assert owner.exists(), "the shared join module is missing"
    assert "joinLawsToSplits" in owner.read_text()

    ts_files = sorted(
        p
        for p in (LEGACY / "src").rglob("*")
        if p.suffix in (".ts", ".tsx") and p.is_file()
    )
    assert len(ts_files) > 10, "the src/ sweep found suspiciously few files"

    # The retired export. Any reappearance means a second map is back.
    for p in ts_files:
        assert "splitByLaw" not in p.read_text(), f"{p.relative_to(LEGACY)} still uses splitByLaw"

    # Only join.ts may build a lookup keyed on public_law. Matches the two
    # shapes a join takes here: `new Map(... public_law ...)` on one line, and
    # `.set(<something>.public_law, ...)`.
    builders = []
    for p in ts_files:
        for line in p.read_text().splitlines():
            if ("new Map" in line and "public_law" in line) or re.search(
                r"\.set\(\s*\w+\.public_law", line
            ):
                builders.append(p.relative_to(LEGACY).as_posix())
                break
    assert builders == ["src/components/laws/join.ts"], builders

    # Both consumers go through it and construct nothing of their own.
    for rel in (
        "src/components/attribution/aggregate.ts",
        "src/components/islands/LawExplorer.tsx",
    ):
        text = (LEGACY / rel).read_text()
        assert "joinLawsToSplits" in text, f"{rel} does not call the shared join"

    # And the Row type has exactly one definition across the laws modules.
    defs = [
        p.relative_to(LEGACY).as_posix()
        for p in ts_files
        if re.search(r"^export (interface|type) Row\b", p.read_text(), re.M)
    ]
    assert defs == ["src/components/laws/join.ts"], defs


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


def test_no_document_still_calls_vote_composition_classified():
    """#31: the two rendered sections are locked above; this locks the norms
    document and the machine-readable metadata no page exposes. Matches
    PHRASES, never the bare stem: 'classified by the filer's address' and
    'classified by place of performance' are the IRS's and USASpending's own
    wording for a different subject and must survive."""
    superseded = (
        "classified party-line",
        "partly classified, not counted",
        "classified from published vote character",
        "comp plr/pld/xp",
        "exact only for pl 115-97",
    )
    for rel in (
        "BRIEF.md",
        "sections.md",
        "SOURCES.md",
        "pipeline/curated/notes.yaml",
        "src/data/budget.json",
    ):
        text = (LEGACY / rel).read_text().lower()
        for fragment in superseded:
            assert fragment not in text, f"{rel} still says {fragment!r}"

    meta = load("budget")["_meta"]
    note = meta["notes"][1]
    assert "counted" in note.lower(), note
    assert "party_splits" in note, note
    assert "legacy_comp" in meta["fields"]["L"], meta["fields"]["L"]
    assert "comp PLR" not in meta["fields"]["L"], meta["fields"]["L"]
    for l in _laws():
        assert "comp" not in l, f"{l['public_law']} still emits a comp key"


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


def test_unemployment_peak_over_actuals_is_fy1983():
    """Section 3 calls FY1983 the highest fiscal year, and FY2020 lower than it."""
    rows = {r["y"]: r["unemp"] for r in load("economy")["data"] if r["actual"]}
    assert max(rows, key=rows.get) == 1983
    assert rows[2020] < rows[1983]


def test_participation_peak_over_actuals_is_fy2000():
    """Section 3 quotes FY2000 as the participation peak and the 4.7 point gap to FY2025."""
    rows = {r["y"]: r["lfpr"] for r in load("economy")["data"] if r["actual"]}
    assert max(rows, key=rows.get) == 2000
    assert abs((rows[2000] - rows[2025]) - 4.671) <= 0.01


def test_fy2020_unemployment_is_a_fiscal_year_average_not_a_monthly_peak():
    """Section 3 says the spring 2020 monthly spike is not in this file: no row in
    economy.json exceeds the FY1983 value."""
    rows = {r["y"]: r["unemp"] for r in load("economy")["data"] if r["actual"]}
    assert max(rows.values()) == rows[1983]
    assert rows[2020] < rows[1983]


# ---- economy route: prices/rates, labor/capital (issue #13) ----

def test_rate_series_start_at_their_documented_first_year():
    """§4 states each series' own start. A back-fill or a zero-fill would break this."""
    rows = {r["y"]: r for r in load("economy")["data"]}
    for field, first in (("t3m", 1950), ("t10", 1954), ("ff", 1955),
                         ("cpi", 1950), ("core_pce", 1960)):
        assert rows[first][field] is not None, f"{field} is null at its documented start FY{first}"
        for y in range(1950, first):
            assert rows[y][field] is None, f"{field} is non-null at FY{y}, before FY{first}"


def test_no_rate_series_is_negative_and_the_minima_are_near_zero():
    """§4's axis holds the FY1981 peak and the near-zero years on one zero-anchored scale."""
    rows = {r["y"]: r for r in load("economy")["data"] if r["actual"]}
    for field in ("ff", "t3m", "t10"):
        vals = {y: r[field] for y, r in rows.items() if r[field] is not None}
        assert min(vals.values()) > 0, f"{field} goes negative; the zero-anchored axis is wrong"
    assert abs(rows[1981]["ff"] - 16.945) <= 0.01
    assert abs(rows[2021]["ff"] - 0.083) <= 0.005
    assert abs(rows[2015]["t3m"] - 0.028) <= 0.005


def test_cpi_inflation_is_negative_in_fy1955_and_fy2009():
    """§4 draws a ZeroLine because the derived inflation series crosses zero."""
    rows = {r["y"]: r["cpi"] for r in load("economy")["data"]}
    def yoy(y):
        return 100 * (rows[y] - rows[y - 1]) / rows[y - 1]
    assert yoy(1955) < 0 and yoy(2009) < 0
    assert abs(yoy(1980) - 13.556) <= 0.01


def test_wage_and_profit_share_are_gdp_shares_and_do_not_sum_to_100():
    """§5's required statement, held to the data: these are shares of GDP, so their sum
    is nowhere near 100 in any year."""
    notes = load("economy")["_meta"]["notes"]
    assert any("shares of GDP, not of national income" in n for n in notes)
    for r in load("economy")["data"]:
        total = r["wage_share"] + r["profit_share"]
        assert 45 < total < 70, f"FY{r['y']}: wage+profit = {total:.1f}"


def test_fy2020_share_moves_are_denominator_artefacts():
    """§5 says the wage share ROSE in FY2020 and the profit share fell then jumped."""
    rows = {r["y"]: r for r in load("economy")["data"]}
    assert rows[2020]["wage_share"] > rows[2019]["wage_share"]
    assert rows[2020]["profit_share"] < rows[2019]["profit_share"]
    assert rows[2021]["profit_share"] > rows[2020]["profit_share"]


def test_nice_extent_zero_anchors_a_non_negative_series():
    """#34: niceExtent padded the low end outward and only re-anchored it to 0 when
    the padded value was still positive, so a non-negative series whose minimum sits
    close to zero got an axis floor below zero. A source-level guard, the same shape
    as test_the_laws_to_splits_join_has_exactly_one_implementation: the JS unit tests
    (`npm run test:unit`) are not wired into any CI workflow, so the pytest suite is
    the only thing that runs this rule unattended."""
    scales = LEGACY / "src/components/charts/scales.ts"
    assert scales.exists(), "src/components/charts/scales.ts is missing"
    text = scales.read_text()

    body = text[text.index("export function niceExtent") :]
    clamps = [ln.strip() for ln in body.splitlines() if re.search(r"\blo\s*=\s*0\b", ln)]
    assert clamps, "niceExtent no longer clamps the low end at all"

    # The pre-#34 guard alone is not enough: something must condition the clamp on
    # every observation being >= 0, not merely on the padded low end being positive.
    assert any(
        re.search(r"every\s*\(.*>=\s*0", ln) for ln in clamps
    ), f"niceExtent's low-end clamp does not test for a non-negative series: {clamps}"

    # And the clamp must read >= 0, so a minimum of exactly 0 floors at 0.
    assert not re.search(r"every\s*\(\s*\(?\w+\)?\s*=>\s*\w+\s*>\s*0", body), (
        "niceExtent's sign test uses > 0; a minimum of exactly 0 is non-negative"
    )

    unit = LEGACY / "src/components/charts/scales.test.ts"
    assert unit.exists(), "the niceExtent unit tests are gone"
    cases = unit.read_text()
    assert "niceExtent" in cases
    # Both directions, or the guard is only half a guard.
    assert re.search(r"test\((['\"]).*floors at exactly zero.*\1", cases), (
        "no unit test covers the non-negative direction"
    )
    assert re.search(r"test\((['\"]).*mixed-sign.*bit-for-bit unchanged.*\1", cases), (
        "no unit test covers the signed direction"
    )
    assert "niceExtentBefore" in cases, (
        "the signed case no longer compares against the pre-#34 implementation"
    )


# ---- schema coverage -----------------------------------------------------
#
# #37. `check_schema` used to be opt-in: an output with no schema file was
# skipped, so twelve of the fourteen published outputs contributed zero schema
# assertions and the build's "validation: N checks passed" line read the same
# whether the data was good or the schema was simply absent. The same defect
# shape as #36's conformance suite, which iterated the SVGs it found.
#
# The fix is a population guard, not a bigger pile of schemas: the tests below
# assert that EVERY published output is covered, that every schema still names
# a live output, and that the build gate itself fails loudly on an output with
# no schema. Authoring the fourteenth schema does not cover the fifteenth
# output; the guard does.

SCHEMAS = ROOT / "schemas"
OUTPUTS = sorted(p.stem for p in DATA.glob("*.json"))


def _schema(name: str) -> dict:
    return json.loads((SCHEMAS / f"{name}.schema.json").read_text())


def _corrupt_budget(d: dict) -> None:
    """Offsetting receipts are negative by construction (SOURCES.md)."""
    d["data"][0]["n_or"] = 0.5


def _corrupt_revenue_sources(d: dict) -> None:
    del d["data"][0]["s_tot"]


def _corrupt_economy(d: dict) -> None:
    """An unobserved year must stay null; 0 would plot as deflation."""
    d["data"][0]["core_pce"] = 0


def _corrupt_debt(d: dict) -> None:
    d["data"][-1]["gdp_share"] = 0


def _corrupt_income_inequality(d: dict) -> None:
    d["data"][0]["gini"] = 0


def _corrupt_bracket_history(d: dict) -> None:
    """A bracket ceiling of 0 is the sparse-series bug, not a bracket."""
    d["data"][0]["s"]["single"][0]["hi"] = 0


def _corrupt_party_splits(d: dict) -> None:
    d["data"][0]["character"] = "bipartisan"


def _corrupt_debt_holders(d: dict) -> None:
    d["data"]["split"][0]["share_pct"] = 150


def _corrupt_debt_maturity(d: dict) -> None:
    d["data"]["history_months"][0]["v"] = "71"


def _corrupt_income_tax_by_group(d: dict) -> None:
    d["data"]["groups"][0]["tax_share_pct"] = 150


def _corrupt_oecd(d: dict) -> None:
    d["data"]["countries"] = []


def _corrupt_cbo_effective_rates(d: dict) -> None:
    """A dropped quintile is the corruption the per-group `required` catches."""
    del d["data"]["rows"][0]["v"]["top1"]


def _corrupt_states_balance(d: dict) -> None:
    d["data"]["jurisdictions"][0]["ratio"] = 0


def _corrupt_states_tax_mix(d: dict) -> None:
    shares = d["data"]["jurisdictions"][0]["shares"]
    shares[next(iter(shares))] = 150


CORRUPTIONS: dict[str, tuple[str, Callable[[dict], None]]] = {
    "budget": ("offsetting-receipts-turned-positive", _corrupt_budget),
    "revenue_sources": ("share-total-dropped-from-a-row", _corrupt_revenue_sources),
    "economy": ("absent-core-pce-written-as-zero", _corrupt_economy),
    "debt": ("absent-gdp-share-written-as-zero", _corrupt_debt),
    "income_inequality": ("absent-gini-written-as-zero", _corrupt_income_inequality),
    "bracket_history": ("bracket-ceiling-written-as-zero", _corrupt_bracket_history),
    "party_splits": ("character-outside-the-counted-vocabulary", _corrupt_party_splits),
    "debt_holders": ("share-pct-over-one-hundred", _corrupt_debt_holders),
    "debt_maturity": ("history-value-arrives-as-a-string", _corrupt_debt_maturity),
    "income_tax_by_group": ("tax-share-pct-over-one-hundred", _corrupt_income_tax_by_group),
    "oecd": ("country-comparison-emptied", _corrupt_oecd),
    "cbo_effective_rates": ("top1-quintile-dropped-from-a-row", _corrupt_cbo_effective_rates),
    "states_balance": ("give-get-ratio-written-as-zero", _corrupt_states_balance),
    "states_tax_mix": ("tax-mix-share-over-one-hundred", _corrupt_states_tax_mix),
}


def _corruption_params() -> list:
    """Sourced from the glob, never a hand-typed list: output number fifteen
    lands here with the id NO-CORRUPTION-CASE and fails the test below."""
    return [
        pytest.param(
            n, id=f"{n}-{CORRUPTIONS[n][0] if n in CORRUPTIONS else 'NO-CORRUPTION-CASE'}"
        )
        for n in OUTPUTS
    ]


def test_every_published_output_has_a_schema():
    """#37 criterion 1. The population is `src/data/*.json`, not the schemas
    that happen to exist. No output is exempt today; if one ever must be, it
    goes in an explicit named frozenset here, never in a weakened assertion."""
    assert OUTPUTS, "no published outputs found in src/data"
    missing = [n for n in OUTPUTS if not (SCHEMAS / f"{n}.schema.json").exists()]
    assert not missing, (
        f"published with no schema: {missing}. Every output build.py emits is "
        f"schema-validated (#37); add pipeline/schemas/<name>.schema.json."
    )


def test_every_schema_names_a_published_output():
    """The converse. A rename that leaves the old schema behind would otherwise
    keep the coverage count whole while the new output ships unchecked."""
    published = set(OUTPUTS)
    orphans = [
        p.name for p in sorted(SCHEMAS.glob("*.schema.json"))
        if p.name[: -len(".schema.json")] not in published
    ]
    assert not orphans, f"schemas with no published output: {orphans}"


def test_check_schema_fails_when_an_output_has_no_schema(monkeypatch, tmp_path):
    """#37 criterion 2, the whole point of the issue: the guard must BITE. The
    automated analogue of #36's manual client:only flip. Both directions are
    asserted in one test, so it cannot pass by failing for an unrelated
    reason."""
    partial = tmp_path / "schemas"
    partial.mkdir()
    for p in SCHEMAS.glob("*.schema.json"):
        if p.name != "budget.schema.json":
            shutil.copy2(p, partial / p.name)

    monkeypatch.setattr(validate, "SCHEMA_DIR", partial)
    c = validate.Checks()
    validate.check_schema(c, OUTPUTS)

    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "budget" in c.failures[0]
    assert "schemas/budget.schema.json" in c.failures[0]
    assert c.passed == len(OUTPUTS) - 1

    # The inverse: with the real directory the same call is clean.
    monkeypatch.setattr(validate, "SCHEMA_DIR", SCHEMAS)
    clean = validate.Checks()
    validate.check_schema(clean, OUTPUTS)
    assert clean.failures == []
    assert clean.passed == len(OUTPUTS)


def test_check_schema_reports_malformed_json_rather_than_raising(monkeypatch, tmp_path):
    """#37 criterion 3. A broken schema file must be a named failure the build
    reports, not a traceback out of validate.run."""
    broken = tmp_path / "schemas"
    broken.mkdir()
    (broken / "budget.schema.json").write_text("{")

    monkeypatch.setattr(validate, "SCHEMA_DIR", broken)
    c = validate.Checks()
    validate.check_schema(c, ["budget"])

    assert len(c.failures) == 1
    assert "not valid JSON" in c.failures[0]


def test_check_schema_reports_an_invalid_schema_document_rather_than_raising(
    monkeypatch, tmp_path
):
    """#37 criterion 3, the subtler half: a file that IS JSON but is not a valid
    JSON Schema. jsonschema would raise SchemaError, and a typo'd keyword is the
    next version of this same bug."""
    invalid = tmp_path / "schemas"
    invalid.mkdir()
    (invalid / "budget.schema.json").write_text('{"type": "not-a-type"}')

    monkeypatch.setattr(validate, "SCHEMA_DIR", invalid)
    c = validate.Checks()
    validate.check_schema(c, ["budget"])

    assert len(c.failures) == 1
    assert "not a valid JSON Schema" in c.failures[0]


@pytest.mark.parametrize("name", _corruption_params())
def test_every_schema_rejects_a_realistic_corruption(name):
    """#37 criteria 5-7. A schema that only asserted "is an object" would pass
    the coverage test above and prove nothing; this is what makes that
    impossible to ship. The real document must validate clean, and a named
    realistic corruption of it must not."""
    assert name in CORRUPTIONS, (
        f"{name} is published but has no corruption case in CORRUPTIONS. Every "
        f"schema must prove it can fail (#37)."
    )
    _, corrupt = CORRUPTIONS[name]
    schema = _schema(name)
    doc = load(name)

    jsonschema.validate(doc, schema)  # the real data is clean

    broken = copy.deepcopy(doc)
    corrupt(broken)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(broken, schema)


# ---- #38: the 1985 bracket corruption, guarded at ingest and on the output --

def test_phantom_zero_row_guard_rejects_a_duplicate_in_any_other_year():
    """#38 criterion 4. `_drop_phantom_zero_row` is a NAMED check, not a silent
    filter: it drops the one known (1985, "single") phantom row and refuses to
    guess anywhere else. Three cases in one test so it cannot pass by failing
    for an unrelated reason."""
    from oneshot import bracket_history

    def phantom_shape() -> list[dict]:
        # The real 1985 single head: a 0% zero bracket up to $2,390, then 11%
        # from $2,390 -- plus the corrupt duplicate 0% row with an open-ended
        # top that contradicts the 50% row already present.
        return [
            {"r": 0.0, "lo": 0, "hi": 2390},
            {"r": 0.0, "lo": 0, "hi": None},
            {"r": 11.0, "lo": 2390, "hi": 3540},
            {"r": 50.0, "lo": 85130, "hi": None},
        ]

    # (i) The same shape in any OTHER year/status is a new corruption: fail loud.
    other = phantom_shape()
    with pytest.raises(SourceUnavailable) as exc:
        bracket_history._drop_phantom_zero_row((1986, "single"), other)
    assert "duplicate 'incomeGreaterThan'" in str(exc.value)
    assert "[0]" in str(exc.value), f"message must name the duplicated floor: {exc.value}"
    assert "refusing to guess" in str(exc.value)
    assert len(other) == 4, "a rejected ladder must not be mutated on the way out"

    # (ii) The one known case drops the PHANTOM, not the real zero bracket.
    known = phantom_shape()
    bracket_history._drop_phantom_zero_row((1985, "single"), known)
    at_zero = [b for b in known if b["lo"] == 0]
    assert len(at_zero) == 1, f"expected one bracket at floor 0, got {at_zero}"
    assert at_zero[0]["hi"] == 2390, "the surviving zero bracket must be the real $2,390 row"
    assert {"r": 0.0, "lo": 0, "hi": None} not in known

    # (iii) A clean ladder passes through untouched.
    clean = [{"r": 0.0, "lo": 0, "hi": 2390}, {"r": 11.0, "lo": 2390, "hi": None}]
    before = copy.deepcopy(clean)
    bracket_history._drop_phantom_zero_row((1985, "single"), clean)
    assert clean == before


def test_check_bracket_history_rejects_a_duplicate_bracket_floor(monkeypatch, tmp_path):
    """#38 criterion 3. The published-output half of the guard. `check_schema`
    cannot express "strictly increasing", so this is a validate.py invariant --
    and it must BITE, in any year, not only 1985."""
    real = load("bracket_history")

    def run_against(doc: dict) -> validate.Checks:
        (tmp_path / "bracket_history.json").write_text(json.dumps(doc))
        monkeypatch.setattr(validate, "DATA_DIR", tmp_path)
        c = validate.Checks()
        validate.check_bracket_history(c)
        return c

    # A duplicated floor, and nothing else wrong: exactly the one named failure.
    dup = copy.deepcopy(real)
    ladder = {r["y"]: r for r in dup["data"]}[1985]["s"]["single"]
    ladder[3]["lo"] = ladder[2]["lo"]
    c = run_against(dup)
    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "duplicate bracket floor" in c.failures[0]
    assert "1985" in c.failures[0] and "single" in c.failures[0]
    assert str(ladder[2]["lo"]) in c.failures[0]

    # The generic check covers every year, not only the one known to be corrupt.
    other = copy.deepcopy(real)
    l1994 = {r["y"]: r for r in other["data"]}[1994]["s"]["mfj"]
    l1994[2]["lo"] = l1994[1]["lo"]
    c = run_against(other)
    assert any("1994 mfj duplicate bracket floor" in f for f in c.failures), c.failures

    # The full phantom shape back in the published data trips the fingerprint too.
    phantom = copy.deepcopy(real)
    l85 = {r["y"]: r for r in phantom["data"]}[1985]["s"]["single"]
    l85.insert(1, {"r": 0.0, "lo": 0, "hi": None, "rlo": 0.0, "rhi": None})
    c = run_against(phantom)
    assert any("1985 single duplicate bracket floor" in f for f in c.failures), c.failures
    assert any("phantom row" in f for f in c.failures), c.failures

    # The inverse: the real published data yields zero failures.
    clean = run_against(real)
    assert clean.failures == [], clean.failures


# ---- #55: the top-rate series is anchored on IRS SOI Table 23 ---------------

def test_top_rates_match_the_soi_table_23_anchor():
    """#55 criterion 4. curated/top_rates.yaml cited "IRS SOI Historical Table 23"
    and NOTHING checked it. This is the corroboration, run as a test rather than
    asserted in a comment: all 106 overlapping years agree to the digit.

    The anchor's reach is asserted too. Table 23 carries four footnote-prefixed
    rate cells ('[19] 91.0' at 1954, '[24, 25] 70.0' at 1974, '[36] 39.6' at
    2000, and a '[31 ] 311,950' in the adjacent floor column at 2003). An
    extractor that dropped those years instead of stripping the prefix would
    still leave a test that passed on everything it happened to cover, so the
    1913-2018 no-gaps assertion is the half that makes the agreement mean
    something.
    """
    anchor = curated.top_rates_soi_anchor()
    published = curated.top_rates()

    assert sorted(anchor) == list(range(1913, 2019)), "anchor must cover 1913-2018 with no gaps"
    assert len(anchor) == 106

    for y in sorted(anchor):
        assert abs(published[y] - anchor[y]) < 0.001, f"{y}: {published[y]} != Table 23 {anchor[y]}"

    # The footnote-prefixed years specifically, read out of the file rather than
    # inferred: these are the four the naive regex got wrong.
    assert anchor[1954] == 91.0 and anchor[1974] == 70.0 and anchor[2000] == 39.6
    # 1981 is the blended part-year rate, not a rounding of 70.
    assert anchor[1981] == 69.125

    # Table 23 stops at 2018 by construction; 2019-2025 are anchored on
    # PL 115-97 and Rev. Proc. 2018-57 -> 2024-40, not on this file.
    assert max(anchor) == 2018
    assert sorted(set(published) - set(anchor)) == list(range(2019, 2026))

    # And the whole check is green against the real curated pair.
    c = validate.Checks()
    validate.check_top_rates_anchor(c)
    assert c.failures == [], c.failures


def test_the_soi_anchor_check_rejects_a_top_rate_that_drifts_from_it(monkeypatch):
    """#55 criterion 4. A guard that currently finds nothing must still be proved
    to BITE -- otherwise "zero drift" is indistinguishable from "nothing was
    compared". Drift one anchored year and require the failure to name it, and
    to carry both values so the reader can see which side moved.
    """
    anchor = curated.top_rates_soi_anchor()
    published = curated.top_rates()

    for year, bad in ((1944, 92.0), (1913, 8.0), (2018, 39.6)):
        monkeypatch.setattr(curated, "top_rates", lambda y=year, b=bad: {**published, y: b})
        c = validate.Checks()
        validate.check_top_rates_anchor(c)
        assert len(c.failures) == 1, f"expected exactly one failure for {year}, got {c.failures}"
        f = c.failures[0]
        assert str(year) in f, f
        assert str(bad) in f and str(anchor[year]) in f, f
        assert "Table 23" in f, f

    # A year the anchor covers going missing from the published series is a
    # named failure too, not a quietly skipped comparison.
    monkeypatch.setattr(curated, "top_rates",
                        lambda: {y: v for y, v in published.items() if y != 1969})
    c = validate.Checks()
    validate.check_top_rates_anchor(c)
    assert any("1969" in f and "absent" in f for f in c.failures), c.failures

    # And a gap in the ANCHOR fails, so a dropped footnote year cannot shrink the
    # check's reach without saying so.
    monkeypatch.setattr(curated, "top_rates_soi_anchor",
                        lambda: {y: v for y, v in anchor.items() if y != 1954})
    c = validate.Checks()
    validate.check_top_rates_anchor(c)
    assert any("no gaps" in f and "1954" in f for f in c.failures), c.failures


# ---- #38: the two CBO price series -----------------------------------------

def test_chained_and_core_cpi_start_at_their_own_first_year():
    """#38 criterion 1. Each series is emitted over exactly the span CBO
    publishes it, and the years before that are a GAP, never a zero. Asserted
    with `is None` rather than falsiness, because 0 is falsy and 0 is the bug."""
    rows = {r["y"]: r for r in load("economy")["data"]}
    years = sorted(rows)

    for field, first_year in (("chained_cpiu", 2002), ("core_cpiu", 1958)):
        assert rows[first_year][field] is not None, f"{field} must be present at FY{first_year}"
        for y in years:
            if y < first_year:
                assert rows[y][field] is None, f"{field} FY{y} is {rows[y][field]!r}, expected null"
            else:
                assert rows[y][field] is not None, f"{field} FY{y} is null inside its published span"
        assert rows[years[-1]][field] is not None, f"{field} must run to the last projected row"


def test_chained_and_core_cpi_are_index_levels_not_rates():
    """#38 criterion 1. Pinning the first observation of each series fixes it as
    an index LEVEL: a year-over-year rate would be single digits. It also fails
    loudly if a future CBO vintage rebases either index."""
    rows = {r["y"]: r for r in load("economy")["data"]}

    assert rows[2002]["chained_cpiu"] == 105.132
    assert rows[1958]["core_cpiu"] == 29.458

    # A level compounds; a year-over-year rate would stay in single digits.
    assert rows[2024]["chained_cpiu"] > rows[2002]["chained_cpiu"] > 20
    assert rows[2024]["core_cpiu"] > 5 * rows[1958]["core_cpiu"]


# ---- #39: the source register ----------------------------------------------

def test_source_register_covers_every_published_output():
    """#39 criterion 5. The population is `src/data/*.json`, not the entries that
    happen to exist in the register, so output number fifteen cannot ship with an
    unchecked source line. The converse is asserted too: an entry left behind by a
    rename would otherwise keep the count whole while the new output went
    unregistered."""
    register = curated.source_register()
    declared = set(register["outputs"])
    assert declared == set(OUTPUTS), (
        f"register/published mismatch — unregistered outputs: "
        f"{sorted(set(OUTPUTS) - declared)}; register entries with no output: "
        f"{sorted(declared - set(OUTPUTS))}"
    )


def test_check_sources_is_clean_against_the_real_tree():
    """The inverse, asserted first so nothing below can pass by failing for an
    unrelated reason. Every source cited by every published output resolves to an
    entry in SOURCES.md, which is what /sources renders."""
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)
    assert c.failures == [], c.failures
    assert c.passed > 0


def test_check_sources_fails_when_a_cited_source_is_not_registered(monkeypatch, tmp_path):
    """#39 criterion 7, the guard-bites proof and the whole point of the issue.
    This is the defect the issue was filed for: a source the site cites, absent
    from the document /sources publishes, with every other check green. Both
    entries are mutated in one test, so the guard is proven generic over the
    register rather than special-cased to whichever source happened to be
    missing, and the test cannot pass by failing for an unrelated reason."""
    original = (LEGACY / "SOURCES.md").read_text()
    cases = {
        "irs_soi_table_5": (
            "IRS Statistics of Income, SOI Data Book Table 5, "
            "Gross Collections by Type of Tax and State"
        ),
        "census_stc": (
            "US Census Bureau, Annual Survey of State Government Tax Collections (STC)"
        ),
    }

    for key, lead_in in cases.items():
        assert lead_in in original, f"{lead_in!r} is not in SOURCES.md; the mutation is a no-op"
        doc = tmp_path / f"SOURCES-{key}.md"
        doc.write_text(original.replace(lead_in, "Some Other Thing"))

        monkeypatch.setattr(validate, "SOURCES_DOC", doc)
        c = validate.Checks()
        validate.check_sources(c, OUTPUTS)

        assert len(c.failures) == 1, f"{key}: expected exactly one failure, got {c.failures}"
        assert key in c.failures[0]
        assert "SOURCES.md" in c.failures[0]


def test_check_sources_fails_when_an_output_cites_an_unregistered_source(monkeypatch, tmp_path):
    """#39 criterion 7, the other direction: a source ADDED to an _meta.source and
    never registered. Rule B alone cannot see this one — the register does not know
    the new source exists — so the stored source_shape carries it instead, and the
    unaccounted free text is what fails."""
    for name in OUTPUTS:
        shutil.copy2(DATA / f"{name}.json", tmp_path / f"{name}.json")
    doc = json.loads((tmp_path / "states_tax_mix.json").read_text())
    doc["_meta"]["source"] += "; Some Unregistered Source"
    (tmp_path / "states_tax_mix.json").write_text(json.dumps(doc))

    monkeypatch.setattr(validate, "DATA_DIR", tmp_path)
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)

    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "states_tax_mix" in c.failures[0]
    assert "Some Unregistered Source" in c.failures[0]


def test_check_sources_tolerates_a_vintage_refresh(monkeypatch, tmp_path):
    """The loose-on-purpose proof (E3/E4). An ordinary CBO refresh moves the
    vintage on both sides and must NOT turn the build red. Without this, a future
    author tightens `_normalize_source` into an exact match and every upstream
    republication becomes a failed build — at which point the check gets disabled,
    and a disabled check is a check that is not looking."""
    for name in OUTPUTS:
        shutil.copy2(DATA / f"{name}.json", tmp_path / f"{name}.json")
    doc = json.loads((tmp_path / "budget.json").read_text())
    refreshed = doc["_meta"]["source"].replace("Feb 2026", "February 2027")
    assert refreshed != doc["_meta"]["source"], "budget.json no longer carries the Feb 2026 vintage"
    doc["_meta"]["source"] = refreshed
    (tmp_path / "budget.json").write_text(json.dumps(doc))

    monkeypatch.setattr(validate, "DATA_DIR", tmp_path)
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)

    assert c.failures == [], c.failures


def test_normalize_source_strips_dates_but_keeps_identifying_numbers():
    """The counterweight to the test above. Vintage tolerance must not be bought
    by erasing every digit: a number is as often a document's identity as its
    date. An all-digit strip collapsed "Table 5" and "Table 23" onto the same
    text, at which point rule B would match a registered source against some
    OTHER table's line in SOURCES.md and rule D's shape would hold while the
    cited document changed underneath it -- the silent pass #39 exists to close.
    """
    n = validate._normalize_source

    # Dates go, in every form the real source lines use.
    assert n("CBO Historical Budget Data (Feb 2026)") == "CBO Historical Budget Data ( )"
    assert n("Debt to the Penny, 7 Aug 2026") == "Debt to the Penny,"
    assert n("The Distribution of Household Income, 2022 (January 2026)") == (
        "The Distribution of Household Income, ( )"
    )
    # A Revenue Procedure's "-NN" serial advances with its year, so it is vintage.
    assert n("IRS Revenue Procedures 2018-57 through 2024-40") == "IRS Revenue Procedures through"

    # Identities stay, and stay DISTINCT.
    assert n("SOI Data Book Table 5") != n("SOI Data Book Table 23")
    assert n("MEHOINUSA672N") == "MEHOINUSA672N"
    assert n("PL 115-97") == "PL 115-97"
    assert n("Supplemental Data Table 9") == "Supplemental Data Table 9"


def test_check_sources_fails_when_a_cited_document_number_changes(monkeypatch, tmp_path):
    """#39 criterion 7, the third direction: the source is registered and the
    source line's wording is unchanged, but the specific document it names is
    not the one the register accounts for. Only a normalizer that keeps
    identifying digits can see this."""
    for name in OUTPUTS:
        shutil.copy2(DATA / f"{name}.json", tmp_path / f"{name}.json")
    doc = json.loads((tmp_path / "cbo_effective_rates.json").read_text())
    swapped = doc["_meta"]["source"].replace("Supplemental Data Table 9", "Supplemental Data Table 4")
    assert swapped != doc["_meta"]["source"], "cbo_effective_rates no longer cites Table 9"
    doc["_meta"]["source"] = swapped
    (tmp_path / "cbo_effective_rates.json").write_text(json.dumps(doc))

    monkeypatch.setattr(validate, "DATA_DIR", tmp_path)
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)

    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "cbo_effective_rates" in c.failures[0]
    assert "Table 4" in c.failures[0]


# ---- #50: a glossary definition cites the register, not free text ---------

GLOSSARY = ROOT.parent / "src" / "content" / "glossary"


def _glossary_copy(tmp_path: Path) -> Path:
    """A writable copy of the term files, for pointing validate at."""
    copy_dir = tmp_path / "glossary"
    shutil.copytree(GLOSSARY, copy_dir)
    return copy_dir


def _set_source(glossary_dir: Path, term: str, keys: list[str] | None) -> None:
    """Rewrite one term's `source` block. `None` removes the field entirely."""
    path = glossary_dir / f"{term}.md"
    block = "" if keys is None else "source:\n" + "".join(f'  - "{k}"\n' for k in keys)
    text, n = re.subn(r"^source:\n(?:  - .*\n)+", block, path.read_text(), count=1, flags=re.M)
    assert n == 1, f"{term}: no source block to rewrite; the mutation is a no-op"
    path.write_text(text)


def test_check_glossary_sources_is_clean_against_the_real_tree():
    """The inverse, asserted first so nothing below can pass by failing for an
    unrelated reason. Every term's citation resolves to a register entry, which rule B
    in turn pins to SOURCES.md."""
    c = validate.Checks()
    validate.check_glossary_sources(c)
    assert c.failures == [], c.failures
    assert c.passed > 0


def test_every_glossary_term_cites_only_registered_keys():
    """#50 criterion 1. The population is `src/content/glossary/*.md`, not the terms
    that happen to appear in the register, so term twenty-four cannot ship with an
    unchecked citation. The file count is asserted too: a term added without a source
    would otherwise leave this passing over a smaller population."""
    registry = curated.source_register()["registry"]
    entries = validate._glossary_entries()

    assert len(entries) == len(list(GLOSSARY.glob("*.md"))) == 23

    for term, keys in entries:
        assert keys, f"{term}: source is missing or empty"
        unknown = [k for k in keys if k not in registry]
        assert not unknown, f"{term}: cites unregistered key(s) {unknown}"


def test_check_glossary_sources_fails_on_an_unresolvable_key(monkeypatch, tmp_path):
    """#50 criterion 3, the guard-bites proof. Two terms are mutated in one test so
    the guard is proven generic over the glossary rather than special-cased to
    whichever term happened to be wrong."""
    cases = {"net-interest": "cbo_histrical_budget", "median": "census_by_fred"}

    for term, typo in cases.items():
        glossary = _glossary_copy(tmp_path / term)
        _set_source(glossary, term, [typo])

        monkeypatch.setattr(validate, "GLOSSARY_DIR", glossary)
        c = validate.Checks()
        validate.check_glossary_sources(c)

        assert len(c.failures) == 1, f"{term}: expected exactly one failure, got {c.failures}"
        assert term in c.failures[0]
        assert typo in c.failures[0]
        assert "/sources" in c.failures[0]


def test_check_glossary_sources_fails_on_a_missing_source(monkeypatch, tmp_path):
    """#50 criterion 2. Missing and empty are the same refusal: a term whose citation
    the reader cannot trace does not ship."""
    for term, keys in (("outlays", None), ("vintage", [])):
        glossary = _glossary_copy(tmp_path / term)
        _set_source(glossary, term, keys)

        monkeypatch.setattr(validate, "GLOSSARY_DIR", glossary)
        c = validate.Checks()
        validate.check_glossary_sources(c)

        assert len(c.failures) == 1, f"{term}: expected exactly one failure, got {c.failures}"
        assert term in c.failures[0]
        assert "missing or empty" in c.failures[0]


def test_check_glossary_sources_fails_when_the_glossary_directory_is_empty(monkeypatch, tmp_path):
    """The #37 rule: nothing to check is a FAILURE, not a pass. A check that reads no
    files reports exactly like a check that read them all and found nothing wrong."""
    empty = tmp_path / "empty"
    empty.mkdir()

    monkeypatch.setattr(validate, "GLOSSARY_DIR", empty)
    c = validate.Checks()
    validate.check_glossary_sources(c)

    assert len(c.failures) == 1, c.failures
    assert "no glossary terms found" in c.failures[0]
    assert c.passed == 0


def test_check_sources_rule_c_accepts_a_glossary_only_citation(monkeypatch, tmp_path):
    """#50's widening of #39 rule C, proved in both directions. Rule C used to fail any
    register entry cited by no OUTPUT, so the first definitional-only source would have
    landed as an orphan. It now spans outputs and glossary terms -- and the converse
    still bites: delete the sole term that cites such a key and the entry is orphaned,
    which is the answer to "may deleting a term orphan its source"."""
    register = copy.deepcopy(curated.source_register())
    # Registered in SOURCES.md (it is tax_policy_center's own registered_as, so rule B
    # passes) but named by no output's cites -- a definitional-only source.
    register["registry"]["tax_policy_center_definitional"] = {
        "registered_as": "Tax Policy Center",
        "cited_as": "Tax Policy Center",
    }
    monkeypatch.setattr(curated, "source_register", lambda: register)

    cited = _glossary_copy(tmp_path / "cited")
    _set_source(cited, "marginal-rate", ["tax_policy_center_definitional"])
    monkeypatch.setattr(validate, "GLOSSARY_DIR", cited)
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)
    assert c.failures == [], c.failures

    # The same key with no term citing it: an orphan, and rule C says so by name.
    monkeypatch.setattr(validate, "GLOSSARY_DIR", _glossary_copy(tmp_path / "uncited"))
    c = validate.Checks()
    validate.check_sources(c, OUTPUTS)
    assert len(c.failures) == 1, c.failures
    assert "tax_policy_center_definitional" in c.failures[0]
    assert "no glossary term" in c.failures[0]


# ---- #41: a title's year range is derived from coverage, never typed -------


def _data_copy(tmp_path: Path) -> Path:
    """A writable copy of the published outputs, for pointing validate at."""
    copy_dir = tmp_path / "data"
    shutil.copytree(DATA, copy_dir)
    return copy_dir


def _retitle(data_dir: Path, name: str, title: str) -> None:
    path = data_dir / f"{name}.json"
    doc = json.loads(path.read_text())
    doc["_meta"]["title"] = title
    path.write_text(json.dumps(doc))


def test_check_meta_titles_is_clean_against_the_real_tree():
    """The inverse, asserted first, so nothing below can pass by failing for an
    unrelated reason: every published title agrees with its own coverage."""
    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)
    assert c.failures == []
    assert c.passed > 0


def test_no_curated_title_types_a_literal_year():
    """#41 criterion 1, at the source rather than the output. A hand-typed range
    in curated/notes.yaml does not follow the series when it is extended -- that
    is the whole defect -- so the curated title carries a placeholder and
    emit.expand_title fills it from coverage."""
    typed = {
        n: curated.meta_for(n)["title"]
        for n in OUTPUTS
        if re.search(r"\d{4}", curated.meta_for(n).get("title", ""))
        and n not in validate.TITLE_RANGE_EXEMPT
    }
    assert typed == {}, f"literal years typed into curated titles: {typed}"


def test_curated_titles_render_to_their_published_form():
    """Templating must not have quietly reworded the thirteen outputs it was not
    aimed at: only budget and income_inequality change text under #41."""
    changed = set()
    for n in OUTPUTS:
        published = load(n)["_meta"]
        rendered = emit.expand_title(n, curated.meta_for(n)["title"], published.get("coverage"))
        if rendered != published["title"]:
            changed.add(n)
    assert changed == set(), f"published titles out of sync with curated/notes.yaml: {changed}"


def test_check_meta_titles_bites_on_the_defect_it_was_filed_for(monkeypatch):
    """The guard-bites proof. Restore the exact pre-#41 curated budget title and
    the check must go red. It is worth being precise about why this needs rule A
    at all: the stale string, FY1995-FY2025, IS a window budget's coverage
    declares (control_start/control_end), so a check that only compared the
    emitted title against coverage passed it for the length of the build. What
    was wrong was the clause it attached to."""
    stale = "Federal outlays, revenue, deficit, party control and major legislation, FY1995-FY2025"
    real = curated.meta_for

    def fake(output: str):
        m = dict(real(output))
        if output == "budget":
            m["title"] = stale
        return m

    monkeypatch.setattr(curated, "meta_for", fake)
    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)

    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "budget" in c.failures[0]
    assert "curated/notes.yaml" in c.failures[0]


def test_check_meta_titles_fails_a_range_coverage_does_not_declare(monkeypatch, tmp_path):
    """Rule B: the published file has drifted from the curated source -- an
    out-of-tier output, or a hand-edit of src/data."""
    copy_dir = _data_copy(tmp_path)
    _retitle(copy_dir, "budget",
             "Federal outlays, revenue, deficit and major legislation, FY1900-FY2025")
    monkeypatch.setattr(validate, "DATA_DIR", copy_dir)

    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)
    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "budget" in c.failures[0]
    assert "1900-2025" in c.failures[0]


def test_check_meta_titles_fails_a_range_with_no_coverage_at_all(monkeypatch, tmp_path):
    """`coverage: null` is UNKNOWN, not pass. Six curated snapshots carry no
    coverage and no year range, which is fine; a range appearing on one of them
    has nothing to prove it against and must fail rather than skip."""
    copy_dir = _data_copy(tmp_path)
    _retitle(copy_dir, "income_tax_by_group",
             "Share of federal individual income tax paid, by income group, 2001-2023")
    monkeypatch.setattr(validate, "DATA_DIR", copy_dir)

    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)
    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "income_tax_by_group" in c.failures[0]
    assert "TITLE_RANGE_EXEMPT" in c.failures[0]


def test_the_only_exemption_carries_a_written_reason_and_is_not_a_silent_skip(monkeypatch):
    """An exemption with no reason is how a check turns back into a skip. Both
    halves are asserted: the entry names why, and with the dict emptied the same
    output goes red -- so the exemption is what is holding it, not an accident of
    the regex failing to see the range."""
    reason = validate.TITLE_RANGE_EXEMPT["cbo_effective_rates"]
    assert "anchor years" in reason
    assert "curated-snapshots.md" in reason
    assert set(validate.TITLE_RANGE_EXEMPT) == {"cbo_effective_rates"}

    monkeypatch.setattr(validate, "TITLE_RANGE_EXEMPT", {})
    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)
    assert len(c.failures) == 2, f"expected exactly two failures, got {c.failures}"
    assert all("cbo_effective_rates" in f for f in c.failures)
    assert "curated/notes.yaml" in c.failures[0]          # rule A: the typed range
    assert "declares no start/end window" in c.failures[1]  # rule B: nothing to check it against


def test_open_ended_titles_assert_a_start_and_not_an_end(monkeypatch, tmp_path):
    """economy.coverage.end is 2036, a projection horizon, while its title says
    "FY1950 onward". An open-ended title asserts its start year only -- and the
    start still has to be right."""
    assert "FY1950 onward" in load("economy")["_meta"]["title"]

    copy_dir = _data_copy(tmp_path)
    _retitle(copy_dir, "economy", "US macroeconomic series, FY1949 onward")
    monkeypatch.setattr(validate, "DATA_DIR", copy_dir)

    c = validate.Checks()
    validate.check_meta_titles(c, OUTPUTS)
    assert len(c.failures) == 1, f"expected exactly one failure, got {c.failures}"
    assert "economy" in c.failures[0]
    assert "1949 onward" in c.failures[0]


def test_iso_date_coverage_bounds_compare_as_years():
    """party_splits.coverage holds ISO date strings, not integers. The year
    comparison must read the year part rather than crashing or silently
    declining to check."""
    coverage = load("party_splits")["_meta"]["coverage"]
    assert isinstance(coverage["start"], str)
    assert (1997, 2025) in validate._coverage_windows(coverage)


def test_nested_per_series_coverage_blocks_are_windows_a_title_may_name():
    """income_inequality's title names three different spans, one per series.
    Each has to resolve to a declared window, not to the file's outer envelope."""
    windows = validate._coverage_windows(load("income_inequality")["_meta"]["coverage"])
    assert {(1984, 2024), (1947, 2024), (1913, 2025)} <= set(windows)


def test_expand_title_raises_rather_than_publishing_a_placeholder():
    """A `{start}` written into a JSON file is worse than the stale range it
    replaced. Unknown is unknown: emit refuses, the same posture write() takes on
    a missing _meta.source."""
    with pytest.raises(ValueError, match="no coverage"):
        emit.expand_title("budget", "Outlays, FY{start}-FY{end}", None)
    with pytest.raises(ValueError, match="no matching key"):
        emit.expand_title("budget", "Outlays, FY{first_year}", {"start": 1962})

    verbatim = "Who holds the federal debt"
    assert emit.expand_title("debt_holders", verbatim, None) == verbatim


# ---- #41: BRIEF.md's file list against the files that exist -----------------


def _brief_file_list() -> list[str]:
    """The first token of every entry in BRIEF.md's "Files in this folder" fence.

    Raises rather than returning an empty list if the section or its fence has
    moved: a parser that quietly finds nothing would make this whole check pass
    by having nothing to check, which is the failure shape the block already
    demonstrated once.
    """
    text = (LEGACY / "BRIEF.md").read_text()
    m = re.search(r"^## Files in this folder\s*\n+```\n(.*?)^```", text, re.S | re.M)
    assert m, "BRIEF.md has no '## Files in this folder' fenced block to check"
    entries = [line.split()[0] for line in m.group(1).splitlines() if line.strip()]
    assert entries, "the 'Files in this folder' fence is empty"
    return entries


def test_brief_file_list_paths_exist():
    """#41: the block claimed a `data/` directory that does not exist and a
    `content/sections.md` that is `sections.md`, and nothing noticed for the
    length of the build. Existence-only on purpose: an exhaustiveness check
    would fight every new file in the repository and end up disabled, while this
    fails on exactly the drift that produced the issue -- a listed path that
    stops being true."""
    missing = [e for e in _brief_file_list() if not (LEGACY / e.rstrip("/")).exists()]
    assert missing == [], f"BRIEF.md lists paths that do not exist: {missing}"


def test_brief_file_list_names_the_brief_itself_and_every_root_json():
    """The two specific claims the block got wrong. The first line named
    README.md as "this brief" -- README.md exists, so an existence check alone
    would have passed a line pointing at the wrong file -- and the eight curated
    inputs sat under a `data/` prefix that never existed."""
    entries = _brief_file_list()
    assert "BRIEF.md" in entries
    assert "sections.md" in entries
    root_json = sorted(
        p.name for p in LEGACY.glob("*.json")
        if p.name not in {"package.json", "package-lock.json", "tsconfig.json"}
    )
    assert root_json, "no curated root JSON inputs found; the glob is checking nothing"
    assert set(root_json) <= set(entries), \
        f"BRIEF.md omits root inputs: {sorted(set(root_json) - set(entries))}"
    assert not [e for e in entries if e.startswith(("data/", "content/"))]


# ---- #54: foreign holdings come from Treasury TIC, not from a report of it --

LIB = ROOT / "lib"

# A two-block slice of ticdata.treasury.gov/Publish/mfhhis01.txt, trimmed to the
# rows this pipeline reads. Real values, real layout: the month abbreviations
# sit on the line ABOVE the `Country` header, `China, Mainland` is quoted
# because its label carries a comma, and the second block repeats every country
# label with a different year's numbers -- which is what makes "the parser
# selected the pinned month's block" a real assertion rather than a tautology.
MFH_FIXTURE = "\n".join(
    "\t".join(cells)
    for cells in [
        ["", "", "", "MAJOR FOREIGN HOLDERS OF TREASURY SECURITIES"],
        ["", "", "", "    (in billions of dollars)"],
        ["", "", "", "HOLDINGS 1/ AT END OF PERIOD"],
        [""],
        [""],
        ["", "Dec", "Nov", "Oct"],
        ["Country", "2025", "2025", "2025"],
        ["", "------", "------", "------"],
        [""],
        ["Japan", "1185.5", "1202.7", "1200"],
        ["United Kingdom", "863.1", "879.8", "875.4"],
        ['"China, Mainland"', "684.4", "683.9", "687.7"],
        ["All Other", "710.8", "700.4", "690.1"],
        ["Grand Total", "9269.5", "9349.6", "9230.5"],
        [""],
        ["Of which:"],
        ["For. Official", "3877.7", "3912.3", "3866.4"],
        [""],
        ["", "Dec", "Nov", "Oct"],
        ["Country", "2024", "2024", "2024"],
        ["", "------", "------", "------"],
        ["Japan", "1061.5", "1087.1", "1101.5"],
        ["United Kingdom", "722.8", "765.6", "769.4"],
        ['"China, Mainland"', "759.0", "768.6", "760.2"],
        ["Grand Total", "8619.3", "8723.3", "8693.5"],
    ]
)


def _fixture_release(vintage: str):
    return tic.read_release(MFH_FIXTURE, vintage, retrieved_at="2026-08-27T00:00:00Z")


def test_tic_parser_selects_the_pinned_months_column():
    """The vintage is DISCOVERED as a column, never assumed to be the first one.
    Both blocks carry a `Nov` column and both carry every country label, so a
    parser that took the first match, or the leftmost column, or the newest
    block would read a different number here."""
    nov25 = _fixture_release("2025-11")
    assert nov25.vintage == "2025-11"
    assert nov25.holdings == {"Japan": 1202.7, "United Kingdom": 879.8, "China": 683.9}
    assert nov25.grand_total_b == 9349.6

    nov24 = _fixture_release("2024-11")
    assert nov24.holdings == {"Japan": 1087.1, "United Kingdom": 765.6, "China": 768.6}
    assert nov24.grand_total_b == 8723.3

    # Not the newest column either: Dec 2025 is a different, unpinned release.
    assert _fixture_release("2025-12").holdings["Japan"] == 1185.5


def test_tic_parser_rejects_a_missing_vintage():
    """The pin is honoured or the run fails. A month the file does not carry
    must never fall back to a neighbouring column -- that is the failure mode
    that put a UK figure matching no TIC month on the page."""
    with pytest.raises(SourceUnavailable) as exc:
        _fixture_release("2026-03")
    assert "no column for 2026-03" in str(exc.value)
    assert "2024-10 to 2025-12" in str(exc.value)


def test_tic_parser_rejects_a_malformed_vintage():
    with pytest.raises(ValueError, match="YYYY-MM"):
        _fixture_release("2025-13")
    with pytest.raises(ValueError, match="YYYY-MM"):
        _fixture_release("Nov 2025")


@pytest.mark.parametrize(
    "drop, missing",
    [("United Kingdom", "'United Kingdom'"), ("Grand Total", "'Grand Total'")],
)
def test_tic_parser_refuses_a_block_with_a_row_missing(drop, missing):
    """No silent skips: a country or the grand total vanishing from the release
    is UNAVAILABLE, not a shorter table."""
    mutilated = "\n".join(
        line for line in MFH_FIXTURE.splitlines() if not line.startswith(drop + "\t")
    )
    with pytest.raises(SourceUnavailable) as exc:
        tic.read_release(mutilated, "2025-11", retrieved_at="2026-08-27T00:00:00Z")
    assert missing in str(exc.value)


def test_tic_parser_refuses_a_cell_that_is_not_a_number():
    mutilated = MFH_FIXTURE.replace("\t1202.7\t", "\t(*)\t")
    with pytest.raises(SourceUnavailable, match="not a number"):
        tic.read_release(mutilated, "2025-11", retrieved_at="2026-08-27T00:00:00Z")


def test_tic_parser_refuses_a_body_it_could_not_parse_at_all():
    """An empty parse is a failure, never 'no rows' -- lib/xlsx.py's contract,
    applied to a text table. A truncated body that lost every header row would
    otherwise read as a file with no months in it."""
    with pytest.raises(SourceUnavailable, match="no 'Country' header row"):
        tic.read_release("nothing\tuseful\there", "2025-11", retrieved_at="x")


def test_tic_fetches_through_the_one_http_core():
    """#40 unified three helpers behind lib/fetch.py. A parallel client here
    would reintroduce the drift that unification closed, and would sidestep the
    min_bytes truncation guard with it."""
    src = (LIB / "tic.py").read_text()
    assert "httpx" not in src, "lib/tic.py must fetch through lib.fetch, not its own client"
    assert "from .fetch import fetch" in src
    assert tic.MIN_BYTES >= 50_000, \
        "a truncated MFH body would parse as 'the pinned month is not published yet'"


# ---- #54: the guards that came with the TIC fetch ---------------------------


def test_foreign_holdings_come_from_tic():
    """Criterion 1. The three country figures are a column of a Treasury
    release, not constants, and the column is named."""
    doc = load("debt_holders")
    meta, d = doc["_meta"], doc["data"]

    assert meta["provenance"]["generator"] == "monthly/debt_holders.py"
    assert meta["provenance"]["retrieved_at"], "a fetched figure records when it was fetched"

    pin = curated._load("snapshots")["snapshots"]["debt_holders"]["tic_vintage"]
    assert re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", pin)
    assert meta["provenance"]["vintage"] == pin == d["tic_as_of"]

    # The curated copy is GONE, not shadowed. Two sources for one published
    # figure with nothing reconciling them is the defect, not the fix.
    snapshots = (ROOT / "curated" / "snapshots.yaml").read_text()
    assert "top_foreign" not in snapshots, \
        "curated/snapshots.yaml still carries a curated copy of the country holdings"

    assert [row["country"] for row in d["top_foreign"]] == ["Japan", "United Kingdom", "China"], \
        "prose_figures.yaml pins Japan/UK/China to top_foreign.{0,1,2}; the order is load-bearing"
    for row in d["top_foreign"]:
        assert row["amount_t"] > 0
        assert round(row["amount_t"], 3) == row["amount_t"], "$T are published to three places"

    # Two dates, distinguishable. Presenting one for both is the failure.
    assert d["as_of"] != d["tic_as_of"]
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["as_of"])


def test_the_two_denominators_reconcile():
    """The 32%-of-gross rebuttal, as arithmetic a reader can redo. 30% of the
    $32.14T held by the public is ~$9.6T, which is 24% of $39.88T gross. Both
    numbers are curated, so nothing recomputes them -- which is exactly why the
    relationship between them needs a check."""
    d = load("debt_holders")["data"]
    public = next(s for s in d["split"] if s["k"] == "public")["amount_t"]
    foreign_of_public = next(s for s in d["public_split"] if s["k"] == "foreign")["share_of_public_pct"]
    of_gross = next(h for h in d["foreign_share_history"] if h["year"] == 2025)["share_of_gross_pct"]

    implied = foreign_of_public * public / d["total_debt_t"]
    assert abs(implied - of_gross) <= 1.0, \
        f"{foreign_of_public}% of ${public}T is {implied:.1f}% of ${d['total_debt_t']}T, " \
        f"not the published {of_gross}%"
    # And the claim being rebutted is NOT what the arithmetic gives.
    assert abs(implied - 32) > 5

    notes = " ".join(load("debt_holders")["_meta"]["notes"]).lower()
    assert "publicly held" in notes and "gross" in notes and "32%" in notes


def test_no_emitted_figure_is_sourced_to_a_news_outlet():
    """Criterion 4. An outlet may be named in SOURCES.md as the ORIGIN OF A
    CIRCULATING CLAIM; it may not be the source of a published value."""
    banned = curated.source_register()["not_a_source"]
    assert banned, "an empty not_a_source list would make the guard vacuous"
    for entry in banned:
        assert entry["name"] and entry["reason"], "an exemption with no reason is a skip"
        for path in sorted(DATA.glob("*.json")):
            assert entry["name"].lower() not in path.read_text().lower(), \
                f"{path.name} names {entry['name']}"


# --- and the proof that each of them bites -----------------------------------


def _mutated_data_dir(tmp_path: Path, mutate: Callable[[dict], None]) -> Path:
    """A copy of src/data with debt_holders.json mutated. The whole directory is
    copied because check_snapshots reads four outputs and check_sources reads
    every one of them; a directory holding only the mutant would fail for the
    wrong reason."""
    # A fresh subdirectory per call: one test mutates twice, and copytree
    # refuses an existing destination.
    staged = tmp_path / f"data{len(list(tmp_path.glob('data*')))}"
    shutil.copytree(DATA, staged)
    doc = json.loads((staged / "debt_holders.json").read_text())
    mutate(doc)
    (staged / "debt_holders.json").write_text(json.dumps(doc, indent=1))
    return staged


def _snapshot_failures(tmp_path, monkeypatch, mutate) -> list[str]:
    monkeypatch.setattr(validate, "DATA_DIR", _mutated_data_dir(tmp_path, mutate))
    c = validate.Checks()
    validate.check_snapshots(c)
    return c.failures


def test_the_guards_pass_on_what_is_actually_published(tmp_path, monkeypatch):
    """The inverse of every negative test below, so none of them can pass by
    failing for an unrelated reason."""
    clean = _snapshot_failures(tmp_path, monkeypatch, lambda doc: None)
    assert clean == []


def test_g1_bites_a_malformed_or_disagreeing_vintage(tmp_path, monkeypatch):
    """A fetch that read a different column would leave the recorded vintage and
    the data's own tic_as_of disagreeing."""
    def mutate(doc):
        doc["_meta"]["provenance"]["vintage"] = "2025-13"
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("must be a YYYY-MM TIC release month" in f for f in failures), failures


def test_g2_bites_a_release_nobody_pinned(tmp_path, monkeypatch):
    """E8: adopting the newest TIC release would move Japan by 0.017 and the UK
    by 0.026 on a re-run, past the prose tolerance, with nobody deciding to."""
    def mutate(doc):
        doc["_meta"]["provenance"]["vintage"] = "2025-12"
        doc["data"]["tic_as_of"] = "2025-12"
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("adopted a release nobody chose" in f for f in failures), failures


def test_g3_bites_a_shifted_country_row(tmp_path, monkeypatch):
    def mutate(doc):
        doc["data"]["top_foreign"][1]["country"] = "Belgium"
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("top_foreign must be exactly" in f for f in failures), failures


def test_g4_bites_a_denominator_moved_without_the_other(tmp_path, monkeypatch):
    """THE REBUTTAL, machine-checked. Moving the share of publicly held debt
    without moving the share of gross would leave the site publishing its own
    version of the mislabelled 32%."""
    def mutate(doc):
        for row in doc["data"]["public_split"]:
            row["share_of_public_pct"] = 40 if row["k"] == "foreign" else 60
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("the two denominators no longer reconcile" in f for f in failures), failures


def test_g5_bites_a_grand_total_that_stops_corroborating(tmp_path, monkeypatch):
    def mutate(doc):
        doc["_meta"]["tic_grand_total_b"] = 4000.0
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("More than 3pp apart" in f for f in failures), failures

    def drop(doc):
        del doc["_meta"]["tic_grand_total_b"]
    failures = _snapshot_failures(tmp_path, monkeypatch, drop)
    assert any("corroborated by nothing" in f for f in failures), failures


def test_g_china_bites_a_fetched_value_that_left_its_resolution_behind(tmp_path, monkeypatch):
    """discrepancies.yaml -> china_holdings keeps a chosen value; it is now the
    editorial bound the fetched figure is checked against. A TIC month whose
    China figure has moved past it re-opens the resolution rather than silently
    overwriting it."""
    def mutate(doc):
        next(r for r in doc["data"]["top_foreign"] if r["country"] == "China")["amount_t"] = 0.761
    failures = _snapshot_failures(tmp_path, monkeypatch, mutate)
    assert any("re-open the resolution" in f for f in failures), failures


def test_g6_bites_an_outlet_reappearing_in_an_emitted_file(tmp_path, monkeypatch):
    """Rule E. Rules A-D reconcile the SOURCE LINE against the register and are
    blind to a publisher named anywhere else in the payload, which is where the
    defect actually lived."""
    def mutate(doc):
        doc["_meta"]["notes"].append("China reads $683B (TIC via Al Jazeera).")
    staged = _mutated_data_dir(tmp_path, mutate)
    monkeypatch.setattr(validate, "DATA_DIR", staged)
    names = sorted(p.stem for p in staged.glob("*.json"))

    c = validate.Checks()
    validate.check_sources(c, names)
    assert any("not_a_source" in f and "debt_holders.json" in f for f in c.failures), c.failures

    # The inverse: unmutated, the same call is clean.
    clean_dir = _mutated_data_dir(tmp_path, lambda doc: None)
    monkeypatch.setattr(validate, "DATA_DIR", clean_dir)
    clean = validate.Checks()
    validate.check_sources(clean, names)
    assert clean.failures == []
