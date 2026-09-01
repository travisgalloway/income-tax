/** Section 1: real GDP on a log scale.
 *
 *  A base-10 log axis so a constant growth rate draws as a straight line and
 *  the 2008-09 recession and the FY2020 dip read as bends rather than being
 *  swamped by the last twenty years, as they would be on a linear axis.
 *  The domain is fixed rather than data-derived so the tick array below is
 *  guaranteed to fall inside it, and so a chart never silently rescales when a
 *  CBO revision moves an endpoint.
 *
 *  The y axis is logarithmic, and `PlotYAxis` takes `scale="log"` for it.
 *  Routing through the shared component rather than writing the axis out here
 *  is what gives this island `interval={0}`. Without it Recharts defaults to
 *  `preserveEnd` and drops ticks it judges too close, which on a log axis with
 *  unevenly spaced round values silently removed half of them elsewhere. These
 *  five all render today, and they are spaced the same way.
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
} from '../charts/RechartsFrame'
import { scaleLog } from '../charts/scales'
import { TableView } from './TableView'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** Covers the shipped min (FY1950, 2.383) and max (FY2036, 28.979) with
 *  headroom either side. A log scale is undefined at or below zero;
 *  test_real_gdp_is_positive_in_every_fiscal_year in the pipeline is the guard
 *  that keeps that true across a CBO revision. */
const Y_DOMAIN: [number, number] = [2, 32]
const X_DOMAIN: [number, number] = [1950, 2036]
const WIDE_TICKS = [2, 5, 10, 20, 30]
const NARROW_TICKS = [2, 10, 30]

const TRILLIONS_TICK = (v: number) => `$${v}T`
const YEAR_TICK = (t: number) => `${t}`

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

  const { projected } = splitAtBoundary(rows, lastActualFy)

  /* The boundary row carries both branch values, so the dashed line starts
   * exactly where the solid one ends. `connectNulls={false}` keeps them apart. */
  const plot = useMemo(
    () =>
      rows.map((r) => {
        const ok = r.rgdp != null && r.rgdp > 0
        return {
          y: r.y,
          rgdpActual: ok && r.actual ? r.rgdp : null,
          rgdpProjected: ok && (!r.actual || r.y === lastActualFy) ? r.rgdp : null,
        }
      }),
    [rows, lastActualFy],
  )

  const {
    boxRef, size, f, narrow, xDomain, x, xTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows: plot,
    xOf: (r) => r.y,
    yValues: rows.map((r) => r.rgdp).filter((v): v is number => v != null),
    xDomain: X_DOMAIN,
    yDomain: Y_DOMAIN,
  })

  // The frame's own y is linear, so the overlay gets its own log scale on the
  // same domain and range. Both the axis and this read from `Y_DOMAIN`.
  const y = useMemo(() => scaleLog().domain(Y_DOMAIN).range([f.innerHeight, 0]), [f.innerHeight])
  const yTicks = useMemo(() => (narrow ? NARROW_TICKS : WIDE_TICKS), [narrow])

  const lastProjected = projected[projected.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  const band = f.innerWidth / rows.length
  // Order is data order, and the array is built in this render.
  const markProps = rows.map(() => mark())

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <LineChart
          ref={surfaceRef}
          data={plot}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          aria-label="Real GDP grew 895% between fiscal 1950 and fiscal 2025, from $2.38 trillion to $23.72 trillion in FY2025 chained dollars, tracing a near-straight line on a log scale with visible bends at the 2008 to 2009 recession and in fiscal 2020."
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
            scale="log"
            domain={Y_DOMAIN}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="Real GDP, $ trillions, log scale"
            format={TRILLIONS_TICK}
          />

          <Line
            type="linear"
            dataKey="rgdpActual"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="rgdpProjected"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeDasharray={PROJECTED_DASH}
            opacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            {/* A SECOND ROW, not a second attempt at the same one. The
                boundary rule's own label sits at y=10 and reaches leftward
                from the rule, and this label reaches leftward from the last
                projected year, so the two shared 55.2px of the top-right
                corner at 1440px and 35.3px at 390px. Both name a channel that
                is not colour, the boundary and the dashed branch, so neither
                may be dropped. `labelHeight` is what puts this one clear of
                the row above at every preset.

                It lands on the dashed line at the top of a log scale, which
                is what the halo is for. */}
            {lastProjected && (
              <Annotation
                frame={f}
                x={x(lastProjected.y)}
                y={10 + labelHeight() + 3}
                anchor="end"
                halo
                label="CBO projection"
              />
            )}

            <BoundaryRule frame={f} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />

            {/* Every fiscal year is Tab-focusable and reports the same text hover does. */}
            {rows.map((r, i) => (
              <g key={r.y}>
                <rect
                  className="datum"
                  x={x(r.y) - band / 2}
                  y={0}
                  width={band}
                  height={f.innerHeight}
                  fill="transparent"
                  {...markProps[i]}
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
          </PlotOverlay>
        </LineChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="fiscal year" />}
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
