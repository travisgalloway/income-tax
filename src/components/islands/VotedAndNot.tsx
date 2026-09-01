/** Section 6: what Congress actually votes on, each year, as a share of the
 *  budget.
 *
 *  Mandatory is charted NET of offsetting receipts (`ma + or`), never `ma`
 *  alone, see the "gross/net trap" in
 *  docs/contracts/interfaces/budget-data.md. Series are also named with
 *  direct end-of-line text labels so colour is never the only way to tell
 *  them apart. FY2015 net interest is marked on the chart so the "endpoints
 *  hide the trajectory" paragraph is visible in the graphic, not just
 *  asserted in prose.
 *
 *  Recharts draws the three lines, the grid and the axes. The three direct
 *  labels, the FY2015 marker and the focusable years stay the site's own code,
 *  drawn in the plot coordinates `useFrame` returns.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart } from 'recharts'
import { Annotation } from '../charts/Annotation'
import { labelHeight } from '../charts/annotate'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { TableView } from './TableView'
import { UnitToggle } from './UnitToggle'
import { UNIT_LABEL, tick, value, fiscalYear, type Unit } from '../charts/format'
import type { BudgetYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'voted-and-not'

const START = 1995
const END = 2025
const MARK_YEAR = 2015

const YEAR_TICK = (t: number) => `${t}`

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

  /* The three series are derived per unit, so they are resolved into plain
   * fields once and Recharts reads them by name. A function `dataKey` would be
   * a fresh reference on every render, which rule 1 warns against. */
  const plot = useMemo(
    () =>
      span.map((r) => ({
        y: r.y,
        mandatory: mandatoryNetOf(r, unit),
        discretionary: discretionaryOf(r, unit),
        netInterest: netInterestOf(r, unit),
      })),
    [span, unit],
  )

  const {
    boxRef, size, f, xDomain, yDomain, x, y, xTicks, yTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows: plot,
    xOf: (r) => r.y,
    yValues: plot.flatMap((r) => [r.mandatory, r.discretionary, r.netInterest]),
  })

  const yFormat = useTickFormat(tick, unit)

  const active = focus != null ? span.find((r) => r.y === focus) : null
  const readoutFor = (r: BudgetYear) =>
    `FY${r.y}: mandatory, net of offsetting receipts, ${value(mandatoryNetOf(r, unit), unit)}; ` +
    `discretionary ${value(discretionaryOf(r, unit), unit)}; net interest ${value(netInterestOf(r, unit), unit)}` +
    `${r.y === MARK_YEAR ? ', the trajectory-hiding trough between flat endpoints' : ''}`

  const last = span[span.length - 1]
  const marked = span.find((r) => r.y === MARK_YEAR)

  // Order is data order, and the array is built in this render.
  const markProps = span.map(() => mark())

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} value={unit} onChange={setUnit} />
      </div>

      <div {...wrapperProps}>
        <LineChart
          ref={surfaceRef}
          data={plot}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          aria-label={shapeLabel(unit)}
          {...SURFACE_DEFAULTS}
        >
          <PlotGrid />
          <PlotXAxis
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Fiscal year"
            format={YEAR_TICK}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit={UNIT_LABEL[unit]}
            format={yFormat}
          />

          <Line
            type="monotone"
            dataKey="mandatory"
            stroke="var(--mand)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="discretionary"
            stroke="var(--disc)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="netInterest"
            stroke="var(--int)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            <Annotation frame={f} x={x(last.y) - 4} y={y(mandatoryNetOf(last, unit)) - 8} anchor="end" seriesLabel halo label="Mandatory (net)" />
            <Annotation frame={f} x={x(last.y) - 4} y={y(discretionaryOf(last, unit)) - 8} anchor="end" seriesLabel halo label="Discretionary" />
            <Annotation frame={f} x={x(last.y) - 4} y={y(netInterestOf(last, unit)) - 8} anchor="end" seriesLabel halo label="Net interest" />

            {/* Below the point where the plot floor allows it, above it where
                it does not. Net interest is the lowest of the three series, so
                at the 360 preset the label below its FY2015 point reached
                1.5px into the x-axis tick row. */}
            {marked && (
              <>
                <circle cx={x(marked.y)} cy={y(netInterestOf(marked, unit))} r={3.5} fill="var(--int)" />
                <Annotation
                  frame={f}
                  x={x(marked.y)}
                  y={
                    y(netInterestOf(marked, unit)) + 18 + labelHeight() * 0.2 > f.innerHeight
                      ? y(netInterestOf(marked, unit)) - 8
                      : y(netInterestOf(marked, unit)) + 18
                  }
                  anchor="middle"
                  halo
                  label={`FY2015: ${value(netInterestOf(marked, unit), unit)}`}
                />
              </>
            )}

            {/* Every year is a focusable datum reporting all three series. */}
            {span.map((r, i) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={y(mandatoryNetOf(r, unit))}
                r={active?.y === r.y ? 5 : 9}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                {...markProps[i]}
                role="img"
                aria-label={readoutFor(r)}
                onFocus={() => setFocus(r.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(r.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </PlotOverlay>
        </LineChart>
      </div>

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
