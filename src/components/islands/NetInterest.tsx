/** Section 7: net interest, nobody appropriates it.
 *
 *  Percent-of-GDP is DELIBERATELY not offered here -- section 6 already
 *  carries net interest as a share of GDP, and a third view of the same
 *  series would duplicate that section rather than add to it. Just a
 *  nominal / real FY2025 toggle.
 *
 *  FY2015 is the "trough" and FY2003 is the "series low" -- SOURCES.md and
 *  validate.py fix that vocabulary, and it is never "low" for FY2015 here, in
 *  annotation, aria-label, live-region readout or table.
 *
 *  The axis is zero-anchored and bars start at zero: truncating the baseline
 *  would misstate the ratios between years. The "$153B must not look like
 *  zero" edge case is solved by tick granularity (every $200B) rather than by
 *  clipping the axis.
 */
import { useMemo, useState } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent, scalePoint } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { value, fiscalYear } from '../charts/format'
import type { BudgetYear } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'net-interest'

const START = 1995
const END = 2025
const TROUGH_YEAR = 2015
const SERIES_LOW_YEAR = 2003
const TICK_STEP = 0.2 // $200B, rendered in $ trillions

type View = 'nominal' | 'real'

const VIEWS: { value: View; label: string }[] = [
  { value: 'nominal', label: 'Nominal dollars' },
  { value: 'real', label: 'Real FY2025 dollars' },
]

function netInterestOf(r: BudgetYear, view: View): number {
  return view === 'real' ? r.r_ni : r.n_ni
}

/** `format.ts`'s `tick` renders zero as "$0B". A bare "$0" reads better on
 *  this axis; this is a local, additive wrapper, not a change to the shared
 *  helper -- #2, #3 and #4 also depend on `tick` unmodified. */
function axisTick(v: number): string {
  if (v === 0) return '$0'
  return `$${(v * 1000).toFixed(0)}B`
}

function noteFor(y: number): string | null {
  if (y === TROUGH_YEAR) return 'a recent trough, not the series low'
  if (y === SERIES_LOW_YEAR) return 'the series low'
  return null
}

/** The sections.md section 7 Alt text block, restated per view -- it
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

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const years = span.map((r) => r.y)
  const x = scalePoint<number>().domain(years).range([0, iw]).padding(0.5)
  const barWidth = Math.max(2, x.step() * 0.6)
  const domain = niceExtent(span.map((r) => netInterestOf(r, view)))
  const y = linear(domain, [ih, 0])

  // Ticks every $200B, zero-anchored, up to the padded domain top -- never
  // the shared `tick()` step, which is unitless about spacing.
  const yTicks = useMemo(() => {
    const top = domain[1]
    const out: number[] = []
    for (let t = 0; t <= top + 1e-9; t += TICK_STEP) out.push(Math.round(t * 10) / 10)
    return out
  }, [domain])
  const xTicks = years.filter((yr) => yr % (narrow ? 10 : 5) === 0)

  const active = focus != null ? span.find((r) => r.y === focus) : null
  const readoutFor = (r: BudgetYear) => {
    const note = noteFor(r.y)
    return `FY${r.y}: ${value(netInterestOf(r, view), view)}${note ? `, ${note}` : ''}`
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

      <Chart ariaLabel={shapeLabel(view)} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={axisTick}
              label={view === 'real' ? 'Real $ trillions, FY2025' : 'Nominal $ trillions'}
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Fiscal year"
              scale={(v) => x(v) ?? 0}
            />

            {span.map((r) => {
              const cx = x(r.y) ?? 0
              const top = y(netInterestOf(r, view))
              const marked = r.y === TROUGH_YEAR || r.y === SERIES_LOW_YEAR
              return (
                <rect
                  key={r.y}
                  x={cx - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(0, ih - top)}
                  fill={marked ? 'var(--int)' : 'var(--mand)'}
                  opacity={marked ? 1 : 0.55}
                />
              )
            })}

            {span
              .filter((r) => r.y === TROUGH_YEAR || r.y === SERIES_LOW_YEAR)
              .map((r) => (
                <Annotation
                  key={r.y}
                  frame={fr}
                  x={x(r.y) ?? 0}
                  y={y(netInterestOf(r, view)) - 8}
                  anchor="middle"
                  label={r.y === TROUGH_YEAR ? 'Trough' : 'Series low'}
                />
              ))}

            {/* Every year is a focusable datum; a large invisible hit target
                spans the full plot height so a thin bar is still easy to
                reach with the pointer, and reports the same text Tab does. */}
            {span.map((r) => (
              <rect
                key={r.y}
                className="datum"
                x={(x(r.y) ?? 0) - barWidth / 2}
                y={0}
                width={barWidth}
                height={ih}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                opacity={active?.y === r.y ? 0.08 : 0}
                {...mark()}
                role="img"
                aria-label={readoutFor(r)}
                onFocus={() => setFocus(r.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(r.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </>
        )}
      </Chart>

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
