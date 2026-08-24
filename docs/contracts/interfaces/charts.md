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
`Top1TaxShare.tsx`, `PayrollBill.tsx`)
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
