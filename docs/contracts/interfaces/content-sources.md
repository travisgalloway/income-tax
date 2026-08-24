# Interface: the reference document (`SOURCES.md` → `/sources`) and §12 (`id="limits"`)

The prose/reference boundary. Read this before touching either the `reference` content
collection or the "What this cannot tell you" section — both carry rules that are easy to
regress silently, because a regression here looks identical to a working page until someone
diffs the HTML.

## The `reference` content collection (`src/content.config.ts`)

`SOURCES.md` lives at the repository root, not under `src/content/`, because the pipeline and
`BRIEF.md` both point at that path and a copy under `src/` is a second copy that drifts from the
first. The collection uses `glob({ pattern: 'SOURCES.md', base: '.' })` to render it in place:

```ts
export const collections = {
  reference: defineCollection({ loader: glob({ pattern: 'SOURCES.md', base: '.' }) }),
}
```

Astro's glob loader derives the entry id from the file's slug (`github-slugger`, which
lowercases), so `SOURCES.md` loads as entry id `sources` — `getEntry('reference', 'sources')`.

**Do not import `SOURCES.md` directly with `import { Content } from '../../SOURCES.md'`.** This
was tried and proven to fail on this codebase: `astro check` passes (the trap — it looks fine),
but `npm run build` fails because rolldown cannot resolve a `.md` import outside `src/`. The
content collection above is the only supported route to render a root-level markdown file.

`src/pages/sources.astro` calls `getEntry` and `render`, then throws if the entry is missing:

```ts
const entry = await getEntry('reference', 'sources')
if (!entry) throw new Error('SOURCES.md did not load. /sources renders it in full; refusing to build a stub.')
```

**This throw is deliberate and must not be relaxed to a fallback render.** A silently empty
`/sources` page is indistinguishable from a working one at a glance; failing the build is the
only way a broken collection load gets noticed before it ships.

The rendered markdown supplies its own `<h1 id="sources">` and standfirst paragraph (from
`SOURCES.md`'s own heading and first paragraph), so the page shell must not repeat them with a
hand-written `<h1>` — that produces a duplicate visual heading. The wrapper section uses
`id="reference"`, not `id="sources"`, so it never collides with the markdown's own heading anchor.

## No second copy of `SOURCES.md`

Nothing under `src/` may contain a paraphrase or excerpt of `SOURCES.md`'s content as static
prose. If a page needs to say what a source is, it either links to `/sources` or quotes
`_meta.source` from the relevant dataset (see `budget-data.md`). Two prose copies of the same
source list is how one of them goes stale while the other is edited.

## §12 — "What this cannot tell you" (`id="limits"`, `src/pages/government/index.astro`)

Structural rules, load-bearing per `BRIEF.md`'s "section 11 is not optional and does not get
collapsed behind a disclosure":

- **No `<details>`, no collapsible, no tab, no "read more."** The whole section renders in the
  static HTML with no island and no `client:` directive — it carries no chart, so it needs none.
- **No stem of "classif" appears in the section.** The dataset counts per-party splits from
  Voteview roll-call records (`src/data/party_splits.json`); the old "classified from published
  vote character" language describes a state that no longer exists. See
  `budget-data.md`-adjacent data: `party_splits.json` `_meta` names the four limits that remain
  (hand-picked final-passage roll call, the CARES Act's missing House roll call, the 10%
  cross-party threshold, and party-vs-caucus membership).
- **Limit 5 links to a chart the reader can immediately flip** (currently `#forty-trillion`,
  nominal ↔ % of GDP). If a future section replaces or removes that chart's unit toggle, this
  link's target must move with it or the claim "every dollar chart on this site can be flipped"
  becomes false.
- **Every figure is either drift-checked or curated-locked, never a bare unlabelled number.** The
  crisis-year concentration figures ($7.78T, 32%, $0.61T) and the $24.15T cumulative-deficit
  figure are in `pipeline/curated/prose_figures.yaml` and reported on by
  `pipeline/lib/report.py`. The $26.74T debt-held-by-public rise is **not** recomputable from any
  `src/data/*.json` output — it is a curated constant
  (`pipeline/curated/discrepancies.yaml` → `deficit_vs_debt_gap.use.debt_held_by_public_rise_t`)
  and is locked instead by a prose-quotes-both-figures test
  (`test_limits_section_quotes_the_curated_deficit_debt_gap`). Do not add it to
  `prose_figures.yaml`: the resolver has no output field to resolve it against and would report
  it unresolvable on every run.

## `pipeline/lib/report.py` span filters

`_resolve`'s `years: [a, b]` span construction accepts two optional filters, added for the
concentration figures, which compare four named years against the rest of a span rather than a
contiguous range:

- `only_years: [...]` — keep only rows whose year is in this list.
- `exclude_years: [...]` — drop rows whose year is in this list.

Both apply after the `[a, b]` range is built, and either or both may be present on a figure. Two
new `agg` cases consume the filtered span: `mean_negated` (negated mean, for average non-crisis
borrowing, which is stored as a negative deficit field) and `share_negated_pct` (the filtered
span's negated sum as a percentage of the **full, unfiltered** span's negated sum). If a sibling
branch also touches `_resolve`'s span construction, both filters and both `match` cases must
survive the merge — see the plan's cross-PR conflict register.
