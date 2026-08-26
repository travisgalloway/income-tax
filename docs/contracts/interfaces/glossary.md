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

## In-prose markers — the `<Term>` consumer seam (#47)

`src/components/Term.astro` is the collection's first in-prose consumer. It is the reason `short`
is capped at 180 characters: that text is now **rendered inside a sentence's paragraph**, not only
on `/glossary`, so lengthening the cap widens a popover in three routes' prose.

```astro
<Term id="net-interest">net interest</Term>
```

| Seam | Rule |
|---|---|
| **Id resolution** | `await getEntry('glossary', id)`, never a direct `.md` import — `content-sources.md` records that an import passes `astro check` and fails `npm run build` under rolldown. A `id` naming no entry is a **named build-time throw**, the sixth in the collection's set: a marker left behind by a rename fails the build rather than rendering a dead link. |
| **Display text** | A `<slot>`, never `entry.data.term`. Prose says "net interest" mid-sentence and the entry says "Net interest"; the anchor is filename-derived, so display text is free. This is what keeps "#47 rewords no prose" true — a word is wrapped, the sentence is untouched. |
| **`href`** | `${BASE_URL without trailing slash}/glossary#${id}`, the same `join()` idiom `BaseLayout.astro:14-15` defines, re-derived rather than exported (exporting it would mean a second `---` block there and a re-export surface four call sites could drift from). Both the trigger and the popover's "Full entry" link carry it. `test_every_term_marker_is_a_real_link` asserts the joined form positively; an unbased `/glossary#…` never reaches production. |
| **Popover id** | `def-<slug>`, never the bare slug. `net-interest` is *both* a glossary slug and a Government section id, and a page carrying both would repeat an id. |
| **`short` is load-bearing twice** | It is the `/glossary` entry's opening sentence *and* the popover's whole body, referenced by the trigger's `aria-describedby` — so it is in the accessible description of a link in running prose, with scripting on or off. |
| **Zero islands** | No `client:` directive, no component `<script>`. The disclosure is `termPopovers()`, one `is:inline` IIFE in `BaseLayout.astro` shared by every marked term on the page. |

### One marker per term per page, and which occurrence gets it

**First use is per page, not per site.** A reader arriving directly at `/households` has not read
`/economy`, so `first_used` is *not* the marking list — it is the site-wide first use, a strict
subset. `nominal` is `first_used` on `/economy` and is marked independently on `/households` and
`/government` too.

> On each of the three route pages, for each glossary term, wrap the **first occurrence in
> rendered prose** — text inside `<p class="prose">`, `<p class="standfirst">`, `<h2>` or `<li>` —
> where the term is used *as the term*. Nothing else.

Four exclusions, each for its own reason:

- **`<Figure>` props.** `ariaLabel`, `title`, `source`, `note` and `vintage` are `string` props
  validated at `Figure.astro:37-41`. They cannot carry markup — captions are not merely out of
  scope, they are impossible.
- **Island props.** Same reason.
- **`<p class="finding">`.** The single-sentence assertion restating each figure is deliberately
  terse and number-dense; the marked set belongs in the explanatory prose a reader is reading.
- **Second and subsequent uses**, and an occurrence that is already the text of an `<a>` — an
  anchor cannot nest, so `net interest` on `/economy` (its only occurrence there is the cross-route
  link in §4) is marked on `/government` instead.

`test_no_page_marks_a_term_twice` is the machine-checkable half. Whether a marker sits on the
genuinely *first* occurrence is a reading check, named as such rather than pretended into a test.

### Terms whose `first_used` route carries no marker

`test_every_first_used_route_carries_its_term_marker` ties this collection's data to #47's markup:
a rename, or a new term nobody marked, fails there. Six terms are exceptions, listed explicitly in
that test so growing the list is a visible diff rather than drift, and each is there because the
route's prose does not name the term:

| Term | Why its `first_used` route carries no marker |
|---|---|
| `cyclical-deficit` | The phrase occurs in no route's prose. §5 says "structural rather than circumstantial" and never names the cyclical half. |
| `gdp-deflator` | Occurs in no route's prose; `/households` §1 says "a different deflator" only inside a `<Figure note>`. |
| `gross-debt` | `/government` §1 is entirely about it and never names it; "gross debt" appears only in `<Figure>` props. |
| `incidence` | Occurs only inside `/households` §6's `<Figure note>`. |
| `vintage` | On `/economy` it appears only as the `vintage={vintageOf(…)}` prop. Marked on `/government` §11, where the prose says "vintages". |
| `net-interest` | On `/economy` its only occurrence is already the text of a cross-route `<a>`. Marked on `/government` §6. |

The right fix for the first four is a prose edit that names the term, which is a content change and
not #47's scope. Until then the reader reaches them through `/glossary` and the nav.

## What the four downstream issues attach to

Recorded so none of them needs this design reopened.

**#47 — terms explain themselves in place, on hover and on focus.** Attaches to the `short` field
(already capped at 180, so #47 inherits a fit guarantee rather than discovering a misfit), the
entry id as anchor, and `/glossary#<slug>` as the popover's "full entry" target. **Shipped** — the
wrapper is `src/components/Term.astro` and the behaviour is `termPopovers()` in `BaseLayout.astro`;
see "In-prose markers" above for the seam it actually uses. It is neither `<dfn>` nor `<abbr>`: the
trigger has to be a real `<a href>` so the marker survives scripting off, and `<dfn>` marks the
*defining* instance of a term, which the `/glossary` entry is and a prose mention is not. #47
wraps words and rewords no sentence — #45 makes no prose edits at all.

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
