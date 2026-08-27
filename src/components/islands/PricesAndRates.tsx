/** Section 4: prices and rates.
 *
 *  Two stacked panels sharing one x-axis. `cpi` and `core_pce` are published as
 *  INDEX LEVELS, not rates: the top panel derives the year-over-year percent
 *  change once, here, so the chart, the table and the copy all show a rate of
 *  change, and no index level is ever labelled "inflation". The bottom panel
 *  draws the three rate series (already percentages) at their native level.
 *
 *  Both panels split at the actual/projection boundary and carry a
 *  `BoundaryRule`; interaction lives on the top panel only, per the `WhoWorks`
 *  convention (the bottom panel has no hoverable element, so hover/focus
 *  parity still holds exactly).
 */
import { useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft, ZeroLine } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

interface InflationRow { y: number; actual: boolean; cpiYoy: number | null; pceYoy: number | null }

function yoy(rows: EconomyYear[], field: 'cpi' | 'core_pce', y: number): number | null {
  const prev = rows.find((r) => r.y === y - 1)?.[field]
  const cur = rows.find((r) => r.y === y)?.[field]
  return prev != null && cur != null && prev !== 0 ? (100 * (cur - prev)) / prev : null
}

const pct = (v: number | null) => (v == null ? 'no data' : `${v.toFixed(1)}%`)

/** The single source of truth for a fiscal year's readout, so hover and
 *  keyboard focus report identical text. */
function describe(r: EconomyYear, inf: InflationRow): string {
  const basis = r.actual ? 'actual' : 'CBO baseline projection'
  return `Fiscal year ${r.y}: CPI-U inflation ${pct(inf.cpiYoy)}, core PCE inflation ` +
    `${pct(inf.pceYoy)}, fed funds rate ${pct(r.ff)}, 3-month bill ${pct(r.t3m)}, ` +
    `10-year note ${pct(r.t10)} (${basis}).`
}

export function PricesAndRates({ rows, lastActualFy }: { rows: EconomyYear[]; lastActualFy: number }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, margin: f } = size
  const H = size.height
  const H2 = Math.round(H * 0.66)
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const ih2 = H2 - f.top - f.bottom
  const narrow = W < 500

  const inflationRows: InflationRow[] = rows.map((r) => ({
    y: r.y,
    actual: r.actual,
    cpiYoy: yoy(rows, 'cpi', r.y),
    pceYoy: yoy(rows, 'core_pce', r.y),
  }))
  const infByYear = new Map(inflationRows.map((r) => [r.y, r]))

  const { actual: infActual, projected: infProjected } = splitAtBoundary(inflationRows, lastActualFy)
  const { actual, projected } = splitAtBoundary(rows, lastActualFy)

  const x = linear([1950, 2036], [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  // Top panel: derived inflation. The data minimum (CPI-U FY1955, -0.47%) is
  // negative, so niceExtent leaves the padded low end negative and a ZeroLine
  // is drawn to make that legible by position.
  const yTop = linear(niceExtent(inflationRows.flatMap((r) => [r.cpiYoy, r.pceYoy])), [ih, 0])
  const yTopTicks = yTop.ticks(narrow ? 4 : 6)

  // Bottom panel: none of the three rate series ever goes negative, so
  // niceExtent anchors this axis at exactly 0 and pads only the high end (#34).
  const rateValues = rows.flatMap((r) => [r.ff, r.t3m, r.t10])
  const yBottom = linear(niceExtent(rateValues), [ih2, 0])
  const yBottomTicks = yBottom.ticks(narrow ? 4 : 6)

  const cpiLine = d3line<InflationRow>().defined((r) => r.cpiYoy != null).x((r) => x(r.y)).y((r) => yTop(r.cpiYoy as number))
  const pceLine = d3line<InflationRow>().defined((r) => r.pceYoy != null).x((r) => x(r.y)).y((r) => yTop(r.pceYoy as number))
  const ffLine = d3line<EconomyYear>().defined((r) => r.ff != null).x((r) => x(r.y)).y((r) => yBottom(r.ff as number))
  const t3mLine = d3line<EconomyYear>().defined((r) => r.t3m != null).x((r) => x(r.y)).y((r) => yBottom(r.t3m as number))
  const t10Line = d3line<EconomyYear>().defined((r) => r.t10 != null).x((r) => x(r.y)).y((r) => yBottom(r.t10 as number))

  const lastActualInf = infActual[infActual.length - 1]
  const lastActualRow = actual[actual.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null
  const activeInf = focus != null ? infByYear.get(focus) : null

  return (
    <div ref={boxRef}>
      <Chart
        ariaLabel="CPI-U inflation peaked at 13.6% in fiscal 1980 and the fed funds rate at 16.9% in fiscal 1981; both fell to near zero between 2009 and 2021 before rising again, with CPI-U inflation at 2.7% and the fed funds rate at 4.4% in fiscal 2025."
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr, mark) => (
          <>
            <AxisLeft frame={fr} ticks={yTopTicks} format={(v) => `${v.toFixed(0)}%`} label="Percent change from the previous fiscal year" scale={yTop} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />
            <ZeroLine frame={fr} y={yTop(0)} />

            <path d={cpiLine(infActual) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />
            <path d={cpiLine(infProjected) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            <path d={pceLine(infActual) ?? ''} fill="none" stroke="var(--disc)" strokeWidth={1.5} />
            <path d={pceLine(infProjected) ?? ''} fill="none" stroke="var(--disc)" strokeWidth={1.5} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />

            {lastActualInf && (
              <>
                <Annotation frame={fr} x={x(lastActualInf.y) - 4} y={yTop(lastActualInf.cpiYoy as number) - 8} anchor="end" label="CPI-U" />
                <Annotation frame={fr} x={x(lastActualInf.y) - 4} y={yTop(lastActualInf.pceYoy as number) + 14} anchor="end" label="Core PCE" />
              </>
            )}

            <BoundaryRule frame={fr} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />

            {/* Interaction lives on the top panel only. */}
            {rows.map((r) => (
              <g key={r.y}>
                <rect
                  className="datum"
                  x={x(r.y) - iw / rows.length / 2}
                  y={0}
                  width={iw / rows.length}
                  height={ih}
                  fill="transparent"
                  {...mark()}
                  role="img"
                  aria-label={describe(r, infByYear.get(r.y) as InflationRow)}
                  onFocus={() => setFocus(r.y)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(r.y)}
                  onMouseLeave={() => setFocus(null)}
                />
                {active?.y === r.y && activeInf && (
                  <>
                    {activeInf.cpiYoy != null && <circle cx={x(r.y)} cy={yTop(activeInf.cpiYoy)} r={4} fill="var(--ink)" />}
                    {activeInf.pceYoy != null && <circle cx={x(r.y)} cy={yTop(activeInf.pceYoy)} r={4} fill="var(--disc)" />}
                  </>
                )}
              </g>
            ))}
          </>
        )}
      </Chart>

      <Chart
        ariaLabel="The fed funds rate, the 3-month bill and the 10-year note all fell to near-zero fiscal-year values between 2009 and 2021 (the fed funds rate to 0.08% in fiscal 2021 and the 3-month bill to 0.03% in fiscal 2015), on the same zero-anchored axis that holds the fiscal 1981 peak of 16.9%."
        width={W}
        height={H2}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft frame={fr} ticks={yBottomTicks} format={(v) => `${v.toFixed(0)}%`} label="Percent per year" scale={yBottom} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            <path d={ffLine(actual) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} />
            <path d={ffLine(projected) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            <path d={t3mLine(actual) ?? ''} fill="none" stroke="var(--ink-soft)" strokeWidth={1.5} />
            <path d={t3mLine(projected) ?? ''} fill="none" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            <path d={t10Line(actual) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={1.5} />
            <path d={t10Line(projected) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={1.5} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />

            {lastActualRow && (
              <>
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yBottom(lastActualRow.ff as number) - 8} anchor="end" label="Fed funds" />
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yBottom(lastActualRow.t3m as number) + 14} anchor="end" label="3-month bill" />
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yBottom(lastActualRow.t10 as number) - 20} anchor="end" label="10-year note" />
              </>
            )}

            <BoundaryRule frame={fr} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active && activeInf ? describe(active, activeInf) : <ChartHint noun="fiscal year" />}
      </p>

      <TableView
        caption="Inflation and interest rates by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'cpiYoy', label: 'CPI-U inflation', unit: 'percent change from the previous fiscal year' },
          { key: 'pceYoy', label: 'Core PCE inflation', unit: 'percent change from the previous fiscal year' },
          { key: 'ff', label: 'Fed funds rate', unit: 'percent per year' },
          { key: 't3m', label: '3-month bill', unit: 'percent per year' },
          { key: 't10', label: '10-year note', unit: 'percent per year' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => {
          const inf = infByYear.get(r.y) as InflationRow
          return {
            y: r.y,
            cpiYoy: inf.cpiYoy != null ? inf.cpiYoy.toFixed(1) : null,
            pceYoy: inf.pceYoy != null ? inf.pceYoy.toFixed(1) : null,
            ff: r.ff != null ? r.ff.toFixed(1) : null,
            t3m: r.t3m != null ? r.t3m.toFixed(1) : null,
            t10: r.t10 != null ? r.t10.toFixed(1) : null,
            basis: r.actual ? 'Actual' : 'CBO baseline projection',
          }
        })}
      />
    </div>
  )
}
