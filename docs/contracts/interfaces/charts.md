# Interface: the chart layer (`src/components/charts/`, `src/components/islands/`)

The internal boundary every chart section builds against. Read this before adding a new section
island — it exists so each section reuses the same primitives rather than re-inlining equivalents.

## `Figure.astro` (`src/components/Figure.astro`)

The apparatus wrapper: numbered head, a `<slot />` for the chart, then a Source/Note/Units
figcaption. Four props are **required and throw at build time** if omitted or empty
(`BRIEF.md` rules 1–2 made structural):

| Prop | Contract |
|---|---|
| `ariaLabel` | The finding, as a sentence — not a description of the chart's shape. |
| `title` | Short italic title beside the figure number. |
| `source` | `_meta.source`, **verbatim**. Never a summary. |
| `xUnit` / `yUnit` | Unit label for each axis. No bare-number axis is permitted. |

Optional: `vintage` (appended to the source line as its own sentence — never spliced into the
verbatim source text) and `note` (scope/method caveats; this is where a gross-vs-net or
coverage-boundary warning belongs, never in a tooltip).

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

The "View as table" disclosure every figure carries. Each `Column` requires a `unit` — there is no
unitless column. Cell values are read as `row[key] ?? 'no data'`, so a consumer that wants "no
data" instead of "0" for a genuinely absent value must pass `null`, not `0` or `''`.

## `UnitToggle` (`src/components/islands/UnitToggle.tsx`) + `charts/format.ts`

The nominal/real/%-of-GDP toggle and its vocabulary:

- `Unit = 'nominal' | 'real' | 'gdp'`, `UNIT_LABEL` (axis-title text per unit), `UNIT_PREFIX`
  (`n_` / `r_` / `g_`, the field-family prefix a dataset carries per unit).
- `trillions`, `percentGdp`, `percent`, `dollars` — full-value formatters for tables, tooltips and
  screen-reader text.
- `tick(v, unit)` — compact axis-tick text, always unit-bearing.
- `value(v, unit)` — the standard "full value or `'no data'` if `v == null`" formatter for
  table/inspector text.
- `fiscalYear(y)` — `FY{y}`.

Any dollar/GDP chart with a unit toggle should read from this module rather than re-deriving
formatters inline (`DebtChart.tsx` predates this module and inlines its own — a parked
simplification, not a pattern to copy forward).

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

`TableView` is not used for the by-state map's non-visual equivalent, because `TableView`'s
Collapsible starts closed and Radix does not render `Collapsible.Content` into the DOM while
closed — confirmed by building the site and finding no `<table>` tag in `dist/*.html` for any
existing `TableView` usage. A collapsed-by-default table can never be the map's required
keyboard-reachable equivalent, and a JS-disabled reader could never open it at all. The by-state
section instead renders a **plain, always-visible** `<table className="sortable-table">`, with
`<th scope="col">` sort buttons (`.sort-button`) toggling `aria-sort` and click-to-resort — reusing
`.tableview-scroll` for the horizontal-scroll wrapper, since that concern is identical. `TableView`
itself is still reused as-is for the tax-mix figure (`StateTaxMix.tsx`), which needs no sort and
whose collapsed-by-default behaviour is acceptable there because it is a supplementary detail
table, not the chart's only non-visual path.

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

`niceExtent` pads a value range outward by a fixed fraction of its span and only re-anchors the
padded low end to `0` if that padded value is still positive — it does not pull a padded-negative
low end back to zero. This is invisible when a series' minimum is not close to zero relative to its
span (`WhoWorks`'s unemployment/noncyclical panel, for example), but it produces a small negative
low end for a genuinely zero-anchored series whose minimum sits very close to zero while its
maximum is far away — exactly the fed funds/3-month bill/10-year note panel, whose minimum is
`0.028` (FY2015) against a maximum of `16.945` (FY1981). `PricesAndRates.tsx`'s rates panel
therefore pins the low end to `0` explicitly and uses only `niceExtent`'s padded high end, rather
than passing the raw `niceExtent(...)` domain straight to `linear()`. See `docs/parked-findings.md`
for the finding logged against `niceExtent` itself.
