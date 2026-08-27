/** Section 1: the debt series.
 *
 *  BRIEF.md interaction note: nominal and share-of-GDP must be EQUALLY
 *  prominent, not one primary and one buried. Nominal doubles; the ratio goes
 *  105% to 124%. A reader who only sees one has been misled. Hence the toggle
 *  sits above the chart, and the standfirst names both.
 */
import { useMemo, useState } from 'react'
import { line as d3line, area as d3area, curveMonotoneX } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { UnitToggle } from './UnitToggle'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import {
  fiscalYear,
  percent,
  percentGdp,
  tick,
  trillions,
  trillionsLong,
  type Unit,
} from '../charts/format'
import type { DebtYear } from '../../data/types'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'debt'

/** Debt has no real-dollar series — deflating a stock of borrowing to FY2025
 *  dollars would answer no question this section asks — so §1 offers two of the
 *  three shared units, not all three. */
type DebtUnit = Extract<Unit, 'nominal' | 'gdp'>

const UNITS: readonly DebtUnit[] = ['nominal', 'gdp']

export function DebtChart({ rows }: { rows: DebtYear[] }) {
  const [unit, setUnit] = useState<DebtUnit>('nominal')
  const [focus, setFocus] = useState<number | null>(null)

  // The share-of-GDP view can only show years with a final GDP denominator.
  // Dropping them is honest; carrying them as zero would not be.
  const shown = useMemo(
    () => (unit === 'gdp' ? rows.filter((r) => r.gdp_share != null) : rows),
    [rows, unit],
  )
  const get = (r: DebtYear) => (unit === 'gdp' ? (r.gdp_share as number) : r.debt)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const years = shown.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear(niceExtent(shown.map(get)), [ih, 0])

  const path = d3line<DebtYear>().x((r) => x(r.y)).y((r) => y(get(r))).curve(curveMonotoneX)
  const fill = d3area<DebtYear>().x((r) => x(r.y)).y0(ih).y1((r) => y(get(r))).curve(curveMonotoneX)

  // Read aloud by the point `aria-label`s and the live readout, so the nominal
  // magnitude is spelled out rather than abbreviated to a letter.
  const full = (r: DebtYear) =>
    unit === 'gdp' ? percentGdp(r.gdp_share as number, 1) : trillionsLong(r.debt, 2)

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  // The ten-year doubling the section leads with.
  const markers = shown.filter((r) => r.y === 2016 || r.y === Math.max(...years))
  const active = focus != null ? shown.find((r) => r.y === focus) : null

  const label =
    unit === 'gdp'
      ? 'Gross US federal debt as a share of GDP at each fiscal year end from 1995 to 2025, rising from about 66% to about 124%, with a step up in 2020.'
      : 'Total US public debt outstanding at each fiscal year end from 1995 to 2026 in nominal dollars, rising from about $5 trillion to $40 trillion, with the FY2016 value of $19.6 trillion and the FY2026 value of $40 trillion marked to show the ten-year doubling.'

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} units={UNITS} value={unit} onChange={setUnit} />
      </div>

      <Chart ariaLabel={label} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={(v) => tick(v, unit)}
              label={unit === 'gdp' ? 'Percent of GDP' : '$ trillions'}
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Fiscal year"
              scale={x}
            />
            <path d={fill(shown) ?? ''} fill="var(--mand)" opacity={0.16} />
            <path d={path(shown) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />

            {markers.map((r) => {
              // Both labels sit up and to the LEFT of their point, so neither
              // crosses the curve, which rises left to right throughout.
              const isLast = r.y === Math.max(...years)
              return (
                <g key={r.y}>
                  <circle cx={x(r.y)} cy={y(get(r))} r={4} fill="var(--ink)" />
                  <line
                    x1={x(r.y)} x2={x(r.y)}
                    y1={y(get(r)) - 6} y2={y(get(r)) - (isLast ? 18 : 30)}
                    stroke="var(--ink)" strokeWidth={0.75}
                  />
                  <Annotation
                    frame={fr}
                    x={x(r.y) - 6}
                    y={y(get(r)) - (isLast ? 22 : 34)}
                    anchor="end"
                    label={
                      narrow
                        ? `${fiscalYear(r.y)} ${unit === 'gdp' ? percent(r.gdp_share as number, 0) : trillions(r.debt, 1)}`
                        : `${fiscalYear(r.y)} ${full(r)}`
                    }
                  />
                </g>
              )
            })}

            {/* Every point is Tab-focusable and reports the same thing hover does. */}
            {shown.map((r) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={y(get(r))}
                r={active?.y === r.y ? 5 : 9}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                {...mark()}
                // NOT role="button": focusing a point reveals its value, it does
                // not activate anything. Announcing it as pressable would promise
                // an action that does not exist.
                role="img"
                aria-label={`Fiscal year ${r.y}: ${full(r)}${r.year_end ? '' : ', not a year-end value'}`}
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
        {active
          ? `${fiscalYear(active.y)}: ${full(active)}${active.year_end ? '' : ' (not a fiscal year-end close)'}`
          : 'Focus or hover a year to read its value.'}
      </p>

      <TableView
        caption="Total US public debt outstanding at fiscal year end"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'debt', label: 'Gross debt', unit: '$ trillions' },
          { key: 'share', label: 'Share of GDP', unit: 'percent' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          debt: r.debt.toFixed(2),
          share: r.gdp_share == null ? null : r.gdp_share.toFixed(1),
          basis: r.year_end ? 'Year-end close' : `As of ${r.as_of ?? 'n/a'}`,
        }))}
      />
    </div>
  )
}
