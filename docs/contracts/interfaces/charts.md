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

## Section-island shape

Every built section island (`DebtChart.tsx`, `BudgetChart.tsx`) follows the same skeleton:

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
