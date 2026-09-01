"""`/contents` derives its whole outline, and the derivation is checked against the pages. Issue #49.

The index route lists every route, every section, every numbered figure and every glossary term.
Its contract is that **nothing on it is hand-listed**, see
`docs/contracts/interfaces/contents.md`. That contract has an obvious cheap proof and a real one,
and this file deliberately does not take the cheap one.

The cheap proof is to compare the built page against the declarations it renders from
(`src/data/sections.ts`, `src/data/figures.ts`). That passes whenever the manifest agrees with
itself, which is exactly the failure it is supposed to detect: a manifest that has drifted from
the pages renders an index that looks right and is wrong.

So tests 2, 3, 4 and 5 read **both sides out of `dist/`**. The route's own built HTML supplies the
sections it really renders, in the order it really renders them, and the figure numbers it really
shows; `/contents` is asserted against that. A figure declared in the wrong section, or two
figures inside one section rendered in the opposite order to their declaration, the one case the
manifest's own throws cannot catch, goes red here.

Figure numbers are readable from `dist/` at all only since #49. They were a CSS counter
(`content: 'Figure ' counter(figure)`), absent from the served bytes; the counter is retired and
`.figure-no` carries the number as text.

Standard library only, and the HTML tree comes from `test_accessibility`'s parser rather than a
third copy of one.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from test_accessibility import Node, nodes_of, parse_html

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
CONTENTS = DIST / "contents" / "index.html"
GLOSSARY_DIR = ROOT / "src" / "content" / "glossary"

BASE = "/income-tax"

if not CONTENTS.exists():
    raise RuntimeError(
        f"{CONTENTS} does not exist. Run `npm run build` from the repository root before pytest — "
        "this suite reads the built site, not the source."
    )


# ---------------------------------------------------------------------------
# Reading the built pages
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def contents() -> Node:
    return parse_html(CONTENTS)


@pytest.fixture(scope="module")
def contents_main(contents: Node) -> Node:
    """The page's `<main>`, which is what the link guards below are about.

    Those two guards ask questions about the CONTENTS PAGE's own links, and used
    to ask them of the whole document. That was the same thing until the site
    bar gained a deliberate external link to the source repository. It is not
    the same thing now, and both guards failed on a link they were never about.
    """
    for n in contents.iter_descendants():
        if n.tag == "main":
            return n
    raise AssertionError("/contents renders no <main>")


def _classed(root: Node, cls: str) -> list[Node]:
    """Every descendant carrying `cls`, in document order."""
    return [n for n in root.iter_descendants() if cls in n.classes()]


def _text(n: Node) -> str:
    """All text under `n`, whitespace-collapsed. `.text()` is direct children only."""
    parts: list[str] = []

    def walk(node: Node) -> None:
        for c in node.children:
            if c.tag == "#text":
                parts.append(c.attrs.get("__text__", "") or "")
            else:
                walk(c)

    walk(n)
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def _page_for(href: str) -> Path:
    """The built page a rail href points at. `/income-tax/economy` -> dist/economy/index.html."""
    rel = href[len(BASE) :].strip("/")
    return DIST / rel / "index.html" if rel else DIST / "index.html"


def _route_blocks(contents: Node) -> list[Node]:
    """The `<section id="contents-…">` blocks, minus the terms block, in document order."""
    return [
        n
        for n in contents.iter_descendants()
        if n.tag == "section"
        and (n.get("id") or "").startswith("contents-")
        and n.get("id") != "contents-terms"
    ]


def _block_route_href(block: Node) -> str:
    """The route a block heads, from its own `<h2><a>`."""
    for h2 in block.iter_descendants():
        if h2.tag == "h2":
            for a in h2.iter_descendants():
                if a.tag == "a":
                    return a.get("href") or ""
    raise AssertionError(f"contents block {block.get('id')!r} has no <h2><a href>")


def _route_link_hrefs(root: Node) -> list[str]:
    """The site bar's route links, in order.

    Read from `nav.navbar-routes-wide`, which replaced the left rail's
    `<ol class="route-links">`. The rail is now a right-hand contents aside and
    carries section anchors only, so the site's route list lives in the bar and
    nowhere else.
    """
    for nav in root.iter_descendants():
        if nav.tag == "nav" and "navbar-routes-wide" in nav.classes():
            return [a.get("href") or "" for a in nav.iter_descendants() if a.tag == "a"]
    raise AssertionError("no <nav class='navbar-routes-wide'> on the page")


def _site_title_href(root: Node) -> str:
    """The wordmark's destination, `a.navbar-title`.

    The front door is the one destination the bar does not name in its route list. It is reached
    from the wordmark instead, so the bar names each page once. Read from the built page rather
    than written as `/income-tax`, so this stays the pairing of two rendered things that the rest
    of this module is.
    """
    for a in root.iter_descendants():
        if a.tag == "a" and "navbar-title" in a.classes():
            return a.get("href") or ""
    raise AssertionError("no <a class='navbar-title'> on the page")


def _rendered_section_ids(page: Path) -> list[str]:
    """`main section[id]` on a built page, in document order, what the route really renders."""
    root = parse_html(page)
    main = next((n for n in root.iter_descendants() if n.tag == "main"), None)
    assert main is not None, f"{page}: no <main>"
    return [
        n.get("id") or ""
        for n in main.iter_descendants()
        if n.tag == "section" and n.get("id")
    ]


def _rendered_figures(page: Path) -> list[tuple[int, str, str]]:
    """`(n, title, enclosing section id)` per figure on a built page, in document order."""
    root = parse_html(page)
    out: list[tuple[int, str, str]] = []
    for fig in nodes_of(root, "figure"):
        if "figure" not in fig.classes():
            continue
        no = next((d for d in fig.iter_descendants() if "figure-no" in d.classes()), None)
        title = next((d for d in fig.iter_descendants() if "figure-title" in d.classes()), None)
        assert no is not None, f"{page}: a figure renders no .figure-no — the number is not in the served HTML"
        assert title is not None, f"{page}: a figure renders no .figure-title"
        m = re.fullmatch(r"Figure (\d+)", _text(no))
        assert m, f"{page}: .figure-no reads {_text(no)!r}, not 'Figure <n>'"
        section_id = ""
        for a in fig.ancestors():
            if a.tag == "section" and a.get("id"):
                section_id = a.get("id") or ""
                break
        out.append((int(m.group(1)), _text(title), section_id))
    return out


def _index_figures(block: Node) -> list[tuple[str, str, str]]:
    """`(figure-no text, title, enclosing index-section anchor)` per figure listed in a block."""
    out: list[tuple[str, str, str]] = []
    for p in _classed(block, "index-figure"):
        no = next((d for d in p.iter_descendants() if "index-figure-no" in d.classes()), None)
        title = next((d for d in p.iter_descendants() if "index-figure-title" in d.classes()), None)
        assert no is not None and title is not None, "an .index-figure is missing its number or title"
        li = next((a for a in p.ancestors() if "index-section" in a.classes()), None)
        assert li is not None, "an .index-figure sits outside any .index-section"
        anchor = next((a.get("href") or "" for a in li.iter_descendants() if a.tag == "a"), "")
        out.append((_text(no), _text(title), anchor.partition("#")[2]))
    return out


# ---------------------------------------------------------------------------
# 1. Routes
# ---------------------------------------------------------------------------


def test_contents_lists_every_route_the_site_bar_names(contents):
    """Exactly the site bar's destinations, minus the index you are standing on.

    `/contents` does not list itself: an index inside the index has a self-referential section
    list. The bar still names it, which is how a reader gets here.

    Renamed from `test_contents_lists_every_route_the_rail_names`. The pairing is the same claim
    against the same `siteRoutes` array; what moved is where the routes are rendered. The left
    rail carried them until the redesign replaced it with a sticky site bar and a right-hand
    contents aside.

    THE FRONT DOOR IS THE ONE DESTINATION THE ROUTE LIST DOES NOT NAME. The bar reaches it from
    the wordmark, so `siteRoutes` omits it and `/contents` prepends `introRoute` instead. This
    used to compare the blocks against the route list alone, which would now demand that the index
    omit a page the site serves. An index that omits a page is wrong, so the expectation carries
    the wordmark's own href at the head of the list and both sides are still read from `dist/`.
    """
    routes = _route_link_hrefs(contents)
    front_door = _site_title_href(contents)
    listed = [_block_route_href(b) for b in _route_blocks(contents)]
    expected = [front_door] + [h for h in routes if h.rstrip("/") != f"{BASE}/contents"]

    assert listed == expected, (
        f"/contents lists {listed} but the site bar names {routes} plus the front door at "
        f"{front_door}. The page derives its blocks from `introRoute` and `siteRoutes`; if these "
        "disagree, something on the page is hand-listed."
    )
    assert f"{BASE}/contents" in [h.rstrip("/") for h in routes], (
        "/contents is not in the site bar. The page exists but nothing navigates to it."
    )
    assert front_door not in routes, (
        f"the bar's route list names {front_door}, which the wordmark already links. The front "
        "door is supposed to be reachable from one place in the bar, not two."
    )


# ---------------------------------------------------------------------------
# 2. Sections
# ---------------------------------------------------------------------------


def test_contents_lists_every_section_of_every_route(contents):
    """Per route block, the listed anchors equal that route's *built* sections, in order.

    Both sides come out of `dist/`, so this cannot be satisfied by `sections.ts` agreeing with
    itself.
    """
    for block in _route_blocks(contents):
        href = _block_route_href(block)
        page = _page_for(href)
        assert page.exists(), f"/contents links to {href}, which built no page at {page}"

        listed = []
        for li in _classed(block, "index-section"):
            a = next((d for d in li.iter_descendants() if d.tag == "a"), None)
            assert a is not None, f"{block.get('id')}: an .index-section carries no link"
            link = a.get("href") or ""
            assert link.startswith(f"{href}#"), (
                f"{block.get('id')}: section link {link!r} does not point into {href}"
            )
            listed.append(link.partition("#")[2])

        rendered = _rendered_section_ids(page)
        # /sources and /glossary declare no sections in `siteRoutes` and list none here; their
        # structure is documented in docs/contracts/accessibility.md and, for the glossary, is its
        # terms, which get their own block below.
        if not listed:
            continue
        assert listed == rendered, (
            f"{block.get('id')}: /contents lists {listed} for {href}, but the built page renders "
            f"{rendered}. The two read the same array, so a mismatch means one of them is a copy."
        )


# ---------------------------------------------------------------------------
# 3 and 4. Figures
# ---------------------------------------------------------------------------


def test_contents_lists_every_figure_in_route_document_order(contents):
    """Numbers are 1..N ascending in built document order, and /contents names each one.

    This is the guarantee the CSS counter used to give for free, and the reason retiring it is
    safe. It is also the only check on the one case the manifest's throws cannot express: two
    figures inside a single section rendered in the opposite order to their declaration.
    """
    for block in _route_blocks(contents):
        href = _block_route_href(block)
        rendered = _rendered_figures(_page_for(href))
        label = _text(next(h for h in block.iter_descendants() if h.tag == "h2"))
        indexed = _index_figures(block)

        assert [n for n, _, _ in rendered] == list(range(1, len(rendered) + 1)), (
            f"{href}: figure numbers in document order are {[n for n, _, _ in rendered]}, not "
            f"1..{len(rendered)} ascending. A figure is declared out of the order it renders in — "
            "see src/data/figures.ts."
        )
        assert len(indexed) == len(rendered), (
            f"{block.get('id')}: /contents lists {len(indexed)} figures for {href}; the built page "
            f"renders {len(rendered)}."
        )
        for (n, title, _), (index_no, index_title, _) in zip(rendered, indexed):
            assert index_no == f"{label}, Figure {n}.", (
                f"{block.get('id')}: /contents names a figure {index_no!r}; the route renders it as "
                f"Figure {n}. Every number on the index is qualified by route label because "
                "numbering restarts per route."
            )
            assert index_title == title, (
                f"{block.get('id')}: /contents titles Figure {n} {index_title!r}; the route renders "
                f"{title!r}."
            )


def test_contents_figure_sections_match_the_built_placement(contents):
    """A figure listed under section S is inside `<section id="S">` on its route's built page."""
    for block in _route_blocks(contents):
        href = _block_route_href(block)
        rendered = _rendered_figures(_page_for(href))
        indexed = _index_figures(block)
        for (n, title, real_section), (_, _, listed_section) in zip(rendered, indexed):
            assert listed_section == real_section, (
                f"{block.get('id')}: /contents lists {title!r} (Figure {n}) under "
                f"{listed_section!r}, but the route renders it inside {real_section!r}."
            )


# ---------------------------------------------------------------------------
# 5. Terms
# ---------------------------------------------------------------------------


def _frontmatter(path: Path) -> dict[str, str]:
    """The flat scalar keys plus `first_used.route` / `.anchor`. No YAML dependency."""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    assert m, f"{path}: no frontmatter block"
    out: dict[str, str] = {}
    prefix = ""
    for line in m.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        key, sep, value = line.strip().partition(":")
        if not sep:
            continue
        value = value.strip().strip("'\"")
        if indent == 0:
            prefix = "" if value else f"{key}."
            if value:
                out[key] = value
        else:
            out[f"{prefix}{key}"] = value
    return out


def test_contents_lists_every_glossary_term(contents):
    """One entry per term file, each carrying its /glossary anchor and its declared first use."""
    files = sorted(GLOSSARY_DIR.glob("*.md"))
    assert files, f"no glossary term files under {GLOSSARY_DIR}"

    items = _classed(contents, "index-term")
    assert len(items) == len(files), (
        f"/contents lists {len(items)} terms; {GLOSSARY_DIR} holds {len(files)} files. The page "
        "reads the collection, so a mismatch means the page is not deriving them."
    )

    hrefs = {a.get("href") or "" for item in items for a in item.iter_descendants() if a.tag == "a"}
    for path in files:
        fm = _frontmatter(path)
        anchor = f"{BASE}/glossary#{path.stem}"
        assert anchor in hrefs, f"/contents carries no link to {anchor} for {path.name}"
        first_used = f"{BASE}{fm['first_used.route']}#{fm['first_used.anchor']}"
        assert first_used in hrefs, (
            f"/contents carries no first-used link {first_used} for {path.name}"
        )


# ---------------------------------------------------------------------------
# 6 and 7. The page's own contracts
# ---------------------------------------------------------------------------


def test_contents_links_are_base_path_joined(contents_main):
    """Every href in the page's own content is base-prefixed or a fragment.

    An unbased href works in `astro dev` and 404s in production, how #70 shipped. A page whose
    every link is derived is where a second join idiom would do the most damage, so there is one,
    in `src/data/sections.ts`.

    Scoped to `<main>`. The site bar carries one deliberate absolute link, to the
    source repository, and it is chrome rather than an index entry.
    """
    for a in contents_main.iter_descendants():
        if a.tag != "a":
            continue
        href = a.get("href") or ""
        # `/income-tax`, and `/income-tax#section`, are the front door: `join('/')` emits no
        # trailing slash, site-wide, and the rail's own first link carries the same string.
        assert (
            href.startswith(f"{BASE}/") or href == BASE or href.startswith(f"{BASE}#")
            or href.startswith("#")
        ), (
            f"/contents has href {href!r}, which is neither base-path joined nor a fragment"
        )


def test_contents_carries_no_term_marker(contents):
    """Zero `.term` wrappers, joining `/`, `/sources` and `/glossary` on that contract.

    The index links to `/glossary` anchors directly and never through `Term.astro`: a popover
    offering the definition of a term whose definition is the next line is noise, and the shared
    marker IIFE returns on its first line here.
    """
    markers = [n for n in contents.iter_descendants() if any(c.startswith("term") for c in n.classes())]
    assert not markers, (
        f"/contents carries {len(markers)} in-prose term marker(s); the contract is zero — "
        "see docs/contracts/interfaces/glossary.md."
    )


def test_contents_has_no_external_hyperlink(contents_main):
    """Sources render as plain text, as they do inside the figure apparatus itself.

    Scoped to `<main>`, because the site bar links to the source repository on
    every page. That link is navigation chrome, and this guard is about how the
    index renders a source.
    """
    external = [
        a.get("href")
        for a in contents_main.iter_descendants()
        if a.tag == "a" and (a.get("href") or "").startswith("http")
    ]
    assert not external, f"/contents carries external hyperlinks: {external}"
