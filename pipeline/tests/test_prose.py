"""The mechanical half of the prose contract. Issue #51.

`docs/contracts/prose.md` has three parts: conventions, a rubric, and a checklist of what only a
human reader can judge. This file enforces the part that is mechanically checkable, punctuation and
emphasis, and nothing else. The rest of the contract says plainly that it is human-judged, and this
suite does not pretend otherwise.

**It reads `dist/`, not `src/`.** That is the whole design. A grep over the page sources counts
`---` frontmatter comments and developer-facing `throw` strings as prose (all three `, ` in
`src/pages/contents.astro`, all five in `src/pages/glossary.astro`, most of the island hits), none
of which a reader ever meets, and it misses the strings the islands assemble at runtime, which a
reader does meet. `src/components/islands/StatutoryVsEffective.tsx:97` is the proof in both
directions: it renders `, ` **into a chart `aria-label`**, so it is a punctuation violation inside
an accessible name, invisible to a source scan and bound by `docs/contracts/accessibility.md` as
well as by this one.

**It is an allow-list, never a deny-list.** A prose string is the text of an element carrying one of
four named classes, or one of three named kinds of accessible name. Nothing else is visited, not
`<span class="unit">—</span>`, which means "this column has no unit" and would otherwise trip every
table; not the `Source.` span at `src/components/Figure.astro:61`, which renders `fig.sourceLine`
verbatim and is quoted material no prose rule may edit. Neither needs an exemption, because neither
is ever in scope. A deny-list would have needed both, and a class added to `Figure.astro` to express
the second.

**The baselines are exact and they are asserted with `==`.** Today's violations are enumerated in
`KNOWN_DASH_DEBT` and `KNOWN_SHOUT_DEBT`, each mapped to the issue that owns its removal. `==` and
not `<=` is the choice that matters: `<=` would let a check pass because it is not looking, and it
would let a fix leave a stale exemption behind forever. With `==`, adding a violation fails on the
new fingerprint and *fixing* one fails on the missing entry, so the baseline can only shrink
deliberately, in the same commit as the fix. #58 has taken its own share of both to zero; what is
left is #102's four island-generated accessible names and #103's five curated-data shouts, the two
surfaces no prose edit to a page source can reach.

Standard library only, and the HTML tree comes from `test_accessibility`'s parser rather than a
third copy of one, the idiom `pipeline/tests/test_contents_index.py` established. The one import
past the standard library is deliberate and is the same rule stated again: section 10 reads
`pipeline/curated/prose_figures.yaml` through `lib.curated._load`, the loader `pipeline/lib/report.py`
uses to build the drift report, so the population this suite asserts against and the population the
drift report reconciles cannot silently diverge.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from test_accessibility import (  # noqa: F401  (Node/nodes_of re-exported for symmetry)
    GLOSSARY_DIR,
    UNMARKED_AT_FIRST_USE,
    Node,
    finding_shape_problems,
    glossary_terms,
    nodes_of,
    parse_html,
)

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
PROSE_DOC = ROOT / "docs" / "contracts" / "prose.md"

if not DIST.exists():
    raise RuntimeError(
        f"{DIST} does not exist. Run `npm run build` from the repository root before pytest — "
        "the prose contract is checked against the served bytes, not the page sources."
    )

PAGES = sorted(DIST.glob("**/index.html"))
if not PAGES:
    raise RuntimeError(f"{DIST} contains no built pages. Run `npm run build` from the repository root.")


# ---------------------------------------------------------------------------
# Scope. Stated once, used by every test.
# ---------------------------------------------------------------------------

#: An element carrying one of these classes is a prose element, and its text is prose.
PROSE_CLASSES = ("prose", "standfirst", "finding", "figure-caveat")

#: `Term.astro`'s popover body. Reader-visible, but it is a glossary entry under
#: `src/content/glossary/`, not this page's prose, a different editing surface with a different
#: owner (#59). Descending into it would put a glossary sentence into a page's fingerprint and hand
#: #58 a fix it does not own.
EXCLUDED_DESCENDANT_CLASS = "term-pop"

#: Elements whose text is markup-free apparatus rather than prose.
SKIP_TAGS = {"script", "style"}

#: An all-caps run of two or more letters, as a whole word. The lookarounds matter: they keep
#: `USASpending` and `HSall_members.csv` out, a CamelCase word is not a shout, while keeping
#: `GDP.`, `GDP's` and `PL 115-97` in.
CAPS_RUN = re.compile(r"(?<![A-Za-z])[A-Z]{2,}(?![A-Za-z])")

#: Runs of digits, with their separators, collapse to `#` in a fingerprint.
DIGIT_RUN = re.compile(r"\d[\d.,]*")

#: The banned constructions. `, ` is not an em dash and is not a substitute for one: it renders as
#: two literal hyphens. Ruling 1 retires it outright rather than blessing it as an ASCII stand-in.
BANNED_DASHES = ("—", " -- ")

#: **Half** of the acronyms and initialisms this site is entitled to write in capitals: the ones
#: with **no glossary entry**, each because the site does not define it. The other half is derived
#: from `src/content/glossary/`'s `abbr` field, and `REGISTERED_INITIALISMS`, the set
#: `test_no_prose_string_shouts` actually asks, is assembled from the two under the section 9
#: banner below, where the test asserting they are disjoint also lives.
#:
#: The split is #59's, and the contract named it as #59's to make: while the glossary held 23
#: entries and none of them an acronym, this set could only be hand-written. Now that six acronyms
#: have entries, an acronym blessed here **and** defined there would be two sources of truth for
#: one initialism, and the older one would rot silently the first time the entry was renamed.
_INITIALISMS_WITH_NO_ENTRY = frozenset(
    {
        # Data hosts and series names the site cites but does not define. FRED is a provenance
        # label ("Census/FRED"); what a reader needs about it is on /sources. AGI reaches only
        # figure notes and source lines, which are quoted material.
        "FRED", "AGI",
        # Places
        "DC", "UK", "US",
        # Laws, by their published short names. Expanding one would be editing quoted material,
        # which Criterion 7 forbids; they arrive through pipeline/curated/laws.yaml.
        "ACA", "CARES", "CHIPS", "IRA", "JGTRRA", "PATH", "PL",
        # Instruments and formats
        "EE", "HTML",
        # Ordinals written as Roman numerals: "Trump II", "World War II"
        "II",
    }
)


def _deep_text(n: Node) -> str:
    """All text a reader meets inside `n`, minus the glossary popovers and minus script/style."""
    out: list[str] = []

    def walk(x: Node) -> None:
        for c in x.children:
            if c.tag == "#text":
                out.append(c.attrs.get("__text__", ""))
            elif c.tag not in SKIP_TAGS and EXCLUDED_DESCENDANT_CLASS not in c.classes():
                walk(c)

    walk(n)
    return "".join(out)


def _inside_a_chart(n: Node) -> bool:
    return any(a.tag == "svg" and "chart" in a.classes() for a in n.ancestors())


def _is_prose_accessible_name(n: Node) -> bool:
    """The three kinds of accessible name that are prose.

    A `figure.figure`'s name and an `svg.chart`'s name are the finding, deliberately the same
    sentence per `docs/contracts/accessibility.md`. A `role="img"` element *inside* a chart is a
    per-datum readout, `BudgetChart.tsx`'s 31 per-fiscal-year labels are these, assembled at
    runtime and read aloud verbatim, which Ruling 1 scoping decision 3 rules in.

    Deliberately excluded: `nav`, `role="radiogroup"`, `role="tablist"` and `role="list"` names.
    Those are control names, governed by the accessibility contract, and they are not prose.
    """
    if n.tag == "figure" and "figure" in n.classes():
        return True
    if n.tag == "svg" and "chart" in n.classes():
        return True
    return n.get("role") == "img" and _inside_a_chart(n)


def _fingerprint(page: str, scope: str, text: str) -> str:
    """`page|scope|first 60 characters, whitespace collapsed, digit runs normalised to #`.

    Three properties earn their keep. It is readable in a diff, so a baseline entry names its own
    subject. Any edit to the offending sentence changes it, so a fix cannot leave a stale exemption
    behind. And digit normalisation collapses `BudgetChart.tsx:84`'s 31 per-fiscal-year labels to
    the three shapes its number formatter produces, because 31 near-identical rows would prove
    nothing three do not.
    """
    collapsed = " ".join(text.split())
    return f"{page}|{scope}|{DIGIT_RUN.sub('#', collapsed)[:60]}"


def prose_strings() -> list[tuple[str, str, str]]:
    """Every prose string on every built page, as `(page, scope, text)`."""
    found: list[tuple[str, str, str]] = []
    for path in PAGES:
        page = str(path.relative_to(DIST))
        root = parse_html(path)
        for n in root.iter_descendants():
            matched = [c for c in n.classes() if c in PROSE_CLASSES]
            if matched:
                found.append((page, matched[0], _deep_text(n)))
            label = n.get("aria-label")
            if label and _is_prose_accessible_name(n):
                found.append((page, f"aria-label:{n.tag}", label))
    return found


# ---------------------------------------------------------------------------
# The baselines. Every entry is a fingerprint mapped to the issue that owns its
# removal, and both are asserted with `==`.
# ---------------------------------------------------------------------------

#: #58 held every prose-class entry and discharged all 23 of them: it was the sentence-craft issue,
#: and it edited `src/pages/**` (plus one `.prose` element inside `StateGiveGet.tsx`, which is page
#: prose the island happens to render). What is left is #102's, and only #102's: island-generated
#: **accessible names**, which are `.tsx` templates no prose edit to a page source can reach.
KNOWN_DASH_DEBT: dict[str, str] = {
    # --- #58's block is gone. It opened at 26 fingerprints over 33 rendered occurrences on the day
    #     #51 landed; #53 retired three by rewriting the sentences under Criterion 2; #58 retired
    #     the remaining 23 (24 em dashes and 6 `, ` across five built pages) by applying Ruling
    #     1's replacement table. Nothing was exempted and no assertion was weakened: the block was
    #     deleted entry by entry, in the same commits as the edits, which is the only way the `==`
    #     below lets a baseline shrink.
    # --- #102, island-generated accessible names. Two `.tsx` templates, outside #58's remit
    #     because #58 edits `src/pages/**` prose only.
    #     `src/components/islands/BudgetChart.tsx:84`, 31 per-fiscal-year `aria-label`s on the
    #     budget bars, collapsing to the three shapes its number formatter produces:
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#B, discretionary $#B, net inter': "#102",
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#T, discretionary $#B, net inter': "#102",
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#T, discretionary $#T, net inter': "#102",
    #     `src/components/islands/StatutoryVsEffective.tsx:97`, `, ` twice inside a chart's
    #     accessible name, which `docs/contracts/accessibility.md` also governs:
    'households/index.html|aria-label:svg|The top statutory income tax rate ran from #% in # to #% in ': "#102",
}

#: #58 held the three shouts in the page sources and discharged all three. #103 owns the
#: curated-data shouts: they reach the page through generated JSON, so retiring them means
#: regenerating data and re-running validation, which is a pipeline change and not a prose edit.
KNOWN_SHOUT_DEBT: dict[str, str] = {
    # --- #58's block is gone. The three shouts Ruling 2 assigned to it, "the bracket COUNT",
    #     "Surtaxes ARE folded" and the figure note's "it INCLUDES PAYROLL TAX", took a
    #     `<strong>` on the emphasised noun phrase and two recasts. The note took a recast
    #     because a `note=` prop is a plain attribute rendered as text and cannot carry markup.
    # --- #103, curated pipeline data. `src/data/party_splits.json:22`'s "AT LEAST ONE" and
    #     `pipeline/curated/laws.yaml:287`'s "VOICE VOTE" reach the page through generated JSON,
    #     so retiring them means regenerating data and re-running validation, a pipeline change,
    #     not a prose edit. Exempted by name, never by a weakened assertion.
    "government/index.html|prose:AT|A vote is 'cross-party' when at least #% of the yes votes ca": "#103",
    "government/index.html|prose:LEAST|A vote is 'cross-party' when at least #% of the yes votes ca": "#103",
    "government/index.html|prose:ONE|A vote is 'cross-party' when at least #% of the yes votes ca": "#103",
    'government/index.html|prose:VOICE|‡ House passed the CARES Act by VOICE VOTE on # March # No r': "#103",
    'government/index.html|prose:VOTE|‡ House passed the CARES Act by VOICE VOTE on # March # No r': "#103",
}


def _owned_by(baseline: dict[str, str], owner: str) -> set[str]:
    return {k for k, v in baseline.items() if v == owner}


# ---------------------------------------------------------------------------
# 1. Punctuation
# ---------------------------------------------------------------------------


def test_no_prose_string_contains_an_em_dash_or_a_double_hyphen():
    offenders = {
        _fingerprint(page, scope, text)
        for page, scope, text in prose_strings()
        if any(d in text for d in BANNED_DASHES)
    }
    new = offenders - set(KNOWN_DASH_DEBT)
    fixed = set(KNOWN_DASH_DEBT) - offenders
    assert not new, (
        "New em dash or ` -- ` in prose. docs/contracts/prose.md Ruling 1 bans both and names a "
        "replacement for each job: comma pair for a parenthetical aside, colon or a new sentence "
        "for an amplifying clause, comma pair for an appositive gloss, full stop for a generated "
        "readout separator. Offending fingerprints:\n  " + "\n  ".join(sorted(new))
    )
    assert not fixed, (
        "A baselined dash is gone but KNOWN_DASH_DEBT still lists it. Delete the entry in the same "
        "commit as the fix — the baseline shrinks deliberately or it rots into a permanent "
        "exemption. Stale fingerprints:\n  " + "\n  ".join(sorted(fixed))
    )
    assert offenders == set(KNOWN_DASH_DEBT)


# ---------------------------------------------------------------------------
# 2. Emphasis
# ---------------------------------------------------------------------------


def test_no_prose_string_shouts():
    offenders = {
        _fingerprint(page, f"{scope}:{word}", text)
        for page, scope, text in prose_strings()
        for word in CAPS_RUN.findall(text)
        if word not in REGISTERED_INITIALISMS
    }
    new = offenders - set(KNOWN_SHOUT_DEBT)
    fixed = set(KNOWN_SHOUT_DEBT) - offenders
    assert not new, (
        "All-caps emphasis in prose. docs/contracts/prose.md Ruling 2 reserves capitals for the "
        "`.kicker` role and replaces shouted emphasis with `<strong>` on the load-bearing noun "
        "phrase, or a recast. If the run is an acronym this site is entitled to, register it in "
        "REGISTERED_INITIALISMS rather than baselining it. Offending fingerprints:\n  "
        + "\n  ".join(sorted(new))
    )
    assert not fixed, (
        "A baselined shout is gone but KNOWN_SHOUT_DEBT still lists it. Delete the entry in the "
        "same commit as the fix. Stale fingerprints:\n  " + "\n  ".join(sorted(fixed))
    )
    assert offenders == set(KNOWN_SHOUT_DEBT)


# ---------------------------------------------------------------------------
# 3. The baselines cannot outlive their subjects
# ---------------------------------------------------------------------------

_OWNER_RE = re.compile(r"^#\d+$")


@pytest.mark.parametrize("name", ["KNOWN_DASH_DEBT", "KNOWN_SHOUT_DEBT"])
def test_the_baselines_are_declining(name):
    """Both baselines, not just the dash one: this is parametrized over each in turn.

    Renamed from `test_the_dash_baseline_is_declining` by #58, which owned both baselines down to
    its own zero and so owned the name that described half of what the test checks.
    """
    baseline = {"KNOWN_DASH_DEBT": KNOWN_DASH_DEBT, "KNOWN_SHOUT_DEBT": KNOWN_SHOUT_DEBT}[name]
    assert baseline, f"{name} is empty. An empty baseline means the check is not looking."
    for fingerprint, owner in sorted(baseline.items()):
        assert _OWNER_RE.match(owner or ""), (
            f"{name} entry has no owning issue number: {fingerprint!r} -> {owner!r}. "
            "A baseline entry nobody owns is a permanent exemption."
        )
        page = fingerprint.split("|", 1)[0]
        assert (DIST / page).exists(), (
            f"{name} entry names a built page that no longer exists: {page}. "
            f"The route was renamed or removed; the entry is stale. Fingerprint: {fingerprint!r}"
        )


# ---------------------------------------------------------------------------
# 4. The contract cannot rot
# ---------------------------------------------------------------------------

#: `path/to/file.ext:12` or `path/to/file.ext:12-34`. Anchored on an extension so prose like
#: "OpenStax 8.7" and a bare `1946-1950` cannot match.
CITATION_RE = re.compile(r"\b([A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z]{1,5}):(\d+)(?:-(\d+))?\b")


def test_prose_contract_cites_lines_that_resolve():
    assert PROSE_DOC.exists(), f"{PROSE_DOC} does not exist."
    text = PROSE_DOC.read_text()
    citations = CITATION_RE.findall(text)
    assert len(citations) >= 20, (
        f"{PROSE_DOC.name} carries only {len(citations)} `path:line` citations. Every convention is "
        "supposed to carry a worked pass and a worked fail at a real line."
    )
    for rel, start, end in citations:
        target = ROOT / rel
        assert target.exists(), (
            f"{PROSE_DOC.name} cites {rel}:{start}, but {rel} does not exist under {ROOT}. "
            "Cite repository-relative paths, and re-check a citation when the file moves."
        )
        lines = target.read_text(errors="replace").splitlines()
        for n in (int(start), int(end or start)):
            assert 1 <= n <= len(lines), (
                f"{PROSE_DOC.name} cites {rel}:{n}, but {rel} has {len(lines)} lines. "
                "The file moved under the citation."
            )


# ---------------------------------------------------------------------------
# 5. The rubric the six C-issues cite
# ---------------------------------------------------------------------------

#: A rubric heading is `### Criterion N, <name>`, and the em dash is part of the match. Without it
#: this also collects `### Criterion 1 audit`, the per-section table #52 added below the rubric, and
#: the consecutive-numbering assertion then fails on a second 1 that is not a criterion at all.
CRITERION_RE = re.compile(r"^### Criterion (\d+) —", re.MULTILINE)


def test_prose_contract_has_a_numbered_rubric():
    numbers = [int(n) for n in CRITERION_RE.findall(PROSE_DOC.read_text())]
    assert len(numbers) >= 6, (
        f"docs/contracts/prose.md carries {len(numbers)} `### Criterion N` headings; the rubric "
        "needs at least six, one per craft dimension, so each C-issue can cite one criterion "
        "rather than the whole document."
    )
    assert numbers == list(range(1, len(numbers) + 1)), (
        f"Rubric criteria are not consecutively numbered from 1: {numbers}. A C-issue cites a "
        "criterion by number, so a gap or a repeat sends it to the wrong rule."
    )


# ---------------------------------------------------------------------------
# 6. Criterion 1, the question comes first
# ---------------------------------------------------------------------------

#: The four report routes. Named, never globbed. `/contents`, `/glossary` and `/sources` also carry
#: `<section id>` elements, but those are index entries and letter groups rather than report
#: sections, and holding an alphabet group to "a standfirst before its first figure" would be
#: nonsense. Adding a report route is a deliberate act and should touch this tuple.
REPORT_PAGES = ("index.html", "economy/index.html", "households/index.html", "government/index.html")

#: Jaccard overlap of number tokens at or above which a standfirst counts as having pre-empted its
#: finding. Deliberately loose: it was set at 0.5 with the highest passing section, then
#: `economy#growth-shadow`, at 0.429. #53's Criterion 2 pass took the whole distribution down, and
#: the highest today is `households#a-century-of-brackets` at 0.222. The ceiling is deliberately
#: left where it was: it is Criterion 1's rule, not Criterion 2's, and tightening it to fit the
#: prose that happens to exist is how a threshold with no headroom starts firing on every honest
#: edit and gets raised until it means nothing.
PREEMPTION_CEILING = 0.5

#: Words that name the drawing rather than the subject. Word-boundary, case-insensitive.
CONSTRUCTION_WORDS = frozenset(
    {"axis", "axes", "chart", "charts", "graph", "graphs", "plot", "panel", "panels",
     "scale", "series", "bars", "legend"}
)

#: `<section …>…</section>`, non-greedy. A regex is honest here only because no `<section>` nests
#: inside another on the four report pages, every one is a direct child of `<main>`. If that ever
#: changes, this silently mis-splits, which is why `sections()` asserts the id set it finds against
#: the parsed tree rather than trusting the regex alone.
#: The opening tag's attributes are captured as a blob rather than anchoring `id` in place, because
#: `id` is not guaranteed to be the first attribute, `<section class="…" id="…">` is valid markup
#: today even though no current page writes it that way.
SECTION_RE = re.compile(r'<section\b([^>]*)>(.*?)</section>', re.DOTALL)

#: `id="..."` pulled out of a `<section>` opening tag's attribute blob, wherever it falls.
SECTION_ID_RE = re.compile(r'\bid="([^"]*)"')


def sections() -> list[tuple[str, str, str, Node]]:
    """Every report section, as `(page, section_id, body_html, node)`.

    Two views of the same section on purpose. The raw `body_html` answers the positional questions
   , does a standfirst appear *before* the first `<figure`, does a `.prose` appear *after* the
    last `</figure>`, which a tree walk answers only by re-deriving document order. The parsed
    `node` answers the textual ones, through the same `_deep_text` the rest of this file uses.
    """
    out: list[tuple[str, str, str, Node]] = []
    for page in REPORT_PAGES:
        path = DIST / page
        assert path.exists(), (
            f"REPORT_PAGES names {page}, which does not exist under {DIST}. A route was renamed or "
            "removed. Fix the tuple deliberately: a missing entry does not fail this suite, it "
            "silently shrinks what it checks."
        )
        raw = path.read_text()
        by_id = {n.get("id"): n for n in nodes_of(parse_html(path), "section") if n.get("id")}
        found: list[tuple[str, str]] = []
        for attrs, body in SECTION_RE.findall(raw):
            id_match = SECTION_ID_RE.search(attrs)
            if id_match:
                found.append((id_match.group(1), body))
        assert {sid for sid, _ in found} == set(by_id), (
            f"{page}: the regex-based section extractor found {sorted(sid for sid, _ in found)} but "
            f"the parsed tree carries {sorted(by_id)}. A `<section>` now nests inside another and "
            "the non-greedy split is wrong. Replace the regex with a tree walk."
        )
        for section_id, body in found:
            out.append((page, section_id, body, by_id[section_id]))
    return out


def _numbers(node: Node, cls: str) -> set[str]:
    """The set of number tokens in the first element of class `cls` inside `node`.

    Trailing `.` and `,` are stripped: `DIGIT_RUN` swallows a sentence-final full stop, so without
    this `2025,` and `2025.` are two different numbers and the overlap measure is mostly noise.
    """
    for d in node.iter_descendants():
        if cls in d.classes():
            return {t.rstrip(".,") for t in DIGIT_RUN.findall(_deep_text(d))} - {""}
    return set()


def test_every_section_with_a_figure_states_its_question_first():
    """Dimension A: a `.standfirst` precedes the section's first `<figure`.

    Scope is structural. A section with no `<figure>` is not exempted, it is simply not asked,
    the three Limits sections and the `/` intro's four sections fall out with no list to maintain.
    """
    offenders = [
        f"{page}#{sid}"
        for page, sid, body, _ in sections()
        if "<figure" in body
        and not (0 <= body.find('class="standfirst"') < body.find("<figure"))
    ]
    assert not offenders, (
        "A section shows its figure before it says what question the figure answers. "
        "docs/contracts/prose.md Criterion 1: the question lives in the standfirst, before the "
        "chart. Sections:\n  " + "\n  ".join(offenders)
    )


def test_every_section_with_a_figure_answers_after_it():
    """Dimension B: a `.prose` follows the section's **last** `</figure>`.

    "Last, not first" is the whole of the two-figure edge case: `government#where-money-comes-from`,
    `government#by-state` and `households#who-pays` each carry prose between their two figures, and
    a first-figure split would pass them on a paragraph the reader meets before the evidence is in.
    """
    offenders = [
        f"{page}#{sid}"
        for page, sid, body, _ in sections()
        if "<figure" in body and 'class="prose"' not in body.rsplit("</figure>", 1)[-1]
    ]
    assert not offenders, (
        "A section ends on a bare figure. docs/contracts/prose.md Criterion 1: the chart is the "
        "answer's evidence, and the closing prose is where the section says what the reader is "
        "looking at. Sections:\n  " + "\n  ".join(offenders)
    )


def test_no_standfirst_preempts_its_finding():
    """Dimension C: the standfirst has not already given the finding away.

    Measured as the Jaccard overlap of number tokens. A standfirst that quotes the finding's exact
    figures posed no question: the reader arrives at the chart already told the answer, and the
    figure becomes decoration. Both sets empty scores 0.0 and passes, which is a real limit and a
    deliberate one: a numberless restatement in words is invisible here and is Checklist item 8.
    """
    scored = []
    for page, sid, _, node in sections():
        a, b = _numbers(node, "standfirst"), _numbers(node, "finding")
        if not a or not b:
            continue
        scored.append((len(a & b) / len(a | b), f"{page}#{sid}"))
    offenders = [f"{name} at {score:.3f}" for score, name in sorted(scored, reverse=True)
                 if score >= PREEMPTION_CEILING]
    assert not offenders, (
        f"A standfirst repeats its finding's numbers at or above {PREEMPTION_CEILING} overlap. "
        "docs/contracts/prose.md Criterion 1: the standfirst poses the question and the finding "
        "answers it. Rewrite the standfirst, never the finding — a finding edit drags its chart "
        "`aria-label` with it under Criterion 7. Sections:\n  " + "\n  ".join(offenders)
    )


def test_no_section_heading_names_the_charts_construction():
    """Dimension D: no `<h2>` names the drawing instead of the subject.

    **This test sees half of what Criterion 1 asks.** It catches a heading that names the apparatus
   , an axis, a panel, a scale. It cannot judge whether a heading names its subject ACCURATELY,
    which is the other half and is human-judged as Checklist item 8 in docs/contracts/prose.md. No
    word list is added here to fake it.

    Naming the variables was a defect under Ruling 4 and is the rule under Ruling 5. "Prices and
    rates" and "Labor and capital" were rewritten by #52 for telling a reader what was plotted
    rather than what was found; Ruling 5 moved the claim to the finding, so those two headings are
    now the shape every route uses. The assertion below did not move across that reversal, which is
    the point of scoping it to the apparatus alone.
    """
    offenders = []
    for page in REPORT_PAGES:
        for h in nodes_of(parse_html(DIST / page), "h2"):
            text = " ".join(_deep_text(h).split())
            hits = sorted(w for w in CONSTRUCTION_WORDS
                          if re.search(rf"\b{w}\b", text, re.IGNORECASE))
            if hits:
                offenders.append(f"{page}: {text!r} names {', '.join(hits)}")
    assert not offenders, (
        "A section heading names the chart's construction. docs/contracts/prose.md Criterion 1: a "
        "heading states the question the section answers or the claim it supports, not how the "
        "picture was drawn. Headings:\n  " + "\n  ".join(offenders)
    )


#: A row of the `### Criterion 1 audit` table: `| /route | section-id | question | Pass |`.
AUDIT_ROW_RE = re.compile(r"^\|\s*(/[a-z]*)\s*\|\s*([a-z0-9-]+)\s*\|", re.MULTILINE)


def _route_of(page: str) -> str:
    return "/" + page[: -len("index.html")].rstrip("/")


def _audit_table(heading: str) -> str:
    """The text under `### <heading>`, ending at the next heading of **any** level.

    The boundary is the part that matters. While `### Criterion 1 audit` was the only audit table
    in the contract, slicing to the next `"\\n## "` was equivalent to slicing to the next heading.
    With `### Criterion 2 audit` sitting beside it, that slice swallows both tables and each
    coverage test below then measures the *union* of the two row sets against its own subject.
    Today that union happens to equal the section set, so the mis-parse would pass rather than
    fail, which is the worse of the two outcomes. Ending at the next heading of any level,
    `\\n# ` through `\\n###### `, whichever comes first, keeps each table to itself even if the
    contract later grows a `####` subsection between two audit tables.
    """
    text = PROSE_DOC.read_text()
    start = text.find(f"### {heading}")
    assert start != -1, (
        f"docs/contracts/prose.md has no `### {heading}` section. The per-surface judgement lives "
        "in the contract, where it can be re-read, not in a PR body, where it cannot."
    )
    nxt = re.search(r"\n#{1,6} ", text[start + 1 :])
    return text[start : start + 1 + nxt.start()] if nxt else text[start:]


def test_the_criterion_one_audit_covers_every_section():
    """The audit table's row set **equals** the section set built from `dist/`.

    Equality, not containment, in the idiom of the two `==`-asserted baselines above. Containment
    would let a new section ship without declaring the question it answers, and would let a deleted
    section leave a stale row asserting a judgement about a page nobody can read any more. What the
    test asserts is the table's *coverage*; the wording of each question is a reviewer's paraphrase
    and is exactly the part no machine can check.
    """
    table = _audit_table("Criterion 1 audit")
    declared = {(route, sid) for route, sid in AUDIT_ROW_RE.findall(table)}
    actual = {(_route_of(page), sid) for page, sid, _, _ in sections()}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Sections on the built site with no row in the Criterion 1 audit table. Add a row naming "
        "the question the section answers:\n  " + "\n  ".join(f"{r}#{s}" for r, s in missing)
    )
    assert not stale, (
        "Criterion 1 audit rows for sections that no longer exist. Delete them in the same commit "
        "as the section:\n  " + "\n  ".join(f"{r}#{s}" for r, s in stale)
    )
    assert declared == actual


# ---------------------------------------------------------------------------
# 7. Criterion 2, the standfirst sets up, the finding claims
# ---------------------------------------------------------------------------

#: A four-digit calendar year. The one number a standfirst and its finding may both name: the
#: standfirst's job is to say over what window the chart runs, and the finding's is to locate its
#: claim in time, so both name the same years by construction. This is a regex class and not a list
#: of instances, so there is nothing here to maintain and nothing to rot.
YEAR = re.compile(r"^(?:19|20)\d{2}$")

#: The cap on a finding, in characters, whitespace collapsed. `docs/contracts/prose.md` left the
#: number open and #53 fixes it here. The longest finding that survives #53 is 193 characters, so
#: the cap carries 27 characters of headroom, the property `PREEMPTION_CEILING`'s comment above
#: argues a threshold needs, and the reason `households#a-century-of-brackets` was rewritten at 216
#: rather than left four characters under the line.
FINDING_CHARS_MAX = 220


def _prose_of(node: Node, cls: str) -> list[Node]:
    return [d for d in node.iter_descendants() if cls in d.classes()]


def findings() -> list[tuple[str, str, Node]]:
    """Every `.finding` on the four report routes, as `(page, section_id, node)`.

    Structural scope, per `docs/contracts/prose.md` rule 2: a section is asked these questions
    **because it carries a `.finding`**. The three Limits sections and the `/` intro's four carry
    none, so they fall out here with no exemption list to keep.
    """
    return [
        (page, sid, node)
        for page, sid, _, section in sections()
        for node in _prose_of(section, "finding")
    ]


def _collapsed(node: Node) -> str:
    return " ".join(_deep_text(node).split())


def test_no_standfirst_repeats_its_findings_figures():
    """A standfirst may name the window; it may not hand over the figure the finding is there for.

    Stricter than `test_no_standfirst_preempts_its_finding` on values and looser on years, and the
    two are complementary rather than redundant. Criterion 1's Jaccard measure counts years, so it
    still fires on a standfirst that names nothing but its finding's window; this one permits every
    shared year and fails on a single shared value. Neither subsumes the other, and #53 keeps both.

    *Cannot see:* a standfirst that restates its finding **in words** rather than in numbers. That
    is Checklist item 2 in `docs/contracts/prose.md`, and it is human-judged.
    """
    offenders = []
    for page, sid, _, section in sections():
        a, b = _numbers(section, "standfirst"), _numbers(section, "finding")
        shared = sorted(t for t in a & b if not YEAR.match(t))
        if shared:
            offenders.append(f"{page}#{sid} shares {', '.join(shared)}")
    assert not offenders, (
        "A standfirst quotes a figure its finding is there to give. docs/contracts/prose.md "
        "Criterion 2: the standfirst sets the chart up and the finding makes the claim. Rewrite "
        "the standfirst, never the finding — a finding edit drags its chart `aria-label` with it "
        "under Criterion 7. A shared four-digit year is allowed, because both elements are "
        "supposed to say when. Sections:\n  " + "\n  ".join(offenders)
    )


def test_every_finding_states_a_finding():
    """Every `.finding` body, and every `figure.figure` name, clears the finding-shape floor.

    The floor is `finding_shape_problems` in `pipeline/tests/test_accessibility.py`, which is where
    it has always lived: at least 40 characters, a digit, no leading shape word, no "chart showing".
    This test applies the same function rather than a second copy of it, so the two surfaces
    `docs/contracts/prose.md` says are the same sentence cannot drift apart in what they are held to.

    Asserting the floor on the `.finding` itself is also what makes trimming a finding safe: a
    rewrite short enough to push its `aria-label` under 40 characters fails here first, on the
    element the author actually edited.

    *Cannot see:* whether the claim is true, or whether the label and the finding beside it say the
    same thing. Checklist item 3, Criterion 7, human-judged.
    """
    offenders = []
    for page, sid, node in findings():
        text = _collapsed(node)
        for problem in finding_shape_problems(text):
            offenders.append(f"{page}#{sid} finding {problem}: {text[:70]!r}")
    for page in REPORT_PAGES:
        for fig in nodes_of(parse_html(DIST / page), "figure"):
            if "figure" not in fig.classes():
                continue
            label = fig.get("aria-label") or ""
            for problem in finding_shape_problems(label):
                offenders.append(f"{page} figure aria-label {problem}: {label[:70]!r}")
    assert not offenders, (
        "A finding, or a figure's accessible name, does not read as a finding. "
        "docs/contracts/prose.md: a figure's accessible name *is* its finding, so both are held to "
        "the same floor. Offenders:\n  " + "\n  ".join(offenders)
    )


def test_no_finding_runs_past_the_cap():
    """Every `.finding` is at or under `FINDING_CHARS_MAX`, whitespace collapsed.

    **Length is a proxy and this test says so.** It cannot count claims. `government#whole-budget`
    is 68 characters and carries three figures; a 200-character finding can carry exactly one. No
    clause-counter and no "and"-splitter is added here to fake the judgement, because a word list
    invented to make a human reading look mechanical reports green and is worse than no check at
    all (`docs/contracts/prose.md`, rule 4). "One claim" is Checklist item 2 and it is read by a
    person. What this catches is the shape that made every multi-claim finding on the site
    identifiable: a finding that kept going.
    """
    offenders = []
    for page, sid, node in findings():
        text = _collapsed(node)
        if len(text) > FINDING_CHARS_MAX:
            offenders.append(f"{page}#{sid} at {len(text)} characters: {text[:70]!r}")
    assert not offenders, (
        f"A finding runs past {FINDING_CHARS_MAX} characters. docs/contracts/prose.md Criterion 2: "
        "a finding states one claim a reader can check against the figure, and it is also the "
        "figure's accessible name, read aloud in full. Move the surplus figures into the section's "
        "closing `.prose`, and move the `<Figure ariaLabel>` in the same commit. "
        "Findings:\n  " + "\n  ".join(offenders)
    )


def test_every_finding_sits_where_the_stylesheet_expects_it():
    """One finding per section, immediately after its standfirst, before the section's first figure.

    `src/styles/global.css:82` selects `.standfirst + .finding`, so a finding that is not its
    standfirst's next sibling silently loses 1.4rem of top margin. That is the cheap half. The
    binding half is that a section's finding, its `<Figure ariaLabel>` and its row in the
    Criterion 2 audit table are one-to-one: a second finding has no label to be and no row to sit
    in, which is why the answer to a multi-claim finding is the closing `.prose` and never a second
    `.finding`.

    Scope is structural. A section carrying no finding is not asked rather than exempted.
    """
    offenders = []
    for page, sid, body, section in sections():
        found = _prose_of(section, "finding")
        if not found:
            continue
        if len(found) > 1:
            offenders.append(f"{page}#{sid} carries {len(found)} findings; one section, one claim")
        for node in found:
            siblings = [c for c in node.parent.children if c.tag != "#text"] if node.parent else []
            i = siblings.index(node)
            previous = siblings[i - 1] if i else None
            if previous is None or "standfirst" not in previous.classes():
                got = f"<{previous.tag} class={previous.get('class')!r}>" if previous else "nothing"
                offenders.append(
                    f"{page}#{sid} finding does not follow its standfirst; it follows {got}"
                )
        first_figure = body.find("<figure")
        if first_figure != -1 and not 0 <= body.find('class="finding"') < first_figure:
            offenders.append(f"{page}#{sid} states its finding after the figure it claims about")
    assert not offenders, (
        "A finding is not where the stylesheet and the audit table expect it. "
        "docs/contracts/prose.md Criterion 2: one finding per section, immediately after the "
        "standfirst it answers, before the figure it is checkable against. Sections:\n  "
        + "\n  ".join(offenders)
    )


def test_the_criterion_two_audit_covers_every_finding():
    """The Criterion 2 audit table's row set **equals** the set of sections carrying a `.finding`.

    Equality, in the idiom of `test_the_criterion_one_audit_covers_every_section` above and of the
    two `==`-asserted baselines. A new finding cannot ship without a reviewer writing down the one
    claim it makes and which figure's `<details>` table that claim is checkable against, and a
    deleted one cannot leave its judgement behind. As with Criterion 1, the test asserts coverage
    and never wording: whether the row's paraphrase is honest is Checklist item 2.
    """
    table = _audit_table("Criterion 2 audit")
    declared = {(route, sid) for route, sid in AUDIT_ROW_RE.findall(table)}
    actual = {(_route_of(page), sid) for page, sid, _ in findings()}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Sections carrying a finding with no row in the Criterion 2 audit table. Add a row naming "
        "the one claim the finding makes and the figure it is checkable against:\n  "
        + "\n  ".join(f"{r}#{s}" for r, s in missing)
    )
    assert not stale, (
        "Criterion 2 audit rows for sections that carry no finding. Delete them in the same commit "
        "as the finding:\n  " + "\n  ".join(f"{r}#{s}" for r, s in stale)
    )
    assert declared == actual


# ---------------------------------------------------------------------------
# 8. Criterion 3, sentence length and word spacing
# ---------------------------------------------------------------------------

#: The cap on a prose sentence, in **words**, whitespace collapsed. Measured over all 443 sentences
#: the four prose classes carried on the seven built pages before #58 edited them: 50 ran past 30
#: words, 29 past 35, 13 past 40, **7 past 45**, 3 past 50 and 2 past 55. 45 is the knee. 40 catches
#: thirteen, several of which are long but well-behaved lists of caveats; 50 leaves the 46- and
#: 49-word sentences that were the worst clause-stacking on the site. Seven is also the count that
#: made #52's road correct under `docs/contracts/prose.md` rule 3: all seven were split, this test
#: asserts zero, and there is no baseline and no exemption set.
#:
#: **Words, not characters, and the divergence from `FINDING_CHARS_MAX` is deliberate.** That cap
#: (220) is a display-length cap on a single ruled-off sentence a screen reader also reads aloud in
#: full. This one is a proxy for clause load, where a word is the unit a reader parses. The two
#: disagree materially: the 49-word offender measured 320 characters and the 46-word one 241. The
#: longest finding on the site is 40 words, so this cap cannot collide with Criterion 2.
SENTENCE_WORDS_MAX = 45

#: A sentence boundary: terminal punctuation, an optional closing quote or bracket, whitespace, and
#: a capital, digit or `$` opening the next sentence. Deliberately conservative, an **over**-split
#: hides a violation by halving a long sentence, while an under-split merely shows a human a longer
#: string than there really is, so the safe direction is to split less.
#:
#: `(?<!\b[A-Z]\.)` exists for exactly one live string: `government#passed-signed` writes "G.W.
#: Bush", which a naive `(?<=[.!?])\s+(?=[A-Z])` cuts in half. It is a lookbehind on a *single*
#: capital at a word boundary, so `GDP.` is unaffected: there is no word boundary before the `P`.
#:
#: The closing quote/bracket is matched via a second, fixed-width lookbehind branch rather than
#: consumed as an ordinary (optional) character, Python's `re` forbids variable-width lookbehind,
#: so the two cases (bare terminal punctuation, and terminal punctuation plus a closer) are spelled
#: out separately. Consuming the closer outright would drop it from the split delimiter and, with
#: it, from the returned sentence string, `sentences()` callers, including this file's offender
#: excerpts, would then show `He said "hi.` instead of `He said "hi."`.
SENTENCE_SPLIT = re.compile(
    r'(?:(?<=[.!?])(?<!\b[A-Z]\.)|(?<=[.!?]["’”)]))\s+(?=[A-Z0-9$])'
)


def sentences(text: str) -> list[str]:
    """`text` split into sentences, whitespace collapsed, empties dropped."""
    return [s for s in (p.strip() for p in SENTENCE_SPLIT.split(" ".join(text.split()))) if s]


def prose_class_strings() -> list[tuple[str, str, str]]:
    """`prose_strings()` minus the accessible names.

    Structural, not a list: a `(page, scope, text)` triple is in scope when its scope is one of
    `PROSE_CLASSES`, which is to say when the string is the text of an element on the page. The
    accessible names fall out because they are `aria-label` scopes, and they fall out for a reason
    this contract already states elsewhere: a chart's name is bound by
    `docs/contracts/accessibility.md` and, where it is a finding, by `FINDING_CHARS_MAX` above,
    and the island-generated ones are `.tsx` templates owned by #102. Holding a per-datum readout
    assembled by a number formatter to a sentence-craft cap would be measuring the formatter.
    """
    return [(page, scope, text) for page, scope, text in prose_strings() if scope in PROSE_CLASSES]


def test_no_prose_sentence_runs_past_the_cap():
    """Every sentence in every prose element is at or under `SENTENCE_WORDS_MAX`.

    Asserts zero. No baseline, no exemption set: #58 found seven violations and split all seven,
    which is the choice `docs/contracts/prose.md` rule 3 prescribes at that count.

    **Cannot see:** whether a sentence is *hard*. It cannot tell a 46-word sentence a reader glides
    through from a 30-word one they have to restart, because length is a proxy and clause count is
    the judgement. No clause-counter and no proxy word list is added here to fake it, a word list
    invented to make a human reading look mechanical reports green, which is worse than no check
    (rule 4). Reading for clause load is Checklist item 10.

    **Also cannot see** a list item that forgot its full stop. An `<ol class="prose">` matches on
    the list element, so `_deep_text` concatenates every `<li>` into one string: `/` section 4's
    four numbered items arrive here as a single text run, split correctly today only because each
    item ends in a full stop. An item that did not would fuse with the next and read as one
    over-long sentence. That is a **false positive**, which is the safe direction for a splitter,
    and it is recorded here rather than left for a future reader to mistake for a real violation.
    """
    offenders = []
    for page, scope, text in prose_class_strings():
        for s in sentences(text):
            n = len(s.split())
            if n > SENTENCE_WORDS_MAX:
                offenders.append(f"{page} .{scope} at {n} words: {s[:70]!r}")
    assert not offenders, (
        f"A prose sentence runs past {SENTENCE_WORDS_MAX} words. docs/contracts/prose.md "
        "Criterion 3: split it at the clause the reader is already pausing at, and do not change "
        "what it claims — every figure in these sentences is registered in "
        "pipeline/curated/prose_figures.yaml, so re-punctuating around a figure is in scope and "
        "restating or re-rounding it is not. Sentences:\n  " + "\n  ".join(offenders)
    )


#: A character that must not sit immediately against a `.term` span. Letters and digits are a fused
#: word (`thestatutory`, `innominal`); a comma is a fused clause boundary.
TERM_ABUTS_BEFORE = re.compile(r"[A-Za-z0-9,]")
TERM_ABUTS_AFTER = re.compile(r"[A-Za-z0-9]")


def _text_and_term_spans(n: Node) -> tuple[str, list[tuple[int, int]]]:
    """`_deep_text(n)`, plus the `(start, end)` offset of every `.term` span inside it."""
    out: list[str] = []
    spans: list[tuple[int, int]] = []
    pos = 0

    def walk(x: Node) -> None:
        nonlocal pos
        for c in x.children:
            if c.tag == "#text":
                t = c.attrs.get("__text__", "")
                out.append(t)
                pos += len(t)
            elif c.tag in SKIP_TAGS or EXCLUDED_DESCENDANT_CLASS in c.classes():
                continue
            elif "term" in c.classes():
                start = pos
                walk(c)
                spans.append((start, pos))
            else:
                walk(c)

    walk(n)
    return "".join(out), spans


def test_no_prose_string_fuses_two_words_at_a_component_boundary():
    """No `.term` span abuts a letter, a digit or a comma in the served bytes.

    Astro strips the whitespace between a text run and a component that begins the next source
    line, so a `<Term>` wrapped onto its own line fuses with the word before it. `/households`
    served "far less than thestatutory rate" and "it is set innominal dollars", and `/government`
    served "permanent law andnet interest", from source that looks correct in every case. **The
    source is not the subject; the served bytes are.**

    Scope is derived from the DOM and carries no list: every `.term` inside every prose element is
    asked, and punctuation that legitimately abuts a term, an opening bracket or quote, is
    allowed by construction rather than by exemption.

    **Cannot see the expression-boundary variant.** The same collapse fuses a text run with a
    `{expr}` that begins the next line, which is how `/contents` served "6 destinations,25 numbered
    figures". An interpolated value is indistinguishable from literal text in the served bytes, so
    there is no span to anchor on and nothing here to check. That instance is fixed by hand, with
    `{' '}` on the line the value is on, and re-reading `/contents`' standfirst is Checklist
    item 12.
    """
    offenders = []
    for path in PAGES:
        page = str(path.relative_to(DIST))
        for n in parse_html(path).iter_descendants():
            if not any(c in PROSE_CLASSES for c in n.classes()):
                continue
            text, spans = _text_and_term_spans(n)
            for start, end in spans:
                if start > 0 and TERM_ABUTS_BEFORE.match(text[start - 1]):
                    offenders.append(f"{page}: ...{text[max(0, start - 30):end]!r}")
                if end < len(text) and TERM_ABUTS_AFTER.match(text[end]):
                    offenders.append(f"{page}: {text[start:end + 30]!r}...")
    assert not offenders, (
        "A glossary term is fused to the word beside it in the served HTML. Astro drops the "
        "newline between a text run and a component that starts the next source line. Keep the "
        "space on the component's own line — `word <Term …>` or `</Term> word` — rather than "
        "letting the line break carry it. Occurrences:\n  " + "\n  ".join(offenders)
    )


#: A row of the `### Criterion 3 audit` table: `` | `economy/index.html` | … | Pass | ``. The page
#: is backticked because it is a path, and anchoring on the backticks keeps the prose in the second
#: column from ever matching this.
#: The directory prefix is optional, because `/` builds to a bare `index.html` with no directory in
#: front of it, and a required prefix silently drops the front door from the row set.
CRITERION_THREE_ROW_RE = re.compile(r"^\|\s*`((?:[A-Za-z0-9_-]+/)*index\.html)`\s*\|", re.MULTILINE)


def test_the_criterion_three_audit_covers_every_page():
    """The Criterion 3 audit table's row set **equals** the pages `dist/` carries.

    Criterion 3's surface is the **page**, not the section: punctuation and emphasis conventions
    are page-wide, and both baselines above are keyed by page. Equality, in the idiom of the
    Criterion 1 and Criterion 2 audits and of the two `==`-asserted baselines: a new route cannot
    ship without a reviewer writing down what its sentence craft turns on, and a deleted one
    cannot leave a stale judgement behind. What the test asserts is the **coverage**, never the
    wording.
    """
    table = _audit_table("Criterion 3 audit")
    declared = set(CRITERION_THREE_ROW_RE.findall(table))
    actual = {str(p.relative_to(DIST)) for p in PAGES}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Built pages with no row in the Criterion 3 audit table. Add a row naming what that "
        "page's sentence craft turns on:\n  " + "\n  ".join(missing)
    )
    assert not stale, (
        "Criterion 3 audit rows for pages that no longer exist. Delete them in the same commit as "
        "the route:\n  " + "\n  ".join(stale)
    )
    assert declared == actual


# ---------------------------------------------------------------------------
# 9. Criterion 4, terms are defined
# ---------------------------------------------------------------------------

#: The prose a `<Term>` marker can physically go in. Three classes, not `PROSE_CLASSES`' four, and
#: the missing one is excluded **structurally rather than by a list**: `.figure-caveat` is rendered
#: from `Figure.astro`'s `note?: string` prop (`src/components/Figure.astro:38`), a plain string
#: that cannot carry a component at all. An `aria-label` is an attribute and cannot either, which
#: is why the accessible-name scopes are absent too. So the four terms whose only occurrence on a
#: route is inside a figure note, `offsetting receipts`, `incidence`, `gdp-deflator` and
#: `/households`' `fiscal-year` before #59 marked it elsewhere, need no exemption entry here.
#: They are outside the population because the markup makes them so. Rule 2.
MARKABLE_PROSE_CLASSES = ("prose", "standfirst", "finding")

#: The glossary collection, read as frontmatter. `test_accessibility` already owns the `first_used`
#: half of this parse; the surface-form half lives here because it is Criterion 4's, and both read
#: the same files rather than a second copy of the list.
_TERM_FIELD_RE = re.compile(r'^term:\s*"(.*)"\s*$', re.MULTILINE)
_ABBR_BLOCK_RE = re.compile(r'^abbr:\s*$\n((?:^[ \t]+-[ \t]+".*"\s*$\n)+)', re.MULTILINE)
_ABBR_ITEM_RE = re.compile(r'^[ \t]+-[ \t]+"(.*)"\s*$', re.MULTILINE)

#: A surface form that is written entirely in capitals, and so is an initialism a reader meets as
#: capitals. `CPI-U` and `core PCE` deliberately fail this: `CAPS_RUN` above already finds `CPI`
#: inside `CPI-U` and `PCE` inside `core PCE`, so the shorter form is the one the shout check asks
#: about and a second spelling would be a second entry for one initialism.
_ALL_CAPS_FORM = re.compile(r"[A-Z]{2,}")


def glossary_surface_forms() -> dict[str, list[str]]:
    """Every glossary id mapped to the strings a reader may meet it as: `term`, plus every `abbr`.

    Derived from `src/content/glossary/*.md`, never listed here. `abbr` exists precisely so that
    this function has something to read: `intragovernmental` is how `/government` §2's finding
    writes `Intragovernmental holdings`, and `FY` is how every route writes `Fiscal year`, and a
    checker that only knew the display term would report green on both.
    """
    forms: dict[str, list[str]] = {}
    for path in sorted(GLOSSARY_DIR.glob("*.md")):
        text = path.read_text()
        m = _TERM_FIELD_RE.search(text)
        assert m, f"{path}: no `term` field in the frontmatter"
        block = _ABBR_BLOCK_RE.search(text)
        abbrs = _ABBR_ITEM_RE.findall(block.group(1)) if block else []
        forms[path.stem] = [m.group(1)] + abbrs
    assert forms, f"no glossary terms found under {GLOSSARY_DIR}"
    return forms


def _surface_pattern(form: str) -> re.Pattern[str]:
    """`form` as a word-boundaried, case-insensitive, hyphen-or-space-flexible, plural-tolerant
    pattern.

    Three tolerances, each earning its keep against a live string. Case, because a term opening a
    sentence is capitalised (`Real GDP`) and mid-sentence is not. Hyphen-or-space, because
    `Roll-call vote` is written "roll call" and `chained dollars` could be written "chained-dollars".
    The optional plural, because `Vintage` is written "vintages" and `Fiscal year` "fiscal years".
    The lookarounds are letters only, not `\\b`: `FY` must match inside `FY2025` (a digit follows)
    and must not match inside `FYI`.
    """
    parts = re.split(r"[\s\-]+", form.strip())
    core = r"[\s\-]+".join(re.escape(p) for p in parts)
    return re.compile(r"(?<![A-Za-z])" + core + r"(?:s|es)?(?![A-Za-z])", re.IGNORECASE)


#: `src/data/sections.ts`'s `routeSections` keys, which are the routes a `first_used.route` may
#: name and therefore the routes this criterion has a population on. Derived from the source of
#: truth rather than restated: `/`, `/sources` and `/glossary` carry zero term markers by contract,
#: and they fall out of scope here **because they are not keys of that map**, not because they are
#: named in an exclusion set.
_ROUTE_SECTIONS_KEY_RE = re.compile(r"^  '(/[a-z-]+)':", re.MULTILINE)


def content_routes() -> list[str]:
    src = (ROOT / "src" / "data" / "sections.ts").read_text()
    start = src.find("export const routeSections = {")
    assert start != -1, "src/data/sections.ts no longer declares `export const routeSections`"
    end = src.find("} satisfies", start)
    assert end != -1, "src/data/sections.ts's routeSections no longer ends in `} satisfies`"
    routes = _ROUTE_SECTIONS_KEY_RE.findall(src[start:end])
    assert len(routes) == 3, f"expected three content routes, parsed {routes}"
    return routes


def markable_stream(route: str) -> tuple[str, list[tuple[int, int, str]]]:
    """A route's markable prose as one document-order string, with every `.term` span located.

    Returns `(text, [(start, end, slug)])`. Elements are visited in document order, the parser's
    `iter_descendants` is a pre-order walk, and joined with a newline, so an offset comparison in
    this string is a "which does the reader meet first" comparison. A markable element nested
    inside another is visited once, at the outer element, so a page cannot double-count its own
    prose and shift every offset after it.
    """
    path = DIST / route.lstrip("/") / "index.html"
    parts: list[str] = []
    spans: list[tuple[int, int, str]] = []
    pos = 0
    for n in parse_html(path).iter_descendants():
        if not any(c in MARKABLE_PROSE_CLASSES for c in n.classes()):
            continue
        if any(any(c in MARKABLE_PROSE_CLASSES for c in a.classes()) for a in n.ancestors()):
            continue
        text, offsets = _text_and_term_spans(n)
        wrappers = [d for d in n.iter_descendants() if "term" in d.classes()]
        assert len(wrappers) == len(offsets), f"{path}: .term span count does not match wrappers"
        for (start, end), w in zip(offsets, wrappers):
            spans.append((pos + start, pos + end, w.get("data-term") or ""))
        parts.append(text)
        parts.append("\n")
        pos += len(text) + 1
    assert parts, f"{path} carries no markable prose"
    return "".join(parts), spans


def _first_surface_use(text: str, forms: list[str]) -> tuple[int, str] | None:
    """The earliest offset in `text` at which any of `forms` occurs, and the matched string."""
    best: tuple[int, str] | None = None
    for form in forms:
        m = _surface_pattern(form).search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), m.group(0))
    return best


def test_every_marked_term_sits_at_its_first_use():
    """On each content route, no marked term's surface form appears earlier than its marker.

    This is the assertion `docs/contracts/interfaces/glossary.md` said out loud it did not have:
    "whether a marker sits on the genuinely *first* occurrence is a reading check". Seven live
    violations were measured, three of them standfirsts, two findings, and all seven were fixed.
    **Asserts zero: no baseline and no exemption set**, which is `docs/contracts/prose.md` rule 3's
    fix-all road at that count, the one #52 took at four rather than the one #51 took at 26. A
    baseline here would make the assertion unfalsifiable in the only direction that matters.

    Two fixes are legal, and the failure message says both, because two different defects land
    here. **Move the marker** when the earlier occurrence is the same term. **Reword the earlier
    sentence** when it is not, `/government` §2 said "the intragovernmental piece is real money
    owed to future retirees", where "real" is the everyday adjective and marking it would point the
    reader at the economic term, which is the opposite of defining it.

    **Cannot see which sense of a word is on the page.** `real money` and `real terms` are the same
    four letters to a matcher, and no word list is invented here to guess between them, because a
    proxy for a reading reports green on exactly the sentences it gets wrong. That is why the fix
    menu has two entries rather than one, and why Checklist item 4 in `docs/contracts/prose.md`
    stays NOT EXECUTED.

    **Also cannot see a term a reader meets in a shortened form nobody declared.** The population
    is `term` plus `abbr`; a clipped noun no editor wrote into `abbr` is invisible. That is a
    deliberate trade against a fuzzy matcher, which would flag `gross federal debt` as `gross debt`
    and go quiet the first time someone silenced it.
    """
    forms = glossary_surface_forms()
    offenders = []
    for route in content_routes():
        text, spans = markable_stream(route)
        first_marker: dict[str, int] = {}
        for start, _end, slug in spans:
            first_marker.setdefault(slug, start)
        for slug, marker in sorted(first_marker.items()):
            earlier = _first_surface_use(text, forms[slug])
            if earlier is not None and earlier[0] < marker:
                offenders.append(
                    f"{route}: {slug!r} is marked at offset {marker} but a reader meets "
                    f"{earlier[1]!r} at {earlier[0]}: ...{text[max(0, earlier[0] - 60):earlier[0] + 45]!r}"
                )
    assert not offenders, (
        "A glossary term is marked later than the reader first meets it. docs/contracts/prose.md "
        "Criterion 4: a term is defined the first time a reader meets it, per route, counting "
        "standfirsts and findings. Two fixes are legal and which one applies is a reading — move "
        "the marker onto the earlier occurrence, or, if the earlier occurrence is a different "
        "sense of the same word, reword that sentence so the everyday sense is not the term. Do "
        "not add an exemption: this check has no baseline by design. Occurrences:\n  "
        + "\n  ".join(offenders)
    )


def test_every_content_route_marks_every_glossary_term_it_uses():
    """First use is **per route**, so a term used on three routes is marked on three routes.

    A reader arriving directly at `/households` has not read `/economy`, which is why `first_used`
    is the site-wide first use and not the marking list. The population is `content_routes()`,
    the three keys of `src/data/sections.ts`'s `routeSections`, so `/`, `/sources` and `/glossary`
    are out of scope **structurally**: they are not keys of that map, and `first_used.route`'s
    `z.enum` makes a term claiming one of them a build failure. No exclusion list is written here
    for them.

    The exceptions are not a second list either. They are `UNMARKED_AT_FIRST_USE` in
    `test_accessibility.py`, already `==`-reconciled by
    `test_every_first_used_route_carries_its_term_marker`, imported rather than copied, a copy
    would be the rot that `docs/contracts/prose.md` rule 2 is about. A term is excused on a route
    only when that route is its declared `first_used` route, so an unmarked use on a *different*
    route still fails here.

    **Cannot see** whether the marked occurrence is the right one; that is the test above.
    """
    forms = glossary_surface_forms()
    routes = glossary_terms()
    offenders = []
    for route in content_routes():
        text, spans = markable_stream(route)
        marked = {slug for _s, _e, slug in spans}
        for slug, surface in sorted(forms.items()):
            if slug in marked:
                continue
            if slug in UNMARKED_AT_FIRST_USE and routes[slug] == route:
                continue
            used = _first_surface_use(text, surface)
            if used is not None:
                offenders.append(
                    f"{route}: uses {used[1]!r} at offset {used[0]} and marks no {slug!r}: "
                    f"...{text[max(0, used[0] - 60):used[0] + 45]!r}"
                )
    assert not offenders, (
        "A content route uses a glossary term in markable prose and never marks it. "
        "docs/contracts/prose.md Criterion 4: first use is per route, because a reader arriving "
        "on one route has not read the others. Wrap the first occurrence in `<Term>`, or — if no "
        "marker can go there, as when the occurrence is already the text of an `<a>` — record the "
        "reason in UNMARKED_AT_FIRST_USE in test_accessibility.py and in "
        "docs/contracts/interfaces/glossary.md. Occurrences:\n  " + "\n  ".join(offenders)
    )


def _glossary_initialisms() -> frozenset[str]:
    """Every all-caps surface form in the glossary collection."""
    return frozenset(
        form
        for surface in glossary_surface_forms().values()
        for form in surface
        if _ALL_CAPS_FORM.fullmatch(form)
    )


#: The set `test_no_prose_string_shouts` blesses, assembled rather than listed. `#59` owned this
#: move: the acronym half is now the glossary's, so an initialism that gains an entry stops being
#: hand-named in the same commit, and the test below asserts the two halves never overlap.
REGISTERED_INITIALISMS = _INITIALISMS_WITH_NO_ENTRY | _glossary_initialisms()


def test_registered_initialisms_do_not_duplicate_the_glossary():
    """The hand-named half and the derived half are **disjoint**, and the union is what is used.

    Disjointness is what makes the derivation bite rather than decorate. Without it an
    acronym could gain a glossary entry while its hand-written spelling stayed behind, and the two
    would drift the first time the entry was renamed or deleted, the rot
    `docs/contracts/prose.md` rule 2 exists to prevent, in the one place where a stale entry reads
    as a passing check.

    **Cannot see** whether an acronym *should* have an entry. That is a judgement, and it is
    recorded per route in the Criterion 4 audit table, whose coverage the next test gates.
    """
    derived = _glossary_initialisms()
    overlap = sorted(_INITIALISMS_WITH_NO_ENTRY & derived)
    assert not overlap, (
        "These initialisms are both hand-named in _INITIALISMS_WITH_NO_ENTRY and derived from a "
        "glossary entry's `term`/`abbr`. The glossary is the source of truth for an acronym that "
        "has an entry: delete the hand-named spelling in the same commit as the entry. "
        f"Duplicated: {overlap}"
    )
    assert derived, (
        "no all-caps surface form was derived from src/content/glossary/ — the `abbr` field or "
        "its parse has moved, and REGISTERED_INITIALISMS has silently shrunk to the hand-named "
        "half, which would let a real shout through"
    )
    assert REGISTERED_INITIALISMS == _INITIALISMS_WITH_NO_ENTRY | derived


#: A row of the `### Criterion 4 audit` table: `` | /route | `CBO` | … | ``. The acronym is
#: backticked, which keeps the reason in the third column from ever matching this.
CRITERION_FOUR_ROW_RE = re.compile(r"^\|\s*(/[a-z-]+)\s*\|\s*`([A-Z]{2,})`\s*\|", re.MULTILINE)


def test_the_criterion_four_audit_covers_every_prose_acronym():
    """The audit table's `(route, acronym)` row set **equals** what `dist/` carries.

    Equality, in the idiom of the Criterion 1, 2 and 3 audits. An acronym in prose is either
    expanded for the reader, which since #59 means a glossary entry and a marker, or it is
    deliberately left as it stands, and which of the two it is cannot be derived from anything:
    `CARES` is a statute's published short name and expanding it would be editing quoted material,
    while `CBO` is a term. So the judgement is written down per route, and this test only asserts
    that every acronym has one and that no judgement outlives its acronym.

    **Cannot see** whether a row's reason is *true*. A reviewer writes it; the acronym-judgement
    Checklist item in `docs/contracts/prose.md` is where reading them is recorded as NOT EXECUTED.
    """
    table = _audit_table("Criterion 4 audit")
    declared = set(CRITERION_FOUR_ROW_RE.findall(table))
    actual: set[tuple[str, str]] = set()
    for route in content_routes():
        text, _spans = markable_stream(route)
        actual |= {(route, m.group(0)) for m in CAPS_RUN.finditer(text)}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Acronyms in markable prose with no row in the Criterion 4 audit table. Add a row saying "
        "whether the reader needs it expanded, and why:\n  "
        + "\n  ".join(f"{r} {a}" for r, a in missing)
    )
    assert not stale, (
        "Criterion 4 audit rows for acronyms no route's prose carries any more. Delete them in "
        "the same commit as the prose:\n  " + "\n  ".join(f"{r} {a}" for r, a in stale)
    )
    assert declared == actual


# ---------------------------------------------------------------------------
# 10. Criterion 5, prose that lets the reader check
# ---------------------------------------------------------------------------

#: Scale factors tried when matching a registry `quoted` value against the served prose.
#:
#: The registry stores most money figures in trillions, `0.232` is written "$232 billion" and
#: `1.203` is written "$1.20 trillion", and stores percentages as their own unit. Rather than
#: keep a hand-written map of "this entry is in trillions, that one in percent", which is exactly
#: the rotting list method rule 2 forbids, the match is arithmetic: try the value at each of these
#: scales, formatted at 0 to 3 decimal places, with and without thousands separators. Tolerant by
#: construction, and tolerant in the safe direction, this check exists to catch a figure that has
#: vanished from the prose entirely, not to police how it is rounded.
_REGISTRY_SCALES = (1, 100, 0.01, 1000, 0.001)


def _renderings(quoted: float) -> set[str]:
    """Every decimal string a registry value could plausibly have been written as in prose.

    The sign is dropped: `n_de` is stored as `-1.78` and the prose says "$1.78 trillion short".
    A deficit's sign is a convention of the generated file, not of the sentence.
    """
    magnitude = abs(float(quoted))
    out: set[str] = set()
    for scale in _REGISTRY_SCALES:
        scaled = magnitude * scale
        for places in range(4):
            grouped = f"{scaled:,.{places}f}"
            out.add(grouped)
            out.add(grouped.replace(",", ""))
    return out


def _appears_in(quoted: float, blob: str) -> bool:
    """Does any rendering of `quoted` appear in `blob` as a number in its own right?

    Anchored on both sides against digits, `.` and `,` so that `39` does not match inside `139`,
    `390`, `39.5` or `1,392`. Without the anchors a two-digit registry value would match almost
    any page and the check would report green on a figure nobody can read.
    """
    return any(
        re.search(rf"(?<![\d.,]){re.escape(form)}(?![\d.,]?\d)", blob)
        for form in sorted(_renderings(quoted))
    )


def registered_prose_figures() -> list[tuple[str, str, float]]:
    """The registry, as `(section key, text, quoted)`, read through the pipeline's own loader.

    `lib.curated._load` is the same door `pipeline/lib/report.py:99` opens to build the drift
    report. Reading it through a second YAML parser here would be a second extractor, which is
    what method rule 1 exists to prevent: the population this test asserts against must be the
    population the drift report reconciles, or the two can disagree without either noticing.
    """
    from lib import curated  # the pipeline's loader, not a second parser

    return [
        (str(f.get("section", "")), str(f.get("text", "")), float(f["quoted"]))
        for f in curated._load("prose_figures")["figures"]
        if "quoted" in f
    ]


def test_every_registered_prose_figure_still_appears_in_the_prose():
    """Every `quoted` value in `pipeline/curated/prose_figures.yaml` is still in the served prose.

    This is Criterion 5's mechanical floor, and it closes the one silent failure mode a Criterion 5
    pass is most likely to open. The registry is how "a reader can check" stays true over time: 118
    figures quoted in prose, each mapped to the generated field it came from, recomputed on every
    run and reported as an editorial event when they drift. Nothing checked that the *prose* still
    carried them. Reword around a figure carelessly and the figure leaves the page, after which the
    drift report goes on reconciling a number no reader ever meets, green, forever, on a check
    that is no longer looking at anything.

    **Measured at 118 of 118 present, 0 missing, so it asserts zero with no baseline**, method
    rule 3's fix-all road at a count of zero. A baseline here would make the assertion
    unfalsifiable in the only direction that matters.

    *Cannot see:* **which section** carries the figure. The registry's `section:` key is the
    retired `sections.md` deck's numbering (Ruling 3), and its bare-numeric keys `3`, `4` and `10`
    do not all resolve to Government sections, so no route-scoped assertion is available without
    first re-keying the registry, which is a pipeline change. And it cannot see whether the
    sentence *around* the figure supports what it claims, which is Checklist item 5. A number
    present in a sentence that misdescribes it passes here and fails Criterion 5 on any reading.
    """
    strings = [" ".join(text.split()) for _page, _scope, text in prose_strings()]
    blob = " ".join(strings)

    # The matcher's own falsifiability, asserted before it is trusted. A tolerance wide enough to
    # find every registered figure is also wide enough to find figures that are not there, and the
    # difference between the two is the whole value of this test. If a later edit loosens the
    # scaling or drops the anchors to make a real failure go away, these two fail first and say so.
    assert not _appears_in(8_675_309, blob), (
        "The registry matcher found a value that is nowhere in the prose. Its tolerance has been "
        "widened past the point of meaning: a check that matches anything reports green on a "
        "figure that has left the page, which is the failure this test exists to catch."
    )
    assert not _appears_in(139, "the ratio is 39% of the deficits run in them"), (
        "The registry matcher is no longer anchored: 139 matched inside '39%'. Restore the digit "
        "lookarounds in `_appears_in`, or every two- and three-digit registry entry passes on any "
        "page carrying a longer number that happens to contain it."
    )

    missing = [
        f"§{section} {text!r} (quoted {quoted})"
        for section, text, quoted in registered_prose_figures()
        if not _appears_in(quoted, blob)
    ]
    assert not missing, (
        "A figure registered in pipeline/curated/prose_figures.yaml no longer appears in the built "
        "prose. docs/contracts/prose.md Criterion 5 and 'Drift and quoted material': the registry "
        "is what keeps a quoted number reconcilable against the data it came from, and a figure "
        "reworded out of the prose leaves the drift report reconciling a number no reader meets. "
        "Put the figure back, or retire its registry entry in the same commit. Do not add an "
        "exemption: this check has no baseline by design. Figures:\n  " + "\n  ".join(missing)
    )


#: A row of the `### Criterion 5 audit` table. Same shape as `AUDIT_ROW_RE`, which it reuses:
#: `| /route | section-id | … |`.
def test_the_criterion_five_audit_covers_every_section():
    """The Criterion 5 audit table's row set **equals** the section set built from `dist/`.

    Method rule 5, in the idiom `test_the_criterion_one_audit_covers_every_section` established.
    Equality, not containment: containment would let a new section ship without declaring what a
    reader can check its prose against and what in it is the site's own reading, and would let a
    deleted section leave a stale judgement behind.

    What is asserted is **coverage**. The three judgement columns are a reviewer's reading and are
    exactly the part no machine can check, which is the point of recording them here, where they
    can be re-read, rather than in a PR body, which nothing can re-read and nothing can fail on.

    *Cannot see:* whether a row is **right**. A section can declare "none" in the interpretation
    column while its prose quietly draws a cause, and this test passes. That reading is Checklist
    item 5; the figure notes are Checklist item 7.
    """
    table = _audit_table("Criterion 5 audit")
    declared = {(route, sid) for route, sid in AUDIT_ROW_RE.findall(table)}
    actual = {(_route_of(page), sid) for page, sid, _, _ in sections()}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Sections on the built site with no row in the Criterion 5 audit table. Add a row naming "
        "what a reader checks the section's prose against, and what in it is the site's own "
        "reading:\n  " + "\n  ".join(f"{r}#{s}" for r, s in missing)
    )
    assert not stale, (
        "Criterion 5 audit rows for sections that no longer exist. Delete them in the same commit "
        "as the section:\n  " + "\n  ".join(f"{r}#{s}" for r, s in stale)
    )
    assert declared == actual


# ---------------------------------------------------------------------------
# 11. Criterion 6, sections and routes hand off
# ---------------------------------------------------------------------------

#: `Term.astro`'s wrapper. Both anchors it renders, `a.term-trigger` and `a.term-more`, are
#: glossary markers, not cross-references: they point every reader of a marked word at the same
#: entry, and counting them would make every section look as though it hands off. The exclusion is
#: **structural**, taken from the markup the component emits, not from a list of hrefs to ignore;
#: it is the same reasoning `EXCLUDED_DESCENDANT_CLASS` uses to keep `.term-pop` out of prose text.
GLOSSARY_MARKER_CLASS = "term"

#: The three reference destinations. A link to one of them is the apparatus, not the argument:
#: Check B2 requires the site's last paragraph to point at something a reader can keep reading,
#: over and above the Sources line it already carried.
APPARATUS_ROUTES = frozenset({"/sources", "/glossary", "/contents"})

#: A bundled asset URL. Astro writes these from `base` itself, so they carry the served prefix and
#: no page author can get one wrong, which is what makes them the right place to read the base
#: from. Hard-coding `/income-tax/` here would make this suite fail the day the site moved, and
#: reading `astro.config.mjs` would assert the source against itself rather than against the bytes.
ASSET_URL_RE = re.compile(r'(?:href|src)="(/[^"]*_astro/[^"]*)"')


def base_prefix() -> str:
    """The served base path, with no trailing slash. `''` if the site is served from the root."""
    prefixes = {url[: url.index("_astro/")].rstrip("/") for p in PAGES for url in ASSET_URL_RE.findall(p.read_text())}
    assert len(prefixes) == 1, (
        "The built pages disagree about the base path their bundled assets are served from: "
        f"{sorted(prefixes)}. One `astro.config.mjs` `base` produces one prefix."
    )
    return prefixes.pop()


def _route_of_path(path: Path) -> str:
    rel = path.relative_to(DIST).as_posix()
    return "/" + rel[: -len("index.html")].rstrip("/")


def built_routes() -> dict[str, Path]:
    """Every route a reader can actually reach, as `route -> built page`.

    Derived from `dist/` rather than from `siteRoutes` in `src/data/sections.ts`, and the two are
    the same set by construction: Astro builds one page per route file. `dist/` is the stronger
    subject of the two, because a `siteRoutes` entry with no built page is itself a 404 and would
    satisfy a check that read the array.
    """
    return {_route_of_path(p): p for p in PAGES}


def _ids_of(path: Path) -> set[str]:
    return {n.get("id") for n in parse_html(path).iter_descendants() if n.get("id")}


def internal_hrefs_under(node: Node) -> list[str]:
    """Every `/`- or `#`-rooted href inside `node`, minus the glossary markers."""
    out: list[str] = []
    for a in node.iter_descendants():
        if a.tag != "a":
            continue
        href = a.get("href") or ""
        if not href.startswith(("/", "#")):
            continue
        if any(GLOSSARY_MARKER_CLASS in x.classes() for x in a.ancestors()):
            continue
        out.append(href)
    return out


def in_prose_hrefs(path: Path) -> list[str]:
    """A built page's internal cross-references: the hrefs inside its prose elements.

    Prose-scoping is what makes every check under this banner non-trivial. The rail and the
    narrow-viewport navbar link every route from every page, and a figure's source line links its
    publisher; none of those carries a `PROSE_CLASSES` class, so scoping to prose excludes the
    whole of the site's furniture, and every `https://` source link with it, without naming one of
    them in an exclusion list.
    """
    root = parse_html(path)
    out: list[str] = []
    for n in root.iter_descendants():
        if any(c in n.classes() for c in PROSE_CLASSES):
            out.extend(internal_hrefs_under(n))
    return out


def _split(href: str, base: str) -> tuple[str, str]:
    """A based href as `(route, fragment)`. `('/government', 'net-interest')`."""
    rest = href[len(base):]
    route, _, fragment = rest.partition("#")
    return (route.rstrip("/") or "/"), fragment


def test_every_in_prose_cross_reference_resolves_and_is_base_aware():
    """Every in-prose internal link lands somewhere that exists, under the served base path.

    Two failures in one test because they are the same sentence read twice: a link a reader
    follows either arrives or does not. A bare `#anchor` must be an `id` on the page it sits on. A
    rooted href must begin with the base, this is the check that would have caught #70, where
    three cross-route links were written without it, worked in `astro dev` and 404ed in production
   , and its route must be a route `dist/` actually built, and its fragment, if it has one, must
    be an `id` on that built page.

    **Measured at the count this issue opened on: 12 in-prose cross-references, 12 resolving, 0
    not base-aware.** Asserted as zero with **no baseline**, which is method rule 3's fix-all road
    at a count of zero, the road #52 and #60 took. The point of a check that already passes is
    that #61 adds six more cross-references to the twelve it measured, taking the page-wide total
    to eighteen: without it the next
    hand-written link reintroduces #70 silently.

    *Cannot see:* whether the target section **delivers what the sentence promised**. A link to
    `#structural-gap` from a sentence claiming section 5 explains why the gap opened resolves
    perfectly and is still wrong. That reading is Checklist item 14. It also cannot see a
    hand-off written with no link in it at all, which is the other half of Checklist item 14.
    """
    base = base_prefix()
    routes = built_routes()
    ids = {route: _ids_of(path) for route, path in routes.items()}
    unbased: list[str] = []
    broken: list[str] = []
    for route, path in sorted(routes.items()):
        for href in in_prose_hrefs(path):
            if href.startswith("#"):
                if href[1:] not in ids[route]:
                    broken.append(f"{route}: {href} is not an id on this page")
                continue
            if base and not href.startswith(base + "/"):
                unbased.append(f"{route}: {href}")
                continue
            target, fragment = _split(href, base)
            if target not in routes:
                broken.append(f"{route}: {href} names {target}, which dist/ did not build")
                continue
            if fragment and fragment not in ids[target]:
                broken.append(f"{route}: {href} names #{fragment}, which is not an id on {target}")
    assert not unbased, (
        "In-prose internal links that skip the base path. They work in `astro dev` and 404 in "
        f"production, which is how #70 shipped. Build every internal href through `join()` in "
        "src/data/sections.ts:\n  " + "\n  ".join(unbased)
    )
    assert not broken, (
        "In-prose cross-references that do not resolve. docs/contracts/prose.md Criterion 6: a "
        "hand-off that points nowhere is worse than no hand-off. Fix the href or the anchor in "
        "the same commit:\n  " + "\n  ".join(broken)
    )


def test_every_joint_of_the_route_ladder_is_written():
    """Each content route carries an in-prose link to the one after it.

    The ladder is derived, in order, from `routeSections`' keys through `content_routes()`, the
    same array the rail renders and `/contents` enumerates, so a fourth route inserted between
    two of these is checked on both of its new joints without this test being edited.

    **Prose-scoping is the whole check.** The rail and the navbar link `/government` from every
    page on the site, so `grep -c government dist/households/index.html` was already non-zero on
    the day this issue opened, while `/households` carried **zero** links to `/government` in any
    sentence a reader reads. **Measured: 1 of 2 joints written.** Asserted as zero violations with
    no baseline, once the second joint was written.

    *Cannot see:* whether the sentence carrying the link is a hand-off or a footnote. A rail-style
    "see also" list at the bottom of a route would satisfy this and hand nobody on. Checklist
    item 14.
    """
    base = base_prefix()
    routes = built_routes()
    ladder = content_routes()
    missing: list[str] = []
    for earlier, later in zip(ladder, ladder[1:]):
        page = routes[earlier]
        targets = {_split(h, base)[0] for h in in_prose_hrefs(page) if not h.startswith("#")}
        if later not in targets:
            missing.append(f"{earlier} names no destination on {later}")
    assert not missing, (
        "A joint of the route ladder is unwritten. docs/contracts/prose.md Criterion 6: the "
        "routes claim a sequence in their `Route N of 3` kickers, so each must hand the reader to "
        "the next in its own prose, not only through the rail:\n  " + "\n  ".join(missing)
    )


def test_the_last_routes_ending_points_back_into_the_argument():
    """The site's final paragraph links something other than the reference pages.

    The terminal route is the last of the ladder `content_routes()` derives, its terminal section
    is the last `<section id>` on that built page, and its closing prose is the last `.prose`
    inside it. That paragraph is the last thing a reader who has read the site in order meets.
    **Measured on the day this issue opened: its only href was `/sources`**, the apparatus, not
    the argument, so the site ended by pointing out of itself. Asserted as zero with no
    baseline.

    `/sources`, `/glossary` and `/contents` are excluded as destinations by name here, and that is
    the one place under this banner where a name appears rather than a structure. It is a
    three-entry list of the routes that carry no argument, it is stated in `APPARATUS_ROUTES`
    beside the reason, and it is checked against `built_routes()` below, so a reference page
    renamed out of `dist/` fails here instead of quietly widening what counts.

    *Cannot see:* whether the sentence is worth reading, or whether an ending that links three
    things is better than one that links one. Checklist item 14.
    """
    routes = built_routes()
    assert APPARATUS_ROUTES <= set(routes), (
        f"APPARATUS_ROUTES names {sorted(APPARATUS_ROUTES - set(routes))}, which dist/ did not "
        "build. A reference page was renamed; rename it here in the same commit, or this test "
        "silently starts accepting a link to it as a hand-off."
    )
    terminal = content_routes()[-1]
    page = terminal.lstrip("/") + "/index.html"
    on_page = [(sid, node) for p, sid, _, node in sections() if p == page]
    assert on_page, f"{page} carries no <section id>, so it has no terminal section to check."
    section_id, node = on_page[-1]
    proses = [d for d in node.iter_descendants() if "prose" in d.classes()]
    assert proses, (
        f"{terminal}#{section_id} is the terminal section of the terminal route and ends with no "
        "`.prose`. That is a Criterion 1 failure as well; see "
        "`test_every_section_with_a_figure_answers_after_it`."
    )
    base = base_prefix()
    destinations: list[str] = []
    for href in internal_hrefs_under(proses[-1]):
        if href.startswith("#"):
            destinations.append(href)
            continue
        route, _ = _split(href, base)
        if route not in APPARATUS_ROUTES:
            destinations.append(href)
    assert destinations, (
        f"{terminal}#{section_id}'s closing prose is the last paragraph on the site and links "
        "only the reference pages. docs/contracts/prose.md Criterion 6: the terminal section of "
        "the terminal route points back into the argument, over and above its Sources line."
    )


def test_the_criterion_six_audit_covers_every_section():
    """The Criterion 6 audit table's row set **equals** the section set built from `dist/`.

    Method rule 5, in the idiom `test_the_criterion_one_audit_covers_every_section` established.
    Equality, not containment: containment would let a new section ship without declaring where it
    hands the reader next, and would let a deleted section leave a stale judgement behind.

    What is asserted is **coverage**, never the wording. "Ends here, and correctly" is a legal
    answer in column 3 and is the answer for a good many of the thirty-one, a construction
    caveat bounding the chart above closes its section, and manufacturing a link out of it is the
    failure the refused link quota would have produced. The refusal and its numbers are recorded
    in Criterion 6 in the contract.

    *Cannot see:* whether a row is **true**. A section can claim in column 3 that it hands off to
    the next while its closing sentence names nothing. Checklist item 14.
    """
    table = _audit_table("Criterion 6 audit")
    declared = {(route, sid) for route, sid in AUDIT_ROW_RE.findall(table)}
    actual = {(_route_of(page), sid) for page, sid, _, _ in sections()}
    missing = sorted(actual - declared)
    stale = sorted(declared - actual)
    assert not missing, (
        "Sections on the built site with no row in the Criterion 6 audit table. Add a row saying "
        "where the section hands the reader next, or why it ends here:\n  "
        + "\n  ".join(f"{r}#{s}" for r, s in missing)
    )
    assert not stale, (
        "Criterion 6 audit rows for sections that no longer exist. Delete them in the same commit "
        "as the section:\n  " + "\n  ".join(f"{r}#{s}" for r, s in stale)
    )
    assert declared == actual
