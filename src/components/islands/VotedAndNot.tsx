/** Section 6: what Congress actually votes on, each year, as a share of the
 *  budget.
 *
 *  Mandatory is charted NET of offsetting receipts (`ma + or`), never `ma`
 *  alone -- see the "gross/net trap" in
 *  docs/contracts/interfaces/budget-data.md. Series are also named with
 *  direct end-of-line text labels so colour is never the only way to tell
 *  them apart. FY2015 net interest is marked on the chart so the "endpoints
 *  hide the trajectory" paragraph is visible in the graphic, not just
 *  asserted in prose.
 */
import { useMemo, useState } from 'react'
import { line as d3line, curveMonotoneX } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { UnitToggle } from './UnitToggle'
import { useChartSize } from '../charts/useChartSize'
import { UNIT_LABEL, tick, value, fiscalYear, type Unit } from '../charts/format'
import type { BudgetYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'voted-and-not'

const START = 1995
const END = 2025
const MARK_YEAR = 2015

function mandatoryNetOf(r: BudgetYear, unit: Unit): number {
  switch (unit) {
    case 'nominal': return r.n_ma + r.n_or
    case 'real': return r.r_ma + r.r_or
    case 'gdp': return r.g_ma + r.g_or
  }
}

function discretionaryOf(r: BudgetYear, unit: Unit): number {
  switch (unit) {
    case 'nominal': return r.n_di
    case 'real': return r.r_di
    case 'gdp': return r.g_di
  }
}

function netInterestOf(r: BudgetYear, unit: Unit): number {
  switch (unit) {
    case 'nominal': return r.n_ni
    case 'real': return r.r_ni
    case 'gdp': return r.g_ni
  }
}

function shapeLabel(unit: Unit): string {
  const basis = unit === 'gdp' ? 'as a percent of GDP' : unit === 'real' ? 'in real FY2025 dollars' : 'in nominal dollars'
  return (
    `Mandatory spending net of offsetting receipts rose the most and spiked in FY2020, discretionary ` +
    `spending drifted down, and net interest ${basis}, FY1995 to FY2025, dipped through the ` +
    'mid-2010s, marked at FY2015, then climbed steeply after 2021.'
  )
}

export function VotedAndNot({ rows }: { rows: BudgetYear[] }) {
  const [unit, setUnit] = useState<Unit>('gdp')
  const [focus, setFocus] = useState<number | null>(null)

  const span = useMemo(() => rows.filter((r) => r.y >= START && r.y <= END), [rows])

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const years = span.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear(
    niceExtent(span.flatMap((r) => [mandatoryNetOf(r, unit), discretionaryOf(r, unit), netInterestOf(r, unit)])),
    [ih, 0],
  )

  const lineFor = (get: (r: BudgetYear) => number) =>
    d3line<BudgetYear>().x((r) => x(r.y)).y((r) => y(get(r))).curve(curveMonotoneX)
  const mandatoryLine = lineFor((r) => mandatoryNetOf(r, unit))
  const discretionaryLine = lineFor((r) => discretionaryOf(r, unit))
  const netInterestLine = lineFor((r) => netInterestOf(r, unit))

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))
  const tickFmt = (v: number) => tick(v, unit)

  const active = focus != null ? span.find((r) => r.y === focus) : null
  const readoutFor = (r: BudgetYear) =>
    `FY${r.y}: mandatory, net of offsetting receipts, ${value(mandatoryNetOf(r, unit), unit)}; ` +
    `discretionary ${value(discretionaryOf(r, unit), unit)}; net interest ${value(netInterestOf(r, unit), unit)}` +
    `${r.y === MARK_YEAR ? ', the trajectory-hiding trough between flat endpoints' : ''}`

  const last = span[span.length - 1]
  const marked = span.find((r) => r.y === MARK_YEAR)

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} value={unit} onChange={setUnit} />
      </div>

      <Chart ariaLabel={shapeLabel(unit)} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft frame={fr} ticks={yTicks} format={tickFmt} label={UNIT_LABEL[unit]} scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            <path d={mandatoryLine(span) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={2} />
            <path d={discretionaryLine(span) ?? ''} fill="none" stroke="var(--disc)" strokeWidth={2} />
            <path d={netInterestLine(span) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} />

            <Annotation frame={fr} x={x(last.y) - 4} y={y(mandatoryNetOf(last, unit)) - 8} anchor="end" seriesLabel label="Mandatory (net)" />
            <Annotation frame={fr} x={x(last.y) - 4} y={y(discretionaryOf(last, unit)) - 8} anchor="end" seriesLabel label="Discretionary" />
            <Annotation frame={fr} x={x(last.y) - 4} y={y(netInterestOf(last, unit)) - 8} anchor="end" seriesLabel label="Net interest" />

            {marked && (
              <>
                <circle cx={x(marked.y)} cy={y(netInterestOf(marked, unit))} r={3.5} fill="var(--int)" />
                <Annotation
                  frame={fr}
                  x={x(marked.y)}
                  y={y(netInterestOf(marked, unit)) + 18}
                  anchor="middle"
                  label={`FY2015: ${value(netInterestOf(marked, unit), unit)}`}
                />
              </>
            )}

            {/* Every year is a focusable datum reporting all three series. */}
            {span.map((r) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={y(mandatoryNetOf(r, unit))}
                r={active?.y === r.y ? 5 : 9}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
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
        caption="Mandatory (net), discretionary and net interest spending by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'mandatory', label: 'Mandatory, net', unit: UNIT_LABEL[unit] },
          { key: 'discretionary', label: 'Discretionary', unit: UNIT_LABEL[unit] },
          { key: 'netInterest', label: 'Net interest', unit: UNIT_LABEL[unit] },
        ]}
        rows={span.map((r) => ({
          y: fiscalYear(r.y),
          mandatory: value(mandatoryNetOf(r, unit), unit),
          discretionary: value(discretionaryOf(r, unit), unit),
          netInterest: value(netInterestOf(r, unit), unit),
        }))}
      />
    </div>
  )
}
