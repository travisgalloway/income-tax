# Interface: the chart layer (`src/components/charts/`, `src/components/islands/`)

The internal boundary every chart section builds against. Read this before adding a new section
island — it exists so each section reuses the same primitives rather than re-inlining equivalents.

## `Figure.astro` (`src/components/Figure.astro`)

The apparatus wrapper: numbered head, a `<slot />` for the chart, then a Source/Note/Units
figcaption. Four props are **required and throw at build time** if omitted or empty
(`BRIEF.md` rules 1–2 made structural):

| Prop | Contract |
|---|---|
| `ariaLabel` | The finding, as a sentence — not a description of the chart's shape. Rendered as the `<figure>`'s own `aria-label`, so the figure carries an accessible name distinct from "figure"; the inner `<svg>` carries the same sentence as its own label. |
| `fig` | The figure's entry in the manifest (below), obtained as `figuresOf('/route')('key')`. Carries the number, the italic title and the composed source line. A missing or malformed entry throws. |
| `xUnit` / `yUnit` | Unit label for each axis. No bare-number axis is permitted. |

Optional: `note` (scope/method caveats; this is where a gross-vs-net or coverage-boundary warning
belongs, never in a tooltip) and `id`.

`ariaLabel`, `xUnit`, `yUnit` and `note` stay at the call site: they belong beside the chart and no
consumer outside the page reads them.

## The figure manifest (`src/data/figures.ts`)

**Where a figure's number, title and source live** (#49). Declared per route, in the order the
route renders them:

```ts
{ key: string; section: string; title: string; source: string; vintage?: string | null }
```

`routeFigures[route]` adds `route`, `n` (the array index + 1) and `sourceLine` (`sourceLineOf`,
which appends the vintage as its own sentence rather than splicing it into the verbatim source).
`figure(route, key)` / `figuresOf(route)` look one up and **throw** on an unknown key.

Two consumers, and that is the point: the page renders each figure *from* the entry, and
`/contents` lists *the same* entry. A manifest only the index read would be a hand-maintained
second list that drifts the first time a figure is added.

`source` is written as the same expression the call site used (`debt._meta.source`,
`vintageOf(economy._meta)`, `curatedVintage(debtHolders._meta, …)`), so "rendered verbatim" holds
by construction and `assertDataset` still stands behind it. This is also why the manifest is not
derived by parsing the `.astro` call sites: `source` is an expression, not a literal, and a parser
would recover `{debt._meta.source}` rather than the sentence a reader must see.

Four throws at module load:

1. a duplicate `key` within a route;
2. a `section` that is not an id in `routeSections[route]`;
3. a declared order whose section indices are not non-decreasing — the manifest may not claim a
   figure order that contradicts the order the route renders its sections in;
4. an empty `title` or `source`.

**Numbering.** `n` is the array index + 1, so a duplicated or skipped number is not expressible,
and numbers restart per route — which is why `/contents` qualifies every one by route label
(`Government, Figure 13.`). The number is rendered as real text in `.figure-no`; it was a CSS
counter (`counter(figure)` on `.figure-head::before`) until #49, which meant it existed only in
the rendered layout and no other page could read it.

**Moving a figure between sections** means changing its `section` *and* moving its declaration to
the matching position in the array. Change one without the other and throw 3 fires at build time.
Change both and every downstream number shifts automatically, on the route and on `/contents`
alike, because both read `n` from the same array. The one thing not prevented structurally is two
figures *within one section* rendered in the opposite order to their declaration; that is caught by
`test_contents_lists_every_figure_in_route_document_order`, which reads the built HTML.

## `Chart` (`src/components/charts/Chart.tsx`)

The SVG primitive. `ariaLabel` is required (the finding, again). `interactive` switches the SVG's
`role` between `img` (static) and `group`: assistive tech treats a `role="img"` subtree as
presentational, so **any chart with Tab-focusable data points must pass `interactive`** or its
focusable children go unannounced. `width` / `height` / `margin` come from `useChartSize`;
`children` is a render-prop receiving the computed `Frame`.

## `Axis.tsx`

`AxisLeft` / `AxisBottom` both require a `label` prop (the unit) — there is no bare-axis escape
hatch. `ZeroLine` draws the emphasised zero line so a value crossing zero (e.g. a deficit/surplus
band) is legible by position, not only by which side of a colour boundary it falls on.

## `TableView` (`src/components/islands/TableView.tsx`)

The "View as table" disclosure every figure carries. A native `<details>`/`<summary>` element, not
a Radix `Collapsible` — the table, its `<caption>`, and its `th scope="col"`/`scope="row"` cells are
present in the server-rendered HTML whether or not scripting runs, and the open/close label swaps
via `.tableview[open] .tv-open`/`.tv-close` CSS rather than component state. Each `Column` requires
a `unit` — there is no unitless column. Cell values are read as `row[key] ?? 'no data'`, so a
consumer that wants "no data" instead of "0" for a genuinely absent value must pass `null`, not `0`
or `''`.

## `UnitToggle` (`src/components/islands/UnitToggle.tsx`) + `charts/format.ts`

The nominal/real/%-of-GDP toggle and its vocabulary:

- `Unit = 'nominal' | 'real' | 'gdp'`, `UNIT_LABEL` (axis-title text per unit), `UNIT_PREFIX`
  (`n_` / `r_` / `g_`, the field-family prefix a dataset carries per unit).
- `trillions`, `percentGdp`, `percent`, `dollars` — full-value formatters for tables, tooltips and
  screen-reader text.
- `trillionsLong(v, digits = 2)` — `$19.57 trillion`, the magnitude spelled out. Use it wherever the
  text is read aloud (`aria-label`s, the `aria-live` readout, on-chart annotations at wide
  viewports); `trillions`' `T` suffix is announced as a bare letter, which is not a unit a listener
  can act on. Sighted-only surfaces keep the compact form.
- `tick(v, unit)` — compact axis-tick text, always unit-bearing. **Exactly zero renders `$0`, not
  `$0B`**: zero has no magnitude, so it takes no magnitude suffix, and `niceExtent` puts an
  exact-zero tick on every non-negative axis on the site.
- `value(v, unit)` — the standard "full value or `'no data'` if `v == null`" formatter for
  table/inspector text.
- `fiscalYear(y)` — `FY{y}`.

`UnitToggle`'s props are `{ value, onChange, label = 'Units', units? }`. `units` narrows the group
to a subset of `Unit` for a series with no denominator for every unit — `units={['nominal', 'gdp']}`
on §1's debt, which has no real-dollar series. Order always comes from the module's own `OPTIONS`,
never from the caller, so a unit sits in the same place in every group on the page. The component is
generic in its unit union (`UnitToggle<U extends Unit>`), so a narrowed caller's `onChange` stays
typed to its own union instead of widening back to `Unit` and needing a cast.

Every unit-toggled chart on the site reads its toggle and its number text from this module; a
section that re-derives an equivalent formatter inline is a defect, not a local style. The one
sanctioned bare-number surface is a `TableView` cell, whose unit is carried by the column header.

## `useChartSize` (`src/components/charts/useChartSize.ts`)

Container-aware viewBox sizing: `WIDE` (720×396) above the 560px breakpoint, `NARROW` (360×316)
below it. Returns `WIDE` before the first client measurement so SSR and desktop agree. A chart
should read its own `narrow` flag from the returned size (`width < 500` or similar), not
re-implement a second breakpoint.

## `Select` (`src/components/islands/Select.tsx`)

The Radix `Select` wrapper for filter controls, the multi-option analogue of `UnitToggle`'s
two/three-option `ToggleGroup`. Props: `{ id, label, value, options: {value,label}[], onChange }`.
The visible `<span class="controls-label" id={id}>` is wired to the trigger via `aria-labelledby`,
not a `<label>` element — Radix's trigger renders a `<button>`, not a form control, so a `<label>`
would target nothing. `position="popper"` keeps the listbox beside the trigger rather than over it.
Fully keyboard operable: Tab to the trigger, Enter/Space/Down to open, arrows to move, Enter to
choose. Introduced for `LawExplorer.tsx`'s three filters (vote character, signing president,
control at enactment); reuse it for any later section needing more than a couple of mutually
exclusive options.

## Section-island shape

Every built section island (`DebtChart.tsx`, `BudgetChart.tsx`, `StructuralGap.tsx`,
`VotedAndNot.tsx`, `NetInterest.tsx`, `LawExplorer.tsx`, `DebtHolders.tsx`, `DebtMaturity.tsx`,
`RevenueChart.tsx`, `OecdChart.tsx`, `MedianIncome.tsx`, `HouseholdSpread.tsx`, `WhoPays.tsx`,
`Top1TaxShare.tsx`, `PayrollBill.tsx`, `PricesAndRates.tsx`, `LaborAndCapital.tsx`)
follows the same skeleton:

1. `useChartSize()` for sizing, `useState` for the active unit/view and the focused/hovered datum.
2. A `useMemo` deriving the per-row values for the active unit.
3. `<Chart interactive ariaLabel={...}>` wrapping axes, drawn series, and one focusable element per
   datum (`tabIndex={0}`, `role="img"`, `onFocus`/`onBlur`/`onMouseEnter`/`onMouseLeave` all setting
   the same focus state) — never `role="button"`, because focusing a datum reveals a value, it does
   not activate anything.
4. A `<p aria-live="polite" className="readout">` (or an `.inspector` panel for a richer, multi-line
   readout) built from the **same formatting function** the `aria-label` uses, so hover and
   keyboard focus can never announce different text.
5. A `<TableView>` mirroring the chart's active unit and columns.

**Every island server-renders its whole `<svg>`.** The skeleton above must produce its chart in the
build output, not on mount: with scripting off a reader still gets the SVG, both axis labels, the
tick text, the figcaption apparatus and the table. Two things are therefore forbidden — mounting an
island `client:only` (which emits an empty `<astro-island>` and no chart at all), and gating any
part of the render on having measured the client, which is why `useChartSize` returns the `WIDE`
preset *before* measurement rather than `null`. `client:visible` and `client:load` both server-render
and differ only in when hydration fires, so either is fine.
`pipeline/tests/test_accessibility.py::test_every_figure_server_renders_its_chart_svg` holds this for
every `<figure class="figure">` on every built page; `test_government_section_1_renders_its_whole_apparatus_without_scripting`
holds the fuller enumeration for `DebtChart`.

`LawExplorer.tsx` extends this skeleton with a second focusable set beyond the chart's own
per-fiscal-year data points: each table row's law-name `<button aria-pressed>` (real button
semantics, since selecting a law is an action, unlike hovering a datum) also drives the same
`readout`/`aria-label` text via `lawReadout`, so a law selected from the table and a fiscal year
focused on the chart share one live region rather than two independent ones.

## Government §11 additions

Two new primitives for the by-state section (issue #14), neither a variant of an existing one:

### The tile-grid cartogram (`src/components/charts/stateGrid.ts`, `StateGiveGet.tsx`)

Not a geographic choropleth: this repo carries `d3-scale`/`d3-shape` but no projection library
(`topojson-client` + `us-atlas`), and a real map's geographic area is not population anyway — it
would make Wyoming shout and Rhode Island vanish. `stateGrid.ts` exports `TILES` (a `{row, col}`
per postal code, 51 entries — the 50 states plus DC, no territory), `GRID_COLS`/`GRID_ROWS` (11×8),
and `divergingFill(v, bound)`, a pure amber↔stone↔teal interpolation with **no party-colour token
referenced anywhere in the module**. `Chart.tsx` is deliberately not reused here: it paints an x/y
plot area and margin frame for a cartesian chart, which a tile grid has no use for. The SVG uses a
fixed `viewBox="0 0 440 320"` (not `useChartSize`) because a tile grid has no meaningful "narrow"
relayout the way an axis chart does; `preserveAspectRatio="xMidYMid meet"` plus `width="100%"` makes
it container-responsive without one.

Each tile is `role="img"` with its own `aria-label` (never `role="button"` — focusing a tile reveals
a value, it does not activate anything), and the outer `<svg>` is `role="group"` per the same rule
`Chart.tsx` documents: a subtree with focusable children must not be `role="img"`.

### The sortable table (`StateGiveGet.tsx`)

`TableView` is not used for the by-state map's non-visual equivalent, because every `TableView`
disclosure starts **closed**: the markup is present either way (it is a native `<details>`, see
above), but a reader meets a collapsed summary, not a table. A table that must be opened before it
can be read is not an acceptable *primary* non-visual equivalent for a figure whose only other
presentation is a map. The by-state
section instead renders a **plain, always-visible** `<table className="sortable-table">`, with
`<th scope="col">` sort buttons (`.sort-button`) toggling `aria-sort` and click-to-resort — reusing
`.tableview-scroll` for the horizontal-scroll wrapper, since that concern is identical. `TableView`
itself is still reused as-is for the tax-mix figure (`StateTaxMix.tsx`), which needs no sort and
whose collapsed-by-default behaviour is acceptable there because it is a supplementary detail
table, not the chart's only non-visual path.

**On a narrow viewport the table keeps all five columns, and identification is carried by a pinned
row header rather than by a reduced column set (#63).** The reason is the one directly above,
applied one layer down: this table is the cartogram's *primary* non-visual equivalent, chosen over
`TableView` precisely because a reader must not have to open anything to reach it. Dropping columns
below a breakpoint reintroduces exactly that — data behind a gesture — and a screen-reader user on a
390px phone would lose them from the accessibility tree as well. So the strategy is **scroll, with
the name kept on screen**, in three declarations in `global.css`:

- `.sortable-table th[scope='row']` and `.sortable-table thead th:first-child` are `position:
  sticky; left: 0` with `background: var(--ground)` — the page background token, because the cells
  that scroll underneath sit on the page background, and because a sticky cell without an opaque
  background of its own is the same as no sticky cell. `z-index: 1` is on both and no stacking
  context is introduced on `.tableview-scroll`.
- `.sortable-table caption` is `position: sticky; left: 0; width: 100cqi`. A `<caption>`'s box is
  the *table's* width, so `max-width: 100%` would resolve against the overflowing table — the bug
  itself — and `100vw` would overshoot the wrapper by the page's own margins. `100cqi` is the
  wrapper's own inline size, which is why `.tableview-scroll` carries `container-type: inline-size`.
  That declaration is site-wide and inert for the tables that do not query it.
- Inside `@media (max-width: 30rem)`, `.sortable-table thead th` and `.sortable-table
  th[scope='row']` drop to `white-space: normal`. Header labels and jurisdiction names are words and
  may wrap; the data cells keep `nowrap`, because a broken number is a misread number. This is a
  reduction of the distance to scroll, not a substitute for the pinned column — the two ship
  together.

Everything in that list is scoped to `.sortable-table`, which is §11's alone, except
`container-type` on the shared wrapper. Nothing here is scripted, so it holds with JavaScript off.
The measured before/after at 390×844 is in `contracts/accessibility.md` § "Government §11's
by-state table at 390px (#63)". The **at-rest affordance** that a wide table scrolls at all — fade,
shadow, persistent scrollbar or text hint, on `.tableview-scroll` and `.law-table-scroll` alike — is
**#76**, deliberately not part of the above; keyboard operability of those wrappers is **#71**.

`StatesTaxMix`'s `not_levied` vs `null`-alone distinction (`docs/contracts/interfaces/state-data.md`)
renders as `"none levied"` vs `"no data"` — the same two words a reader needs to tell "this state
doesn't have this tax" from "we don't have this figure" apart, and the page's closing `<p
class="prose">` states the `"none levied"` convention in body copy so it does not depend on a
reader opening the (collapsed-by-default) table to learn it.

## `YearRange` (`src/components/islands/YearRange.tsx`)

The shared brushable year-range timeline used by the Households route (`MedianIncome.tsx`,
`HouseholdSpread.tsx`). Two-thumb Radix `Slider.Root` standing in for a year-range brush, since the
site's charts do not otherwise carry a zoom/brush interaction.

Props: `min`, `max`, `value: [number, number]`, `onChange`, `label` (the slider's accessible name,
e.g. `"Years shown"`), `id` (namespaces the `aria-labelledby` wiring — more than one instance can
live on a single page).

- `minStepsBetweenThumbs={4}`: a range narrower than five years is not a readable chart, so Radix
  makes that range unreachable rather than a consumer needing to validate it.
- Each thumb carries its own `aria-label` (`"First year shown"` / `"Last year shown"`) and an
  explicit `aria-valuetext={String(year)}`, so the value announces as a year rather than a grouped
  number (`aria-valuetext` overrides the default `aria-valuenow` announcement).
- A sibling `<p aria-live="polite" className="readout">` reads `Showing {lo} to {hi}.` — built from
  the same `value` prop the caller's charts filter by (`clampToRange` in `charts/series.ts`), so the
  announcement can never disagree with what is drawn.
- **Mount-gated**: `useState` + `useEffect(() => setReady(true), [])`, `if (!ready) return null`.
  Without JS the control is absent from the HTML entirely — never present-and-dead — and the charts
  it would otherwise drive render complete at their default full range.
- The domain's own endpoints are also printed as plain text beneath the track, so the slider's full
  range is legible without touching it.

Pairs with `charts/series.ts`:

```ts
export function seriesSpan<T extends { y: number }>(rows: T[], key: keyof T): [number, number]
export function clampToRange<T extends { y: number }>(rows: T[], range: [number, number]): T[]
```

`seriesSpan` derives a chart's own default range and slider domain from the data (never a hardcoded
constant, so a future data revision that changes a series' start year fails a test rather than
silently mislabelling); it throws on an all-null series rather than falling back to `[0, 1]`, which
would chart an empty series as though it were real. `clampToRange` filters a row array to the
currently-selected `[lo, hi]`.

## Economy route additions (`src/components/charts/estimates.tsx`)

`economy.json` carries CBO actuals and its baseline projection in one series, and
`_meta.notes[0]` forbids drawing the two as one continuous line. `estimates.tsx` is the shared
vocabulary for that split, used by every Economy-route chart that touches `economy.json`:

- `PROJECTED_DASH` (`'6 4'`) and `PROJECTED_OPACITY` (`0.55`) — the dash pattern and opacity every
  projected branch uses, so a reader learns the convention once.
- `splitAtBoundary(rows, lastActualFy)` — splits a row array into `{ actual, projected }` at the
  boundary, **throwing** if a row is flagged `actual` past it. The boundary row is repeated as the
  first point of `projected` so the dashed branch starts where the solid one ends; they remain two
  separate `<path>` elements with different stroke styles.
- `<BoundaryRule frame x label>` — a vertical rule at the boundary plus its own `.annotation` text,
  so the split is legible without relying on the dash pattern alone.

Two-panel convention (`WhoWorks.tsx`): when two series share a unit but not a base (percent of the
labour force versus percent of the population 16 and over), they get two stacked `<Chart>`
elements with the same `width`/`margin`/`x` scale rather than one chart with two y-axes. Only the
panel with an interaction affordance carries focusable `.datum` elements — a second panel with no
hoverable content needs no focusable one, so hover/focus parity still holds exactly.

## Derived series and `ZeroLine` (`PricesAndRates.tsx`, issue #13)

A series published as an index level (`cpi`, `core_pce`) is never charted or labelled as a rate.
Where a chart needs a rate of change, it is derived once (a single `yoy()` helper computing
`100 * (cur - prev) / prev` over the same dataset the chart already reads) and the transform is
named in the `Figure`'s `yUnit`, `note`, axis title and table headers — never left implicit. The
derived series still carries the source row's `actual` flag, so `splitAtBoundary` applies to it
exactly as it does to a raw field.

A derived rate of change can cross zero even when every underlying index level is monotonically
increasing (CPI-U fell in FY1955 and FY2009 even though the CPI-U index itself never fell). A panel
whose domain admits negative values draws `<ZeroLine frame={fr} y={yScale(0)} />` so a value below
zero is legible by position, not only by colour or by reading the axis tick labels.

`niceExtent` pads a value range outward by a fixed fraction of its span, then anchors the low end
at exactly `0` for any series with no negative observation — whether the pad left that low end
above zero or pushed it below. A series that does contain a negative value keeps its padded
negative low end untouched, and a panel whose domain therefore admits negatives still draws its
`<ZeroLine>`. The sign test reads the raw values rather than `extent()`'s output, because `extent()`
widens a degenerate range by `±1` and a single non-negative datum would otherwise look signed.

The practical consequence is that a zero-anchored series whose minimum sits very close to zero
while its maximum is far away — the fed funds/3-month bill/10-year note panel, minimum `0.028`
(FY2015) against a maximum of `16.945` (FY1981) — now gets a floor of exactly `0` from
`niceExtent` itself. Call sites pass the returned domain straight to `linear()`; none of them
re-pins the low end by hand.
