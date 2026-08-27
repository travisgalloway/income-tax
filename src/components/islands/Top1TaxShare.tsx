/** Section 5, figure B: the top 1% share of federal individual income tax paid,
 *  in the five years the IRS has published it — 2001, 2019, 2021, 2022, 2023.
 *
 *  This is NOT an annual series: the gap between 2001 and 2019 is 18 years.
 *  Discrete points on a true linear year axis only, so the gap reads as a
 *  gap. No line, no area, no interpolation of any kind.
 */
import { useState } from 'react'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisLeft, AxisBottom } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { percent } from '../charts/format'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { Top1IncomeSharePoint } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

export function Top1TaxShare({ rows }: { rows: Top1IncomeSharePoint[] }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const years = rows.map((p) => p.year)
  const x = linear([2001, 2023], [0, iw])
  const y = linear(niceExtent(rows.map((p) => p.v)), [ih, 0])
  const xTicks = years // published years only; a generated tick set would imply an annual series
  const yTicks = y.ticks(narrow ? 4 : 5)

  const active = focus != null ? rows.find((p) => p.year === focus) : null
  const describe = (p: Top1IncomeSharePoint) =>
    `Tax year ${p.year}: ${percent(p.v, 1)} of federal individual income tax paid by the top 1%`

  const ariaLabel =
    'Share of federal individual income tax paid by the top 1%, in the five published tax years ' +
    '2001, 2019, 2021, 2022 and 2023: 33.2%, 38.8%, 45.8%, 40.4% and 38.4%. This is five scattered ' +
    'observations, not a continuous annual series; there is an 18-year gap between 2001 and 2019.'

  return (
    <div ref={boxRef}>
      <Chart ariaLabel={ariaLabel} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={(v) => percent(v, 0)}
              label="Percent of income tax paid"
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Tax year"
              scale={x}
            />

            {rows.map((p) => {
              const isActive = active?.year === p.year
              return (
                <g key={p.year}>
                  <circle
                    className="datum"
                    cx={x(p.year)}
                    cy={y(p.v)}
                    r={isActive ? 5 : 9}
                    fill={isActive ? 'var(--ink)' : 'transparent'}
                    stroke="var(--ink)"
                    strokeWidth={isActive ? 0 : 1.5}
                    {...mark()}
                    role="img"
                    aria-label={describe(p)}
                    onFocus={() => setFocus(p.year)}
                    onBlur={() => setFocus(null)}
                    onMouseEnter={() => setFocus(p.year)}
                    onMouseLeave={() => setFocus(null)}
                  />
                  <circle cx={x(p.year)} cy={y(p.v)} r={2.5} fill="var(--ink)" />
                  <Annotation
                    frame={fr}
                    x={x(p.year)}
                    y={y(p.v) - 12}
                    anchor="middle"
                    label={`${p.year}: ${percent(p.v, 1)}`}
                  />
                </g>
              )
            })}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="point" />}
      </p>

      <TableView
        caption="Share of federal individual income tax paid by the top 1%, published years only"
        columns={[
          { key: 'year', label: 'Tax year', unit: 'calendar year' },
          { key: 'v', label: 'Share of income tax paid', unit: 'percent' },
        ]}
        rows={rows.map((p) => ({ year: p.year, v: percent(p.v, 1) }))}
      />
    </div>
  )
}
