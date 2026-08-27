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
    #     37 rendered occurrences, across five built pages. Zeroing this block is #58's own
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

CRITERION_RE = re.compile(r"^### Criterion (\d+)\b", re.MULTILINE)


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
