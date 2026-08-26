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

### The other content collection

`src/content.config.ts` exports two collections. The second, `glossary`, backs `/glossary` and has
its own contract at **`glossary.md`** beside this file — the term shape, the filename-is-the-slug
rule, the five build-time throws, and the `routeSections` map in `src/data/sections.ts`. The two
are documented apart because they share nothing but the config file: `reference` renders one
root-level document through `render()`, `glossary` loads 23 frontmatter-only files and never calls
it. Editing `src/content.config.ts` means reading both.

## No second copy of `SOURCES.md`

Nothing under `src/` may contain a paraphrase or excerpt of `SOURCES.md`'s content as static
prose. If a page needs to say what a source is, it either links to `/sources` or quotes
`_meta.source` from the relevant dataset (see `budget-data.md`). Two prose copies of the same
source list is how one of them goes stale while the other is edited.

## Every cited source is registered, and the build enforces it

**A source named in any published output's `_meta.source` must be findable in `SOURCES.md`.**
`/sources` renders that document in full, so a source that is cited but not registered is one the
reader cannot trace — and until #39 nothing observed it. `check_meta` asserts only that
`_meta.source` is non-empty and is not the summary string `"CBO data"`; nothing related a citation
to the register.

The register lives at **`pipeline/curated/sources.yaml`** and is enforced by
**`check_sources`** in `pipeline/lib/validate.py`, called from `run()` **unconditionally**,
alongside `check_meta` and `check_schema` and never behind an `if "x" in outputs:` gate — a check
skipped because its output was not in the tier reads exactly like a check that passed (#37).

The file has two blocks:

- `registry` — one entry per cited source: `registered_as` (a string that must appear in
  `SOURCES.md`), `cited_as` (one string, or several, that may appear in an `_meta.source`), and
  the optional `cited_in_prose_only: true`.
- `outputs` — one entry per published output: `cites` (register keys) and `source_shape`, that
  output's `_meta.source` vintage-normalized with every citation replaced by its `{key}`.

Four rules, each a named failure:

| | Rule | Catches |
|---|---|---|
| **A** | every declared `cited_as` appears in that output's `_meta.source` | a citation renamed or dropped out from under the register |
| **B** | every `registered_as` appears in `SOURCES.md` | **the #39 defect** — a cited source absent from `/sources` |
| **C** | every register entry is cited by some output, or is `cited_in_prose_only` | an orphan entry left behind by a rename |
| **D** | the recomputed shape equals the stored `source_shape` exactly | a source **added** to `_meta.source` and never registered — the case B cannot see, because the register does not know the new source exists |

Three rules that are not negotiable when editing any of this:

- **The register is curated YAML, never scraped from `SOURCES.md`.** The document uses `**bold**`
  for ordinary emphasis as well as for source lead-ins (`**Rejected.**`, `**This is "give."**`),
  so a scraper would count prose emphasis as a source and report a full register while a real
  source was missing. `registered_as` is matched **into** `SOURCES.md`; `SOURCES.md` is never
  parsed **out of**.
- **Both sides are vintage-normalized by the same function**, `_normalize_source`, which strips
  **dates and only dates**: years, month names, a day-of-month attached to a month name, and the
  `-NN` serial that numbers a Revenue Procedure within its year (`2018-57`). `SOURCES.md` carries
  the same vintages the `_meta.source` strings do, so an ordinary CBO February-2026 →
  February-2027 refresh moves both and must pass. This is loose on purpose, the same balance the
  schema bounds strike (`docs/test-plan.md`, DATA-1): a check that turns every upstream
  republication red is a check that gets disabled.
- **Digits that identify a document are never stripped.** `Table 5` and `Table 23` are different
  tables, `MEHOINUSA672N` and `MEHOINUSA646N` are different FRED series, `PL 115-97` is a specific
  law. Erasing arbitrary numbers would let B match a registered source against some *other*
  table's line in `SOURCES.md`, and let D's shape hold while the cited document changed underneath
  it — the same silent pass this check exists to close. Identifying numbers therefore appear
  verbatim in the stored `source_shape` values.
- **A source that is cited but genuinely never ingested is an explicit named exemption**, not a
  weakened assertion. `rockefeller_bop` carries `cited_in_prose_only: true` because §11 names the
  Rockefeller Institute's balance-of-payments series in body copy and the pipeline ingests
  nothing from it. That exempts it from C and D, **never from B**.

Adding an output without adding its `outputs` entry fails the build.
`test_source_register_covers_every_published_output` asserts both directions against
`src/data/*.json`, so neither an unregistered new output nor an orphan entry left by a rename can
keep the count whole.

**What this register is not (#57).** It makes the register **complete** — every cited source is
in `SOURCES.md`. It does not make it **navigable**. Source *tiers* (primary / derived /
cited-never-ingested) as a reader-facing taxonomy, the format of a `<Figure>`'s "Source:" line,
and anchor links from that line into `/sources` are #57's scope and are deliberately absent here.
`cited_in_prose_only` is a build-gate exemption flag, not a tier: do not read it as one, and do
not grow it into one without #57.

## §12 — "What this cannot tell you" (`id="limits"`, `src/pages/government/index.astro`)

Structural rules, load-bearing per `BRIEF.md`'s "section 11 is not optional and does not get
collapsed behind a disclosure":

- **No `<details>`, no collapsible, no tab, no "read more."** The whole section renders in the
  static HTML with no island and no `client:` directive — it carries no chart, so it needs none.
- **The section carries six numbered limits**, not five. Limits 1–5 keep their numbering:
  `content-sources.md` pins "Limit 5 links to a chart the reader can immediately flip" below, and
  the grep-pinned phrases in `.claude/plans/issue-8.md` and `.claude/plans/issue-11.md` are
  positional, so a new limit is **appended** after limit 5 and before `<h3>Two more worth
  knowing</h3>`, never inserted. The heading's count word and the `<li>` count move together, and
  `sections.md` §12 mirrors both — nothing automated relates the two, so a change to one is a
  change to all three.
- **Limit 6 owns the place-of-payment principle.** Federal tax is recorded against the filer's
  address, federal award spending against the place of performance, and neither base says who
  bore the cost or got the benefit. §11 states the *worked examples* (border employer, military
  base, federal retiree, Medicaid pass-through — the ones that matter to the reader of that
  chart) and links to `#limits` for the principle. Neither is a copy of the other, and neither
  may become one: the general statement lives in §12, the chart-specific cases in §11.
- **No stem of "classif" appears in the section.** The dataset counts per-party splits from
  Voteview roll-call records (`src/data/party_splits.json`); the old "classified from published
  vote character" language describes a state that no longer exists. See
  `budget-data.md`-adjacent data: `party_splits.json` `_meta` names the four limits that remain
  (hand-picked final-passage roll call, the CARES Act's missing House roll call, the 10%
  cross-party threshold, and party-vs-caucus membership).
  **The trap, for anyone writing new copy here.** `test_limits_section_does_not_call_the_votes_classified`
  slices from `id="limits"` to the end of the file and bans the bare stem across all of it, though
  its docstring scopes it to limit 4. The natural wording for limit 6's subject is "the IRS
  **classif**ies collections by the filer's address" — §11's own former phrasing — and it turns
  the build red. Use *records / booked / recorded against*. **Do not narrow the test to make room
  for the copy**: a guard is not weakened to fit new prose.
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
