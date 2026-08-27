/** Section 1: real GDP on a log scale.
 *
 *  A base-10 log axis so a constant growth rate draws as a straight line and
 *  the 2008-09 recession and the FY2020 dip read as bends rather than being
 *  swamped by the last twenty years, as they would be on a linear axis.
 *  The domain is fixed rather than data-derived so the tick array below is
 *  guaranteed to fall inside it, and so a chart never silently rescales when a
 *  CBO revision moves an endpoint.
 */
import { useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, scaleLog } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'

/** The single source of truth for a fiscal year's readout text: the focus
 *  rects' aria-label and the live-region paragraph both call this, so hover
 *  and keyboard focus can never announce different things. */
function describe(r: EconomyYear): string {
  const basis = r.actual ? 'actual' : 'CBO baseline projection'
  return `Fiscal year ${r.y}: real GDP $${(r.rgdp as number).toFixed(3)} trillion, ` +
    `nominal GDP $${(r.gdp as number).toFixed(3)} trillion (${basis}).`
}

export function RealGdpLogScale({ rows, lastActualFy }: { rows: EconomyYear[]; lastActualFy: number }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const { actual, projected } = splitAtBoundary(rows, lastActualFy)

  // Domain covers the shipped min (FY1950, 2.383) and max (FY2036, 28.979)
  // with headroom either side. A log scale is undefined at or below zero;
  // test_real_gdp_is_positive_in_every_fiscal_year in the pipeline is the
  // guard that keeps that true across a CBO revision.
  const y = scaleLog().domain([2, 32]).range([ih, 0])
  const x = linear([1950, 2036], [0, iw])

  const yTicks = narrow ? [2, 10, 30] : [2, 5, 10, 20, 30]
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const line = d3line<EconomyYear>()
    .defined((r) => r.rgdp != null && r.rgdp > 0)
    .x((r) => x(r.y))
    .y((r) => y(r.rgdp as number))

  const lastProjected = projected[projected.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  return (
    <div ref={boxRef}>
      <Chart
        ariaLabel="Real GDP grew 895% between fiscal 1950 and fiscal 2025, from $2.38 trillion to $23.72 trillion in FY2025 chained dollars, tracing a near-straight line on a log scale with visible bends at the 2008 to 2009 recession and in fiscal 2020."
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={(v) => `$${v}T`}
              label="Real GDP, $ trillions, log scale"
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Fiscal year"
              scale={x}
            />

            <path d={line(actual) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />
            <path
              d={line(projected) ?? ''}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeDasharray={PROJECTED_DASH}
              opacity={PROJECTED_OPACITY}
            />
            {lastProjected && (
              <Annotation
                frame={fr}
                x={x(lastProjected.y)}
                y={y(lastProjected.rgdp as number) - 10}
                anchor="end"
                label="CBO projection"
              />
            )}

            <BoundaryRule frame={fr} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />

            {/* Every fiscal year is Tab-focusable and reports the same text hover does. */}
            {rows.map((r) => (
              <g key={r.y}>
                <rect
                  className="datum"
                  x={x(r.y) - iw / rows.length / 2}
                  y={0}
                  width={iw / rows.length}
                  height={ih}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={describe(r)}
                  onFocus={() => setFocus(r.y)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(r.y)}
                  onMouseLeave={() => setFocus(null)}
                />
                {active?.y === r.y && (
                  <circle cx={x(r.y)} cy={y(r.rgdp as number)} r={4} fill="var(--ink)" />
                )}
              </g>
            ))}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : 'Focus or hover a fiscal year to read its value.'}
      </p>

      <TableView
        caption="Real and nominal GDP by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'rgdp', label: 'Real GDP', unit: '$ trillions, FY2025 chained' },
          { key: 'gdp', label: 'Nominal GDP', unit: '$ trillions' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          rgdp: (r.rgdp as number).toFixed(3),
          gdp: (r.gdp as number).toFixed(3),
          basis: r.actual ? 'Actual' : 'CBO baseline projection',
        }))}
      />
    </div>
  )
}
