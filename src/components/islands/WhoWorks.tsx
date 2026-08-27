/** Section 3: who works, and who is counted.
 *
 *  Unemployment and the noncyclical rate share a base (the labour force), so
 *  they share the top panel and one y-axis. Participation is a percent of a
 *  different base (the civilian population 16+) and gets its own panel rather
 *  than a second y-axis on the same chart, which would put two denominators
 *  on one scale. Interaction lives on the top panel only: the bottom panel
 *  has no hoverable element, so hover/focus parity still holds exactly.
 */
import { useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent, extent } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { splitAtBoundary, BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY } from '../charts/estimates'
import type { EconomyYear } from '../../data/types'

/** The single source of truth for a fiscal year's readout: reports
 *  unemployment, the noncyclical rate AND participation for the year, so the
 *  live region says everything the two panels together show. */
function describe(r: EconomyYear): string {
  const basis = r.actual ? 'actual' : 'CBO baseline projection'
  return `Fiscal year ${r.y}: unemployment ${(r.unemp as number).toFixed(1)}%, ` +
    `noncyclical rate ${(r.nairu as number).toFixed(1)}%, ` +
    `labour force participation ${(r.lfpr as number).toFixed(1)}% (${basis}).`
}

export function WhoWorks({ rows, lastActualFy }: { rows: EconomyYear[]; lastActualFy: number }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, margin: f } = size
  const H = size.height
  const H2 = Math.round(H * 0.66)
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const ih2 = H2 - f.top - f.bottom
  const narrow = W < 500

  const { actual, projected } = splitAtBoundary(rows, lastActualFy)

  const x = linear([1950, 2036], [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  // Top panel: unemployment and the noncyclical rate share the labour-force
  // base, so they share a zero-based axis. niceExtent forces the low end to
  // zero, giving a 0-to-about-10.7 axis with nothing clipped.
  const yTop = linear(niceExtent(rows.flatMap((r) => [r.unemp, r.nairu])), [ih, 0])
  const yTopTicks = yTop.ticks(narrow ? 4 : 6)

  // Bottom panel: participation never approaches zero, so a zero-based axis
  // would squash an eight-point move into an unreadable band. Padded extent,
  // not niceExtent, is used deliberately: this axis is NOT zero-based.
  const [lfprLo, lfprHi] = extent(rows.map((r) => r.lfpr))
  const lfprPad = (lfprHi - lfprLo) * 0.1
  const yBottom = linear([lfprLo - lfprPad, lfprHi + lfprPad], [ih2, 0])
  const yBottomTicks = yBottom.ticks(narrow ? 3 : 5)

  const unempLine = d3line<EconomyYear>().defined((r) => r.unemp != null).x((r) => x(r.y)).y((r) => yTop(r.unemp as number))
  const nairuLine = d3line<EconomyYear>().defined((r) => r.nairu != null).x((r) => x(r.y)).y((r) => yTop(r.nairu as number))
  const lfprLine = d3line<EconomyYear>().defined((r) => r.lfpr != null).x((r) => x(r.y)).y((r) => yBottom(r.lfpr as number))

  const lastActualRow = actual[actual.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  return (
    <div ref={boxRef}>
      <Chart
        ariaLabel="Unemployment fell to 4.2% in fiscal 2025, below CBO's noncyclical rate of 4.4%, after a fiscal year peak of 10.1% in 1983 and 7.3% in fiscal 2020."
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft frame={fr} ticks={yTopTicks} format={(v) => `${v}%`} label="Percent of the labour force" scale={yTop} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            <path d={unempLine(actual) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />
            <path d={unempLine(projected) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            <path d={nairuLine(actual) ?? ''} fill="none" stroke="var(--disc)" strokeWidth={1.25} />
            <path d={nairuLine(projected) ?? ''} fill="none" stroke="var(--disc)" strokeWidth={1.25} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />

            {lastActualRow && (
              <>
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yTop(lastActualRow.unemp as number) - 8} anchor="end" label="Unemployment" />
                <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yTop(lastActualRow.nairu as number) + 14} anchor="end" label="Noncyclical rate" />
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
                    <circle cx={x(r.y)} cy={yTop(r.unemp as number)} r={4} fill="var(--ink)" />
                    <circle cx={x(r.y)} cy={yTop(r.nairu as number)} r={4} fill="var(--disc)" />
                  </>
                )}
              </g>
            ))}
          </>
        )}
      </Chart>

      <Chart
        ariaLabel="Labour force participation was 62.4% in fiscal 2025, 4.7 points below its fiscal 2000 peak of 67.1%."
        width={W}
        height={H2}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft frame={fr} ticks={yBottomTicks} format={(v) => `${v.toFixed(0)}%`} label="Percent of the population 16 and over" scale={yBottom} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            <path d={lfprLine(actual) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={2} />
            <path d={lfprLine(projected) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={2} strokeDasharray={PROJECTED_DASH} opacity={PROJECTED_OPACITY} />
            {lastActualRow && (
              <Annotation frame={fr} x={x(lastActualRow.y) - 4} y={yBottom(lastActualRow.lfpr as number) - 8} anchor="end" label="Labour force participation" />
            )}
            <BoundaryRule frame={fr} x={x(lastActualFy)} label={`Last actual, FY${lastActualFy}`} />
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : 'Focus or hover a fiscal year to read its value.'}
      </p>

      <TableView
        caption="Unemployment, the noncyclical rate and labour force participation by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'unemp', label: 'Unemployment rate', unit: 'percent' },
          { key: 'nairu', label: 'Noncyclical rate', unit: 'percent' },
          { key: 'lfpr', label: 'Participation rate', unit: 'percent' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          unemp: r.unemp != null ? r.unemp.toFixed(1) : null,
          nairu: r.nairu != null ? r.nairu.toFixed(1) : null,
          lfpr: r.lfpr != null ? r.lfpr.toFixed(1) : null,
          basis: r.actual ? 'Actual' : 'CBO baseline projection',
        }))}
      />
    </div>
  )
}
