/** Section 3: who works, and who is counted.
 *
 *  Unemployment and the noncyclical rate share a base (the labour force), so
 *  they share the top panel and one y-axis. Participation is a percent of a
 *  different base (the civilian population 16 and over) and keeps its own
 *  panel, because two denominators are two panels. A second y-axis would put
 *  both denominators on one scale.
 *
 *  RECHARTS DRAWS ONE SURFACE PER CHART, so the two panels are two charts.
 *  Both are forced onto `X_DOMAIN`, and neither derives an x domain of its own.
 *  Two derived domains would disagree by a pixel or two and a reader could no
 *  longer read straight down a year.
 *
 *  Interaction lives on the top panel only. The bottom panel carries no
 *  hoverable element, so hover and focus parity holds exactly, and the top
 *  panel's chart holds the figure's only roving group.
 *
 *  Two reference-identity rules govern this file, both recorded in
 *  `../charts/RechartsFrame.tsx`. `useFrame` memoises every axis value for the
 *  first, and the `dot` renderers below are deliberately fresh on every render
 *  for the second.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart, type DotItemDotProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import { stackDown } from '../charts/annotate'
import { ChartHint } from '../charts/ChartHint'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { frame as makeFrame, linear, extent } from '../charts/scales'
import { BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY, splitAtBoundary } from '../charts/estimates'
import { TableView } from './TableView'
import type { EconomyYear } from '../../data/types'

/** The x domain both panels are forced onto. Module scope, so its identity is
 *  stable and the memo in `useFrame` holds. */
const X_DOMAIN: [number, number] = [1950, 2036]

const asYear = (v: number) => `${v}`
const asPercent = (v: number) => `${v}%`
const asWholePercent = (v: number) => `${v.toFixed(0)}%`

const TOP_LABEL =
  "Unemployment fell to 4.2% in fiscal 2025, below CBO's noncyclical rate of 4.4%, after a fiscal year peak of 10.1% in 1983 and 7.3% in fiscal 2020."
const BOTTOM_LABEL =
  'Labour force participation was 62.4% in fiscal 2025, 4.7 points below its fiscal 2000 peak of 67.1%.'

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

  const { actual, projected } = useMemo(
    () => splitAtBoundary(rows, lastActualFy),
    [rows, lastActualFy],
  )

  // Top panel: unemployment and the noncyclical rate share the labour-force
  // base, so they share a zero-based axis. `useFrame` derives it through
  // niceExtent, which forces the low end to zero and clips nothing.
  const top = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: rows.flatMap((r) => [r.unemp, r.nairu]).filter((v): v is number => v != null),
    xDomain: X_DOMAIN,
  })

  // Bottom panel: participation never approaches zero, so a zero-based axis
  // would squash an eight-point move into an unreadable band. The domain is
  // forced from a padded extent, and it is NOT zero-based.
  const lfprValues = rows.map((r) => r.lfpr).filter((v): v is number => v != null)
  const [lfprLo, lfprHi] = extent(lfprValues)
  const lfprPad = (lfprHi - lfprLo) * 0.1
  const bottom = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: lfprValues,
    yDomain: [lfprLo - lfprPad, lfprHi + lfprPad],
    xDomain: X_DOMAIN,
    yTickCount: [3, 5],
  })

  // The bottom panel is two thirds the height of the top one, as it was before
  // the conversion. `useChartSize` inside `useFrame` reports one height, so the
  // shorter panel builds its own frame and its own y scale from that height.
  const H2 = Math.round(bottom.size.height * 0.66)
  const f2 = makeFrame(bottom.size.width, H2, bottom.size.margin)
  const yBottom = linear(bottom.yDomain, [f2.innerHeight, 0])
  const bottomStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${bottom.size.width} / ${H2}` }),
    [bottom.size.width, H2],
  )

  /** One row per year, with the actual and the projected branch in separate
   *  keys. Recharts takes one data array per surface, so the split
   *  `splitAtBoundary` expresses as two arrays is expressed here as two keys
   *  and `connectNulls={false}`. The boundary year appears in both, which is
   *  what joins the solid branch to the dashed one. */
  const data = useMemo(() => {
    const isActual = new Set(actual.map((r) => r.y))
    const isProjected = new Set(projected.map((r) => r.y))
    return rows.map((r) => ({
      y: r.y,
      unempActual: isActual.has(r.y) ? r.unemp : null,
      unempProjected: isProjected.has(r.y) ? r.unemp : null,
      nairuActual: isActual.has(r.y) ? r.nairu : null,
      nairuProjected: isProjected.has(r.y) ? r.nairu : null,
      lfprActual: isActual.has(r.y) ? r.lfpr : null,
      lfprProjected: isProjected.has(r.y) ? r.lfpr : null,
      // Carries the per-year hit rects. The value only has to sit inside the
      // domain, because a dot outside it is never rendered.
      hit: top.yDomain[0],
    }))
  }, [rows, actual, projected, top.yDomain])

  const xFormat = useTickFormat(asYear, null)
  const topYFormat = useTickFormat(asPercent, null)
  const bottomYFormat = useTickFormat(asWholePercent, null)

  const lastActualRow = actual[actual.length - 1]

  /** The two end-of-line names, ordered as the lines read at the last actual
   *  year and pushed apart only where they would touch. See `stackDown`. */
  const stackedNames = useMemo(() => {
    if (!lastActualRow) return []
    const series = [
      { label: 'Unemployment', v: lastActualRow.unemp as number },
      { label: 'Noncyclical rate', v: lastActualRow.nairu as number },
    ]
      .filter((r) => Number.isFinite(r.v))
      .sort((a, b) => b.v - a.v)
    const ys = stackDown(series.map((r) => top.y(r.v) - 8))
    return series.map((r, i) => ({ label: r.label, y: ys[i] as number }))
  }, [lastActualRow, top.y])

  const active = focus != null ? rows.find((r) => r.y === focus) : null

  // Called once per row in this render, then handed to the dot renderer by
  // index. `mark()` counts from a counter that resets once per render of the
  // component holding the hook, and the renderer runs inside `<Line>`, which
  // can render without this island rendering.
  const markProps = rows.map(() => top.mark())

  /** The per-year hit rect, and the two focused points that sit on it. Fresh on
   *  every render, and never wrapped in `useCallback`: an identical `dot` prop
   *  makes React bail out of the `<Line>` subtree, and the marks then freeze at
   *  their first paint while the readout keeps working. */
  const hitDot = (props: DotItemDotProps) => {
    const r = rows[props.index]
    if (!r) return null
    const band = top.f.innerWidth / rows.length
    const on = active?.y === r.y
    return (
      <g key={r.y}>
        <rect
          className="datum"
          x={Number(props.cx) - band / 2}
          y={top.f.margin.top}
          width={band}
          height={top.f.innerHeight}
          fill="transparent"
          {...markProps[props.index]}
          role="img"
          aria-label={describe(r)}
          onFocus={() => setFocus(r.y)}
          onBlur={() => setFocus(null)}
          onMouseEnter={() => setFocus(r.y)}
          onMouseLeave={() => setFocus(null)}
        />
        {on && (
          <>
            <circle
              cx={Number(props.cx)}
              cy={top.f.margin.top + top.y(r.unemp as number)}
              r={4}
              fill="var(--ink)"
            />
            <circle
              cx={Number(props.cx)}
              cy={top.f.margin.top + top.y(r.nairu as number)}
              r={4}
              fill="var(--disc)"
            />
          </>
        )}
      </g>
    )
  }

  return (
    <div>
      <div ref={top.boxRef} {...top.wrapperProps}>
        <LineChart
          ref={top.surfaceRef}
          data={data}
          width={top.size.width}
          height={top.size.height}
          margin={top.chartMargin}
          style={top.chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={TOP_LABEL}
        >
          <PlotGrid />
          <PlotXAxis
            domain={top.xDomain}
            ticks={top.xTicks}
            gutter={top.size.margin.bottom}
            unit="Fiscal year"
            format={xFormat}
          />
          <PlotYAxis
            domain={top.yDomain}
            ticks={top.yTicks}
            gutter={top.size.margin.left}
            unit="Percent of the labour force"
            format={topYFormat}
          />
          <Line
            type="linear"
            dataKey="unempActual"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="unempProjected"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeDasharray={PROJECTED_DASH}
            strokeOpacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="nairuActual"
            stroke="var(--disc)"
            strokeWidth={1.25}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="nairuProjected"
            stroke="var(--disc)"
            strokeWidth={1.25}
            strokeDasharray={PROJECTED_DASH}
            strokeOpacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {/* The hit series draws no line. It exists so every year gets a mark,
              including the projected years, where the solid branch is null. */}
          <Line
            dataKey="hit"
            stroke="none"
            dot={hitDot}
            activeDot={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={top.f.margin}>
            {/* The two lines meet at the boundary year, so the two names sat
                on each other: 79.4px of overlap at 1440px. They are stacked in
                the order the lines read at that year, each held to its own
                line wherever the other allows. Neither is dropped, because the
                name is what tells the two lines apart without colour. */}
            {lastActualRow && (
              <>
                {stackedNames.map((n) => (
                  <Annotation
                    key={n.label}
                    frame={top.f}
                    x={top.x(lastActualRow.y) - 4}
                    y={n.y}
                    anchor="end"
                    halo
                    label={n.label}
                  />
                ))}
              </>
            )}
            <BoundaryRule
              frame={top.f}
              x={top.x(lastActualFy)}
              label={`Last actual, FY${lastActualFy}`}
            />
          </PlotOverlay>
        </LineChart>
      </div>

      <div ref={bottom.boxRef} {...bottom.wrapperProps}>
        <LineChart
          ref={bottom.surfaceRef}
          data={data}
          width={bottom.size.width}
          height={H2}
          margin={bottom.chartMargin}
          style={bottomStyle}
          {...SURFACE_DEFAULTS}
          role="img"
          aria-label={BOTTOM_LABEL}
        >
          <PlotGrid />
          <PlotXAxis
            domain={bottom.xDomain}
            ticks={bottom.xTicks}
            gutter={bottom.size.margin.bottom}
            unit="Fiscal year"
            format={xFormat}
          />
          <PlotYAxis
            domain={bottom.yDomain}
            ticks={bottom.yTicks}
            gutter={bottom.size.margin.left}
            unit="Percent of the population 16+"
            format={bottomYFormat}
          />
          <Line
            type="linear"
            dataKey="lfprActual"
            stroke="var(--mand)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="lfprProjected"
            stroke="var(--mand)"
            strokeWidth={2}
            strokeDasharray={PROJECTED_DASH}
            strokeOpacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f2.margin}>
            {lastActualRow && (
              <Annotation
                frame={f2}
                x={bottom.x(lastActualRow.y) - 4}
                y={yBottom(lastActualRow.lfpr as number) - 8}
                anchor="end"
                halo
                label="Labour force participation"
              />
            )}
            <BoundaryRule
              frame={f2}
              x={bottom.x(lastActualFy)}
              label={`Last actual, FY${lastActualFy}`}
            />
          </PlotOverlay>
        </LineChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="fiscal year" />}
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
