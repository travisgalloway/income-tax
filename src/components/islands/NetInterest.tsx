/** Section 7: net interest, nobody appropriates it.
 *
 *  Percent-of-GDP is DELIBERATELY not offered here, section 6 already
 *  carries net interest as a share of GDP, and a third view of the same
 *  series would duplicate that section rather than add to it. Just a
 *  nominal / real FY2025 toggle.
 *
 *  FY2015 is the "trough" and FY2003 is the "series low", SOURCES.md and
 *  validate.py fix that vocabulary, and it is never "low" for FY2015 here, in
 *  annotation, aria-label, live-region readout or table.
 *
 *  The axis is zero-anchored and bars start at zero: truncating the baseline
 *  would misstate the ratios between years. The "$153B must not look like
 *  zero" edge case is solved by tick granularity (every $200B) rather than by
 *  clipping the axis.
 *
 *  Drawn on `charts/RechartsFrame.tsx` as a `<BarChart>`. Read that file's
 *  header before editing this one. Two reference-identity rules govern the code
 *  below, they point in opposite directions, and both fail silently.
 */
import { useMemo, useState } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Bar, BarChart, type BarShapeProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { tick, value, fiscalYear } from '../charts/format'
import type { BudgetYear } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'net-interest'

const START = 1995
const END = 2025
const TROUGH_YEAR = 2015
const SERIES_LOW_YEAR = 2003
const TICK_STEP = 0.2 // $200B, rendered in $ trillions

/** The bars stand on a point band, so the numeric domain is widened by half a
 *  band at each end. `scalePoint().padding(0.5)` put the first and last mark
 *  half a step inside the plot, and a bare `[1995, 2025]` domain would centre
 *  those two bars on the plot edges and clip half of each. */
const X_PAD = 0.5

type View = 'nominal' | 'real'

const VIEWS: { value: View; label: string }[] = [
  { value: 'nominal', label: 'Nominal dollars' },
  { value: 'real', label: 'Real FY2025 dollars' },
]

function netInterestOf(r: BudgetYear, view: View): number {
  return view === 'real' ? r.r_ni : r.n_ni
}

/** MEASURED. This axis used a local wrapper that rendered every tick in
 *  billions, so the top of the range printed `$1000B`: 38.9 units at the 360
 *  preset, starting at x=5.1, which is inside the rotated axis title's own
 *  band (2.7 to 14.1). `format.ts`'s shared `tick` switches to trillions at
 *  1.0 and prints `$1T` at 20.5 units, and it already renders zero as a bare
 *  `$0`, which is the only reason the wrapper existed. See `leftTickRoom` in
 *  `axisFit.ts` for the budget. */

const YEAR_FORMAT = (t: number) => `${t}`

function noteFor(y: number): string | null {
  if (y === TROUGH_YEAR) return 'a recent trough, not the series low'
  if (y === SERIES_LOW_YEAR) return 'the series low'
  return null
}

/** The sections.md section 7 Alt text block, restated per view, it
 *  describes the nominal shape only, so the real-dollar view needs its own
 *  wording (DebtChart.tsx:65-68 is the precedent for a view-dependent
 *  aria-label on this chart layer). */
function shapeLabel(view: View): string {
  if (view === 'real') {
    return (
      'Real net interest payments, FY2025 dollars, ran higher in the 1990s than the nominal ' +
      'series, fell through the 2000s to the series low in FY2003, eased to a recent trough in ' +
      'FY2015, then climbed sharply through FY2025.'
    )
  }
  return (
    'Federal net interest payments in nominal dollars sat near $250 billion through the 1990s, ' +
    'fell through the 2000s to the series low of $153 billion in FY2003, reached a recent trough ' +
    'of $223 billion in FY2015, then climbed sharply to $970 billion by FY2025.'
  )
}

export function NetInterest({ rows }: { rows: BudgetYear[] }) {
  const [view, setView] = useState<View>('nominal')
  const [focus, setFocus] = useState<number | null>(null)

  const span = useMemo(() => rows.filter((r) => r.y >= START && r.y <= END), [rows])
  const values = span.map((r) => netInterestOf(r, view))

  const {
    size,
    boxRef,
    f,
    x,
    y,
    xDomain,
    yDomain,
    xTicks,
    chartMargin,
    chartStyle,
    surfaceRef,
    wrapperProps,
    mark,
  } = useFrame({
    rows: span,
    xOf: (r) => r.y,
    yValues: values,
    xDomain: [START - X_PAD, END + X_PAD],
    // Zero-anchored, from the raw values, for the reason in the file header.
    yDomain: niceExtent(values),
  })

  const barWidth = Math.max(2, (f.innerWidth / span.length) * 0.6)

  // Ticks every $200B, zero-anchored, up to the padded domain top, never
  // the shared `tick()` step, which is unitless about spacing. Memoised for
  // the same reason `useFrame` memoises its own, and `yDomain` is already a
  // stable reference, so this memo holds across renders.
  const yTicks = useMemo(() => {
    const top = yDomain[1]
    const out: number[] = []
    for (let t = 0; t <= top + 1e-9; t += TICK_STEP) out.push(Math.round(t * 10) / 10)
    return out
  }, [yDomain])

  const active = focus != null ? span.find((r) => r.y === focus) : null
  const readoutFor = (r: BudgetYear) => {
    const note = noteFor(r.y)
    return `FY${r.y}: ${value(netInterestOf(r, view), view)}${note ? `, ${note}` : ''}`
  }

  /* Rule 1: `tick` is a module import and `view` is a plain string, so this
   * formatter keeps its identity until the toggle actually moves. */
  const yFormat = useTickFormat(tick, view)

  const yTitle = view === 'real' ? 'Real $ trillions, FY2025' : 'Nominal $ trillions'
  const dataKey = view === 'real' ? 'r_ni' : 'n_ni'

  // `mark()` runs once per year HERE, in this island's own render, and the
  // results reach the shape renderer by index. The renderer runs inside
  // `<Bar>`, which subscribes to Recharts' store and may render without this
  // island rendering, so calling `mark()` from there would advance the counter
  // past the end and leave the group with no focusable mark.
  const markProps = span.map(() => mark())

  /** A NEW FUNCTION on every render, deliberately. Recharts calls a `shape`
   *  renderer as a plain function, so a memoised one leaves the graphical item
   *  with identical props, React bails out of the subtree, and the bars freeze
   *  at their first paint. See rule 2 in `RechartsFrame.tsx`.
   *
   *  The bar's HEIGHT comes from Recharts, through the y scale it built from
   *  the domain above. Its width and its centre come from the site's own point
   *  band, because the band width is fixed at 0.6 of a step here and Recharts
   *  derives a numeric axis band from the data spacing instead.
   *
   *  IT DRAWS THE VISIBLE BAR AND NOTHING FOCUSABLE. See the overlay below. */
  const bar = (props: BarShapeProps) => {
    const i = props.originalDataIndex
    const r = span[i]
    if (!r || !Number.isFinite(props.y) || !Number.isFinite(props.height)) return null
    const cx = x(r.y)
    const marked = r.y === TROUGH_YEAR || r.y === SERIES_LOW_YEAR
    return (
      <rect
        key={r.y}
        x={cx - barWidth / 2}
        y={props.y}
        width={barWidth}
        height={props.height}
        fill={marked ? 'var(--int)' : 'var(--mand)'}
        opacity={marked ? 1 : 0.55}
      />
    )
  }

  return (
    <div ref={boxRef}>
      <div className="controls">
        <span className="controls-label" id="net-interest-units">Measured in</span>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-labelledby={labelledByFigure(FIGURE, 'net-interest-units')}
          className="unit-toggle"
        >
          {VIEWS.map((v) => (
            <ToggleGroup.Item key={v.value} value={v.value} className="unit-toggle-item">
              {v.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <div {...wrapperProps}>
        <BarChart
          ref={surfaceRef}
          data={span}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={shapeLabel(view)}
        >
          <PlotGrid />
          <PlotXAxis
            dataKey="y"
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Fiscal year"
            format={YEAR_FORMAT}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit={yTitle}
            format={yFormat}
          />
          <Bar
            dataKey={dataKey}
            barSize={barWidth}
            isAnimationActive={false}
            activeBar={false}
            shape={bar}
          />

          {/* THE FOCUSABLE MARKS, and the reason they are here rather than in
              the `shape` renderer above. Recharts keys each bar's wrapper on
              its own geometry and rebuilds that subtree on every render of
              this island, so a mark drawn inside `shape` is DESTROYED the
              moment focusing it sets `focus` state. Measured: the mark took
              focus, the island re-rendered, the node was replaced, and
              `document.activeElement` was `<body>` one tick later, so the
              first arrow press reached no key handler at all. `WhoPays` states
              the same rule for a different reason.

              Every year is a focusable datum; the hit target spans the full
              plot height so a thin bar is still easy to reach with the
              pointer, and reports the same text Tab does. Nothing here needs
              Recharts' geometry: the centre is the site's own point band and
              the height is the whole plot. */}
          <PlotOverlay margin={f.margin}>
            {span.map((r, i) => {
              const cx = x(r.y)
              const isActive = active?.y === r.y
              return (
                <rect
                  key={r.y}
                  className="datum"
                  x={cx - barWidth / 2}
                  y={0}
                  width={barWidth}
                  height={f.innerHeight}
                  fill={isActive ? 'var(--ink)' : 'transparent'}
                  opacity={isActive ? 0.08 : 0}
                  {...markProps[i]}
                  role="img"
                  aria-label={readoutFor(r)}
                  onFocus={() => setFocus(r.y)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(r.y)}
                  onMouseLeave={() => setFocus(null)}
                />
              )
            })}

            {/* The two marked years are labelled through the site's own clamp,
                which draws nothing for a label too wide to fit. Recharts has no
                equivalent, so the labels are drawn in plot coordinates here. */}
            {span
              .filter((r) => r.y === TROUGH_YEAR || r.y === SERIES_LOW_YEAR)
              .map((r) => (
                <Annotation
                  key={r.y}
                  frame={f}
                  x={x(r.y)}
                  y={y(netInterestOf(r, view)) - 8}
                  anchor="middle"
                  label={r.y === TROUGH_YEAR ? 'Trough' : 'Series low'}
                />
              ))}
          </PlotOverlay>
        </BarChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? readoutFor(active) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Federal net interest payments by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'netInterest', label: 'Net interest', unit: view === 'real' ? 'Real $ trillions, FY2025' : 'Nominal $ trillions' },
          { key: 'note', label: 'Note', unit: '' },
        ]}
        rows={span.map((r) => ({
          y: fiscalYear(r.y),
          netInterest: value(netInterestOf(r, view), view),
          note: noteFor(r.y) ?? '',
        }))}
      />
    </div>
  )
}
