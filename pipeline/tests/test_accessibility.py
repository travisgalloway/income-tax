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


def test_every_chart_svg_states_a_finding(page):
    path, root = page
    for svg in nodes_of(root, "svg"):
        if "chart" not in svg.classes():
            continue
        label = svg.get("aria-label") or ""
        assert len(label) >= 40, (
            f"{path}: chart svg aria-label is under 40 characters: {label!r}"
        )
        assert re.search(r"\d", label), (
            f"{path}: chart svg aria-label has no digit — it states no finding: {label!r}"
        )
        assert not _SHAPE_WORD_RE.match(label), (
            f"{path}: chart svg aria-label describes its shape, not its finding: {label!r}"
        )
        assert "chart showing" not in label.lower(), (
            f"{path}: chart svg aria-label says 'chart showing', a shape description: {label!r}"
        )


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

BASE_LAYOUT = SRC / "layouts" / "BaseLayout.astro"


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
        # `/` and `/sources` pass no `sections` prop: one section each, no
        # contents list, and the spy returns before observing anything (E6).
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
        selectors for selectors, _ in rules
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


_SCROLL_API_RE = re.compile(r"scrollIntoView|scrollTo\s*\(|scrollBy\s*\(|behavior\s*:")


def test_the_section_spy_introduces_no_scripted_scrolling():
    """What makes "reduced motion is satisfied vacuously" an observation.

    The rail is not a scroll container and the panel is never auto-scrolled, so
    the spy reads scroll position and writes an attribute — it moves nothing.
    The `IntersectionObserver` assertion is what stops this passing by finding
    no script at all.
    """
    text = BASE_LAYOUT.read_text()
    scripts = re.findall(r"<script is:inline>(.*?)</script>", text, re.DOTALL)
    assert len(scripts) == 1, (
        f"{BASE_LAYOUT}: expected exactly one `<script is:inline>` block, "
        f"found {len(scripts)}"
    )
    block = scripts[0]
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
