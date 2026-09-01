/** Households §1: what a household earns.
 *
 *  Real median household income, 1984-2024, constant 2024 dollars. A single
 *  series, no unit toggle: `income_inequality.json` carries no `n_`/`r_`/`g_`
 *  field family, and there is no honest second unit to offer here (see
 *  docs/contracts/interfaces/income-inequality-data.md). The shared
 *  `YearRange` brush is the interaction instead of a unit toggle.
 *
 *  Recharts draws the line, the grid and the two axes. The focusable points,
 *  the readout and the table stay the site's own code, and the two
 *  reference-identity rules that govern every Recharts island are stated in
 *  `../charts/RechartsFrame.tsx`.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart } from 'recharts'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
} from '../charts/RechartsFrame'
import { calendarYear, dollars, dollarsCompact } from '../charts/format'
import { seriesSpan, clampToRange } from '../charts/series'
import { YearRange } from './YearRange'
import { TableView } from './TableView'
import type { IncomeYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

export function MedianIncome({ rows }: { rows: IncomeYear[] }) {
  // The series' own start/end, never a hardcoded constant, so a future
  // revision that shifts the start year fails a test rather than drifting
  // silently out of sync with this chart's domain.
  const domain = useMemo(() => seriesSpan(rows, 'mhi'), [rows])
  const [range, setRange] = useState<[number, number]>(domain)
  const [focus, setFocus] = useState<number | null>(null)

  const shown = useMemo(() => clampToRange(rows, range), [rows, range])
  // Nulls are dropped before the frame sees them, because the memo key inside
  // `useFrame` reads `Math.min` over this array and null coerces to zero.
  const values = useMemo(
    () => shown.map((r) => r.mhi).filter((v): v is number => v != null),
    [shown],
  )
  const points = useMemo(() => shown.filter((r) => r.mhi != null), [shown])

  const {
    boxRef, size, f, xDomain, yDomain, x, y, xTicks, yTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows: shown,
    xOf: (r) => r.y,
    yValues: values,
    // The brush sets the domain, so an end year with no observation still
    // reaches the axis edge the slider promised.
    xDomain: range,
  })

  const fmtFull = (r: IncomeYear) => `${calendarYear(r.y)}: ${dollars(r.mhi as number)}`
  const active = focus != null ? shown.find((r) => r.y === focus) : null

  const first = shown.find((r) => r.mhi != null)
  const last = [...shown].reverse().find((r) => r.mhi != null)
  const label =
    first && last
      ? `Real median household income at each year from ${range[0]} to ${range[1]}, from ${dollars(first.mhi as number)} in ${first.y} to ${dollars(last.mhi as number)} in ${last.y}, in constant 2024 dollars.`
      : 'Real median household income, constant 2024 dollars.'

  // Order is data order, and the array is built in this render. Calling
  // `mark()` from a Recharts callback would advance the counter out of step.
  const markProps = points.map(() => mark())

  return (
    <div ref={boxRef}>
      <YearRange
        id="mhi-range"
        label="Years shown"
        min={domain[0]}
        max={domain[1]}
        value={range}
        onChange={setRange}
      />

      <div {...wrapperProps}>
        <LineChart
          ref={surfaceRef}
          data={shown}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          aria-label={label}
          {...SURFACE_DEFAULTS}
        >
          <PlotGrid />
          <PlotXAxis
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Calendar year"
            format={calendarYear}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="Constant 2024 dollars"
            format={dollarsCompact}
          />
          <Line
            type="linear"
            dataKey="mhi"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            {/* Every point is Tab-focusable and reports the same thing hover does. */}
            {points.map((r, i) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={y(r.mhi as number)}
                r={active?.y === r.y ? 5 : 8}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                {...markProps[i]}
                // NOT role="button": focusing a point reveals its value, it does
                // not activate anything.
                role="img"
                aria-label={fmtFull(r)}
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
        {active ? fmtFull(active) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Real median household income, constant 2024 dollars"
        columns={[
          { key: 'y', label: 'Year', unit: 'calendar year' },
          { key: 'mhi', label: 'Real median household income', unit: 'constant 2024 dollars' },
        ]}
        rows={shown.map((r) => ({
          y: calendarYear(r.y),
          mhi: r.mhi == null ? null : dollars(r.mhi),
        }))}
      />
    </div>
  )
}
