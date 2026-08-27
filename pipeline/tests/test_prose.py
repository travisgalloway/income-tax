"""The mechanical half of the prose contract. Issue #51.

`docs/contracts/prose.md` has three parts: conventions, a rubric, and a checklist of what only a
human reader can judge. This file enforces the part that is mechanically checkable — punctuation and
emphasis — and nothing else. The rest of the contract says plainly that it is human-judged, and this
suite does not pretend otherwise.

**It reads `dist/`, not `src/`.** That is the whole design. A grep over the page sources counts
`---` frontmatter comments and developer-facing `throw` strings as prose (all three ` -- ` in
`src/pages/contents.astro`, all five in `src/pages/glossary.astro`, most of the island hits), none
of which a reader ever meets — and it misses the strings the islands assemble at runtime, which a
reader does meet. `src/components/islands/StatutoryVsEffective.tsx:97` is the proof in both
directions: it renders ` -- ` **into a chart `aria-label`**, so it is a punctuation violation inside
an accessible name, invisible to a source scan and bound by `docs/contracts/accessibility.md` as
well as by this one.

**It is an allow-list, never a deny-list.** A prose string is the text of an element carrying one of
four named classes, or one of three named kinds of accessible name. Nothing else is visited — not
`<span class="unit">—</span>`, which means "this column has no unit" and would otherwise trip every
table; not the `Source.` span at `src/components/Figure.astro:61`, which renders `fig.sourceLine`
verbatim and is quoted material no prose rule may edit. Neither needs an exemption, because neither
is ever in scope. A deny-list would have needed both, and a class added to `Figure.astro` to express
the second.

**The baselines are exact and they are asserted with `==`.** Today's violations are enumerated in
`KNOWN_DASH_DEBT` and `KNOWN_SHOUT_DEBT`, each mapped to the issue that owns its removal. `==` and
not `<=` is the load-bearing choice: `<=` would let a check pass because it is not looking, and it
would let a fix leave a stale exemption behind forever. With `==`, adding a violation fails on the
new fingerprint and *fixing* one fails on the missing entry, so the baseline can only shrink
deliberately, in the same commit as the fix. #58 has taken its own share of both to zero; what is
left is #102's four island-generated accessible names and #103's five curated-data shouts, the two
surfaces no prose edit to a page source can reach.

Standard library only, and the HTML tree comes from `test_accessibility`'s parser rather than a
third copy of one — the idiom `pipeline/tests/test_contents_index.py` established.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from test_accessibility import (  # noqa: F401  (Node/nodes_of re-exported for symmetry)
    Node,
    finding_shape_problems,
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
#: `src/content/glossary/`, not this page's prose — a different editing surface with a different
#: owner (#59). Descending into it would put a glossary sentence into a page's fingerprint and hand
#: #58 a fix it does not own.
EXCLUDED_DESCENDANT_CLASS = "term-pop"

#: Elements whose text is markup-free apparatus rather than prose.
SKIP_TAGS = {"script", "style"}

#: An all-caps run of two or more letters, as a whole word. The lookarounds matter: they keep
#: `USASpending` and `HSall_members.csv` out — a CamelCase word is not a shout — while keeping
#: `GDP.`, `GDP's` and `PL 115-97` in.
CAPS_RUN = re.compile(r"(?<![A-Za-z])[A-Z]{2,}(?![A-Za-z])")

#: Runs of digits, with their separators, collapse to `#` in a fingerprint.
DIGIT_RUN = re.compile(r"\d[\d.,]*")

#: The banned constructions. ` -- ` is not an em dash and is not a substitute for one: it renders as
#: two literal hyphens. Ruling 1 retires it outright rather than blessing it as an ASCII stand-in.
BANNED_DASHES = ("—", " -- ")

#: Acronyms and initialisms this site is entitled to write in capitals. An explicit named set, in
#: the idiom of `test_accessibility.py`'s `FIGURES_WITHOUT_A_CHART` — it cannot be derived from
#: `src/content/glossary/`, whose 23 entries are all words and none an acronym. If #59 adds acronym
#: entries, deriving this from the glossary is #59's move to make.
REGISTERED_INITIALISMS = frozenset(
    {
        # Statistical agencies, series and publishers
        "CBO", "CPI", "FRED", "GDP", "IRS", "OECD", "PCE", "AGI", "FY",
        # Places
        "DC", "UK", "US",
        # Laws, by their published short names
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
    per-datum readout — `BudgetChart.tsx`'s 31 per-fiscal-year labels are these — assembled at
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
    #     the remaining 23 (24 em dashes and 6 ` -- ` across five built pages) by applying Ruling
    #     1's replacement table. Nothing was exempted and no assertion was weakened: the block was
    #     deleted entry by entry, in the same commits as the edits, which is the only way the `==`
    #     below lets a baseline shrink.
    # --- #102, island-generated accessible names. Two `.tsx` templates, outside #58's remit
    #     because #58 edits `src/pages/**` prose only.
    #     `src/components/islands/BudgetChart.tsx:84` — 31 per-fiscal-year `aria-label`s on the
    #     budget bars, collapsing to the three shapes its number formatter produces:
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#B, discretionary $#B, net inter': "#102",
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#T, discretionary $#B, net inter': "#102",
    'government/index.html|aria-label:rect|FY# Outlays $#T (mandatory $#T, discretionary $#T, net inter': "#102",
    #     `src/components/islands/StatutoryVsEffective.tsx:97` — ` -- ` twice inside a chart's
    #     accessible name, which `docs/contracts/accessibility.md` also governs:
    'households/index.html|aria-label:svg|The top statutory income tax rate ran from #% in # to #% in ': "#102",
}

#: #58 held the three shouts in the page sources and discharged all three. #103 owns the
#: curated-data shouts: they reach the page through generated JSON, so retiring them means
#: regenerating data and re-running validation, which is a pipeline change and not a prose edit.
KNOWN_SHOUT_DEBT: dict[str, str] = {
    # --- #58's block is gone. The three shouts Ruling 2 assigned to it — "the bracket COUNT",
    #     "Surtaxes ARE folded" and the figure note's "it INCLUDES PAYROLL TAX" — took a
    #     `<strong>` on the load-bearing noun phrase and two recasts. The note took a recast
    #     because a `note=` prop is a plain attribute rendered as text and cannot carry markup.
    # --- #103, curated pipeline data. `src/data/party_splits.json:22`'s "AT LEAST ONE" and
    #     `pipeline/curated/laws.yaml:287`'s "VOICE VOTE" reach the page through generated JSON,
    #     so retiring them means regenerating data and re-running validation — a pipeline change,
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

#: A rubric heading is `### Criterion N — <name>`, and the em dash is part of the match. Without it
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
# 6. Criterion 1 — the question comes first
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
#: inside another on the four report pages — every one is a direct child of `<main>`. If that ever
#: changes, this silently mis-splits, which is why `sections()` asserts the id set it finds against
#: the parsed tree rather than trusting the regex alone.
#: The opening tag's attributes are captured as a blob rather than anchoring `id` in place, because
#: `id` is not guaranteed to be the first attribute — `<section class="…" id="…">` is valid markup
#: today even though no current page writes it that way.
SECTION_RE = re.compile(r'<section\b([^>]*)>(.*?)</section>', re.DOTALL)

#: `id="..."` pulled out of a `<section>` opening tag's attribute blob, wherever it falls.
SECTION_ID_RE = re.compile(r'\bid="([^"]*)"')


def sections() -> list[tuple[str, str, str, Node]]:
    """Every report section, as `(page, section_id, body_html, node)`.

    Two views of the same section on purpose. The raw `body_html` answers the positional questions
    — does a standfirst appear *before* the first `<figure`, does a `.prose` appear *after* the
    last `</figure>` — which a tree walk answers only by re-deriving document order. The parsed
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

    Scope is structural. A section with no `<figure>` is not exempted, it is simply not asked —
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
    — an axis, a panel, a scale. It cannot catch a heading that names the *variables*: "Prices and
    rates" and "Labor and capital" are headings that tell the reader what was plotted rather than
    what was found, and both pass this test on every word list anyone would write. That failure
    mode is human-judged, it is Checklist item 8 in docs/contracts/prose.md, and no word list is
    added here to fake it.
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

    The boundary is the load-bearing part. While `### Criterion 1 audit` was the only audit table
    in the contract, slicing to the next `"\\n## "` was equivalent to slicing to the next heading.
    With `### Criterion 2 audit` sitting beside it, that slice swallows both tables and each
    coverage test below then measures the *union* of the two row sets against its own subject.
    Today that union happens to equal the section set, so the mis-parse would pass rather than
    fail, which is the worse of the two outcomes. Ending at the next heading of any level --
    `\\n# ` through `\\n###### `, whichever comes first -- keeps each table to itself even if the
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
# 7. Criterion 2 — the standfirst sets up, the finding claims
# ---------------------------------------------------------------------------

#: A four-digit calendar year. The one number a standfirst and its finding may both name: the
#: standfirst's job is to say over what window the chart runs, and the finding's is to locate its
#: claim in time, so both name the same years by construction. This is a regex class and not a list
#: of instances, so there is nothing here to maintain and nothing to rot.
YEAR = re.compile(r"^(?:19|20)\d{2}$")

#: The cap on a finding, in characters, whitespace collapsed. `docs/contracts/prose.md` left the
#: number open and #53 fixes it here. The longest finding that survives #53 is 193 characters, so
#: the cap carries 27 characters of headroom — the property `PREEMPTION_CEILING`'s comment above
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
    load-bearing half is that a section's finding, its `<Figure ariaLabel>` and its row in the
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
# 8. Criterion 3 — sentence length and word spacing
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
#: a capital, digit or `$` opening the next sentence. Deliberately conservative — an **over**-split
#: hides a violation by halving a long sentence, while an under-split merely shows a human a longer
#: string than there really is, so the safe direction is to split less.
#:
#: `(?<!\b[A-Z]\.)` exists for exactly one live string: `government#passed-signed` writes "G.W.
#: Bush", which a naive `(?<=[.!?])\s+(?=[A-Z])` cuts in half. It is a lookbehind on a *single*
#: capital at a word boundary, so `GDP.` is unaffected: there is no word boundary before the `P`.
#:
#: The closing quote/bracket is matched via a second, fixed-width lookbehind branch rather than
#: consumed as an ordinary (optional) character — Python's `re` forbids variable-width lookbehind,
#: so the two cases (bare terminal punctuation, and terminal punctuation plus a closer) are spelled
#: out separately. Consuming the closer outright would drop it from the split delimiter and, with
#: it, from the returned sentence string — `sentences()` callers, including this file's offender
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
    the judgement. No clause-counter and no proxy word list is added here to fake it — a word list
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
    asked, and punctuation that legitimately abuts a term — an opening bracket or quote — is
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
