/** Section 1: the debt series.
 *
 *  BRIEF.md interaction note: nominal and share-of-GDP must be EQUALLY
 *  prominent, not one primary and one buried. Nominal doubles; the ratio goes
 *  105% to 124%. A reader who only sees one has been misled. Hence the toggle
 *  sits above the chart, and the standfirst names both.
 */
import { useMemo, useState } from 'react'
import { line as d3line, area as d3area, curveMonotoneX } from 'd3-shape'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Chart } from '../charts/Chart'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { DebtYear } from '../../data/types'

type View = 'nominal' | 'gdp'

const VIEWS: { value: View; label: string }[] = [
  { value: 'nominal', label: 'Nominal dollars' },
  { value: 'gdp', label: '% of GDP' },
]

export function DebtChart({ rows }: { rows: DebtYear[] }) {
  const [view, setView] = useState<View>('nominal')
  const [focus, setFocus] = useState<number | null>(null)

  // The share-of-GDP view can only show years with a final GDP denominator.
  // Dropping them is honest; carrying them as zero would not be.
  const shown = useMemo(
    () => (view === 'gdp' ? rows.filter((r) => r.gdp_share != null) : rows),
    [rows, view],
  )
  const get = (r: DebtYear) => (view === 'gdp' ? (r.gdp_share as number) : r.debt)

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

  const fmt = (v: number) => {
    if (view === 'gdp') return `${v.toFixed(0)}%`
    if (v === 0) return '$0'
    return v < 1 ? `$${(v * 1000).toFixed(0)}B` : `$${v.toFixed(0)}T`
  }
  const fmtFull = (r: DebtYear) =>
    view === 'gdp' ? `${(r.gdp_share as number).toFixed(1)}% of GDP` : `$${r.debt.toFixed(2)} trillion`

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  // The ten-year doubling the section leads with.
  const markers = shown.filter((r) => r.y === 2016 || r.y === Math.max(...years))
  const active = focus != null ? shown.find((r) => r.y === focus) : null

  const label =
    view === 'gdp'
      ? 'Gross US federal debt as a share of GDP at each fiscal year end from 1995 to 2025, rising from about 66% to about 124%, with a step up in 2020.'
      : 'Total US public debt outstanding at each fiscal year end from 1995 to 2026 in nominal dollars, rising from about $5 trillion to $40 trillion, with the FY2016 value of $19.6 trillion and the FY2026 value of $40 trillion marked to show the ten-year doubling.'

  return (
    <div ref={boxRef}>
      <div className="controls">
        <span className="controls-label" id="debt-units">Measured in</span>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-labelledby="debt-units"
          className="unit-toggle"
        >
          {VIEWS.map((v) => (
            <ToggleGroup.Item key={v.value} value={v.value} className="unit-toggle-item">
              {v.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <Chart ariaLabel={label} width={W} height={H} margin={f}>
        {(fr) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={fmt}
              label={view === 'gdp' ? 'Percent of GDP' : '$ trillions'}
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
                  <text
                    x={x(r.y) - 6}
                    y={y(get(r)) - (isLast ? 22 : 34)}
                    textAnchor="end"
                    className="annotation"
                  >
                    {narrow ? `FY${r.y} ${view === 'gdp' ? `${(r.gdp_share as number).toFixed(0)}%` : `$${r.debt.toFixed(1)}T`}` : `FY${r.y} ${fmtFull(r)}`}
                  </text>
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
                tabIndex={0}
                role="button"
                aria-label={`Fiscal year ${r.y}: ${fmtFull(r)}${r.year_end ? '' : ', not a year-end value'}`}
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
          ? `FY${active.y}: ${fmtFull(active)}${active.year_end ? '' : ' (not a fiscal year-end close)'}`
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
