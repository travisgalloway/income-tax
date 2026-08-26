"""The validation gate.

build.py writes NOTHING if any check here fails. These assertions encode the
traps already documented in BRIEF.md and SOURCES.md, so that a source revision
cannot quietly violate one.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

import jsonschema

from . import curated
from .errors import ValidationFailed

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "data"
SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
SOURCES_DOC = Path(__file__).resolve().parent.parent.parent / "SOURCES.md"


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


def check_schema(c: Checks, names: list[str]) -> None:
    """Every output build.py emits is schema-validated, with no opt-in. A
    MISSING schema is a FAILURE, not a skip (#37): a validation step that
    passes because it had nothing to check reads exactly like one that passed
    because the data was good, and that is the state this gate exists to
    prevent. A schema file that is not valid JSON, or that does not conform
    to the JSON Schema metaschema, is a named failure too. Note this does
    NOT cover a typo'd or unknown keyword within an otherwise well-formed
    schema (e.g. "requred" instead of "required") — jsonschema silently
    ignores unrecognized keywords per the spec, so that class of mistake
    still validates cleanly and is caught only by review or by the schema
    actually asserting the wrong thing."""
    for n in names:
        path = SCHEMA_DIR / f"{n}.schema.json"
        if not path.exists():
            c.ok(
                False,
                f"{n}: no schema at schemas/{n}.schema.json. Every output build.py "
                f"emits must be schema-validated; add the schema rather than letting "
                f"the output ship unchecked (#37).",
            )
            continue
        try:
            schema = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            c.ok(False, f"{n}: schemas/{n}.schema.json is not valid JSON: {exc}")
            continue
        try:
            jsonschema.validate(_load(n), schema)
            c.ok(True, f"{n}: schema ok")
        except jsonschema.ValidationError as exc:
            c.ok(False, f"{n}: schema violation at {list(exc.absolute_path)}: {exc.message}")
        except jsonschema.SchemaError as exc:
            c.ok(
                False,
                f"{n}: schemas/{n}.schema.json is not a valid JSON Schema: {exc.message}",
            )


_DATEISH = re.compile(
    r"\b(19|20)\d{2}\b"
    r"|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b"
    r"|\d+"
)


def _normalize_source(s: str) -> str:
    """Strip vintages before comparing source strings.

    A CBO February-2026 -> February-2027 refresh must PASS; a source added,
    renamed or dropped must FAIL. Loose on purpose, the same balance the
    schemas' bounds strike (docs/test-plan.md, DATA-1): a check that turned
    every ordinary upstream refresh red would be turned off, and a check that
    is off is a check that is not looking.

    Applied to BOTH sides of every comparison. SOURCES.md carries the same
    vintages the _meta.source strings do ("..., February 2026"), so a refresh
    moves both and only one normalizer may exist.
    """
    return " ".join(_DATEISH.sub("", s).split())


def _citations(entry: dict[str, Any]) -> list[str]:
    """The normalized forms an _meta.source may use for one register entry.

    Several are allowed because two outputs legitimately name one source
    differently: debt.json writes "US Treasury, Historical Debt Outstanding and
    Debt to the Penny" in full, debt_holders.json uses the short form.
    """
    raw = entry.get("cited_as", [])
    variants = [raw] if isinstance(raw, str) else list(raw)
    return [_normalize_source(v) for v in variants]


def _shape(source: str, keys: list[str], registry: dict[str, Any]) -> str:
    """The output's _meta.source, normalized, with every citation it declares
    replaced by its {key}. Longest variant first, so a substitution never eats
    a prefix of a longer one. Whatever is left as free text is a source the
    register does not account for."""
    out = _normalize_source(source)
    pairs = [(v, k) for k in keys for v in _citations(registry[k])]
    for variant, key in sorted(pairs, key=lambda p: len(p[0]), reverse=True):
        out = out.replace(variant, "{" + key + "}")
    return out


def check_sources(c: Checks, names: list[str]) -> None:
    """Every source a published output CITES must be REGISTERED in SOURCES.md,
    the document /sources renders in full (#39).

    check_meta only asserts that _meta.source is non-empty and not the summary
    string "CBO data". NOTHING reconciled a citation against the register, so a
    source could be named on the page and absent from /sources with every check
    green -- the same "check that is not looking" shape as #36 (a manual check
    nobody ran), #37 (a missing schema read as a skip) and #38 (an unregistered
    prose figure). Adding the missing sources alone would leave the next one
    just as silent; this is the check that makes the class impossible.

    The register is an explicit curated YAML, never scraped out of SOURCES.md:
    the document uses **bold** for ordinary emphasis too, so a scraper would
    count "**Rejected.**" as a source and report a full register while a real
    source was missing. registered_as is matched INTO SOURCES.md; SOURCES.md is
    never parsed OUT of.
    """
    reg = curated.source_register()
    registry: dict[str, Any] = reg["registry"]
    outputs: dict[str, Any] = reg["outputs"]

    doc = _normalize_source(SOURCES_DOC.read_text()) if SOURCES_DOC.exists() else ""
    c.ok(
        bool(doc),
        f"SOURCES.md not found or empty at {SOURCES_DOC}; the source register cannot "
        f"be checked, and an unreadable register is unknown, never clean",
    )

    # B -- the #39 defect itself: a cited source absent from what /sources renders.
    for key, entry in sorted(registry.items()):
        c.ok(
            _normalize_source(entry["registered_as"]) in doc,
            f"{key}: cited by this site but NOT registered in SOURCES.md (looked for "
            f"{entry['registered_as']!r}). /sources renders SOURCES.md in full, so an "
            f"unregistered source is one the reader cannot trace (#39).",
        )

    # C -- no orphan entries left behind by a rename.
    cited_anywhere = {k for o in outputs.values() for k in o["cites"]}
    for key, entry in sorted(registry.items()):
        c.ok(
            key in cited_anywhere or bool(entry.get("cited_in_prose_only")),
            f"{key}: in the register but cited by no published output. Add it to an "
            f"output's cites, or mark it cited_in_prose_only: true with a reason.",
        )

    for n in names:
        if n not in outputs:
            c.ok(
                False,
                f"{n}: no entry in curated/sources.yaml. Every published output must "
                f"declare which sources it cites, or its source line is unchecked (#39).",
            )
            continue

        spec = outputs[n]
        src = _load(n).get("_meta", {}).get("source", "")
        norm = _normalize_source(src)
        known = []

        # A -- a citation renamed or dropped out from under the register.
        for key in spec["cites"]:
            if key not in registry:
                c.ok(False, f"{n}: cites unknown register key {key!r}")
                continue
            known.append(key)
            c.ok(
                any(v in norm for v in _citations(registry[key])),
                f"{n}: curated/sources.yaml says it cites {key}, but no form of that "
                f"citation appears in its _meta.source. Rename it in both places, or "
                f"drop it from cites.",
            )

        # D -- a source ADDED to the source line and never registered.
        got = _shape(src, known, registry)
        c.ok(
            got == spec["source_shape"],
            f"{n}: _meta.source no longer matches its registered shape, so a source was "
            f"added, removed or renamed without updating curated/sources.yaml -- and an "
            f"unregistered source never reaches /sources (#39).\n"
            f"  expected: {spec['source_shape']}\n"
            f"  got:      {got}",
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


_COMPS = ("XP", "PLR", "PLD")
_PARTY_LINE = ("PLR", "PLD")


def _composition_total_t(laws: list[dict[str, Any]], comps: tuple[str, ...]) -> float:
    """Sum the ten-year scores of one vote composition in exact decimal and round
    ONCE, half-up, at the end. Summing the per-law DISPLAYED values instead is what
    put 7.52 in laws.yaml against a true 5.206 + 2.306 = 7.512 (#32).

    Decimal(str(v)) is deliberate: float's round() is banker's, not half-up, and a
    binary float sum of the at-most-3dp score_t values only lands on the right side
    of a .005 boundary by luck.
    """
    total = sum((Decimal(str(l["score_t"])) for l in laws
                 if l["score_t"] is not None and l["legacy_comp"] in comps), Decimal(0))
    return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


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

    # #32: the split totals are curated by hand and were NOT gated at all, which is how
    # party_line_t sat at 7.52 against a true 7.512 with every downstream reader on 7.51.
    # legacy_comp, not party_splits.json's counted character: check_laws runs under
    # `if "budget" in outputs` and party_splits need not be in the same run. The two
    # classifications are proved equal for all 23 laws by
    # test_counted_character_matches_the_hand_classification.
    for l in laws:
        c.ok(l.get("legacy_comp") in _COMPS,
             f"law {l['name']!r} has vote composition {l.get('legacy_comp')!r}, not one of "
             f"{_COMPS}; an unknown value would silently drop it from both split totals")

    # Equality, not c.close: a tolerance is exactly what let this drift through, so the
    # curated constant must BE the half-up rounding of the summed scores.
    for label, comps, key in (("party-line", _PARTY_LINE, "party_line_t"),
                              ("cross-party", ("XP",), "cross_party_t")):
        got = _composition_total_t(laws, comps)
        c.ok(got == totals[key],
             f"{label} legislative cost $T: laws.yaml {key} is {totals[key]}, the per-law "
             f"scores sum to {got} (round the sum half-up, never the displayed values)")

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

    # A duplicate bracket floor is the fingerprint of the one known corrupt upstream row (1985
    # single, dropped by name at ingest in oneshot/bracket_history.py, which raises on a duplicate
    # in any other year/status). This is the matching named check on the PUBLISHED output, so a
    # duplicate floor that ever got past ingest cannot reach src/data unobserved.
    for y, r in by.items():
        for status, ladder in r["s"].items():
            if ladder is None:
                continue
            los = [b["lo"] for b in ladder]
            counts = Counter(los)
            dupes = sorted(lo for lo, n in counts.items() if n > 1)
            c.ok(all(a < b for a, b in zip(los, los[1:])),
                 f"bracket_history: {y} {status} duplicate bracket floor {dupes}"
                 if dupes else
                 f"bracket_history: {y} {status} bracket floors are not strictly increasing: {los}")

    # 1985 single is the ladder the upstream corruption lands in, so its correct shape is asserted
    # positively rather than merely "it parsed". IRS 1985 Form 1040 Tax Rate Schedule X (the first
    # indexed year under ERTA'81, reproduced in IRS SOI Historical Table 23): a single filer's zero
    # bracket amount is $2,390, then fifteen rate brackets 11%-50%, the 50% rate applying above
    # $85,130. A regression to the corrupt shape is a named failure, not a silent pass.
    l85 = by[1985]["s"]["single"]
    c.ok(len(l85) == 16, f"bracket_history: 1985 single has {len(l85)} brackets, expected 16 "
                         "(the $2,390 zero bracket plus fifteen rates 11%-50%)")
    zero_rate = [b for b in l85 if b["r"] == 0.0]
    c.ok(len(zero_rate) == 1, f"bracket_history: 1985 single has {len(zero_rate)} zero-rate "
                              "brackets, expected exactly one (the $2,390 zero bracket amount)")
    c.ok(all(b["hi"] is not None for b in zero_rate),
         "bracket_history: 1985 single carries an open-ended zero-rate bracket -- the phantom row "
         "the ingest guard drops has reached the published data")
    c.ok(bool(zero_rate) and zero_rate[0]["hi"] == 2390,
         f"bracket_history: 1985 single zero bracket ends at "
         f"{zero_rate[0]['hi'] if zero_rate else None}, expected $2,390")
    top_85 = l85[-1]
    c.ok(top_85["r"] == 50.0 and top_85["lo"] == 85130 and top_85["hi"] is None,
         f"bracket_history: 1985 single top bracket is {top_85['r']}% open-ended above "
         f"{top_85['lo']}, expected 50% above $85,130")

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


def check_states(c: Checks) -> None:
    d = _load("states_balance")["data"]
    jurs = d["jurisdictions"]

    in_grid = [j for j in jurs if j["in_grid"]]
    c.ok(len(in_grid) == 51, f"states: expected 51 in_grid jurisdictions, got {len(in_grid)}")

    dc = next((j for j in jurs if j["code"] == "DC"), None)
    c.ok(dc is not None, "states: DC is missing")
    if dc:
        c.ok(dc.get("is_state") is False, "states: DC.is_state should be False; DC is not a state")
        c.ok("DC" in d["color_domain"]["excludes"],
             "states: DC is not recorded in color_domain.excludes")

    territories = [j for j in jurs if not j["in_grid"]]
    c.ok(bool(territories), "states: no territory rows found; coverage was silently dropped")
    for j in territories:
        c.ok(j["give_b"] is None, f"states: territory {j['code']} has a give_b; should be null")
        c.ok(j["get_b"] is not None, f"states: territory {j['code']} has no get_b")

    for j in jurs:
        for k in ("give_b", "get_b", "balance_pc", "ratio"):
            c.ok(j[k] is None or j[k] != 0, f"states: {j['code']}.{k} is exactly 0; absence must be null")

    total_give = sum(j["give_b"] for j in jurs if j["give_b"] is not None)
    nat_give = d["national"]["give_b"]
    c.ok(total_give <= nat_give + 1e-6,
         f"states: sum of jurisdiction give_b ({total_give}) exceeds the national total ({nat_give})")
    c.close(total_give, nat_give, nat_give * 0.02, "states: sum of jurisdiction give_b vs national")

    for j in jurs:
        c.ok(j["ratio"] is None or j["ratio"] > 0,
             f"states: {j['code']}.ratio is non-positive: {j['ratio']}")

    c.ok(d["fy_give"] == d["fy_get"],
         f"states: fy_give {d['fy_give']} != fy_get {d['fy_get']}; give and get must be the same FY")

    mix = _load("states_tax_mix")["data"]
    for j in mix["jurisdictions"]:
        for k, v in j["shares"].items():
            c.ok(v is None or 0 <= v <= 100, f"states_tax_mix: {j['code']}.{k} share {v} out of [0,100]")
            if v is None:
                c.ok(k in j.get("not_levied", []) or j.get("partial"),
                     f"states_tax_mix: {j['code']}.{k} is null but not in not_levied and not partial")


def run(outputs: list[str]) -> Checks:
    c = Checks()
    check_meta(c, outputs)
    check_schema(c, outputs)
    # Unconditional, next to check_meta and check_schema and never behind an
    # `if "x" in outputs:` gate: a check skipped because its output was not in
    # the tier reads exactly like a check that passed (#37).
    check_sources(c, outputs)
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
    if "states_balance" in outputs:
        check_states(c)
    if "cbo_effective_rates" in outputs:
        check_cbo_effective_rates(c)
    if "bracket_history" in outputs:
        check_bracket_history(c)
    return c
