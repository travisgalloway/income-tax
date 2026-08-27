"""Static accessibility conformance suite. Issue #15.

Walks every built page under `dist/**/index.html` and every island component
under `src/components/islands/*.tsx`, checking the parts of issue #15's
Definition of done that are provable from source and build output alone —
no DOM, no assistive technology, no rendered pixels. Everything that needs a
browser or a screen reader is itemised instead in
`docs/contracts/accessibility.md` for a human to run.

Written generically on purpose: only thirteen of the fourteen sections this
issue was meant to audit exist yet (Government section 1; everything else on
`main` renders "Not built yet."). This suite makes no assumption about which
routes or how many charts exist — it walks whatever `dist/` contains, so each
section is covered the moment its own PR lands, without editing this file.

Standard library only: `html.parser`, `re`, `pathlib`. No new dependency.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
SRC = ROOT / "src"
GLOBAL_CSS = SRC / "styles" / "global.css"
TOKENS_CSS = SRC / "styles" / "tokens.css"
ACCESSIBILITY_DOC = ROOT / "docs" / "contracts" / "accessibility.md"
BASE_LAYOUT = SRC / "layouts" / "BaseLayout.astro"

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

FOCUSABLE_TAGS = {"button", "summary"}

# ---------------------------------------------------------------------------
# A minimal HTML tree, enough to answer "what are this element's ancestors"
# and "what is document order" — the two things a flat regex scan cannot do.
# ---------------------------------------------------------------------------


@dataclass
class Node:
    tag: str
    attrs: dict[str, str | None]
    parent: "Node | None" = None
    children: list["Node"] = field(default_factory=list)

    def get(self, name: str, default: str | None = None) -> str | None:
        return self.attrs.get(name, default)

    def classes(self) -> list[str]:
        return (self.attrs.get("class") or "").split()

    def text(self) -> str:
        return "".join(
            c.attrs.get("__text__", "") for c in self.children if c.tag == "#text"
        )

    def iter_descendants(self):
        for c in self.children:
            if c.tag != "#text":
                yield c
                yield from c.iter_descendants()

    def ancestors(self):
        p = self.parent
        while p is not None:
            yield p
            p = p.parent


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#document", {})
        self.stack: list[Node] = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), parent=self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID_ELEMENTS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, dict(attrs), parent=self.stack[-1])
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(
            Node("#text", {"__text__": data}, parent=self.stack[-1])
        )


def parse_html(path: Path) -> Node:
    builder = _TreeBuilder()
    builder.feed(path.read_text())
    return builder.root


def nodes_of(root: Node, *tags: str) -> list[Node]:
    return [n for n in root.iter_descendants() if n.tag in tags]


def id_map(root: Node) -> dict[str, Node]:
    return {n.get("id"): n for n in root.iter_descendants() if n.get("id")}


def is_focusable(n: Node) -> bool:
    if n.get("tabindex") == "0":
        return True
    if n.tag == "a" and n.get("href") is not None:
        return True
    return n.tag in FOCUSABLE_TAGS


def has_aria_hidden_ancestor(n: Node) -> bool:
    return any(a.get("aria-hidden") == "true" for a in n.ancestors())


def has_accessible_name(n: Node, root: Node) -> bool:
    if (n.get("aria-label") or "").strip():
        return True
    labelledby = n.get("aria-labelledby")
    if labelledby and id_map(root).get(labelledby) is not None:
        return True
    return False


# ---------------------------------------------------------------------------
# Fixture data: fail loudly, don't skip — a skip on a missing build reports
# green on a tree that was never built, which is worse than no test at all.
# ---------------------------------------------------------------------------

if not DIST.exists():
    raise RuntimeError(
        f"{DIST} does not exist. Run `npm run build` from the repository root "
        "before running the accessibility conformance suite."
    )

PAGES = sorted(DIST.glob("**/index.html"))
if not PAGES:
    raise RuntimeError(
        f"No dist/**/index.html found under {DIST}. Run `npm run build`."
    )

ISLANDS_DIR = SRC / "components" / "islands"
ISLANDS = sorted(ISLANDS_DIR.glob("*.tsx"))
if not ISLANDS:
    raise RuntimeError(f"No island components found under {ISLANDS_DIR}.")


def _page_id(path: Path) -> str:
    return path.relative_to(DIST).as_posix()


def _island_id(path: Path) -> str:
    return path.name


PAGE_PARAMS = [pytest.param(p, id=_page_id(p)) for p in PAGES]
ISLAND_PARAMS = [pytest.param(p, id=_island_id(p)) for p in ISLANDS]


@pytest.fixture(params=PAGE_PARAMS)
def page(request) -> tuple[Path, Node]:
    path: Path = request.param
    return path, parse_html(path)


@pytest.fixture(params=ISLAND_PARAMS)
def island_source(request) -> tuple[Path, str]:
    path: Path = request.param
    return path, path.read_text()


# ---------------------------------------------------------------------------
# Per built page
# ---------------------------------------------------------------------------


def test_every_page_declares_a_language(page):
    path, root = page
    htmls = nodes_of(root, "html")
    assert htmls, f"{path}: no <html> element found"
    lang = htmls[0].get("lang")
    assert lang and lang.strip(), f"{path}: <html> has no lang attribute"


def test_skip_link_targets_a_focusable_main(page):
    path, root = page
    links = [n for n in nodes_of(root, "a") if "skip-link" in n.classes()]
    assert links, f"{path}: no .skip-link element found"
    href = links[0].get("href") or ""
    assert href.startswith("#") and len(href) > 1, (
        f"{path}: .skip-link href {href!r} is not a same-page fragment"
    )
    target = id_map(root).get(href[1:])
    assert target is not None, (
        f"{path}: .skip-link targets id {href[1:]!r}, which does not exist"
    )
    assert target.get("tabindex") == "-1", (
        f"{path}: skip-link target #{href[1:]} lacks tabindex=\"-1\", so "
        "activating it moves the viewport but not keyboard focus (D3)"
    )


def test_every_nav_landmark_has_an_accessible_name(page):
    path, root = page
    for nav in nodes_of(root, "nav"):
        assert has_accessible_name(nav, root), (
            f"{path}: a <nav> has neither aria-label nor an aria-labelledby "
            f"resolving to an existing id: {nav.attrs}"
        )


def test_route_nav_and_contents_nav_are_separate_landmarks(page):
    path, root = page
    has_toc = any(n.tag == "ol" and "toc" in n.classes() for n in root.iter_descendants())
    if not has_toc:
        return  # a page with no section list (e.g. Sources) has nothing to separate
    navs = nodes_of(root, "nav")
    assert len(navs) >= 2, (
        f"{path}: has a section list but only {len(navs)} <nav> landmark(s) — "
        "the route nav and the contents list must be two separately named "
        "navigation landmarks (D5)"
    )


def test_heading_levels_do_not_skip(page):
    path, root = page
    headings = nodes_of(root, "h1", "h2", "h3", "h4", "h5", "h6")
    h1s = [h for h in headings if h.tag == "h1"]
    assert len(h1s) == 1, f"{path}: expected exactly one <h1>, found {len(h1s)}"
    prev_level = 0
    for h in headings:
        level = int(h.tag[1])
        assert level <= prev_level + 1, (
            f"{path}: heading level jumps from h{prev_level} to h{level}, "
            "skipping a level"
        )
        prev_level = level


def test_no_focusable_element_is_aria_hidden(page):
    path, root = page
    for n in root.iter_descendants():
        if is_focusable(n) and has_aria_hidden_ancestor(n):
            pytest.fail(f"{path}: focusable <{n.tag}> sits inside an aria-hidden subtree: {n.attrs}")


def test_every_figure_has_an_accessible_name(page):
    path, root = page
    for fig in nodes_of(root, "figure"):
        if "figure" not in fig.classes():
            continue
        assert has_accessible_name(fig, root), (
            f"{path}: a <figure class=\"figure\"> has no accessible name (D2): {fig.attrs}"
        )


# ---------------------------------------------------------------------------
# Per chart, over all built pages
# ---------------------------------------------------------------------------

_SHAPE_WORD_RE = re.compile(
    r"^(line|bar|area|pie|stacked|scatter|donut)\s+chart", re.IGNORECASE
)


def finding_shape_problems(text: str) -> list[str]:
    """The four shape rules a string must clear to read as a finding, as a list of failures.

    Lifted verbatim out of `test_every_chart_svg_states_a_finding` below, which still calls it and
    still asserts exactly what it asserted before. It is a function rather than four inline
    assertions so that `pipeline/tests/test_prose.py`'s Criterion 2 check can hold `.finding`
    bodies and `figure.figure` accessible names to the same floor without a second, drifting copy
    of it. `docs/contracts/prose.md` says the finding and the chart's accessible name are the same
    sentence; one predicate for both is what makes that cheap to enforce.

    **It sees shape, never substance.** A string can clear all four and still claim something the
    chart does not show, or disagree with the finding printed beside it. That is Checklist item 3
    in `docs/contracts/prose.md`, and it is human-judged.
    """
    problems: list[str] = []
    if len(text) < 40:
        problems.append("is under 40 characters")
    if not re.search(r"\d", text):
        problems.append("has no digit — it states no finding")
    if _SHAPE_WORD_RE.match(text):
        problems.append("describes its shape, not its finding")
    if "chart showing" in text.lower():
        problems.append("says 'chart showing', a shape description")
    return problems


def test_every_chart_svg_states_a_finding(page):
    path, root = page
    for svg in nodes_of(root, "svg"):
        if "chart" not in svg.classes():
            continue
        label = svg.get("aria-label") or ""
        for problem in finding_shape_problems(label):
            pytest.fail(f"{path}: chart svg aria-label {problem}: {label!r}")


# Figures that legitimately carry no chart. Empty today, and it stays an
# explicit named set on purpose: a prose-only or table-only figure is exempted
# by `id`, never by weakening the assertion below to "some figure has a chart".
FIGURES_WITHOUT_A_CHART: set[str] = set()


def _figure_title(fig: Node) -> str:
    for d in fig.iter_descendants():
        if "figure-title" in d.classes():
            return d.text().strip()
    return fig.get("id") or "(untitled figure)"


def test_every_figure_server_renders_its_chart_svg(page):
    """Existence, not conformance. Issue #36.

    Every other chart test in this module iterates the SVGs it finds and
    asserts about them, so a chart whose SVG vanished from the server render
    — a mount switched to `client:only`, a `mounted` gate added to
    `useChartSize` — would contribute zero assertions and leave the suite
    green. This test is the one that goes red instead.
    """
    path, root = page
    for fig in nodes_of(root, "figure"):
        if "figure" not in fig.classes():
            continue
        if (fig.get("id") or "") in FIGURES_WITHOUT_A_CHART:
            continue
        charts = [
            n for n in fig.iter_descendants()
            if n.tag == "svg" and "chart" in n.classes()
        ]
        assert charts, (
            f"{path}: the figure {_figure_title(fig)!r} contains no "
            "svg.chart in the server-rendered HTML — with scripting off it "
            "shows no chart at all. Islands must server-render their <svg>; "
            "`client:only` and mount-gated sizing are forbidden."
        )


def test_government_section_1_renders_its_whole_apparatus_without_scripting(page):
    """Issue #36's criterion 2, section 1 specifically.

    The generic guard above proves the `<svg>` exists. Section 1's contract
    enumerates more than that: prose, axis labels, tick text, the figcaption
    apparatus and the table caption all have to survive with scripting off.
    Kept literal and §1-shaped — a generic "every chart has axis labels" test
    would false-fail on the axis-free islands (`DebtHolders`, the
    `StateGiveGet` cartogram).
    """
    path, root = page
    if path.parent.name != "government":
        pytest.skip("section 1 lives on /government/")

    figs = [
        f for f in nodes_of(root, "figure")
        if "figure" in f.classes()
        and "Total public debt outstanding" in _figure_title(f)
    ]
    assert len(figs) == 1, (
        f"{path}: expected exactly one 'Total public debt outstanding' "
        f"figure, found {len(figs)}"
    )
    fig = figs[0]

    charts = [
        n for n in fig.iter_descendants()
        if n.tag == "svg" and "chart" in n.classes()
    ]
    assert charts, f"{path}: section 1's figure server-renders no svg.chart"
    svg = charts[0]

    texts = [
        d.text().strip() for d in svg.iter_descendants() if d.tag == "text"
    ]
    for label in ("Fiscal year", "$ trillions"):
        assert label in texts, (
            f"{path}: section 1's SSR svg has no {label!r} axis label — "
            f"its <text> nodes are {texts!r}"
        )

    y_ticks = [t for t in texts if re.fullmatch(r"\$\d+T?", t)]
    x_ticks = [t for t in texts if re.fullmatch(r"(19|20)\d{2}", t)]
    assert len(y_ticks) >= 4, (
        f"{path}: section 1's SSR svg carries {len(y_ticks)} dollar tick "
        f"labels, expected at least 4: {texts!r}"
    )
    assert len(x_ticks) >= 4, (
        f"{path}: section 1's SSR svg carries {len(x_ticks)} year tick "
        f"labels, expected at least 4: {texts!r}"
    )

    captions = [d for d in fig.iter_descendants() if d.tag == "figcaption"]
    assert captions, f"{path}: section 1's figure has no <figcaption>"
    leads = [
        d.text().strip() for d in captions[0].iter_descendants()
        if "lead" in d.classes()
    ]
    for lead in ("Units.", "Note.", "Source."):
        assert lead in leads, (
            f"{path}: section 1's figcaption is missing its {lead!r} line "
            f"with scripting off — it carries {leads!r}"
        )

    section = next(
        (a for a in fig.ancestors() if a.tag == "section"), None
    )
    assert section is not None, f"{path}: section 1's figure has no <section>"
    paragraphs = [
        p for p in section.iter_descendants()
        if p.tag == "p" and len(p.text().strip()) > 80
    ]
    assert paragraphs, (
        f"{path}: section 1 renders no prose paragraph with scripting off"
    )
    table_captions = [
        d.text().strip() for d in section.iter_descendants() if d.tag == "caption"
    ]
    assert any(table_captions), (
        f"{path}: section 1's TableView renders no <caption> with scripting "
        "off — the chart's data has no non-visual equivalent"
    )


def test_focusable_data_points_are_labelled_and_grouped(page):
    path, root = page
    for svg in nodes_of(root, "svg"):
        focusable_points = [
            n for n in svg.iter_descendants() if n.get("tabindex") == "0"
        ]
        if not focusable_points:
            continue
        for pt in focusable_points:
            assert (pt.get("aria-label") or "").strip(), (
                f"{path}: a focusable data point has no aria-label: {pt.attrs}"
            )
        assert svg.get("role") == "group", (
            f"{path}: an svg with Tab-focusable children carries "
            f"role={svg.get('role')!r} instead of role=\"group\" — its "
            "subtree is presentational to assistive tech and the focusable "
            "children go unannounced"
        )


def test_every_chart_has_a_real_table_in_the_static_html(page):
    path, root = page
    charts = [n for n in nodes_of(root, "svg") if "chart" in n.classes()]
    if not charts:
        return
    tables = nodes_of(root, "table")
    ok = False
    for t in tables:
        descendants = list(t.iter_descendants())
        has_caption = any(d.tag == "caption" for d in descendants)
        has_col = any(d.tag == "th" and d.get("scope") == "col" for d in descendants)
        has_row = any(d.tag == "th" and d.get("scope") == "row" for d in descendants)
        if has_caption and has_col and has_row:
            ok = True
            break
    assert ok, (
        f"{path}: has a chart but no <table> with a <caption>, a "
        "th[scope=col] and a th[scope=row] exists in the static HTML (D1)"
    )


def test_live_regions_do_not_outnumber_charts(page):
    path, root = page
    live_regions = [n for n in root.iter_descendants() if n.get("aria-live")]
    charts = [n for n in nodes_of(root, "svg") if "chart" in n.classes()]
    assert len(live_regions) <= len(charts), (
        f"{path}: {len(live_regions)} aria-live element(s) but only "
        f"{len(charts)} chart(s) — a chart should carry at most one live "
        "region, not one per data point"
    )


# ---------------------------------------------------------------------------
# Over src/: cross-cutting rules
# ---------------------------------------------------------------------------


def test_no_island_encodes_a_category_only_in_colour(island_source):
    path, text = island_source
    tokens = "|".join(re.escape(t) for t in series_tokens())
    if not tokens:
        return
    pattern = re.compile(r"(?:fill|stroke)=\{?[\"'`][^\"'`]*var\(--(?:" + tokens + r")\)")
    if pattern.search(text) and "<TableView" not in text:
        pytest.fail(
            f"{path}: paints a series token in fill=/stroke= but renders no "
            "<TableView> — the category has no text-carried equivalent"
        )


def test_focus_and_motion_rules_survive_the_build():
    css_files = list(DIST.glob("_astro/*.css"))
    assert css_files, f"No built CSS found under {DIST / '_astro'}"
    built_css = "\n".join(f.read_text() for f in css_files)
    assert "prefers-reduced-motion" in built_css, "built CSS lost the reduced-motion rule"
    assert re.search(r":focus-visible", built_css), "built CSS lost the :focus-visible rule"
    assert "skip-link:focus-visible" in built_css, (
        "built CSS lost .skip-link:focus-visible (D4)"
    )
    source_css = GLOBAL_CSS.read_text()
    m = re.search(r"\.datum:focus-visible\s*\{([^}]*)\}", source_css)
    assert m and "stroke" in m.group(1), (
        ".datum:focus-visible in global.css has no stroke fallback (D6) — "
        "WebKit does not paint outline on SVG shapes"
    )


def test_noscript_narrow_chart_mitigation_is_present(page):
    path, root = page
    for ns in nodes_of(root, "noscript"):
        for style in [n for n in ns.iter_descendants() if n.tag == "style"]:
            text = style.text()
            if ".axis-label" in text and "font-size" in text:
                return
    pytest.fail(
        f"{path}: no <noscript> style block enlarges .axis-label at narrow "
        "widths — with scripting off, useChartSize never leaves the wide "
        "preset and chart text scales down with the plot"
    )


# ---------------------------------------------------------------------------
# Contrast, computed from tokens.css and cross-checked against the doc
# ---------------------------------------------------------------------------


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _srgb_to_linear(c: int) -> float:
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _relative_luminance(hexcolor: str) -> float:
    r, g, b = _hex_to_rgb(hexcolor)
    R, G, B = _srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b)
    return 0.2126 * R + 0.7152 * G + 0.0722 * B


def contrast_ratio(hex1: str, hex2: str) -> float:
    l1, l2 = _relative_luminance(hex1), _relative_luminance(hex2)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


_TOKEN_HEX_RE = re.compile(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})")


def tokens_css_colors() -> dict[str, str]:
    text = TOKENS_CSS.read_text()
    return dict(_TOKEN_HEX_RE.findall(text))


_GROUND = "#DDE0DB"
_PANEL = "#F3F4F0"


_DOC_ROW_RE = re.compile(
    r"^\|\s*`--([\w-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(\w+)\s*\|\s*(.*?)\s*\|\s*$",
    re.MULTILINE,
)


@dataclass
class ContrastRow:
    token: str
    hexval: str
    vs_ground: float
    vs_panel: float
    role: str
    note: str


def doc_contrast_rows() -> list[ContrastRow]:
    if not ACCESSIBILITY_DOC.exists():
        pytest.fail(f"{ACCESSIBILITY_DOC} does not exist")
    text = ACCESSIBILITY_DOC.read_text()
    rows = [
        ContrastRow(token, hexval, float(vg), float(vp), role, note)
        for token, hexval, vg, vp, role, note in _DOC_ROW_RE.findall(text)
    ]
    if not rows:
        pytest.fail(f"{ACCESSIBILITY_DOC}: found no contrast table rows to parse")
    return rows


def series_tokens() -> list[str]:
    try:
        return [r.token for r in doc_contrast_rows() if r.role == "series"]
    except Exception:
        return []


def test_token_contrast_table_matches_tokens_css():
    css_tokens = tokens_css_colors()
    doc_rows = {r.token: r for r in doc_contrast_rows()}
    for name, hexval in css_tokens.items():
        row = doc_rows.get(name)
        assert row is not None, (
            f"tokens.css defines --{name}: {hexval} with no row in "
            f"{ACCESSIBILITY_DOC.relative_to(ROOT)}"
        )
        assert row.hexval.upper() == hexval.upper(), (
            f"--{name}: doc states hex {row.hexval}, tokens.css says {hexval}"
        )
        actual_vg = contrast_ratio(hexval, _GROUND)
        actual_vp = contrast_ratio(hexval, _PANEL)
        assert abs(actual_vg - row.vs_ground) <= 0.01, (
            f"--{name} vs --ground: doc says {row.vs_ground}, recomputed {actual_vg:.2f}"
        )
        assert abs(actual_vp - row.vs_panel) <= 0.01, (
            f"--{name} vs --panel: doc says {row.vs_panel}, recomputed {actual_vp:.2f}"
        )


def test_text_role_tokens_meet_4_5_to_1():
    css_tokens = tokens_css_colors()
    for row in doc_contrast_rows():
        if row.role != "text":
            continue
        hexval = css_tokens.get(row.token, row.hexval)
        assert contrast_ratio(hexval, _GROUND) >= 4.5, (
            f"--{row.token} scores below 4.5:1 against --ground"
        )
        assert contrast_ratio(hexval, _PANEL) >= 4.5, (
            f"--{row.token} scores below 4.5:1 against --panel"
        )


def test_series_tokens_below_3_to_1_are_documented_as_needing_redundant_encoding():
    css_tokens = tokens_css_colors()
    for row in doc_contrast_rows():
        if row.role != "series":
            continue
        hexval = css_tokens.get(row.token, row.hexval)
        if contrast_ratio(hexval, _PANEL) < 3.0:
            assert row.note.startswith("redundant-encoding:"), (
                f"--{row.token} scores below 3:1 against --panel but its "
                "contrast-table row carries no redundant-encoding: note "
                "naming its non-colour carrier"
            )


_TEXT_SELECTORS = [
    ".axis-label", ".axis-title", ".annotation", ".readout", ".kicker",
    ".standfirst", "figcaption", ".tableview .unit", ".rail a", ".navbar a",
    "body",
]

_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_MEDIA_RE = re.compile(r"@media[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}", re.DOTALL)
_RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")


def iter_css_rules(css_text: str):
    """Yield (selectors, body) for every simple rule, including rules nested
    one level inside an @-rule (e.g. @media) — the only nesting this
    stylesheet uses. The @-rule's own condition is discarded, not returned
    as a selector."""
    text = _COMMENT_RE.sub("", css_text)
    prev = None
    while prev != text:
        prev = text
        text = _MEDIA_RE.sub(lambda m: m.group(1), text)
    for m in _RULE_RE.finditer(text):
        selectors_str, body = m.groups()
        yield [s.strip() for s in selectors_str.split(",")], body


_COLOR_TOKEN_RE = re.compile(r"(?:color|fill)\s*:\s*var\(--([\w-]+)\)")


def test_no_text_selector_paints_with_a_low_contrast_token():
    css_tokens = tokens_css_colors()
    rules = list(iter_css_rules(GLOBAL_CSS.read_text()))
    for selector in _TEXT_SELECTORS:
        matches = [body for selectors, body in rules if selector in selectors]
        assert matches, f"selector {selector!r} not found in global.css"
        for body in matches:
            m = _COLOR_TOKEN_RE.search(body)
            if not m:
                continue
            token = m.group(1)
            hexval = css_tokens.get(token)
            assert hexval is not None, f"{selector} references unknown token --{token}"
            vg = contrast_ratio(hexval, _GROUND)
            vp = contrast_ratio(hexval, _PANEL)
            assert vg >= 4.5 and vp >= 4.5, (
                f"{selector} paints text with --{token} ({hexval}), which "
                f"scores {vg:.2f}:1 vs --ground and {vp:.2f}:1 vs --panel — "
                "below the 4.5:1 text threshold"
            )


# ---------------------------------------------------------------------------
# Narrow-viewport nav bar (#42). Below 62rem the rail is replaced by a bar
# fixed to the top of the viewport whose <details> disclosure carries the route
# links and the page's contents list. The rail keeps its own markup; the two are
# mutually `display: none`, so four <nav> elements are in the DOM and exactly
# two are in the accessibility tree at any viewport.
# ---------------------------------------------------------------------------

_NARROW_MEDIA_RE = re.compile(
    r"@media\s*\(\s*max-width:\s*62rem\s*\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}", re.DOTALL
)


def narrow_media_block() -> str:
    """The raw body of `@media (max-width: 62rem){…}` in global.css.

    `iter_css_rules` flattens every @-rule and discards its condition, so it
    cannot tell a narrow-viewport rule from a desktop one — and "the bar is
    fixed" and "anchors clear the bar" are claims about the narrow block
    specifically. Raises rather than returning "" if the block moves or is
    renamed: a helper that finds nothing to check reads exactly like one whose
    checks passed.
    """
    text = _COMMENT_RE.sub("", GLOBAL_CSS.read_text())
    matches = _NARROW_MEDIA_RE.findall(text)
    if len(matches) != 1:
        raise AssertionError(
            f"expected exactly one `@media (max-width: 62rem)` block in "
            f"{GLOBAL_CSS}, found {len(matches)} — the narrow-viewport nav bar "
            "checks below have nothing to read"
        )
    return matches[0]


_INLINE_SCRIPT_RE = re.compile(r"<script is:inline>(.*?)</script>", re.DOTALL)


def layout_inline_script() -> str:
    """The body of `BaseLayout.astro`'s single `<script is:inline>` block.

    Comments are kept, not stripped: the block's own prose is part of what the
    checks below read, and #44's `aria-current='true'` comment is single-quoted
    on purpose so the built page carries no double-quoted literal of it.

    Raises rather than returning `""` if the block moves, is renamed or is
    split in two — same contract, and same reason, as `narrow_media_block()`
    above: a helper that finds nothing to check reads exactly like one whose
    checks passed.
    """
    matches = _INLINE_SCRIPT_RE.findall(BASE_LAYOUT.read_text())
    if len(matches) != 1:
        raise AssertionError(
            f"expected exactly one `<script is:inline>` block in {BASE_LAYOUT}, "
            f"found {len(matches)} — the checks that read the layout script "
            "have nothing to read"
        )
    return matches[0]


def _hrefs(root: Node, ol_class: str, exclude: str | None = None) -> set[str]:
    out: set[str] = set()
    for ol in root.iter_descendants():
        if ol.tag != "ol" or ol_class not in ol.classes():
            continue
        if exclude and exclude in ol.classes():
            continue
        for a in ol.iter_descendants():
            if a.tag == "a" and a.get("href"):
                out.add(a.get("href"))
    return out


def test_nav_bar_mirrors_every_route_and_section(page):
    path, root = page
    rail_routes = _hrefs(root, "route-links")
    bar_routes = _hrefs(root, "navbar-routes")
    assert rail_routes, f"{path}: no .rail .route-links anchors found"
    assert bar_routes == rail_routes, (
        f"{path}: the nav bar's route list does not mirror the rail's — "
        f"bar {sorted(bar_routes)} vs rail {sorted(rail_routes)}"
    )
    rail_toc = _hrefs(root, "toc", exclude="navbar-toc")
    bar_toc = _hrefs(root, "navbar-toc")
    assert bar_toc == rail_toc, (
        f"{path}: the nav bar's contents list does not mirror the rail's — "
        f"bar {sorted(bar_toc)} vs rail {sorted(rail_toc)}"
    )


def test_nav_bar_does_not_precede_the_skip_link(page):
    path, root = page
    order = {id(n): i for i, n in enumerate(root.iter_descendants())}
    skip = [n for n in root.iter_descendants() if n.tag == "a" and "skip-link" in n.classes()]
    assert skip, f"{path}: no .skip-link element found"
    triggers = [
        n for n in root.iter_descendants()
        if n.tag == "summary" and "navbar-trigger" in n.classes()
    ]
    assert triggers, f"{path}: no .navbar-trigger <summary> found"
    assert order[id(skip[0])] < order[id(triggers[0])], (
        f"{path}: the nav bar's trigger precedes the skip link in document "
        "order, so the skip link is no longer the first focusable node"
    )


def test_no_page_repeats_an_id(page):
    path, root = page
    seen: dict[str, int] = {}
    for n in root.iter_descendants():
        ident = n.get("id")
        if ident:
            seen[ident] = seen.get(ident, 0) + 1
    dupes = {k: v for k, v in seen.items() if v > 1}
    # `id_map` builds a dict and silently keeps the last element of a duplicated
    # id, so every aria-labelledby check above would still pass with two
    # `id="toc-heading"` on the page. This counts instead.
    assert not dupes, f"{path}: duplicate id(s) {dupes} — aria-labelledby resolution is undefined"


def test_nav_bar_panel_scrolls_internally():
    block = narrow_media_block()
    bodies = [
        body for selectors, body in iter_css_rules(block)
        if ".navbar-panel" in selectors
    ]
    assert bodies, "no `.navbar-panel` rule inside @media (max-width: 62rem)"
    joined = " ".join(bodies)
    assert "max-height" in joined, (
        "`.navbar-panel` sets no max-height, so a 12-entry panel grows the page "
        "instead of scrolling inside itself"
    )
    assert re.search(r"overflow-y\s*:\s*auto", joined), (
        "`.navbar-panel` does not set `overflow-y: auto`"
    )


def test_sticky_nav_bar_offsets_its_anchor_targets():
    block = narrow_media_block()
    offset = {
        selector
        for selectors, body in iter_css_rules(block)
        if "scroll-margin-top" in body
        for selector in selectors
    }
    for required in ("section[id]", "#main"):
        assert required in offset, (
            f"{required} has no `scroll-margin-top` inside "
            "@media (max-width: 62rem), so the fixed bar covers the top of "
            "whatever an anchor — or the skip link — lands on"
        )


_MOTION_RE = re.compile(r"(?:^|;)\s*(?:transition|animation)[\w-]*\s*:", re.MULTILINE)


def test_nav_bar_open_close_is_not_animated():
    for selectors, body in iter_css_rules(GLOBAL_CSS.read_text()):
        if not any("navbar" in s for s in selectors):
            continue
        assert not _MOTION_RE.search(body), (
            f"rule {selectors} declares a transition or animation — the nav "
            "bar satisfies prefers-reduced-motion by having no motion at all, "
            "not by relying on the global reduce block to zero one out"
        )


def test_nav_bar_tap_targets_clear_44px():
    block = narrow_media_block()
    _MIN_HEIGHT_RE = re.compile(r"min-height\s*:\s*([\d.]+)rem")
    setters: set[str] = set()
    for selectors, body in iter_css_rules(block):
        if not any("navbar" in s for s in selectors):
            continue
        m = _MIN_HEIGHT_RE.search(body)
        if not m:
            continue
        assert float(m.group(1)) >= 2.75, (
            f"rule {selectors} sets min-height {m.group(1)}rem, below the "
            "2.75rem (44px) tap-target floor"
        )
        setters.update(selectors)
    for required in (".navbar-trigger", ".navbar a"):
        assert required in setters, (
            f"{required} sets no min-height inside @media (max-width: 62rem), "
            "so nothing holds it to the 44px tap-target floor"
        )


# ---------------------------------------------------------------------------
# The suite itself must fail loudly on an unbuilt tree, not skip.
# ---------------------------------------------------------------------------


def test_the_suite_ran_against_a_real_build():
    # If this test executed at all, module-level collection already found
    # dist/ and src/components/islands/ non-empty — see the RuntimeErrors
    # raised at import time above. This assertion exists so a future refactor
    # that accidentally removes those guards has something failing here too.
    assert DIST.exists() and PAGES


# ---------------------------------------------------------------------------
# Reading position in the contents list (#44). One IntersectionObserver in
# `BaseLayout.astro`'s inline <script> marks the section containing the viewport
# midpoint with aria-current='true' on both contents lists at once. Nothing is
# marked at build time and nothing is marked with scripting off — marking
# section 1 statically would be wrong for every reader not at the top.
# ---------------------------------------------------------------------------


def test_no_built_page_ships_a_section_level_aria_current(page):
    """The JS-off criterion, guarded against passing by accident.

    A build that dropped the route markers entirely would satisfy "no
    aria-current='true' anywhere" vacuously, so this also pins the route
    markers at exactly two per page — the rail's and the panel's, the same
    duplication that puts two in the DOM and one in the accessibility tree.
    """
    path, root = page
    marked = [
        n for n in root.iter_descendants() if n.get("aria-current") == "true"
    ]
    assert not marked, (
        f"{path}: {len(marked)} element(s) carry aria-current='true' in the "
        "server-rendered HTML. Reading position is derived from scroll "
        "position at runtime; a static mark is wrong for every reader who is "
        f"not at the top: {[n.attrs for n in marked]}"
    )
    routed = [
        n for n in root.iter_descendants() if n.get("aria-current") == "page"
    ]
    assert len(routed) == 2, (
        f"{path}: expected exactly 2 aria-current='page' elements (the rail's "
        f"route list and the panel's), found {len(routed)}"
    )


def _anchors_in(root: Node, ol_class: str, exclude: str | None = None) -> list[Node]:
    out: list[Node] = []
    for ol in root.iter_descendants():
        if ol.tag != "ol" or ol_class not in ol.classes():
            continue
        if exclude and exclude in ol.classes():
            continue
        out.extend(a for a in ol.iter_descendants() if a.tag == "a")
    return out


def test_every_contents_anchor_is_addressable_by_the_spy(page):
    """The spy writes to `a[data-section="<id>"]` and reads `main section[id]`.

    A section added to a page but not to its `sections` array — or the reverse
    — is silently unmarkable, and no rendered check would notice on a route
    nobody re-scrolls.
    """
    path, root = page
    mains = nodes_of(root, "main")
    assert mains, f"{path}: no <main> element found"
    section_ids = [
        n.get("id") for n in mains[0].iter_descendants()
        if n.tag == "section" and n.get("id")
    ]
    lists = {
        ol_class: _anchors_in(root, ol_class, exclude)
        for ol_class, exclude in (("toc", "navbar-toc"), ("navbar-toc", None))
    }
    if not any(lists.values()):
        # `/sources` passes no `sections` prop: one section, no contents list,
        # and the spy returns before observing anything (E6). `/` left this
        # branch when #48 shipped — it now passes a page-local array of four.
        return
    for ol_class, anchors in lists.items():
        assert anchors, (
            f"{path}: has a .{'navbar-toc' if ol_class == 'toc' else 'toc'} "
            f"contents list but no .{ol_class} one — the two must stay in "
            "sync, because one querySelectorAll writes both"
        )
        listed = [a.get("data-section") for a in anchors]
        assert all(listed), (
            f"{path}: an anchor in .{ol_class} carries no data-section, so "
            f"the section spy cannot address it: {[a.attrs for a in anchors]}"
        )
        assert listed == section_ids, (
            f"{path}: .{ol_class} lists {listed} but <main> renders "
            f"{section_ids} — every contents entry must name a section that "
            "exists, in document order, or the mark cannot track the page"
        )


_LIVE_REGION_ATTRS = ("aria-live", "aria-atomic")
_LIVE_REGION_ROLES = {"status", "alert", "log", "marquee", "timer"}


def test_contents_lists_are_not_live_regions(page):
    """The proof of the screen-reader criterion, not an assumption.

    An `aria-current` change on an element that is neither focused nor inside a
    live region is not announced, so rapid scrolling produces no stream of
    announcements — the state is there when the reader navigates into the list
    and silent until then. That holds only while no live region is added to or
    above either contents list, which is what this checks. Complements
    `test_live_regions_do_not_outnumber_charts`, which counts them site-wide.
    """
    path, root = page
    for ol in root.iter_descendants():
        if ol.tag != "ol" or "toc" not in ol.classes():
            continue
        for node in [ol, *ol.ancestors(), *ol.iter_descendants()]:
            for attr in _LIVE_REGION_ATTRS:
                assert node.get(attr) is None, (
                    f"{path}: <{node.tag}> at or around a contents list "
                    f"declares {attr}={node.get(attr)!r} — every reading-"
                    "position change would then be announced while scrolling"
                )
            role = (node.get("role") or "").strip().lower()
            assert role not in _LIVE_REGION_ROLES, (
                f"{path}: <{node.tag}> at or around a contents list declares "
                f"role={role!r}, which is an implicit live region"
            )


def test_section_state_selector_is_scoped_and_not_bare():
    """`[aria-current]` bare would restyle the route links too.

    Two values live on this page — `page`, server-rendered on route links and
    styled ink-with-underline, and `true`, client-set on contents links and
    styled ink alone. A bare attribute selector collapses the distinction.
    """
    rules = list(iter_css_rules(GLOBAL_CSS.read_text()))
    scoped = [
        s for selectors, _ in rules
        for s in selectors
        if "[aria-current='true']" in s and (".toc" in s or ".navbar-toc" in s)
    ]
    assert scoped, (
        "global.css declares no rule matching [aria-current='true'] inside "
        ".toc / .navbar-toc — the marked section has no visible treatment"
    )
    bare = re.compile(r"\[aria-current\]")
    for selectors, _ in rules:
        for s in selectors:
            assert not bare.search(s), (
                f"global.css rule {s!r} matches [aria-current] bare, which "
                "catches the route links' aria-current='page' as well as the "
                "contents list's aria-current='true'"
            )


# `behavior\s*:` is anchored with a lookbehind so it matches the scroll
# options bag (`behavior: 'smooth'`) and not the CSS properties
# `overscroll-behavior` or `scroll-behavior`, which are declarations about
# containment and about motion preference, not scripted scrolls — and which
# would otherwise make this regex unusable over served HTML that inlines CSS.
_SCROLL_API_RE = re.compile(
    r"scrollIntoView|scrollTo\s*\(|scrollBy\s*\(|(?<![\w-])behavior\s*:"
)


def test_the_section_spy_introduces_no_scripted_scrolling():
    """What makes "reduced motion is satisfied vacuously" an observation.

    The rail is not a scroll container and the panel is never auto-scrolled, so
    the spy reads scroll position and writes an attribute — it moves nothing.
    The `IntersectionObserver` assertion is what stops this passing by finding
    no script at all.

    Reads `src/`; `test_no_built_page_scripts_a_scroll` (#46) makes the same
    check over `dist/`, where an island bundled into the page would show up and
    here it would not. The overlap is deliberate — neither is redundant.
    """
    block = layout_inline_script()
    assert "IntersectionObserver" in block, (
        f"{BASE_LAYOUT}: the inline script declares no IntersectionObserver — "
        "the section spy is gone, and the checks below would pass vacuously"
    )
    found = _SCROLL_API_RE.findall(block)
    assert not found, (
        f"{BASE_LAYOUT}: the inline script calls {found} — the navigation "
        "chrome introduces no scripted scrolling at all, which is how "
        "prefers-reduced-motion is satisfied here"
    )


# ---------------------------------------------------------------------------
# Reading position across navigation (#46). Nothing here implements scroll
# restoration, and that is the deliverable: the browser's own
# `history.scrollRestoration = 'auto'` default already returns the reader to
# the place they were reading on Back and Forward, and scroll anchoring already
# absorbs both the post-hydration chart growth and the collapsed <details>
# tables. Measured, not assumed — the numbers are in
# `docs/contracts/accessibility.md` § Manual pass results.
#
# So the code change is a guard. Five one-line changes elsewhere in this repo
# would each silently take the behaviour away with every other test still
# green; the five checks below are what turns each of them red. Each asserts an
# absence, so each is paired with a positive assertion that fails if the file
# it reads is empty, moved or unreadable.
# ---------------------------------------------------------------------------

_TEXT_SUFFIXES = {".astro", ".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".md"}


def _src_text_files() -> list[Path]:
    return sorted(
        p for p in SRC.rglob("*") if p.is_file() and p.suffix in _TEXT_SUFFIXES
    )


def test_scroll_restoration_is_left_to_the_browser():
    """`history.scrollRestoration` is never assigned, anywhere in `src/`.

    Setting it to `'manual'` opts out of the browser's restore *and* of scroll
    anchoring's correction of it, replacing a pixel-exact result with a
    hand-rolled offset — which the `<details>` case, where the document is
    11,854–11,970px shorter on return, would put thousands of pixels wrong. Reading it
    is harmless, but there is no reason to and no way to tell the two apart by
    grep, so the string is barred outright.

    Over `src/` rather than `dist/`: `is:inline` scripts are not bundled and a
    future island's code would be, so only the source covers both.
    """
    files = _src_text_files()
    assert BASE_LAYOUT in files, (
        f"{BASE_LAYOUT} was not among the {len(files)} source files scanned — "
        "the check below would pass by reading the wrong tree"
    )
    offenders = [
        str(p.relative_to(ROOT))
        for p in files
        if "scrollRestoration" in p.read_text(errors="replace")
    ]
    assert not offenders, (
        f"{offenders} mention `history.scrollRestoration`. Scroll restoration "
        "is the platform's here: the default is 'auto', nothing assigns it, "
        "and no storage of our own mirrors it — see docs/contracts/"
        "accessibility.md, 'Scroll restoration is the platform's'"
    )


_SCROLL_BEHAVIOR_RE = re.compile(r"(?<![\w-])scroll-behavior\s*:\s*([^;}]+)")


def test_no_stylesheet_requests_smooth_scrolling():
    """No rule asks for smooth scrolling, and the reduce block still says so.

    `html { scroll-behavior: smooth }` would turn every history restore into a
    visible animated scroll, and would defeat `prefers-reduced-motion` for any
    reader whose engine resolves the cascade before the reduce block. The
    second assertion is what stops this passing by finding no `scroll-behavior`
    declaration at all.
    """
    declarations = []
    for _selectors, body in iter_css_rules(GLOBAL_CSS.read_text()):
        declarations.extend(m.strip() for m in _SCROLL_BEHAVIOR_RE.findall(body))
    assert declarations, (
        f"{GLOBAL_CSS} declares `scroll-behavior` nowhere — the "
        "prefers-reduced-motion block's `scroll-behavior: auto !important` is "
        "gone, and the check below has nothing to read"
    )
    for value in declarations:
        assert value.split()[0] == "auto", (
            f"{GLOBAL_CSS} declares `scroll-behavior: {value}` — only `auto` "
            "may be declared. Smooth scrolling animates every history restore "
            "and fights prefers-reduced-motion"
        )


def test_scroll_anchoring_is_not_disabled():
    """`overflow-anchor` is declared nowhere, and that absence is load-bearing.

    Scroll anchoring is the single mechanism that absorbs layout change landing
    *after* a history restore: Government's charts grow by ~123px when
    `useChartSize` swaps the WIDE preset for NARROW, and the document is
    11,854–11,970px shorter on return because `<details>` `open` is not restored. Both
    self-correct to the pixel with anchoring on (default `auto`), and neither
    would with `overflow-anchor: none` on `html`, `body` or `main`. Nobody
    would think to look for a declaration that is not there, so this test looks
    for it instead.

    Paired with `.navbar-panel`'s `overscroll-behavior: contain`, which is a
    real declaration in the same file, so this cannot pass by failing to read
    the stylesheet.
    """
    rules = list(iter_css_rules(GLOBAL_CSS.read_text()))
    for selectors, body in rules:
        assert not re.search(r"(?<![\w-])overflow-anchor\s*:", body), (
            f"{GLOBAL_CSS} rule {selectors!r} declares `overflow-anchor`. "
            "Scroll anchoring must stay at its `auto` default — it is what "
            "makes the back button land on the reader's section after the "
            "charts and the collapsed tables have changed the document height"
        )
    contained = [
        body
        for selectors, body in rules
        if ".navbar-panel" in selectors and "overscroll-behavior" in body
    ]
    assert contained, (
        f"{GLOBAL_CSS}: `.navbar-panel` no longer declares "
        "`overscroll-behavior` — the absence check above may have read nothing"
    )


def test_the_layout_registers_no_bfcache_disqualifying_listener():
    """No `unload` or `beforeunload` listener anywhere in the layout script.

    Either one permanently disqualifies the page from the back/forward cache,
    so *every* Back navigation takes the full-reload path instead of the free
    one. The measurements behind #46 were all taken on that slow path and hold
    there — but there is no reason to force it, and a listener added for an
    unrelated purpose would do so invisibly.

    The substring `unload` is barred outright: it catches `beforeunload`,
    `onunload` and the bare event name in one check, and nothing else in this
    script legitimately contains it.
    """
    block = layout_inline_script()
    assert "addEventListener" in block, (
        f"{BASE_LAYOUT}: the inline script registers no listener at all — the "
        "check below would pass against an empty or gutted script"
    )
    assert "unload" not in block, (
        f"{BASE_LAYOUT}: the inline script mentions `unload`. An `unload` or "
        "`beforeunload` listener disqualifies the page from bfcache, making "
        "every back navigation a full reload"
    )


def test_no_built_page_scripts_a_scroll(page):
    """Nothing in the served HTML moves the viewport for the reader.

    The built-output companion to
    `test_the_section_spy_introduces_no_scripted_scrolling`, which reads
    `src/`: this one would catch a scripted scroll arriving through an island
    bundled into the page, which the source check cannot see. Keep both.

    This is also #46's `prefers-reduced-motion` proof, and it is a vacuous one
    on purpose — a scroll that never happens needs no `behavior: 'auto'`. A
    scripted scroll after load would also fight the history restore, producing
    the double-jump the issue names.
    """
    path, _root = page
    html = path.read_text()
    assert "IntersectionObserver" in html, (
        f"{path}: the layout's inline script is not in the served page — the "
        "check below would pass by finding no script"
    )
    found = _SCROLL_API_RE.findall(html)
    assert not found, (
        f"{path} ships {found}. Nothing here scrolls the reader: the section "
        "spy reads position and writes an attribute, and the back button's "
        "restore is the browser's"
    )


# ---------------------------------------------------------------------------
# In-prose glossary markers (#47). `src/components/Term.astro` wraps a term's
# first use per page in a real <a href> to its /glossary anchor, with the
# term's `short` as a `hidden` sibling inside the same wrapper — the popover
# `termPopovers()` discloses. Everything below is provable from the built HTML
# and the stylesheet; the hover, focus, touch and Escape behaviour is a browser
# question and is recorded as manual rows M9-M12 in
# docs/contracts/accessibility.md.
# ---------------------------------------------------------------------------

GLOSSARY_DIR = SRC / "content" / "glossary"
_FIRST_USED_RE = re.compile(
    r"^first_used:\s*$\s*^\s*route:\s*[\"']([^\"']+)[\"']\s*$", re.MULTILINE
)


_SHORT_RE = re.compile(r'^short:\s*"(.*)"\s*$', re.MULTILINE)
_UNICODE_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


def _short_of(path: Path) -> str:
    """The `short` field of a glossary file, with its JSON-style `\\uXXXX`
    escapes resolved — several entries write an em dash that way."""
    m = _SHORT_RE.search(path.read_text())
    assert m, f"{path}: no `short` field in the frontmatter"
    return _UNICODE_ESCAPE_RE.sub(lambda x: chr(int(x.group(1), 16)), m.group(1))


def glossary_terms() -> dict[str, str]:
    """Every glossary entry id mapped to the route its `first_used` names.

    The ids are filenames, which is the collection's durability guarantee —
    `docs/contracts/interfaces/glossary.md`, "The filename is the slug".
    """
    entries: dict[str, str] = {}
    for path in sorted(GLOSSARY_DIR.glob("*.md")):
        m = _FIRST_USED_RE.search(path.read_text())
        assert m, f"{path}: no `first_used.route` in the frontmatter"
        entries[path.stem] = m.group(1)
    assert entries, f"no glossary terms found under {GLOSSARY_DIR}"
    return entries


def term_wrappers(root: Node) -> list[Node]:
    return [n for n in root.iter_descendants() if "term" in n.classes()]


def marked_terms(root: Node) -> list[str]:
    return [w.get("data-term") or "" for w in term_wrappers(root)]


# Terms whose `first_used` route carries no in-prose marker, each because that
# route's prose does not name the term in a place a marker can go. Explicit so
# that growing this list is a visible diff rather than drift; the reasons are
# in docs/contracts/interfaces/glossary.md, "Terms whose first_used route
# carries no marker". Fixing any of the first four is a prose edit, which is a
# content change and was out of #47's scope.
UNMARKED_AT_FIRST_USE = {
    "cyclical-deficit": "the phrase occurs in no route's prose",
    "gdp-deflator": "occurs in no route's prose; only 'deflator' in a <Figure note>",
    "gross-debt": "/government section 1 is about it and never names it",
    "incidence": "occurs only inside a <Figure note>",
    "vintage": "on /economy only as the vintage={…} prop; marked on /government",
    "net-interest": "on /economy only as the text of a cross-route <a>; marked on /government",
}

_PAGE_FOR_ROUTE = {"/economy": "economy", "/households": "households", "/government": "government"}


def test_every_term_marker_is_a_real_link(page):
    """Every marker is an `<a href>` to its own base-path-joined anchor.

    Fails if a trigger becomes a `<button>`, loses its `href`, or emits an
    unbased `/glossary#…` — #70's failure mode, which 404s in production.
    """
    path, root = page
    # `/`, `/sources` and `/glossary` carry no marked term, by design. That
    # this check cannot pass vacuously across the whole site is
    # `test_every_first_used_route_carries_its_term_marker`'s job.
    for w in term_wrappers(root):
        slug = w.get("data-term")
        assert slug, f"{path}: a .term wrapper carries no data-term"
        triggers = [n for n in w.iter_descendants() if "term-trigger" in n.classes()]
        assert len(triggers) == 1, (
            f"{path}: .term[data-term={slug!r}] holds {len(triggers)} "
            ".term-trigger elements, expected exactly 1"
        )
        trigger = triggers[0]
        assert trigger.tag == "a", (
            f"{path}: the trigger for {slug!r} is a <{trigger.tag}>, not an <a> — "
            "with scripting off it would be inert"
        )
        assert trigger.get("href") == f"/income-tax/glossary#{slug}", (
            f"{path}: the trigger for {slug!r} points at "
            f"{trigger.get('href')!r}, not the base-path-joined "
            f"'/income-tax/glossary#{slug}'"
        )
        assert trigger.get("aria-describedby") == f"def-{slug}", (
            f"{path}: the trigger for {slug!r} does not describe itself by "
            f"'def-{slug}' — the definition would not reach assistive technology"
        )


def test_every_term_marker_names_a_real_glossary_entry(page):
    path, root = page
    terms = glossary_terms()
    for slug in marked_terms(root):
        assert slug in terms, (
            f"{path}: marks {slug!r}, which is not a file under {GLOSSARY_DIR}"
        )


def test_no_page_marks_a_term_twice(page):
    """The machine-checkable half of "only the first use is marked".

    Whether a marker sits on the genuinely first occurrence is a reading check
    and is named as such in the interface contract rather than pretended into a
    test. A duplicate would also repeat a `def-<slug>` id.
    """
    path, root = page
    slugs = marked_terms(root)
    duplicated = sorted({s for s in slugs if slugs.count(s) > 1})
    assert not duplicated, (
        f"{path}: marks {duplicated} more than once — only a term's first use "
        "on a page is marked, and a second marker repeats its def-<slug> id"
    )


def test_every_first_used_route_carries_its_term_marker():
    """Ties #45's `first_used` data to #47's markup, in both directions.

    A term renamed, or added without a marker, fails here rather than rotting
    quietly. The exception list is asserted too: every id in it must still be a
    real term, and none of them may be marked on the route it names — so a
    later prose edit that makes one markable forces the list to shrink instead
    of leaving a stale entry behind.
    """
    terms = glossary_terms()
    marks = {
        name: set(marked_terms(parse_html(DIST / name / "index.html")))
        for name in _PAGE_FOR_ROUTE.values()
    }
    assert any(marks.values()), (
        "no built route page carries a single .term marker — every assertion "
        "below would pass by reading nothing"
    )
    for slug, reason in UNMARKED_AT_FIRST_USE.items():
        assert slug in terms, (
            f"UNMARKED_AT_FIRST_USE names {slug!r} ({reason}), which is no "
            f"longer a term under {GLOSSARY_DIR} — the exception is stale"
        )
    for slug, route in sorted(terms.items()):
        page_name = _PAGE_FOR_ROUTE[route]
        if slug in UNMARKED_AT_FIRST_USE:
            assert slug not in marks[page_name], (
                f"{slug!r} is now marked on {route}, its first_used route, but "
                "is still listed in UNMARKED_AT_FIRST_USE — delete the entry"
            )
            continue
        assert slug in marks[page_name], (
            f"{slug!r} declares first_used {route} and dist/{page_name}/"
            "index.html carries no marker for it. Either mark its first prose "
            "use there, or record why it cannot be marked in "
            "UNMARKED_AT_FIRST_USE and in docs/contracts/interfaces/glossary.md"
        )


def test_term_popovers_are_not_animated(page):
    """Reduced motion, and the no-JS guarantee, in one check.

    No `.term*` rule declares a transition or an animation, so
    `prefers-reduced-motion` is satisfied vacuously and greppably — the same
    way `test_nav_bar_open_close_is_not_animated` proves it for the nav bar,
    rather than by relying on the global reduce block to zero out a motion that
    was written anyway.

    The second half asserts the definition text itself is in the served bytes
    while the popover is `hidden`: that is what an `aria-describedby` target
    has to be for a screen reader to reach the definition with scripting off,
    and it is what a portal would take away.
    """
    css = GLOBAL_CSS.read_text()
    for selectors, body in iter_css_rules(css):
        if not any("term" in s for s in selectors):
            continue
        assert not _MOTION_RE.search(body), (
            f"rule {selectors} declares a transition or animation — the term "
            "popover satisfies prefers-reduced-motion by having no motion at "
            "all"
        )
    assert "@keyframes" not in css.split("In-prose glossary markers")[-1], (
        "the in-prose marker block in global.css declares @keyframes"
    )

    path, root = page
    shorts = {p.stem: _short_of(p) for p in sorted(GLOSSARY_DIR.glob("*.md"))}
    for w in term_wrappers(root):
        slug = w.get("data-term")
        pops = [n for n in w.iter_descendants() if "term-pop" in n.classes()]
        assert len(pops) == 1, (
            f"{path}: .term[data-term={slug!r}] holds {len(pops)} .term-pop "
            "elements, expected exactly 1 — and it must be a descendant of the "
            "wrapper, which is what satisfies WCAG 1.4.13 hoverable"
        )
        pop = pops[0]
        assert "hidden" in pop.attrs, (
            f"{path}: the popover for {slug!r} is not `hidden` in the served "
            "HTML — with scripting off it would be open on every marked term"
        )
        assert pop.get("id") == f"def-{slug}", (
            f"{path}: the popover for {slug!r} has id {pop.get('id')!r}, not "
            f"'def-{slug}' — the bare slug would collide with a section id"
        )
        body = [n for n in pop.iter_descendants() if "term-short" in n.classes()]
        assert len(body) == 1, (
            f"{path}: the popover for {slug!r} holds {len(body)} .term-short "
            "elements, expected exactly 1"
        )
        assert body[0].text().strip() == shorts[slug], (
            f"{path}: the popover for {slug!r} does not carry the term's "
            "`short` verbatim, so the aria-describedby target does not hold "
            f"the definition. Served: {body[0].text().strip()!r}"
        )


# ---------------------------------------------------------------------------
# Radix `Select` popper width at 390px (#62). On a phone the "Control at
# enactment" listbox laid itself out 427px wide, x=10 to x=437, so 46px of
# every option sat past the viewport edge — and `documentElement.scrollWidth`
# stayed 390 with the popper wrapper computing `overflow-x: visible`, which
# makes the overrun unreachable rather than merely awkward.
#
# **None of the three checks below can see that defect, and none of them
# claims to.** `dist/government/index.html` contains `select-content` zero
# times — Radix mounts `Content` only while the listbox is open, so the
# listbox is never in the served bytes — and width and overflow are computed,
# not serialised, so even a mounted popper would not expose its rendered size
# to a static reader. What these checks verify is that the three *declarations* that
# bound the popup are still present: a later sweep that deletes any one of
# them turns one of these red instead of silently restoring the defect.
#
# The rendered proof is a browser measurement, recorded in
# `docs/contracts/accessibility.md` § Manual pass results. Automating that
# observation in CI is #67, which owns exactly that capability.
#
# Each check is a plain function over text, so each is paired below with a
# negative test that feeds it the mutant it exists to catch — an absence
# asserted against source that was never mutated proves only that the source
# is unchanged.
# ---------------------------------------------------------------------------

#: The two `position="popper"` listbox classes. Both are clamped against
#: `--radix-select-content-available-width`, which Radix 2.3.7 mounts on the
#: `Content` element itself and computes as the collision boundary minus the
#: `collisionPadding` the call site passes.
POPPER_CONTENT_CLASSES = (".select-content", ".tax-mix-select-content")

AVAILABLE_WIDTH_VAR = "--radix-select-content-available-width"

_MAX_WIDTH_RE = re.compile(r"(?:^|;)\s*max-width\s*:\s*([^;]+)")
_MAX_HEIGHT_RE = re.compile(r"(?:^|;)\s*max-height\s*:\s*([^;]+)")
_OVERFLOW_Y_RE = re.compile(r"(?:^|;)\s*overflow-y\s*:\s*([^;]+)")
_OVERFLOW_X_RE = re.compile(r"(?:^|;)\s*overflow-x\s*:\s*([^;]+)")


def popper_width_bound_failures(css_text: str) -> list[str]:
    """Every popper listbox class declares a `max-width` measured against the
    viewport. Returns one string per failure, empty when all are bound."""
    rules = list(iter_css_rules(css_text))
    failures = []
    for cls in POPPER_CONTENT_CLASSES:
        bodies = [body for selectors, body in rules if cls in selectors]
        if not bodies:
            failures.append(f"{cls} has no rule in global.css at all")
            continue
        declared = [m.group(1).strip() for b in bodies for m in [_MAX_WIDTH_RE.search(b)] if m]
        if not declared:
            failures.append(
                f"{cls} declares no max-width, so the popper sizes itself to "
                "its widest option and opens past a 390px viewport (#62)"
            )
            continue
        if not any(AVAILABLE_WIDTH_VAR in d for d in declared):
            failures.append(
                f"{cls} declares max-width: {declared[-1]!r}, which does not "
                f"reference {AVAILABLE_WIDTH_VAR} — the only value that knows "
                "the collision boundary and the side the popper chose"
            )
    return failures


def test_every_radix_popper_content_class_bounds_its_width():
    failures = popper_width_bound_failures(GLOBAL_CSS.read_text())
    assert not failures, "; ".join(failures)


def _select_namespaces(source: str) -> list[str]:
    """The local names `@radix-ui/react-select` is bound to in one island.

    Resolved from the import rather than matched as a bare `Select.Content`,
    so `Tabs.Content` and `Dialog.Content` — which are not poppers and need no
    collision configuration — are not swept in, and so a third `Select`
    consumer is covered the moment its file lands, whatever it names the
    namespace.
    """
    return re.findall(
        r"import\s+\*\s+as\s+(\w+)\s+from\s+['\"]@radix-ui/react-select['\"]", source
    )


def _opening_tag(source: str, start: int) -> str:
    """The full JSX opening tag beginning at `start`, brace-aware.

    A regex to the first `>` would stop inside `{() => …}`; every prop value
    here is a brace expression, so depth is tracked instead."""
    depth = 0
    for i in range(start, len(source)):
        c = source[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == ">" and depth == 0:
            return source[start : i + 1]
    return source[start:]


def collision_padding_failures(sources: dict[str, str]) -> list[str]:
    """Every Radix `Select` `Content` in `src/components/islands/` passes an
    explicit `collisionPadding`.

    Not decoration: `collisionPadding` is the number
    `--radix-select-content-available-width` is measured against, so the
    `max-width` clamp checked above is only as good as this prop. The two are
    a pair and neither is a fix on its own (#62).
    """
    failures = []
    found = 0
    for name, source in sorted(sources.items()):
        for ns in _select_namespaces(source):
            for m in re.finditer(rf"<{re.escape(ns)}\.Content\b", source):
                found += 1
                tag = _opening_tag(source, m.start())
                if "collisionPadding" not in tag:
                    line = source[: m.start()].count("\n") + 1
                    failures.append(
                        f"{name}:{line}: <{ns}.Content> passes no "
                        "collisionPadding, so the available-width var the "
                        "listbox is clamped against is measured against a "
                        "boundary nobody chose (#62)"
                    )
    if not found:
        failures.append(
            "no Radix Select Content element found in any island — this check "
            "has nothing to read and would pass vacuously"
        )
    return failures


def test_every_radix_select_content_passes_collision_padding():
    failures = collision_padding_failures({p.name: p.read_text() for p in ISLANDS})
    assert not failures, "; ".join(failures)


def two_axis_scroll_box_failures(css_text: str) -> list[str]:
    """`.tax-mix-select-content` scrolls on one axis, and says so.

    Load-bearing rather than pedantic: CSS forces a used `overflow-x` of
    `auto` whenever `overflow-y` is not `visible`, so "we never wrote
    `overflow-x`" is not the same as "there is no horizontal scroll box" —
    measured at 390px before this rule existed, the listbox computed
    `overflow-x: auto`. Nothing is clipped by declaring `hidden`, because the
    width clamp above stops the content exceeding the box.
    """
    cls = ".tax-mix-select-content"
    bodies = [body for selectors, body in iter_css_rules(css_text) if cls in selectors]
    if not bodies:
        return [f"{cls} has no rule in global.css at all"]
    body = "".join(bodies)
    failures = []
    if not _MAX_HEIGHT_RE.search(body):
        failures.append(
            f"{cls} declares no max-height — the 51-jurisdiction list is no "
            "longer bounded to a scrolling box"
        )
    overflow_y = _OVERFLOW_Y_RE.search(body)
    if not overflow_y or overflow_y.group(1).strip() != "auto":
        failures.append(
            f"{cls} does not declare `overflow-y: auto`, so the jurisdictions "
            "past the fold are unreachable"
        )
    overflow_x = _OVERFLOW_X_RE.search(body)
    if not overflow_x:
        failures.append(
            f"{cls} declares no overflow-x, which CSS then computes as `auto` "
            "because overflow-y is not `visible` — a two-axis scroll box"
        )
    elif overflow_x.group(1).strip() in {"auto", "scroll"}:
        failures.append(
            f"{cls} declares overflow-x: {overflow_x.group(1).strip()!r} — a "
            "horizontal scrollbar on a listbox nothing is too wide for"
        )
    return failures


def test_the_tax_mix_listbox_is_not_a_two_axis_scroll_box():
    failures = two_axis_scroll_box_failures(GLOBAL_CSS.read_text())
    assert not failures, "; ".join(failures)


# --- and the proof that each of the three bites ------------------------------
# This repository has removed checks that could not fail. Each mutant below is
# the exact edit that reintroduces the 390px defect.


def test_the_width_guard_bites_a_popper_that_lost_its_clamp():
    css = GLOBAL_CSS.read_text()
    dropped = css.replace(
        f"max-width: var({AVAILABLE_WIDTH_VAR}, calc(100vw - 1.5rem));", "", 1
    )
    assert dropped != css, "the mutant did not apply — the declaration moved"
    assert popper_width_bound_failures(dropped), "a popper with no clamp passed"

    # And the subtler regression: a clamp that is *there* but measured against
    # something that does not know where the popper was placed.
    naive = css.replace(
        f"max-width: var({AVAILABLE_WIDTH_VAR}, calc(100vw - 1.5rem));",
        "max-width: 30rem;",
    )
    assert popper_width_bound_failures(naive), "a fixed-rem clamp passed"


def test_the_collision_guard_bites_a_content_that_dropped_the_prop():
    sources = {p.name: p.read_text() for p in ISLANDS}
    assert not collision_padding_failures(sources), (
        "the mutants below prove nothing if the real sources already fail"
    )

    mutants = {
        name: source.replace("collisionPadding={8}", "")
        for name, source in sources.items()
    }
    assert mutants != sources, "no island carries collisionPadding to remove"
    failures = collision_padding_failures(mutants)
    assert len(failures) == 2, failures
    assert all("collisionPadding" in f for f in failures), failures

    # A third consumer, added without the prop, is caught without editing this
    # suite (E9) — and an alias other than `RadixSelect` is still resolved.
    newcomer = {
        "Newcomer.tsx": (
            "import * as Sel from '@radix-ui/react-select'\n"
            "const C = () => <Sel.Content className='x' position='popper'>"
            "{null}</Sel.Content>\n"
        )
    }
    assert collision_padding_failures({**sources, **newcomer}), (
        "a new Select consumer with no collisionPadding passed"
    )

    # `Tabs.Content` is not a popper and must not be swept in.
    tabs = {
        "Tabby.tsx": (
            "import * as Tabs from '@radix-ui/react-tabs'\n"
            "const C = () => <Tabs.Content value='a'>{null}</Tabs.Content>\n"
        )
    }
    assert not collision_padding_failures({**sources, **tabs}), (
        "a non-Select Content was demanded to carry collisionPadding"
    )


def _mutate_rule(css_text: str, selector: str, old: str, new: str) -> str:
    """`old` -> `new`, inside one rule's block only.

    A bare `str.replace` would hit the first `overflow-y: auto` in the
    stylesheet, which belongs to another rule entirely — a mutant that lands
    somewhere else proves the guard bites something else."""
    m = re.search(rf"{re.escape(selector)}\s*\{{([^{{}}]*)\}}", css_text)
    assert m, f"{selector} block not found in global.css"
    body = m.group(1)
    assert old in body, f"{old!r} is not declared in {selector}"
    return css_text[: m.start(1)] + body.replace(old, new, 1) + css_text[m.end(1) :]


def test_the_scroll_box_guard_bites_each_way_it_can_regress():
    css = GLOBAL_CSS.read_text()
    assert not two_axis_scroll_box_failures(css)

    cls = ".tax-mix-select-content"
    for mutant, why in (
        (_mutate_rule(css, cls, "overflow-x: hidden;", ""), "overflow-x deleted"),
        (_mutate_rule(css, cls, "overflow-x: hidden;", "overflow-x: auto;"), "overflow-x: auto"),
        (_mutate_rule(css, cls, "max-height: 20rem;", ""), "max-height deleted"),
        (_mutate_rule(css, cls, "overflow-y: auto;", ""), "overflow-y deleted"),
    ):
        assert mutant != css, f"the mutant for {why!r} did not apply"
        assert two_axis_scroll_box_failures(mutant), f"{why} passed"


# ---- Government §11's by-state table on a phone (#63) ----------------------
#
# **None of these four guards can see the defect they exist to protect.**
# Width, `overflow`, sticky offsets and `cqi` resolution are all *computed*;
# `dist/` carries markup and a stylesheet, not a layout. What they prove is
# that the declarations which produce the fixed behaviour are still present,
# so a later sweep cannot quietly delete them. The behaviour itself is a
# measured browser observation, recorded as such in
# `docs/contracts/accessibility.md` § "Government §11's by-state table at
# 390px"; #67 owns automating it.

_STICKY_ROW_HEADER_SELECTORS = (
    ".sortable-table th[scope='row']",
    ".sortable-table thead th:first-child",
)


def pinned_row_header_failures(css_text: str) -> list[str]:
    """Every selector that pins §11's name column must declare `position:
    sticky`, a `left` offset, and an opaque background drawn from a token.

    A sticky cell with no background of its own is the same as no sticky cell:
    the four number columns scroll *through* it."""
    failures: list[str] = []
    for selector in _STICKY_ROW_HEADER_SELECTORS:
        bodies = [
            body for selectors, body in iter_css_rules(css_text)
            if selector in selectors
        ]
        if not bodies:
            failures.append(f"{selector} has no rule in global.css")
            continue
        joined = " ".join(bodies)
        if not re.search(r"position\s*:\s*sticky", joined):
            failures.append(f"{selector} does not declare `position: sticky`")
        if not re.search(r"(?:^|;|\s)left\s*:", joined):
            failures.append(f"{selector} declares no `left` offset to stick at")
        m = re.search(r"background(?:-color)?\s*:\s*([^;]+)", joined)
        if m is None:
            failures.append(
                f"{selector} sets no background, so the columns it pins "
                "scroll through it"
            )
        elif "var(--" not in m.group(1) or "transparent" in m.group(1):
            failures.append(
                f"{selector} sets background {m.group(1).strip()!r}, which is "
                "not an opaque palette token"
            )
    return failures


def test_the_by_state_row_header_column_is_pinned():
    assert not pinned_row_header_failures(GLOBAL_CSS.read_text())


def caption_container_bound_failures(css_text: str) -> list[str]:
    """§11's caption must be sized against the scroll container's own inline
    size, and `.tableview-scroll` must actually be a query container.

    A `<caption>`'s box is the *table's* width, so `max-width: 100%` resolves
    against the 745px that is the bug. The two declarations are useless apart,
    which is why one guard asserts both."""
    failures: list[str] = []
    rules = list(iter_css_rules(css_text))

    caption = " ".join(
        body for selectors, body in rules
        if ".sortable-table caption" in selectors
    )
    if not caption:
        failures.append(".sortable-table caption has no rule in global.css")
    else:
        m = re.search(r"(?:^|;|\s)(?:max-)?width\s*:\s*([^;]+)", caption)
        if m is None:
            failures.append(
                ".sortable-table caption sets no width, so its box is the "
                "table's 745px and its first line runs off a 390px phone"
            )
        elif "cqi" not in m.group(1) and "vw" not in m.group(1):
            failures.append(
                f".sortable-table caption is sized {m.group(1).strip()!r}, "
                "which resolves against the table rather than the window it "
                "scrolls inside"
            )
        if not re.search(r"position\s*:\s*sticky", caption):
            failures.append(
                ".sortable-table caption is not sticky, so it scrolls out of "
                "the window with the table"
            )

    wrapper = " ".join(
        body for selectors, body in rules if ".tableview-scroll" in selectors
    )
    if not wrapper:
        failures.append(".tableview-scroll has no rule in global.css")
    elif not re.search(r"container-type\s*:\s*inline-size", wrapper):
        failures.append(
            ".tableview-scroll is not `container-type: inline-size`, so "
            "`cqi` inside it resolves against the viewport, not the wrapper"
        )
    return failures


def test_the_by_state_caption_is_bound_to_its_scroll_container():
    assert not caption_container_bound_failures(GLOBAL_CSS.read_text())


_TABLE_CELL_SELECTOR_RE = re.compile(r"(?<![\w.#\-])(td|th|col|caption)(?![\w\-])")
_CELL_HIDDEN_RE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden")


def hidden_table_cell_failures(css_text: str) -> list[str]:
    """No rule anywhere in the stylesheet may hide a table cell.

    The cheapest way to make a wide table fit a phone is to drop columns, and
    #63's contract forbids it: §11's table is the cartogram's primary
    non-visual equivalent, so a reader on a narrow viewport still needs all
    five columns. Written over the whole stylesheet rather than over §11's
    selectors, so a future table is covered without editing this suite."""
    failures: list[str] = []
    for selectors, body in iter_css_rules(css_text):
        cells = [s for s in selectors if _TABLE_CELL_SELECTOR_RE.search(s)]
        if cells and _CELL_HIDDEN_RE.search(body):
            failures.append(
                f"{', '.join(cells)} hides a table cell: {body.strip()!r}"
            )
    return failures


def test_no_stylesheet_rule_hides_a_table_cell_at_a_breakpoint():
    assert not hidden_table_cell_failures(GLOBAL_CSS.read_text())


def test_the_by_state_table_serves_all_five_columns_with_scripting_off():
    """The served-DOM half of #63: §11's table is always-visible markup, not a
    disclosure and not a hydration product, so all five columns and every
    jurisdiction row are in the built bytes."""
    path = DIST / "government" / "index.html"
    assert path.exists(), "dist/government/index.html is missing — run `npm run build`"
    root = parse_html(path)

    tables = [
        n for n in nodes_of(root, "table") if "sortable-table" in n.classes()
    ]
    assert len(tables) == 1, (
        f"expected exactly one .sortable-table on /government/, found {len(tables)}"
    )
    table = tables[0]

    col_headers = [
        n for n in nodes_of(table, "th") if n.get("scope") == "col"
    ]
    assert len(col_headers) == 5, (
        "§11's by-state table must serve all five columns at every viewport; "
        f"the build has {len(col_headers)}"
    )
    for th in col_headers:
        buttons = [
            n for n in th.iter_descendants()
            if n.tag == "button" and "sort-button" in n.classes()
        ]
        assert buttons, (
            f"column header {th.text()!r} ships no .sort-button — the sort "
            "controls are this figure's only controls"
        )

    row_headers = [n for n in nodes_of(table, "th") if n.get("scope") == "row"]
    assert len(row_headers) >= 51, (
        "the 50 states and DC must each be a row header in the served markup; "
        f"found {len(row_headers)}"
    )


def test_the_by_state_guards_bite_the_ways_the_fix_can_regress():
    """Each of the three stylesheet guards above, against the mutant that
    removes exactly what it protects."""
    css = GLOBAL_CSS.read_text()
    assert not pinned_row_header_failures(css)
    assert not caption_container_bound_failures(css)
    assert not hidden_table_cell_failures(css)

    unpinned = _mutate_rule(
        css, ".sortable-table thead th:first-child", "position: sticky;", ""
    )
    assert unpinned != css, "the unpinned mutant did not apply"
    assert pinned_row_header_failures(unpinned), "a name column with no sticky passed"

    see_through = _mutate_rule(
        css,
        ".sortable-table thead th:first-child",
        "background: var(--ground);",
        "background: transparent;",
    )
    assert pinned_row_header_failures(see_through), (
        "a sticky cell with a transparent background passed — the numbers "
        "would scroll straight through the name"
    )

    table_bound = _mutate_rule(
        css, ".sortable-table caption", "width: 100cqi;", "max-width: 100%;"
    )
    assert caption_container_bound_failures(table_bound), (
        "a caption sized against the table's own 745px passed"
    )

    uncontained = _mutate_rule(
        css, ".tableview-scroll", "container-type: inline-size;", ""
    )
    assert caption_container_bound_failures(uncontained), (
        "a `cqi` caption inside a wrapper that is not a query container passed"
    )

    dropped_column = css + (
        "\n@media (max-width: 30rem) {\n"
        "  .sortable-table td:nth-child(4) { display: none; }\n"
        "}\n"
    )
    assert hidden_table_cell_failures(dropped_column), (
        "a breakpoint that drops the Net balance column passed"
    )

    # And the guard must not sweep in a rule that hides something which is not
    # a table cell — `.tableview .tv-close` and the navbar chrome are both
    # `display: none` today.
    assert not hidden_table_cell_failures(
        css + "\n.tableview .tv-close { display: none; }\n"
    ), "a non-cell `display: none` was reported as a hidden column"


# ---------------------------------------------------------------------------
# Chart annotations clipped at the plot edge (#64)
#
# Unlike the CSS-layout defects in #62 and #63, this one is fully provable from
# the served bytes: an annotation's `x`, its `text-anchor`, its ancestor
# `transform`s, its text content and its SVG's `viewBox` are ALL in `dist/`.
# Only the text width is estimated — and it is estimated with the same constant
# `src/components/charts/annotate.ts` clamps against, so these guards prove the
# clamp was APPLIED, using the arithmetic the clamp itself is built on.
#
# What is NOT provable here: the 360-unit NARROW geometry. `useChartSize`
# returns the WIDE preset before measurement, so SSR only ever emits 720. That
# half is covered by `src/components/charts/annotate.test.ts` under
# `npm run test:unit`. A browser probe with real `getBoundingClientRect()` is
# #67's; `docs/contracts/accessibility.md` records it as measured, not asserted.
# ---------------------------------------------------------------------------

# The annotation family: direct labels that name a datum or a series. Keyed on
# class because that is what survives into the built HTML.
ANNOTATION_CLASSES = {
    "annotation",
    "series-label",
    "dotplot-average-label",
    "maturity-marker-label",
}

# global.css font sizes, asserted against the stylesheet below rather than
# trusted, because a size change silently changes every width in this file.
ANNOTATION_FONT_PX = {
    "annotation": 11.5,
    "series-label": 11.5,
    "dotplot-average-label": 10.5,
    "maturity-marker-label": 10.5,
}

# Must equal ADVANCE_EM in src/components/charts/annotate.ts — asserted below.
ADVANCE_EM = 0.62

# Every other `<text>` class that ships today. This is an `==` audit, not an
# ignore list: a class that appears in neither set fails the audit, so a new
# annotation cannot ship unguarded (E10). Splitting the corpus this way is
# deliberate — axis text, tick text and the labels named here belong to the
# broad 390px legibility sweep in #66, NOT to #64, and a later reader should
# not "complete" this guard into that issue's scope.
#
# `holders-label` is a genuine direct data label that overruns /government
# today (Foreign $9.64T … at +100 units). It is recorded in
# docs/parked-findings.md and left to #66; it is listed here so the audit still
# bites when something NEW appears.
NON_ANNOTATION_TEXT_CLASSES = {
    "attrib-row-label",
    "axis-label",
    "axis-title",
    "control-strip-glyph",
    "datum",
    "dotplot-label",
    "dotplot-label-us",
    "dotplot-value",
    "dotplot-value-us",
    "holders-label",
    "legend-label",
    "maturity-label",
    "panel-title",
    "state-tile-code",
    "state-tile-mark",
}

ANNOTATE_TS = SRC / "components" / "charts" / "annotate.ts"
ANNOTATION_TSX = SRC / "components" / "charts" / "Annotation.tsx"
CHARTS_DIR = SRC / "components" / "charts"

_TRANSLATE = re.compile(r"translate\(\s*(-?[\d.]+)")

_TS_COMMENT = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)


def _without_comments(source: str) -> str:
    """Source with comments removed.

    These guards forbid CALLING `getBBox` and friends; annotate.ts's own header
    NAMES them, in the sentence explaining why it does not use them. Scanning
    raw text would fail on the documentation of the rule it is enforcing — and
    the obvious "fix" for that is to delete the explanation.
    """
    return _TS_COMMENT.sub("", source)


def _font_px_for(node: Node) -> float:
    for token in node.classes():
        if token in ANNOTATION_FONT_PX:
            return ANNOTATION_FONT_PX[token]
    return 11.5


def _label_and_width(node: Node) -> tuple[str, float]:
    """The label's text, and an upper bound on its rendered advance width.

    A multi-line label (`<tspan>` children, as OecdChart's two-line average
    marker) is as wide as its WIDEST LINE, never the concatenation of them —
    reading the parent's flattened text would over-estimate by 2x and report a
    fictitious overrun (E9).
    """
    font_px = _font_px_for(node)
    tspans = [c for c in node.iter_descendants() if c.tag == "tspan"]
    if tspans:
        lines = [(s.text() or "").strip() for s in tspans]
        widest = max(lines, key=len) if lines else ""
        return widest, max((len(line) for line in lines), default=0) * font_px * ADVANCE_EM
    label = (node.text() or "").strip()
    return label, len(label) * font_px * ADVANCE_EM


def _local_x(node: Node, svg: Node) -> float:
    """`x`, plus every ancestor `translate()` up to the SVG.

    An absent `x` is 0, NOT "skip this node". BracketHistory emitted exactly
    that shape — a `<text>` positioned entirely by an ancestor `<g transform>`
    — and a guard that skipped it would pass green over a real overrun (E7).
    """
    dx = float(node.get("x") or 0)
    parent = node.parent
    while parent is not None and parent is not svg:
        match = _TRANSLATE.search(parent.get("transform") or "")
        if match:
            dx += float(match.group(1))
        parent = parent.parent
    return dx


def _annotated_svgs(root: Node) -> list[tuple[Node, float]]:
    """Every `<svg>` carrying a numeric viewBox, with its width in user units.

    `html.parser` LOWERCASES attribute names, so the attribute in `dist/` is
    `viewbox`, and `svg.get("viewBox")` returns None for every SVG on the site.
    A guard written the obvious way finds zero annotations and passes green on a
    broken tree — which is what `..._sees_the_whole_corpus` below exists to
    catch (E8).
    """
    out = []
    for svg in root.iter_descendants():
        if svg.tag != "svg":
            continue
        viewbox = (svg.get("viewbox") or "").split()
        if len(viewbox) != 4:
            continue
        out.append((svg, float(viewbox[2])))
    return out


def _annotation_nodes(root: Node) -> list[tuple[Node, Node, float]]:
    found = []
    for svg, width in _annotated_svgs(root):
        for node in svg.iter_descendants():
            if node.tag == "text" and (set(node.classes()) & ANNOTATION_CLASSES):
                found.append((node, svg, width))
    return found


def annotation_clipping_failures(root: Node) -> list[str]:
    """Annotations whose painted box leaves their own SVG, in units."""
    failures = []
    for node, svg, width in _annotation_nodes(root):
        label, text_width = _label_and_width(node)
        x = _local_x(node, svg)
        anchor = node.get("text-anchor") or "start"
        if anchor == "end":
            left = x - text_width
        elif anchor == "middle":
            left = x - text_width / 2
        else:
            left = x
        right = left + text_width
        if left < -0.5:
            failures.append(
                f'"{label}" ({anchor}) starts at {left:.1f}, {-left:.1f} units past the left edge'
            )
        elif right > width + 0.5:
            failures.append(
                f'"{label}" ({anchor}) ends at {right:.1f}, {right - width:.1f} units past '
                f"the right edge of a {width:.0f}-unit viewBox"
            )
    return failures


def test_no_chart_annotation_is_clipped_by_its_svg(page):
    """Chart.tsx renders with a viewBox and no `overflow: visible`, so a label
    drawn past the SVG edge is CLIPPED, not spilled — cut mid-glyph, with no
    ellipsis and no scrollbar.

    That is a correctness defect, not a layout one. `2022: top 1% 31.5%` was
    rendering as `2022: top 19`: a complete-looking label carrying a number that
    is not the number, on a site whose whole claim is that every figure traces
    to a source.
    """
    path, root = page
    failures = annotation_clipping_failures(root)
    assert not failures, f"{path}: annotation clipped by its own SVG:\n  " + "\n  ".join(failures)


def test_the_annotation_clipping_guard_sees_the_whole_corpus():
    """The anti-blindness check.

    Both ways the guard above can go blind are silent and both cost a cycle
    during this investigation: `viewBox` lowercased to `viewbox` by
    `html.parser`, and a `<text>` with no `x` attribute. Either one turns
    `test_no_chart_annotation_is_clipped_by_its_svg` into a test that walks zero
    nodes and passes on a broken tree. So assert it saw the corpus.
    """
    seen = 0
    parsed_svgs = 0
    per_route: dict[str, int] = {}
    for path in PAGES:
        root = parse_html(path)
        nodes = _annotation_nodes(root)
        parsed_svgs += len(_annotated_svgs(root))
        seen += len(nodes)
        if nodes:
            per_route[path.parent.name] = len(nodes)

    assert seen >= 63, (
        f"the annotation walk found only {seen} nodes across dist/; it found 63 when #64 "
        f"landed. Either annotations were dropped from the server render, or the walk has "
        f"gone blind (viewBox/viewbox, or a <text> with no x). Per route: {per_route}"
    )
    assert parsed_svgs >= 20, (
        f"only {parsed_svgs} SVGs yielded a numeric viewBox width — the attribute in dist/ "
        f"is lowercase `viewbox`, and reading `viewBox` returns None for every one of them"
    )
    # Every one of the three chart routes must be represented. A walk that
    # silently lost a whole route would still clear the total on the other two.
    for route in ("economy", "households", "government"):
        assert per_route.get(route), f"no annotations found on /{route}"


def test_no_annotation_class_ships_outside_the_guarded_set():
    """`==` audit over every `<text>` class in `dist/` (E10).

    A new direct-label class must be sorted into one bucket or the other by
    hand. It cannot ship unnoticed into neither, which is how a clamp gets
    quietly bypassed a year from now.
    """
    seen: set[str] = set()
    for path in PAGES:
        root = parse_html(path)
        for svg, _ in _annotated_svgs(root):
            for node in svg.iter_descendants():
                if node.tag == "text":
                    seen.update(node.classes())

    known = ANNOTATION_CLASSES | NON_ANNOTATION_TEXT_CLASSES
    unknown = seen - known
    assert not unknown, (
        f"unclassified <text> class(es) in dist/: {sorted(unknown)}. Add each to "
        f"ANNOTATION_CLASSES if it is a direct label that must be clamped by "
        f"annotate.ts, or to NON_ANNOTATION_TEXT_CLASSES if it is axis text or "
        f"belongs to #66's broader 390px sweep."
    )
    stale = known - seen
    assert not stale, (
        f"class(es) listed here no longer ship: {sorted(stale)}. Remove them, so this "
        f"audit keeps meaning what it says."
    )


def test_the_annotation_constants_match_the_source_and_the_stylesheet():
    """The width arithmetic above is only a proof of the clamp while it uses the
    clamp's own numbers. Three copies exist — this file, annotate.ts, and
    global.css — so pin them to each other."""
    ts = ANNOTATE_TS.read_text()

    advance = re.search(r"export const ADVANCE_EM = ([\d.]+)", ts)
    assert advance, "annotate.ts no longer exports ADVANCE_EM"
    assert float(advance.group(1)) == ADVANCE_EM, (
        f"annotate.ts has ADVANCE_EM = {advance.group(1)}, this suite has {ADVANCE_EM}. "
        f"They must move together — and only ever upward: the constant is a deliberate "
        f"OVER-estimate, because clamping early costs whitespace while clamping late "
        f"reproduces #64."
    )

    css = GLOBAL_CSS.read_text()
    for cls, expected in ANNOTATION_FONT_PX.items():
        rule = re.search(rf"\.{re.escape(cls)}\s*\{{(.*?)\}}", css, re.S)
        if cls == "series-label":
            continue  # inherits .annotation's size; it only adds font-style
        assert rule, f"global.css has no .{cls} rule"
        size = re.search(r"font-size:\s*([\d.]+)px", rule.group(1))
        assert size and float(size.group(1)) == expected, (
            f".{cls} is {size.group(1) if size else 'unset'}px in global.css but "
            f"{expected}px here; every width in this file would be wrong"
        )


def test_annotation_placement_is_not_measured_at_runtime():
    """Criterion 5: the server render and the hydrated render must agree, so
    nothing shifts under the reader on hydration.

    Guaranteed by construction — placement is a pure function of `(x, label,
    frame, anchor)` — and that is what this pins. A `getBBox()` introduced later
    to "measure it properly" would produce a server placement and a client
    placement that differ, and the difference would be a visible jump.
    """
    measured = re.compile(r"getBBox|getComputedTextLength|getExtentOfChar")
    for path in sorted(CHARTS_DIR.glob("*.ts*")) + ISLANDS:
        source = _without_comments(path.read_text())
        assert not measured.search(source), (
            f"{path.name} measures text at runtime; annotation placement must stay pure "
            f"so the server and the client agree"
        )

    # `getBoundingClientRect` has exactly one legitimate use in this tree:
    # useChartSize measures the CONTAINER to choose between two presets. It
    # never touches text. Pinned by name so a second use has to argue for
    # itself here.
    rect_users = {
        path.name
        for path in sorted(CHARTS_DIR.glob("*.ts*")) + ISLANDS
        if "getBoundingClientRect" in _without_comments(path.read_text())
    }
    assert rect_users == {"useChartSize.ts"}, (
        f"getBoundingClientRect is used in {sorted(rect_users)}; only useChartSize.ts "
        f"may measure, and only the container, never text"
    )

    helper = _without_comments(ANNOTATE_TS.read_text())
    for forbidden in ("window", "document", "useEffect", "useState", "useRef"):
        assert forbidden not in helper, (
            f"annotate.ts references `{forbidden}`; the placement helper must be pure"
        )


def test_every_annotation_is_placed_through_the_clamp():
    """Criterion 2, in greppable form.

    `placeAnnotation` returns `null` for a label too wide to fit anywhere, and
    the caller must then render NOTHING — absent beats truncated. A call site
    that emitted a bare `<text className="annotation">` would have skipped both
    the clamp and the `null`, i.e. would be free to draw exactly the partial
    number this issue is about. So every annotation class appears in exactly one
    file under src/components/: Annotation.tsx, which honours `null` for all of
    them.
    """
    offenders: dict[str, set[str]] = {}
    for path in sorted(CHARTS_DIR.glob("*.ts*")) + ISLANDS:
        if path.name == ANNOTATION_TSX.name:
            continue
        source = _without_comments(path.read_text())
        for cls in ANNOTATION_CLASSES:
            for match in re.finditer(rf"\b{re.escape(cls)}\b", source):
                tag = _enclosing_jsx_tag(source, match.start())
                if tag != "Annotation":
                    offenders.setdefault(cls, set()).add(f"{path.name} (<{tag}>)")

    assert not offenders, (
        f"annotation classes written outside Annotation.tsx: "
        f"{ {k: sorted(v) for k, v in offenders.items()} }. Every annotation must go "
        f"through <Annotation>, which applies the clamp and renders nothing when the "
        f"label cannot fit."
    )

    # The classes are not merely absent elsewhere — Annotation.tsx really does
    # emit all of them, so the check above is about routing, not about the
    # family having quietly emptied out.
    component = _without_comments(ANNOTATION_TSX.read_text())
    for cls in ANNOTATION_CLASSES:
        assert cls in component, (
            f"`{cls}` is in ANNOTATION_CLASSES but Annotation.tsx never emits it; either "
            f"it moved somewhere unclamped, or this suite's family list is stale"
        )

    # And Annotation.tsx must actually honour the null.
    assert "if (!placed) return null" in component, (
        "Annotation.tsx no longer renders nothing on an unplaceable label; a truncated "
        "number would become reachable again"
    )


def _enclosing_jsx_tag(source: str, index: int) -> str:
    """The JSX element whose attribute list contains `source[index]`.

    Naming a class on `<Annotation className="…">` is fine — that prop still
    goes through the clamp. Naming it on a bare `<text>` is the escape hatch
    this audit exists to close, and the two are textually identical apart from
    the tag. Regexing `<text …>` cannot tell them apart either, because these
    components carry arrow-function handlers whose `=>` ends the attribute
    match early, so walk back to the opening tag instead.
    """
    open_bracket = source.rfind("<", 0, index)
    if open_bracket == -1:
        return "?"
    name = re.match(r"<\s*([A-Za-z][\w.]*)", source[open_bracket:])
    return name.group(1) if name else "?"


def _parse_html_string(markup: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(markup)
    return builder.root


def test_the_annotation_clipping_guard_bites():
    """The negative test: the guard against the mutants it exists to catch.

    Every anchor, both edges, and the two shapes that made earlier drafts of
    this guard report healthy while blind.
    """
    # A clean corpus flags nothing.
    clean = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="100" class="annotation">2022: top 1% 31.5%</text>'
        '<text x="600" text-anchor="end" class="annotation">Last actual, FY2025</text>'
        '<text x="300" text-anchor="middle" class="annotation">2023: 38.4%</text>'
        "</svg>"
    )
    assert not annotation_clipping_failures(clean), "a within-bounds corpus was flagged"

    over_right_start = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="694" class="annotation">Last actual, FY2025</text></svg>'
    )
    failures = annotation_clipping_failures(over_right_start)
    assert failures and "Last actual, FY2025" in failures[0], (
        "a start-anchored label running off the right edge passed"
    )

    over_right_middle = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="696" text-anchor="middle" class="annotation">2022: top 1% 31.5%</text></svg>'
    )
    assert annotation_clipping_failures(over_right_middle), (
        "the exact defect #64 reported — `2022: top 1% 31.5%` clipped to `2022: top 19` — passed"
    )

    over_left_end = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="10" text-anchor="end" class="annotation">Unemployment</text></svg>'
    )
    failures = annotation_clipping_failures(over_left_end)
    assert failures and "left edge" in failures[0], (
        "an end-anchored label running off the LEFT edge passed"
    )

    # E7: no `x` attribute at all, positioned by an ancestor's translate. An
    # earlier draft skipped these; missing x is 0, not "not my problem".
    no_x = _parse_html_string(
        '<svg viewBox="0 0 720 396"><g transform="translate(700,20)">'
        '<text text-anchor="middle" class="annotation">1981: 69.125% (part-year cut)</text>'
        "</g></svg>"
    )
    assert annotation_clipping_failures(no_x), (
        "a <text> with no x, carried past the edge by its ancestor's translate, passed"
    )
    assert _local_x(
        [n for n in no_x.iter_descendants() if n.tag == "text"][0],
        [n for n in no_x.iter_descendants() if n.tag == "svg"][0],
    ) == 700, "the ancestor translate was not accumulated"

    # E9: two lines are as wide as the widest, not their concatenation. This one
    # must NOT be flagged — over-reading here would be a false alarm that a
    # later reader "fixes" by loosening the guard.
    two_lines = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="380" class="dotplot-average-label">'
        '<tspan x="380">OECD average, 34.1% of GDP</tspan>'
        '<tspan x="380" dy="1.15em">(mean of 38 members, not a country)</tspan>'
        "</text></svg>"
    )
    assert not annotation_clipping_failures(two_lines), (
        "a two-line label was measured as the concatenation of its lines"
    )
    label, width = _label_and_width(
        [n for n in two_lines.iter_descendants() if n.tag == "text"][0]
    )
    assert label == "(mean of 38 members, not a country)", "the widest line was not chosen"

    # E8: the lowercasing trap, demonstrated rather than described. A camelCase
    # read finds no SVG at all, so every mutant above would pass.
    assert _annotated_svgs(
        _parse_html_string(
            '<svg VIEWBOX="0 0 720 396"><text x="900" class="annotation">off the edge</text></svg>'
        )
    ), "an uppercase VIEWBOX in source, lowercased by html.parser, was not found by the guard"
    svg_node = [n for n in over_right_start.iter_descendants() if n.tag == "svg"][0]
    assert svg_node.get("viewBox") is None and svg_node.get("viewbox") is not None, (
        "html.parser stopped lowercasing attribute names; the guard reads `viewbox` and "
        "would now find zero SVGs"
    )

    # A class outside the guarded family is not this issue's business (#66).
    other = _parse_html_string(
        '<svg viewBox="0 0 720 396">'
        '<text x="600" class="axis-title">Percent of the labour force</text></svg>'
    )
    assert not annotation_clipping_failures(other), "axis text was swept into #64's scope"
