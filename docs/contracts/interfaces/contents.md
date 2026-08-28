# Interface: `/contents`, and what the site derives its outline from

The index route (`src/pages/contents.astro`, #49) and the three declarations it reads. Read this
before adding a route, a section or a figure. Each of those changes this page, and the contract
is that **none of them requires editing it**.

## The rule

**Nothing on `/contents` is hand-listed.** Every route name, section label, figure number, figure
title, source line and term on the page is read from a declaration that something else also
renders from. There is no list on the page that a person keeps up to date, because a list only
this page read would drift the first time something was added, and it would drift silently,
because the page would still look right.

Four derivations, and the second consumer of each:

| What | Declared in | Also rendered from it by |
|---|---|---|
| Routes and their labels | `siteRoutes` in `src/data/sections.ts` | `BaseLayout`'s rail and narrow-viewport navbar |
| Section anchors | `routeSections` / `introSections` in the same module | each route page's own `sections` prop; `/glossary`'s `first_used` check |
| Figure number, title, source | `src/data/figures.ts` | the `<Figure>` call sites themselves |
| Terms | the `glossary` content collection | `/glossary` |

## `src/data/sections.ts`

Three exports #49 added to the section map:

- **`join(path)`** is the base-path join, moved verbatim out of `BaseLayout.astro`, and it is the
  one implementation on the site. The site is served from `/income-tax/`, and an href that skips
  the base works in `astro dev` and 404s in production, which is how #70 shipped. Every internal
  href goes through it.
- **`introSections`** holds `/`'s four sections, lifted out of `src/pages/index.astro`'s
  frontmatter. It is still deliberately *not* an entry in `routeSections`, whose keys are the
  domain of `ContentRoute` and therefore of a glossary term's `first_used.route`. See that module's
  header.
- **`siteRoutes`** holds seven `{ path, label, sections }` entries in rail order: `/`, the three
  routes, then `/contents`, `/sources`, `/glossary`. `/sources` and `/glossary` declare
  `sections: []` because neither passes a `sections` prop. `/glossary`'s real structure is its
  terms, which `/contents` enumerates term by term rather than re-deriving as letter groups.

`BaseLayout` builds its `routes` as `siteRoutes.map((r) => ({ href: join(r.path), label: r.label }))`.
The rail and the navbar read that same array, so **a route added to `siteRoutes` appears in both
and on `/contents`, with no other edit**.

`src/data/glossary-sort.ts` holds `sortKey`, lifted out of `glossary.astro` for the same reason:
`/contents` lists the same terms and must list them in the same order, and a page module cannot be
imported. The key is locale-independent by construction, because it is a normalised ASCII key
compared with `<` and `>`, and never the locale-sensitive comparator, whose result depends on the
ICU locale of the build machine.

## What the page renders

One `<section id="contents-{slug}">` per entry in `siteRoutes`, **except `/contents` itself**,
because listing the index inside the index would make its own section list self-referential. The
rail still names it, which is how a reader gets here.
`test_contents_lists_every_route_the_rail_names` pins the set as exactly
`rail routes minus {/contents}`.

Inside each block, an `<ol class="index-sections">` of that route's sections, each `<li
class="index-section">` linking `{join(route)}#{id}`, with the figures declared in that section
listed beneath it as `<p class="index-figure">`:

- `.index-figure-no` carries `"{Route label}, Figure {n}."` Numbering restarts per route, because
  the retired counter was reset on `main`, so **every number on this page is qualified by route
  label**, and a bare "Figure 1" appears nowhere.
- `.index-figure-title` carries the manifest's `title`.
- `.index-source` carries the manifest's `sourceLine`, as **plain text**. There are zero external
  hyperlinks on this page, as there are on every page of this site.

Then comes `<section id="contents-terms">`, holding all 23 terms in `/glossary`'s own order, each
linking to `{join('/glossary')}#{id}` and to its `first_used` anchor, labelled
`"{Route label}, {Section label}"`. Both halves of that label are looked up from `siteRoutes` and
never typed. Both anchors are already build-gated by `glossary.astro`'s `first_used` check, so a
dangling one fails the build before this page can render it, and `/contents` throws its own named
error if a lookup nonetheless misses.

The page's own `sections` prop is built from the same loop it renders, so the rail's contents list
and the page cannot disagree.

**Zero term markers.** `/contents` links to `/glossary` anchors directly and never through
`Term.astro`, joining `/`, `/sources` and `/glossary` on that contract
(`docs/contracts/interfaces/glossary.md`). Pinned by `test_contents_carries_no_term_marker`.

**No hydration.** The page is static Astro, with no island and no chart, so #36's server-render
rule is satisfied vacuously. The directive's name is deliberately absent from the source file,
because the criterion that proves this greps for it.

## Adding things

| You add | You edit | `/contents` |
|---|---|---|
| a section | `routeSections` (or `introSections`) | lists it, no edit |
| a route | `siteRoutes`, plus the page | lists it, no edit; the rail and navbar carry it too |
| a figure | `src/data/figures.ts`, plus the call site | lists it and renumbers, no edit |
| a term | a file in `src/content/glossary/` | lists it, no edit |

Two things prove the table stays true. The staleness run in `.claude/plans/issue-49.md`
§ Verification adds a throwaway section, builds, and confirms it appears on `/contents` with zero
edits to `contents.astro`. Unattended, `pipeline/tests/test_contents_index.py` reads **both** sides
of its section, figure and term assertions out of `dist/`, so neither can be satisfied by a
declaration agreeing with itself.
