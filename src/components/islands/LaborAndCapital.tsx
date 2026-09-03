/** Section 5: labor and capital.
 *
 *  `wage_share` and `profit_share` are both percentages of the SAME
 *  denominator (GDP), unlike `WhoWorks`'s two bases, so they share one panel
 *  and one zero-based y-axis. Zero-based is deliberate: the level difference
 *  between a ~42-51% share and a ~7-13% share is the honest picture of two
 *  shares of one denominator, and a padded non-zero axis would imply a
 *  comparability the data does not have.
 *
 *  Recharts draws four lines, two per series, because economy.json's actual and
 *  projected values may not be one continuous line. The split is expressed as
 *  two null-masked fields per series rather than two data arrays, since one
 *  Recharts chart carries one `data` prop. `splitAtBoundary` still runs, for
 *  its throw and for the last actual row the labels sit on.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
} from '../charts/RechartsFrame'
import { TableView } from './TableView'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** Fixed so a CBO revision that moves an endpoint cannot silently rescale the
 *  panel. Hoisted so the axis prop keeps its reference between renders. */
const X_DOMAIN: [number, number] = [1950, 2036]

const PERCENT_TICK = (v: number) => `${v.toFixed(0)}%`
const YEAR_TICK = (t: number) => `${t}`

/** The single source of truth for a fiscal year's readout. */
function describe(r: EconomyYear): string {
  const basis = r.actual ? 'actual' : 'CBO baseline projection'
  return `Fiscal year ${r.y}: wages and salaries ${(r.wage_share as number).toFixed(1)}% of GDP, ` +
    `corporate profits ${(r.profit_share as number).toFixed(1)}% of GDP (${basis}).`
}

export function LaborAndCapital({ rows, lastActualFy }: { rows: EconomyYear[]; lastActualFy: number }) {
  const [focus, setFocus] = useState<number | null>(null)

  const { actual } = splitAtBoundary(rows, lastActualFy)

  /* The boundary row carries BOTH branch values, so the dashed line starts
   * exactly where the solid one ends, which is what `splitAtBoundary` does with
   * two arrays. `connectNulls={false}` keeps the two branches separate paths. */
  const plot = useMemo(
    () =>
      rows.map((r) => ({
        y: r.y,
        wageActual: r.actual ? r.wage_share : null,
        wageProjected: !r.actual || r.y === lastActualFy ? r.wage_share : null,
        profitActual: r.actual ? r.profit_share : null,
        profitProjected: !r.actual || r.y === lastActualFy ? r.profit_share : null,
      })),
    [rows, lastActualFy],
  )

  const {
    boxRef, size, f, xDomain, yDomain, x, y, xTicks, yTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows: plot,
    xOf: (r) => r.y,
    yValues: rows
      .flatMap((r) => [r.wage_share, r.profit_share])
      .filter((v): v is number => v != null),
    xDomain: X_DOMAIN,
  })

  const lastActualRow = actual[actual.length - 1]
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
          aria-label="Wages and salaries fell from a fiscal 1970 peak of 51.5% of GDP to a fiscal 2024 low of 42.2%, while corporate profits rose from a fiscal 1982 low of 7.0% of GDP to a fiscal 2025 peak of 13.1%, both shares of GDP rather than of national income."
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
            unit="Percent of GDP"
            format={PERCENT_TICK}
          />

          <Line
            type="linear"
            dataKey="wageActual"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="wageProjected"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeDasharray={PROJECTED_DASH}
            opacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="profitActual"
            stroke="var(--int)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="profitProjected"
            stroke="var(--int)"
            strokeWidth={2}
            strokeDasharray={PROJECTED_DASH}
            opacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            {lastActualRow && (
              <>
                <Annotation frame={f} x={x(lastActualRow.y) - 4} y={y(lastActualRow.wage_share as number) - 8} anchor="end" halo label="Wages and salaries" />
                <Annotation frame={f} x={x(lastActualRow.y) - 4} y={y(lastActualRow.profit_share as number) + 14} anchor="end" halo label="Corporate profits" />
              </>
            )}

            <BoundaryRule frame={f} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />

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
                  <>
                    <circle cx={x(r.y)} cy={y(r.wage_share as number)} r={4} fill="var(--ink)" />
                    <circle cx={x(r.y)} cy={y(r.profit_share as number)} r={4} fill="var(--int)" />
                  </>
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
        caption="Wages and salaries against corporate profits, both as a percent of GDP, by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'wage', label: 'Wages and salaries', unit: 'percent of GDP' },
          { key: 'profit', label: 'Corporate profits', unit: 'percent of GDP' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          wage: r.wage_share != null ? r.wage_share.toFixed(1) : null,
          profit: r.profit_share != null ? r.profit_share.toFixed(1) : null,
          basis: r.actual ? 'Actual' : 'CBO baseline projection',
        }))}
      />
    </div>
  )
}
