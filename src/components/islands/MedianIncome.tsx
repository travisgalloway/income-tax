/** Households §1: what a household earns.
 *
 *  Real median household income, 1984-2024, constant 2024 dollars. A single
 *  series, no unit toggle: `income_inequality.json` carries no `n_`/`r_`/`g_`
 *  field family, and there is no honest second unit to offer here (see
 *  docs/contracts/interfaces/income-inequality-data.md). The shared
 *  `YearRange` brush is the interaction instead of a unit toggle.
 */
import { useMemo, useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { calendarYear, dollars, dollarsCompact } from '../charts/format'
import { seriesSpan, clampToRange } from '../charts/series'
import { YearRange } from './YearRange'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { IncomeYear } from '../../data/types'

export function MedianIncome({ rows }: { rows: IncomeYear[] }) {
  // The series' own start/end, never a hardcoded constant, so a future
  // revision that shifts the start year fails a test rather than drifting
  // silently out of sync with this chart's domain.
  const domain = useMemo(() => seriesSpan(rows, 'mhi'), [rows])
  const [range, setRange] = useState<[number, number]>(domain)
  const [focus, setFocus] = useState<number | null>(null)

  const shown = useMemo(() => clampToRange(rows, range), [rows, range])

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const x = linear(range, [0, iw])
  const y = linear(niceExtent(shown.map((r) => r.mhi)), [ih, 0])

  const path = d3line<IncomeYear>()
    .defined((r) => r.mhi != null)
    .x((r) => x(r.y))
    .y((r) => y(r.mhi as number))

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const fmtFull = (r: IncomeYear) => `${calendarYear(r.y)}: ${dollars(r.mhi as number)}`
  const active = focus != null ? shown.find((r) => r.y === focus) : null

  const first = shown.find((r) => r.mhi != null)
  const last = [...shown].reverse().find((r) => r.mhi != null)
  const label =
    first && last
      ? `Real median household income at each year from ${range[0]} to ${range[1]}, from ${dollars(first.mhi as number)} in ${first.y} to ${dollars(last.mhi as number)} in ${last.y}, in constant 2024 dollars.`
      : 'Real median household income, constant 2024 dollars.'

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

      <Chart ariaLabel={label} interactive width={W} height={H} margin={f}>
        {(fr) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={dollarsCompact}
              label="Constant 2024 dollars"
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={calendarYear}
              label="Calendar year"
              scale={x}
            />
            <path d={path(shown) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />

            {/* Every point is Tab-focusable and reports the same thing hover does. */}
            {shown.filter((r) => r.mhi != null).map((r) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={y(r.mhi as number)}
                r={active?.y === r.y ? 5 : 8}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                tabIndex={0}
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
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? fmtFull(active) : 'Focus or hover a year to read its value.'}
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
