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
