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
import yaml

from . import curated
from .errors import ValidationFailed
from .mspd import REQUIRED_CLASSES as MSPD_REQUIRED_CLASSES

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "data"
SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
SOURCES_DOC = Path(__file__).resolve().parent.parent.parent / "SOURCES.md"
GLOSSARY_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "content" / "glossary"


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


# A year range in a title, "FY1962-FY2025" or "1913-2025", either dash. The
# FY prefix is optional on each end and is NOT part of the captured year.
TITLE_RANGE = re.compile(r"(?:FY)?(\d{4})\s*[-–—]\s*(?:FY)?(\d{4})")
# An open-ended title, "FY1950 onward": a start year and no end to assert.
TITLE_OPEN = re.compile(r"(?:FY)?(\d{4})\s+onward")

# Outputs whose title carries a year range that no _meta.coverage can confirm.
# An entry is a WRITTEN REASON, never a bare name: an exemption with no reason
# is how a check turns back into a skip. Keep this dict as small as the facts
# allow, and delete an entry the moment its output acquires a coverage block.
TITLE_RANGE_EXEMPT = {
    "cbo_effective_rates":
        "published anchor years, not a continuous span, and curated snapshots carry "
        "_meta.refresh instead of _meta.coverage by contract "
        "(docs/contracts/interfaces/curated-snapshots.md). The anchor years are pinned "
        "numerically by check_cbo_effective_rates and test_cbo_effective_rates_are_"
        "anchor_points_not_a_series instead.",
}


def _coverage_year(v: Any) -> int | None:
    """A coverage bound as a year. party_splits carries ISO dates, not ints."""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        m = re.match(r"(\d{4})", v)
        if m:
            return int(m.group(1))
    return None


def _coverage_windows(coverage: Any) -> list[tuple[int | None, int | None]]:
    """Every (start, end) pair a coverage block declares, nesting included.

    `start`/`end`, `control_start`/`control_end` and the per-series blocks
    (`mhi`, `gini`, `top`) are all windows a title is allowed to name.
    """
    if not isinstance(coverage, dict):
        return []
    starts = {k[: -len("start")]: v for k, v in coverage.items()
              if isinstance(k, str) and k.endswith("start")}
    ends = {k[: -len("end")]: v for k, v in coverage.items()
            if isinstance(k, str) and k.endswith("end")}
    windows = [(_coverage_year(v), _coverage_year(ends[p]))
               for p, v in starts.items() if p in ends]
    for v in coverage.values():
        windows.extend(_coverage_windows(v))
    return windows


def check_meta_titles(c: Checks, names: list[str]) -> None:
    """A year range in a title is DERIVED from coverage, never typed by hand.

    The defect this exists for (#41): budget's `_meta.title` read FY1995-FY2025
    for the length of the build while `_meta.coverage.start` was 1962 and
    `_meta.notes[3]` said FY1962-FY2025, the same file contradicting itself in
    three places, and a regeneration of `_meta` reproduced it faithfully because
    the range was hand-curated, not derived. Correcting the string alone would
    leave the next coverage extension free to do it again.

    Two rules, and the first is the one that bites:

    A. The CURATED title in `curated/notes.yaml` may not carry a literal year.
       It writes `FY{start}-FY{end}` and `emit.expand_title` fills it, so the
       range follows the series instead of standing still while it moves. The
       stale budget title passed rule B on its own, FY1995-FY2025 is a real
       window, `control_start`/`control_end`, just not the one the sentence
       attached it to, which is exactly why a check on the output alone is
       not enough.
    B. Every range in the EMITTED title is a window `_meta.coverage` declares.
       This catches a published file that has drifted from the curated source
       (an out-of-tier output, a hand-edit of `src/data/`) and pins which
       window each templated clause resolved to.

    A title with no year range passes both. A range with no coverage to check it
    against FAILS unless the output is in TITLE_RANGE_EXEMPT with a reason,
    because `coverage: null` is unknown, not good news.
    """
    for n in names:
        m = _load(n).get("_meta", {})
        title = m.get("title") or ""
        ranges = [(int(a), int(b)) for a, b in TITLE_RANGE.findall(title)]
        opens = [int(a) for a in TITLE_OPEN.findall(title)]
        if not ranges and not opens:
            continue
        if n in TITLE_RANGE_EXEMPT:
            c.ok(bool(TITLE_RANGE_EXEMPT[n].strip()),
                 f"{n}: exempt from the title/coverage check but carries no written reason")
            continue

        # Rule A, against the curated source the emitted title is built from.
        try:
            raw = curated.meta_for(n).get("title") or ""
        except KeyError as exc:
            c.ok(False, f"{n}: no curated title to check: {exc}")
            continue
        c.ok(not re.search(r"\d{4}", raw),
             f"{n}: curated/notes.yaml types a literal year into title {raw!r}. Write the range "
             f"as a coverage placeholder ({{start}}, {{end}}) so it follows the series, or add "
             f"the output to TITLE_RANGE_EXEMPT with the reason it cannot.")

        # Rule B, against what was actually published.
        windows = _coverage_windows(m.get("coverage"))
        if not windows:
            c.ok(False,
                 f"{n}: _meta.title claims a year range ({title!r}) but _meta.coverage declares "
                 f"no start/end window to check it against. Give the output a coverage block, or "
                 f"add it to TITLE_RANGE_EXEMPT with the reason why it cannot have one.")
            continue
        for a, b in ranges:
            c.ok((a, b) in windows,
                 f"{n}: _meta.title claims {a}-{b}, which is not a window _meta.coverage "
                 f"declares ({sorted(w for w in windows if w[0] is not None)}). Template the "
                 f"title from coverage in curated/notes.yaml rather than typing the range.")
        for a in opens:
            c.ok(any(w[0] == a for w in windows),
                 f"{n}: _meta.title claims {a} onward, but no _meta.coverage window starts "
                 f"at {a} ({sorted(w for w in windows if w[0] is not None)})")


def check_schema(c: Checks, names: list[str]) -> None:
    """Every output build.py emits is schema-validated, with no opt-in. A
    MISSING schema is a FAILURE, not a skip (#37): a validation step that
    passes because it had nothing to check reads exactly like one that passed
    because the data was good, and that is the state this gate exists to
    prevent. A schema file that is not valid JSON, or that does not conform
    to the JSON Schema metaschema, is a named failure too. Note this does
    NOT cover a typo'd or unknown keyword within an otherwise well-formed
    schema (e.g. "requred" instead of "required"), jsonschema silently
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


_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"

_DATEISH = re.compile(
    # A day-of-month, in either order, before the bare-month rule can eat the
    # month and strand the day: "7 Aug 2026", "August 7, 2026".
    rf"\b\d{{1,2}}\s+{_MONTH}\b"
    rf"|\b{_MONTH}\s+\d{{1,2}}\b"
    rf"|\b{_MONTH}\b"
    # A 4-digit year, plus the "-NN" that serially numbers an IRS Revenue
    # Procedure within its year ("2018-57"): that suffix advances with the
    # vintage, so it is part of the vintage.
    r"|\b(?:19|20)\d{2}(?:-\d{1,3})?\b"
)


def _normalize_source(s: str) -> str:
    """Strip vintages before comparing source strings.

    A CBO February-2026 -> February-2027 refresh must PASS; a source added,
    renamed or dropped must FAIL. Loose on purpose, the same balance the
    schemas' bounds strike (docs/test-plan.md, DATA-1): a check that turned
    every ordinary upstream refresh red would be turned off, and a check that
    is off is a check that is not looking.

    Only DATES are stripped, never arbitrary digits. A number is as often the
    identity of a document as it is its vintage, "SOI Data Book Table 5" and
    "SOI Historical Table 23" are different tables, "MEHOINUSA672N" and
    "MEHOINUSA646N" are different FRED series, "PL 115-97" is a specific law,
    and a normalizer that erased those would let rule B match a registered
    source against some OTHER table's line in SOURCES.md, and let rule D's
    shape hold while the cited document changed underneath it. That is the
    same silent-pass shape this check exists to close.

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


_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?\r?\n)---\r?\n?", re.DOTALL)


def _glossary_frontmatter() -> list[tuple[str, dict[str, Any]]]:
    """(term id, parsed frontmatter) for every src/content/glossary/*.md, sorted.

    The term id is the filename stem, which is what Astro's glob loader derives the
    entry id from, see docs/contracts/interfaces/glossary.md. Frontmatter is the text
    between the opening `---` fence and the next line that is exactly `---`; nothing
    calls render() on these entries, so the body is empty by contract and is not read
    here. Matching fences by line position (not `str.split("---")`) means a `---` inside
    a YAML string, for example a source title containing an em dash written as
    `---`, cannot be mistaken for a fence.

    Returns [] for an absent or empty directory. That is NOT treated as clean: the
    caller turns it into a named failure, the #37 rule.
    """
    if not GLOSSARY_DIR.is_dir():
        return []
    out: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(GLOSSARY_DIR.glob("*.md")):
        match = _FRONTMATTER_RE.match(path.read_text())
        data = yaml.safe_load(match.group(1)) if match else None
        out.append((path.stem, data if isinstance(data, dict) else {}))
    return out


def _glossary_entries() -> list[tuple[str, list[str]]]:
    """(term id, the register keys its `source` cites). A missing, empty or malformed
    `source` yields an empty list; check_glossary_sources is what names that as a
    failure."""
    entries = []
    for term, data in _glossary_frontmatter():
        raw = data.get("source")
        keys = [k for k in raw if isinstance(k, str)] if isinstance(raw, list) else []
        entries.append((term, keys))
    return entries


def check_glossary_sources(c: Checks) -> None:
    """Every glossary term's `source` must resolve to an entry in the register (#50).

    The site's figures have carried this discipline since #39; a definition had none.
    Each of the 23 terms carried a hand-typed citation restating a line already in
    SOURCES.md, with nothing relating either copy to the other, so a vintage bump in
    SOURCES.md left 23 stale citations with every check green.

    Layer 1 is the Zod schema in src/content.config.ts, which fails `astro check` and
    `npm run build`. This is layer 2, and it exists because that lane is blind to the
    workflow that runs unattended: refresh-data.yml runs the pipeline and pytest, never
    a site build. A source discipline enforced only where a human is watching is the
    "check that is not looking" shape of #36, #37 and #38.

    The glossary is NOT a pipeline output, nothing emits it and there is no
    src/data/glossary.json, so it gets no schema file and no sources.yaml `outputs:`
    entry, either of which would be an orphan. This check reads the term files directly
    instead, as a second population beside src/data/*.json.
    """
    registry: dict[str, Any] = curated.source_register()["registry"]
    entries = _glossary_entries()

    # An empty or unreadable glossary is UNKNOWN, never clean, the #37 rule, in the
    # same register as check_sources' own "an unreadable register is unknown".
    c.ok(
        bool(entries),
        f"no glossary terms found at {GLOSSARY_DIR}; every term's citation is therefore "
        f"unchecked, and an unreadable glossary is unknown, never clean (#50).",
    )

    for term, keys in entries:
        if not keys:
            c.ok(
                False,
                f"{term}: source is missing or empty. A definition is a claim; refusing "
                f"to ship a term whose citation the reader cannot trace to /sources "
                f"(#50). source is a list of pipeline/curated/sources.yaml registry keys.",
            )
            continue
        for key in keys:
            c.ok(
                key in registry,
                f"{term}: source key {key!r} is in no pipeline/curated/sources.yaml "
                f"registry entry. A definition is a claim; refusing to ship a term whose "
                f"citation the reader cannot trace to /sources (#50).",
            )


def check_sources(c: Checks, names: list[str]) -> None:
    """Every source a published output CITES must be REGISTERED in SOURCES.md,
    the document /sources renders in full (#39).

    check_meta only asserts that _meta.source is non-empty and not the summary
    string "CBO data". NOTHING reconciled a citation against the register, so a
    source could be named on the page and absent from /sources with every check
    green, the same "check that is not looking" shape as #36 (a manual check
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

    raw_doc = SOURCES_DOC.read_text() if SOURCES_DOC.exists() else ""
    doc = _normalize_source(raw_doc)
    c.ok(
        bool(doc),
        f"SOURCES.md not found or empty at {SOURCES_DOC}; the source register cannot "
        f"be checked, and an unreadable register is unknown, never clean",
    )

    # B, the #39 defect itself: a cited source absent from what /sources renders.
    for key, entry in sorted(registry.items()):
        c.ok(
            _normalize_source(entry["registered_as"]) in doc,
            f"{key}: cited by this site but NOT registered in SOURCES.md (looked for "
            f"{entry['registered_as']!r}). /sources renders SOURCES.md in full, so an "
            f"unregistered source is one the reader cannot trace (#39).",
        )

    # C, no orphan entries left behind by a rename. Spans outputs AND glossary terms
    # since #50: a term's `source` is a list of register keys, so a definitional-only
    # source is legitimately cited by no output, and deleting the sole term that cites a
    # key orphans it here rather than passing unnoticed.
    cited_anywhere = {k for o in outputs.values() for k in o["cites"]}
    cited_anywhere |= {k for _, keys in _glossary_entries() for k in keys}
    for key, entry in sorted(registry.items()):
        c.ok(
            key in cited_anywhere or bool(entry.get("cited_in_prose_only")),
            f"{key}: in the register but cited by no published output and by no glossary "
            f"term. Add it to an output's cites or to a term's source, or mark it "
            f"cited_in_prose_only: true with a reason.",
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

        # A, a citation renamed or dropped out from under the register.
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

        # D, a source ADDED to the source line and never registered.
        got = _shape(src, known, registry)
        c.ok(
            got == spec["source_shape"],
            f"{n}: _meta.source no longer matches its registered shape, so a source was "
            f"added, removed or renamed without updating curated/sources.yaml -- and an "
            f"unregistered source never reaches /sources (#39).\n"
            f"  expected: {spec['source_shape']}\n"
            f"  got:      {got}",
        )

    _check_no_outlet_sources_a_figure(c, reg)
    _check_source_tiers(c, registry, raw_doc, doc)


# The tier vocabulary (#57). Five terms, each earning its place against a real
# register entry. `scholarly republication` is the term that settles it: Voteview is
# not official (it is not the House Clerk) and it is not secondary (it
# republishes the primary roll-call record, and the join it feeds is regressed
# against the Clerk's), so a three-term primary/official/secondary vocabulary
# could only call it secondary, which is the failing vocabulary the issue
# names. `compilation` is the other: #55 argued in prose, once, inside one
# source string, that the Tax Foundation CSV is "a compilation ... rather than a
# source in its own right", and nothing could read that argument. compiled_from
# says it in a field a check can read.
SOURCE_TIERS = (
    "primary",
    "official republication",
    "scholarly republication",
    "compilation",
    "secondary",
)


def _check_source_tiers(c: Checks, registry: dict[str, Any], raw_doc: str, doc: str) -> None:
    """Rules F-I, every source states what KIND of source it is, and is followable.

    Rules A-E make the register COMPLETE: every cited source is in SOURCES.md.
    They say nothing about what the source is or where a reader goes next, and
    until #57 the site had no machine-readable answer to either. The one place
    the distinction had been drawn, Tax Foundation as "a compilation ... rather
    than a source in its own right", was drawn in prose, once, for one source,
    inside a string nothing parses.

    | F | every entry states a tier from SOURCE_TIERS                          |
    | G | every entry has an https:// url, or a WRITTEN url_exempt reason      |
    | H | secondary => justification; compilation => compiled_from (real keys) |
    | I | the tier and the url stated in SOURCES.md match the register         |

    Rule I preserves the never-parse-out invariant. It matches a COMPOSED string
    INTO SOURCES.md exactly as rule B does, looking for the literal
    "{registered_as}** [em dash] {tier}", which is the document's own lead-in
    form. SOURCES.md is still never
    parsed OUT of. The prose side is vintage-normalized by _normalize_source,
    like rule B, so an ordinary refresh still passes; the URL is compared RAW,
    because a "2026-02" in a filename identifies a document rather than dating
    it and normalizing it away would let the link drift to another vintage's
    file unnoticed.

    Where a later rule reads a field an earlier one just rejected, I needs F's
    tier, the url-in-doc check needs G's url, the later rule stays silent for
    that entry rather than piling a second confusing message onto the same
    defect. That is not a skip: F or G has already failed loudly, by name, for
    the same key in the same pass.
    """
    for key, entry in sorted(registry.items()):
        tier = entry.get("tier")
        stated = isinstance(tier, str) and tier in SOURCE_TIERS

        # F, a source added with no stated kind, or a typo'd tier.
        c.ok(
            stated,
            f"{key}: tier is {tier!r}, which is not one of {', '.join(SOURCE_TIERS)}. "
            f"Every registered source must say what KIND of source it is; a source with "
            f"no stated kind is one the reader has to guess about (#57).",
        )

        url = entry.get("url")
        exempt = entry.get("url_exempt")
        followable = isinstance(url, str) and url.startswith("https://") and len(url) > 8
        excused = isinstance(exempt, str) and bool(exempt.strip())

        # G, an unfollowable source line, or an exemption used as a silent skip.
        c.ok(
            followable or excused,
            f"{key}: has no well-formed https:// url and no written url_exempt reason. "
            f"Every source line the reader meets must be followable to a page; where no "
            f"single URL is truthful, say WHY in url_exempt -- an exemption with no "
            f"reason is how a check turns back into a skip (#57).",
        )
        c.ok(
            not (followable and excused),
            f"{key}: carries both a url and a url_exempt reason. One of the two is false; "
            f"an exemption beside a working link is an exemption nobody will notice going "
            f"stale.",
        )

        # H, a secondary source slipped in unargued; a compilation passed off as a
        # source in its own right.
        if tier == "secondary":
            justification = entry.get("justification")
            c.ok(
                isinstance(justification, str) and bool(justification.strip()),
                f"{key}: tier is secondary and it carries no justification. Every other "
                f"tier describes a source that publishes or republishes a record; "
                f"secondary is the residue, and the residue has to be argued for in "
                f"writing before it ships (#57).",
            )
        if tier == "compilation":
            compiled = entry.get("compiled_from")
            c.ok(
                isinstance(compiled, list)
                and bool(compiled)
                and all(isinstance(k, str) and k in registry for k in compiled),
                f"{key}: tier is compilation and compiled_from is {entry.get('compiled_from')!r}. "
                f"A compilation is not a source in its own right, so it must name the "
                f"registered sources it assembles -- every element a real register key "
                f"(#55, #57).",
            )

        # I, the tier or the URL on the page drifting from the register.
        if stated:
            c.ok(
                _normalize_source(f"{entry['registered_as']}** — {tier}") in doc,
                f"{key}: SOURCES.md does not state this source's tier as the register does "
                f"(looked for {entry['registered_as'] + '** — ' + tier!r}). /sources renders "
                f"SOURCES.md in full, so a tier that lives only in the register is a tier "
                f"the reader never sees, and one the page states alone is one nothing checks "
                f"(#57).",
            )
        if followable:
            c.ok(
                url in raw_doc,
                f"{key}: the register's url {url!r} does not appear in SOURCES.md. The link "
                f"a reader follows from a figure caption and the link /sources offers must "
                f"be the same link, or one of the two is stale.",
            )


def _check_no_outlet_sources_a_figure(c: Checks, reg: dict[str, Any]) -> None:
    """Rule E, no emitted value is attributed to a news outlet (#54).

    Rules A-D reconcile the source LINE against the register. They say nothing
    about a publisher named somewhere else in the payload, and that is exactly
    where the defect lived: debt_holders._meta.notes sourced the China figure to
    "TIC via Al Jazeera", an outlet's paraphrase standing in for the agency's
    own release, with every check green.

    Curated and explicit rather than scraped, the shape #39 established: the
    banned list is a written decision in curated/sources.yaml with a reason
    beside each name, and an empty or malformed list is a FAILURE rather than a
    check with nothing to do. Scoped to src/data/*.json deliberately,
    SOURCES.md may still name an outlet as the ORIGIN OF A CIRCULATING CLAIM,
    which is a different thing from sourcing a published figure to it.
    """
    banned = reg.get("not_a_source")
    if not isinstance(banned, list) or not banned:
        c.ok(
            False,
            "curated/sources.yaml has no non-empty not_a_source: list. An outlet cannot "
            "be checked against a list that is not there, and a check with nothing to "
            "check reads exactly like one that passed (#54).",
        )
        return

    files = sorted(DATA_DIR.glob("*.json"))
    c.ok(
        bool(files),
        f"no published outputs found at {DATA_DIR}; rule E is therefore checking nothing, "
        f"and an unreadable output directory is unknown, never clean",
    )

    for entry in banned:
        name = entry.get("name") if isinstance(entry, dict) else None
        if not name or not (isinstance(entry, dict) and entry.get("reason")):
            c.ok(False, f"curated/sources.yaml not_a_source entry {entry!r} needs a name and "
                        f"a written reason; an exemption with no reason is how a check turns "
                        f"back into a skip")
            continue
        needle = name.lower()
        for path in files:
            c.ok(
                needle not in path.read_text().lower(),
                f"{path.name}: names {name!r}, which curated/sources.yaml lists under "
                f"not_a_source. A news report of an agency's data is not the agency's "
                f"data, and the reader cannot trace it (#54). Source the figure to the "
                f"release itself.",
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


# A TIC release month. Deliberately month-bounded rather than `\d{2}`: a fetch
# that read a column header wrong would otherwise publish "2025-13" as a vintage.
# A release month, YYYY-MM. Shared by the TIC and MSPD guards: both pin a
# statement month rather than a day, and both fail on anything else.
_RELEASE_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# The three countries the site publishes, and the only ones lib/tic.py returns.
FOREIGN_HOLDERS = {"Japan", "United Kingdom", "China"}


def _check_foreign_holdings(
    c: Checks,
    holders: dict[str, Any],
    split: dict[str, Any],
    latest_foreign: dict[str, Any] | None,
) -> None:
    """The guards that came with the TIC fetch (#54).

    Foreign holdings used to be hand-typed constants traceable to a news
    report; they are now a column of a Treasury release. Everything that can go
    wrong with that is a SILENT failure, a column read one to the left, a
    builder that adopted the newest release, a parser that grabbed a shifted
    row, so each has a guard here and each guard has a negative test proving
    it bites.
    """
    d = holders["data"]
    meta = holders["_meta"]
    vintage = meta.get("provenance", {}).get("vintage")
    pin = curated._load("snapshots")["snapshots"]["debt_holders"].get("tic_vintage")

    # G1, the vintage is present, well formed, and describes the data beside
    # it. A fetch that fell back to a different column would leave these two
    # disagreeing.
    c.ok(
        isinstance(vintage, str) and bool(_RELEASE_MONTH.match(vintage))
        and vintage == d.get("tic_as_of"),
        f"debt_holders: _meta.provenance.vintage must be a YYYY-MM TIC release month and "
        f"must equal data.tic_as_of; got {vintage!r} and {d.get('tic_as_of')!r}. A figure "
        f"without its release month is the trap SOURCES.md exists to prevent.",
    )

    # G2, the pin is honoured. TIC revises monthly and publishes with a lag,
    # so "whatever is newest" would move published figures on every re-run
    # without anyone deciding to. Moving the vintage is an editorial act.
    c.ok(
        d.get("tic_as_of") == pin,
        f"debt_holders: data.tic_as_of is {d.get('tic_as_of')!r} but "
        f"curated/snapshots.yaml pins debt_holders.tic_vintage: {pin!r}. The builder "
        f"adopted a release nobody chose.",
    )

    # G3, exactly the three countries, no more and no other. Catches a parser
    # that read a shifted row, and closes the door the Fed omission depends on.
    c.ok(
        {row["country"] for row in d["top_foreign"]} == FOREIGN_HOLDERS
        and len(d["top_foreign"]) == len(FOREIGN_HOLDERS),
        f"debt_holders: top_foreign must be exactly {sorted(FOREIGN_HOLDERS)}, got "
        f"{[row['country'] for row in d['top_foreign']]}",
    )

    # G4, THE REBUTTAL, MACHINE-CHECKED. discrepancies.yaml ->
    # foreign_share_of_debt answers the circulating "32% of gross" claim with
    # arithmetic: 30% of the $32.14T held by the public is ~$9.6T, which is 24%
    # of $39.88T gross. If a future edit moves either share without the other,
    # the site would be publishing a 32%-shaped inconsistency of its own.
    foreign = next((s for s in d["public_split"] if s["k"] == "foreign"), None)
    gross_pct = latest_foreign["share_of_gross_pct"] if latest_foreign else None
    if foreign is None or gross_pct is None:
        c.ok(False, "debt_holders: no foreign public_split row or no 2025 gross share; the "
                    "two denominators cannot be reconciled")
    else:
        implied = foreign["share_of_public_pct"] * split["public"]["amount_t"] / d["total_debt_t"]
        c.ok(
            abs(implied - gross_pct) <= 1.0,
            f"debt_holders: the two denominators no longer reconcile. "
            f"{foreign['share_of_public_pct']}% of the ${split['public']['amount_t']}T held "
            f"by the public is {implied:.1f}% of ${d['total_debt_t']}T gross, but "
            f"foreign_share_history says {gross_pct}%. Fix both or neither.",
        )

    # G5, TIC's own all-country total corroborates the curated foreign share.
    # A CROSS-CHECK, not a published figure: the TIC release month and Debt to
    # the Penny's as_of are different dates, so their quotient is not a
    # well-defined share and the 30/24 stay curated. 3pp of slack is what those
    # different dates cost.
    grand_total_b = meta.get("tic_grand_total_b")
    if not isinstance(grand_total_b, (int, float)) or foreign is None:
        c.ok(False, "debt_holders: _meta.tic_grand_total_b is missing or not a number; the "
                    "curated foreign share is then corroborated by nothing")
    else:
        corroborated = 100 * (grand_total_b / 1000) / split["public"]["amount_t"]
        c.ok(
            abs(corroborated - foreign["share_of_public_pct"]) <= 3.0,
            f"debt_holders: TIC's grand total of ${grand_total_b}B is {corroborated:.1f}% of "
            f"the ${split['public']['amount_t']}T held by the public, against a curated "
            f"foreign share of {foreign['share_of_public_pct']}%. More than 3pp apart: one "
            f"of the two has moved and the other has not.",
        )

    # G-china, discrepancies.yaml -> china_holdings keeps a chosen value, and
    # it is now the editorial BOUND the fetched figure is checked against rather
    # than the source of the published number. TIC November 2025 reads 683.9,
    # which the site publishes as 0.684; the resolution's 0.683 is what that is
    # allowed to differ from.
    china = next((row for row in d["top_foreign"] if row["country"] == "China"), None)
    chosen = curated.discrepancies()["china_holdings"]["use"]["amount_t"]
    c.ok(
        china is not None and abs(china["amount_t"] - chosen) <= 0.01,
        f"debt_holders: China reads {china and china['amount_t']} from TIC but "
        f"discrepancies.yaml -> china_holdings chose {chosen}. More than 0.01T apart means "
        f"the fetched release and the editorial resolution are about different vintages; "
        f"re-open the resolution rather than letting the pipeline overwrite it.",
    )


def _check_debt_maturity(c: Checks, maturity: dict[str, Any]) -> None:
    """The six guards over the fetched instrument composition (#56).

    Written to bite the defect that was actually shipped, not a hypothetical
    one. `marketable_total_t` read $28.0T for as long as it was a curated
    constant, and $28.0T is bills + notes + bonds ($28.11T), not the marketable
    total ($30.91T). Two published claims rested on that denominator and were
    artefacts of it, so the checks that asserted them are inverted here rather
    than kept: the three instruments really are not an exhaustive partition, but
    by $2.80T of TIPS and floating-rate notes rather than by a $0.05T rounding
    residue; and the published 22% bills share does not "disagree on purpose"
    with the total beside it, it reconciles with the right one.
    """
    d = maturity["data"]
    meta = maturity["_meta"]
    comp = {row["k"]: row for row in d["composition"]}
    vintage = meta.get("provenance", {}).get("vintage")
    pin = curated._load("snapshots")["snapshots"]["debt_maturity"].get("mspd_vintage")

    # G1, the statement month is present, well formed, and describes the data
    # beside it. A fetch that resolved a different month would leave these two
    # disagreeing.
    c.ok(
        isinstance(vintage, str) and bool(_RELEASE_MONTH.match(vintage))
        and vintage == d.get("mspd_as_of"),
        f"debt_maturity: _meta.provenance.vintage must be a YYYY-MM MSPD statement month "
        f"and must equal data.mspd_as_of; got {vintage!r} and {d.get('mspd_as_of')!r}. A "
        f"figure without its release month is the trap SOURCES.md exists to prevent.",
    )

    # G2, the pin is honoured. MSPD publishes monthly, so "whatever is newest"
    # would move three published figures and the marketable total on every
    # re-run without anyone deciding to.
    c.ok(
        d.get("mspd_as_of") == pin,
        f"debt_maturity: data.mspd_as_of is {d.get('mspd_as_of')!r} but "
        f"curated/snapshots.yaml pins debt_maturity.mspd_vintage: {pin!r}. The builder "
        f"adopted a statement nobody chose.",
    )

    # G3 (was EC2), the three instruments are NOT the marketable total, and
    # the gap is the two families the chart does not draw. The old tolerance was
    # `> 0.01`, which a $0.05T rounding residue satisfied: the check passed for
    # eighteen months while the total beside it was the subtotal. A floor of
    # 2.0 is what would have caught that.
    total_amt = sum(row["amount_t"] for row in d["composition"])
    gap = d["marketable_total_t"] - total_amt
    c.ok(
        gap >= 2.0,
        f"debt_maturity: bills + notes + bonds is ${total_amt:.2f}T against a marketable "
        f"total of ${d['marketable_total_t']:.2f}T, a gap of ${gap:.2f}T. TIPS and "
        f"floating-rate notes alone are about $2.8T, so a gap this small means the total "
        f"is the three-instrument subtotal wearing the total's label -- the $28.0T defect "
        f"#56 removed. It is not a rounding residue and must not be tolerated as one.",
    )

    # G4 (was EC3, inverted), bills' published share must RECONCILE with the
    # amounts beside it. The old check asserted the two must DISAGREE, which was
    # true only of the wrong denominator; 6.76/30.91 is 21.9% against a
    # published 22%. Keeping that assertion would forbid the correct state.
    bills = comp["bills"]
    derived = 100 * bills["amount_t"] / d["marketable_total_t"]
    c.ok(
        abs(derived - bills["share_pct"]) <= 0.5,
        f"debt_maturity: bills are ${bills['amount_t']}T of a ${d['marketable_total_t']}T "
        f"marketable total, {derived:.1f}%, against a published share_pct of "
        f"{bills['share_pct']}. More than 0.5pp apart means one of the two moved and the "
        f"other did not.",
    )
    # The other half of EC3 is real and stands: only bills carries a share, so
    # DebtMaturity.tsx has nothing to derive one from for notes and bonds.
    c.ok(
        "share_pct" in comp["bills"] and "share_pct" not in comp["notes"]
        and "share_pct" not in comp["bonds"],
        "debt_maturity: share_pct must be present on bills only",
    )

    # G5, the class set is the published one. A query that silently narrowed
    # to the three drawn families would make G3 fail loudly, but one that
    # narrowed to five would make it pass for the wrong reason, so the set the
    # total was summed over is recorded and checked rather than inferred.
    classes = meta.get("mspd_classes")
    c.ok(
        isinstance(classes, list)
        and set(MSPD_REQUIRED_CLASSES) <= set(classes),
        f"debt_maturity: _meta.mspd_classes is {classes!r} and does not carry all of "
        f"{list(MSPD_REQUIRED_CLASSES)}. The marketable total was summed over a narrower "
        f"class set than Treasury publishes, which is what the $28.0T total looked like.",
    )


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

    _check_foreign_holdings(c, holders, split, latest_foreign)

    _check_debt_maturity(c, _load("debt_maturity"))

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


def check_top_rates_anchor(c: Checks) -> None:
    """Every top rate the site publishes for 1913-2018 equals IRS SOI Historical
    Table 23's highest-bracket rate for that year (#55).

    curated/top_rates.yaml used to cite "IRS SOI Historical Table 23; Tax Policy
    Center" and nothing checked either claim, the anchor was a sentence in a
    comment. curated/top_rates_soi_anchor.yaml is Table 23's column transcribed
    with its SHA-256, and this is the check that makes the citation an
    OBSERVATION. It runs unconditionally, not behind an `if "bracket_history" in
    outputs` gate: a check skipped because its output was not in the tier reads
    exactly like a check that passed (#37).

    Table 23 stops at 2018, so 2019-2025 are out of its reach by construction and
    are anchored on PL 115-97 and Rev. Proc. 2018-57 through 2024-40 instead. The
    anchor must cover 1913-2018 with NO GAPS, a year silently dropped by a
    footnote-prefixed cell would otherwise shrink the check's reach without
    failing anything, which is the failure this no-gaps assertion exists to stop.
    """
    anchor = curated.top_rates_soi_anchor()
    published = curated.top_rates()

    years = sorted(int(y) for y in anchor)
    c.ok(years == list(range(1913, 2019)),
         f"top_rates_soi_anchor: expected IRS SOI Table 23's full 1913-2018 range with no gaps, "
         f"got {years[0] if years else None}-{years[-1] if years else None} ({len(years)} years); "
         f"missing {sorted(set(range(1913, 2019)) - set(years))}")

    for y in years:
        want = anchor[y]
        got = published.get(y)
        if got is None:
            c.ok(False, f"top_rates: {y} is in IRS SOI Table 23 ({want}%) but absent from "
                        f"curated/top_rates.yaml")
            continue
        c.ok(abs(got - want) < 0.001,
             f"top_rates: {y} published {got}% != IRS SOI Historical Table 23 {want}%. "
             f"Table 23 is the anchor for 1913-2018; a disagreement is an editorial event "
             f"(curated/discrepancies.yaml), never a silent re-baseline of closed history.")


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
    check_meta_titles(c, outputs)
    check_schema(c, outputs)
    # Unconditional, next to check_meta and check_schema and never behind an
    # `if "x" in outputs:` gate: a check skipped because its output was not in
    # the tier reads exactly like a check that passed (#37).
    check_sources(c, outputs)
    check_glossary_sources(c)
    # Unconditional for the same reason as check_sources above: this one
    # reconciles two CURATED files against each other and needs no output at
    # all, so gating it on a tier would only make it silently skippable (#55).
    check_top_rates_anchor(c)
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
