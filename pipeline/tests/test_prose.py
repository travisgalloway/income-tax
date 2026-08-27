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
deliberately, in the same commit as the fix. Reaching zero is #58's definition of done, plus #102
and #103 for the two surfaces no prose edit can reach.

Standard library only, and the HTML tree comes from `test_accessibility`'s parser rather than a
third copy of one — the idiom `pipeline/tests/test_contents_index.py` established.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from test_accessibility import Node, nodes_of, parse_html  # noqa: F401  (Node/nodes_of re-exported for symmetry)

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

#: #58 owns every prose-class entry: it is the sentence-craft issue, and it edits `src/pages/**`.
#: #102 owns the two `aria-label` entries, which are island `.tsx` templates outside #58's remit.
KNOWN_DASH_DEBT: dict[str, str] = {
    # --- #58, sentence craft: the em dash and ` -- ` in the page sources. 26 fingerprints over
    #     33 rendered occurrences, across five built pages. Zeroing this block is #58's own
    #     definition of done, and it is machine-checkable.
    'contents/index.html|standfirst|The whole of the site on one page: # sections across # desti': "#58",
    'economy/index.html|prose|National aggregates say nothing about distribution. Every se': "#58",
    'government/index.html|figure-caveat|Note. Give is gross IRS collections by filer address; get is': "#58",
    'government/index.html|prose|Give (IRS), get (USASpending) and this state tax mix (Census': "#58",
    'government/index.html|prose|In real terms mandatory spending— net of offsetting receipts': "#58",
    'government/index.html|prose|Midpoint: zero net balance, equivalently $# received per $# ': "#58",
    'government/index.html|prose|Where the money is counted is not where it lands. The two si': "#58",
    'government/index.html|standfirst|Every state pays federal tax and every state receives federa': "#58",
    "households/index.html|figure-caveat|Note. CBO's average federal tax rate includes payroll tax, c": "#58",
    'households/index.html|figure-caveat|Note. Constant # dollars. The budget series elsewhere on thi': "#58",
    'households/index.html|figure-caveat|Note. The Gini is for families, not households; household se': "#58",
    'households/index.html|figure-caveat|Note. This chart counts the federal individual income tax on': "#58",
    'households/index.html|figure-caveat|Note. This figure is on fiscal years, while sections # throu': "#58",
    'households/index.html|figure-caveat|Note. Twelve years show a published top rate that differs fr': "#58",
    'households/index.html|finding|The # top bracket started at $# about $# million in # dollar': "#58",
    'households/index.html|finding|The top statutory rate fell from #% in # to #% in # Over the': "#58",
    'households/index.html|prose|# Distributional data is by tax unit, not by person or by ho': "#58",
    'households/index.html|prose|The series begins in # because that is where the Census/FRED': "#58",
    'households/index.html|prose|Two things move independently here. The bracket COUNT is a p': "#58",
    'households/index.html|standfirst|Nobody pays the top rate on their whole income. The top brac': "#58",
    'households/index.html|standfirst|Real median household income rose #% in three decades, but t': "#58",
    'index.html|prose|Each section opens the same way: a section number, a heading': "#58",
    'index.html|prose|Its through-line is that the popular story — that one party ': "#58",
    'index.html|prose|The debt, who holds it, the whole budget behind it, and the ': "#58",
    'index.html|prose|The three routes are meant to be read in order — the economy': "#58",
    'index.html|prose|Where a series can honestly be shown in more than one unit, ': "#58",
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

#: #58 owns the three shouts in the page sources. #103 owns the curated-data shouts: they reach the
#: page through generated JSON, so retiring them means regenerating data and re-running validation,
#: which is a pipeline change and not a prose edit.
KNOWN_SHOUT_DEBT: dict[str, str] = {
    # --- #58, the three shouts in the page sources: `src/pages/households/index.astro:121`
    #     ("bracket COUNT"), `:133` ("Surtaxes ARE folded") and `:159`, the figure note
    #     ("it INCLUDES PAYROLL TAX"), which Ruling 2 rules in explicitly.
    'households/index.html|prose:ARE|Ordinary income only: capital gains have been taxed at separ': "#58",
    'households/index.html|prose:COUNT|Two things move independently here. The bracket COUNT is a p': "#58",
    "households/index.html|figure-caveat:INCLUDES|Note. CBO's average federal tax rate includes payroll tax, c": "#58",
    "households/index.html|figure-caveat:PAYROLL|Note. CBO's average federal tax rate includes payroll tax, c": "#58",
    "households/index.html|figure-caveat:TAX|Note. CBO's average federal tax rate includes payroll tax, c": "#58",
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
def test_the_dash_baseline_is_declining(name):
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
#: finding. Deliberately loose: the highest passing section today is `economy#growth-shadow` at
#: 0.429, so the margin is one section wide. A threshold with no headroom is a threshold that fires
#: on every honest edit and gets raised until it means nothing.
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


def test_the_criterion_one_audit_covers_every_section():
    """The audit table's row set **equals** the section set built from `dist/`.

    Equality, not containment, in the idiom of the two `==`-asserted baselines above. Containment
    would let a new section ship without declaring the question it answers, and would let a deleted
    section leave a stale row asserting a judgement about a page nobody can read any more. What the
    test asserts is the table's *coverage*; the wording of each question is a reviewer's paraphrase
    and is exactly the part no machine can check.
    """
    text = PROSE_DOC.read_text()
    start = text.find("### Criterion 1 audit")
    assert start != -1, (
        "docs/contracts/prose.md has no `### Criterion 1 audit` section. The per-section judgement "
        "lives in the contract, where it can be re-read, not in a PR body, where it cannot."
    )
    end = text.find("\n## ", start)
    table = text[start : end if end != -1 else len(text)]
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
