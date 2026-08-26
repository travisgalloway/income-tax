# Interface: the `glossary` collection and `/glossary`

The site's vocabulary, as data. Read this before touching `src/content/glossary/`,
`src/content.config.ts`'s `glossary` entry, `src/pages/glossary.astro` or `src/data/sections.ts` —
four downstream issues attach to the shapes recorded here, and changing one of them silently
forces those issues to be replanned.

Its sibling is `content-sources.md`, which covers the other content collection (`reference` →
`/sources`).

## The collection

One Markdown file per term under `src/content/glossary/`, loaded by
`glob({ pattern: '*.md', base: './src/content/glossary' })`. Not at the repository root:
`SOURCES.md` lives there because the pipeline and `BRIEF.md` both point at that path, and nothing
points at a glossary term.

```ts
glossary: defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/glossary' }),
  schema: z.object({
    term:       z.string().min(1),
    short:      z.string().min(20).max(180),
    long:       z.string().min(80),
    source:     z.string().min(1),
    see_also:   z.array(z.string()).default([]),
    first_used: z.object({
      route:  z.enum(['/economy', '/households', '/government']),
      anchor: z.string().min(1),
    }),
  }),
})
```

| Field | Rule and why |
|---|---|
| `term` | Display text. Recasing or rewording it must never move an anchor — see the slug rule below. |
| `short` | One sentence. Floored at 20 characters so a stub is a build failure, **capped at 180 so it fits an in-prose popover**. The cap is the schema's job: a definition that will not fit in place is caught now, not discovered later by #47. |
| `long` | The full entry, plain text. |
| `source` | A plain-text citation, printed verbatim. **Not** a URL and not validated as one; a `source` containing a URL is still printed as text, which is how "zero external hyperlinks" stays true. |
| `see_also` | Sibling term **ids** (filename slugs), not display text. Optional, defaults to `[]`. |
| `first_used` | Where a reader first meets the term. The route enum is the three routes that carry a contents list; the anchor is checked against `routeSections` at build time. |

**This is the glossary's equivalent of the pipeline's `check_schema` gate.** The collection is
**not a pipeline output** — nothing emits it, it is hand-authored Markdown, and it has no
`src/data/glossary.json`. So it gets **no `pipeline/schemas/glossary.schema.json`** and **no
`pipeline/curated/sources.yaml` `outputs:` entry**: either would be an orphan and would fail
`test_every_schema_names_a_published_output` /
`test_source_register_covers_every_published_output`, whose populations are `src/data/*.json`. The
Zod schema above is what makes a missing or malformed field a build failure, enforced by
`npx astro check` and `npm run build`.

## The filename is the slug, and that is the durability guarantee

Astro's glob loader derives the entry id from the filename via `github-slugger` — the same
mechanism `content-sources.md` records for `SOURCES.md` → `sources`. So `net-interest.md` → entry
id `net-interest` → `<dt id="net-interest">` → `/glossary#net-interest`.

**Do not derive the slug from `term` at render time.** Retitling a term would then silently break
every anchor emitted by the in-prose popover (#47) and the index (#49), and break it in the way
that is hardest to notice: the page still renders, the link still resolves to the page, and the
reader lands at the top. With the filename as the slug, renaming the display text is free and
moving an anchor is a deliberate `git mv` that shows up in review.

## `long` is a frontmatter field, not the Markdown body

The Markdown body of a term file must be **empty**. Nothing calls `render()` on these entries;
the full entry is the `long` field. Four reasons, recorded so this is not "fixed" later:

1. Zod validates frontmatter only, so a body would be the one part of the entry with no schema.
2. Plain text makes "zero external hyperlinks on this page" structurally true rather than
   grep-true — a Markdown body could grow an `[x](https://…)` at any time.
3. It keeps the entry shape flat and machine-readable, which is what #49 needs to build an index
   and #47 needs to fill a popover without rendering Markdown inside a tooltip.
4. It avoids `render()` and with it the whole `.md`-import / rolldown class of failure that
   `content-sources.md` records.

A non-empty body is a named build failure rather than prose written into a void.

## The build-time throws

`src/pages/sources.astro` throws rather than rendering a stub, and for the reason
`content-sources.md` gives: a silently empty page is indistinguishable from a working one.
`/glossary` follows that precedent with five throws, each carrying its own message. None of them
may be relaxed to a fallback render.

| Throw | Catches |
|---|---|
| Empty collection | `getCollection('glossary')` returned `[]` — a heading over nothing. |
| Markdown body present | Prose written where nothing renders it. |
| Id collision | A term slug equal to a `terms-<letter>` section id or to a layout-owned id (`main`, `toc-heading`, `navbar-toc-heading`, `navbar-panel`, `navbar-disclosure`). `test_no_page_repeats_an_id` is the net; a named throw is the better error. |
| Dangling `see_also` | A `see_also` value that is not a term id, naming both terms. Zod cannot cross-reference sibling entries, so this cannot live in the schema. |
| Bad `first_used` | `routeSections[route]` has no section with that `anchor`, naming the term, the route and the anchor. The `z.enum` already caught a bad *route*; this catches a renamed or invented *section*. |

## `src/data/sections.ts` — one map of route → section anchors

`routeSections` is the single source of truth for which anchors each route has. It exists because
the `first_used` check needs something to check **against**: while each route's section list was a
`const` in that page's frontmatter, "a term pointing at a section the route does not have fails the
build" was not satisfiable at all, and a hand-copied second list would have drifted the first time
a section was renamed — silently, which is the exact failure `first_used` exists to catch.

The three route pages import it and pass their own slice to `BaseLayout`, so the rendered nav and
the build-time check read the same array and cannot disagree.

**`/` and `/sources` are deliberately absent from the map**, and `/glossary` is not in it either.
`/` and `/sources` pass no `sections` prop and carry one section each, as
`docs/contracts/accessibility.md` records; `/glossary` builds its `sections` prop from its own
letter groups. A term whose `first_used.route` is any of the three is a build failure by the
`z.enum`, which is correct — no glossary term's first prose use is on any of them.

## The page

- One `<section id="terms-<letter>">` per initial letter **actually present**, in render order,
  and the `sections` prop is built from the same list — so the contents rail cannot diverge from
  the sections, which is what `test_every_contents_anchor_is_addressable_by_the_spy` asserts
  (`data-section` values equal `main section[id]` exactly, in document order).
- Headings run `h1` → `h2` only. `<dt>`/`<dd>` are not headings, so no `h3` is needed and
  `test_heading_levels_do_not_skip` is satisfied.
- The `id` lives on the `<dt>`. That is the anchor.
- **Zero islands and zero `client:` directives.** Nothing here needs hydration, so #36's
  server-render rule is satisfied vacuously and greppably.
- `see_also` renders as **same-page fragment links** (`href="#gdp-deflator"`). These must **not**
  be base-prefixed. The route itself is reachable only through `BaseLayout`'s `routes` array,
  which runs every href through `join()` and therefore emits `/income-tax/glossary`.
- A letter with no terms produces no section and no contents entry. Anything sorting under a
  non-alphabetic first character groups under `#`; no term needs that today, and the branch exists
  so a future one does not silently vanish.

## Ordering must not depend on the machine's locale

Sort key: `term` lowercased, NFD-normalised with combining marks stripped, non-alphanumerics
dropped. Compared with `<` / `>`, with the entry id as tiebreak. **Never the locale-sensitive
string comparator** — its result depends on the ICU locale the build machine carries and can
differ between a developer's machine and CI, which would make the rendered order a property of the
builder rather than of the data. `src/pages/glossary.astro` says the same thing in a comment that
deliberately avoids writing the comparator's name, because the criterion proving this greps the
file for it.

## Which terms are in, and which are deliberately out

**23 files.** `structural deficit` / `cyclical deficit` is one bullet in #45 and two entries here,
for the same reason `nominal` / `real` is: each is only meaningful against the other, so each needs
its own anchor for a popover to point at.

Three first-pass candidates are **deliberately absent**, each confirmed by grep against the prose:

| Term | Why not |
|---|---|
| `automatic stabilizers` | Zero occurrences in the routes' prose. |
| `labor share` | Zero occurrences. The routes say "labour force", which is a different term. |
| `mean` | Zero occurrences as a standalone contrast to `median`. |

A term is added here when the prose uses it, not in anticipation of prose that might.

## What the four downstream issues attach to

Recorded so none of them needs this design reopened.

**#47 — terms explain themselves in place, on hover and on focus.** Attaches to the `short` field
(already capped at 180, so #47 inherits a fit guarantee rather than discovering a misfit), the
entry id as anchor, and `/glossary#<slug>` as the popover's "full entry" target. #47 supplies the
in-prose `<dfn>`/`<abbr>` wrapper and the hover-plus-focus behaviour, and it is the issue that
makes prose edits — #45 makes none.

**#49 — an index: every term, every section, every figure.** Attaches to
`getCollection('glossary')` for terms, **`routeSections`** for sections, and `<Figure>`'s optional
`id` prop for figures. `routeSections` is precisely the map #49 would otherwise have had to build
by parsing three `.astro` frontmatters.

**#50 — glossary definitions carry the same source discipline as figures.** Attaches to the
`source` field, already required and non-empty, and already carrying a real citation traceable to
`SOURCES.md` in all 23 files — so #50 is a check to write, not 23 files to backfill. Two shape
decisions here mean it needs **no migration**: `source` is `z.string()` and may be widened
additively (to a union, or with sibling `source_key` / `retrieved` fields), and nothing in
`glossary.astro` reads it as anything but text to print. **The gate itself is #50's scope and is
deliberately absent here**: nothing relates a `source` value to `SOURCES.md` the way `check_sources`
does for `_meta.source`.

**#59 — every technical term is defined the first time a reader meets it.** Attaches to
`first_used` and the term list. `getCollection('glossary')` plus `first_used.{route,anchor}` is the
machine-readable list #59's verification needs, and the build-time check guarantees every
`first_used` still points at a section that exists. **What is not here**: nothing asserts the term
is actually *defined or linked* at that point in the prose — only that its target exists.
