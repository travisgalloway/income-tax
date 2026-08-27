/** Section 5: labor and capital.
 *
 *  `wage_share` and `profit_share` are both percentages of the SAME
 *  denominator (GDP), unlike `WhoWorks`'s two bases, so they share one panel
 *  and one zero-based y-axis. Zero-based is deliberate: the level difference
 *  between a ~42-51% share and a ~7-13% share is the honest picture of two
 *  shares of one denominator, and a padded non-zero axis would imply a
 *  comparability the data does not have.
 */
import { useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'

/** The single source of truth for a fiscal year's readout. */
function describe(r: EconomyYear): string {
  const basis = r.actual ? 'actual' : 'CBO baseline projection'
  return `Fiscal year ${r.y}: wages and salaries ${(r.wage_share as number).toFixed(1)}% of GDP, ` +
    `corporate profits ${(r.profit_share as number).toFixed(1)}% of GDP (${basis}).`
}

export function LaborAndCapital({ rows, lastActualFy }: { rows: EconomyYear[]; lastActualFy: number }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const { actual, projected } = splitAtBoundary(rows, lastActualFy)

  const x = linear([1950, 2036], [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))
  const y = linear(niceExtent(rows.flatMap((r) => [r.wage_share, r.profit_share])), [ih, 0])
  const yTicks = y.ticks(narrow ? 4 : 6)

  const wageLine = d3line<EconomyYear>().defined((r) => r.wage_share != null).x((r) => x(r.y)).y((r) => y(r.wage_share as number))
  const profitLine = d3line<EconomyYear>().defined((r) => r.profit_share != null).x((r) => x(r.y)).y((r) => y(r.profit_share as number))

  const lastActualRow = actual[actual.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  return (
    <div ref={boxRef}>
      <Chart
        ariaLabel="Wages and salaries fell from a fiscal 1970 peak of 51.5% of GDP to a fiscal 2024 low of 42.2%, while corporate profits rose from a fiscal 1982 low of 7.0% of GDP to a fiscal 2025 peak of 13.1%, both shares of GDP rather than of national income."
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft frame={fr} ticks={yTicks} format={(v) => `${v.toFixed(0)}%`} label="Percent of GDP" scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            <path d={wageLine(actual) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />
            <path d={wageLine(projected) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            <path d={profitLine(actual) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} />
            <path d={profitLine(projected) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />

            {lastActualRow && (
              <>
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={y(lastActualRow.wage_share as number) - 8} anchor="end" label="Wages and salaries" />
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={y(lastActualRow.profit_share as number) + 14} anchor="end" label="Corporate profits" />
              </>
            )}

            <BoundaryRule frame={fr} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />

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
                  <>
                    <circle cx={x(r.y)} cy={y(r.wage_share as number)} r={4} fill="var(--ink)" />
                    <circle cx={x(r.y)} cy={y(r.profit_share as number)} r={4} fill="var(--int)" />
                  </>
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
