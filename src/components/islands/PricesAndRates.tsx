/** Section 4: prices and rates.
 *
 *  Two stacked panels on one x domain. `cpi` and `core_pce` are published as
 *  INDEX LEVELS, not rates, so the top panel derives the year-over-year percent
 *  change once, here. The chart, the table and the copy then all show a rate of
 *  change, and no index level is ever labelled "inflation". The bottom panel
 *  draws the three rate series, already percentages, at their native level.
 *
 *  RECHARTS DRAWS ONE SURFACE PER CHART, so the two panels are two charts.
 *  Both are forced onto `X_DOMAIN` rather than deriving one each. Two derived
 *  domains would disagree by a pixel or two and a reader could no longer read
 *  straight down a fiscal year.
 *
 *  Both panels split at the actual/projection boundary and carry a
 *  `BoundaryRule`. Interaction lives on the top panel only, per the `WhoWorks`
 *  convention, so the top panel's chart holds the figure's only roving group.
 *
 *  Two reference-identity rules govern this file, both recorded in
 *  `../charts/RechartsFrame.tsx`. `useFrame` memoises every axis value for the
 *  first, and the `dot` renderer below is deliberately fresh on every render
 *  for the second.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart, type DotItemDotProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import { stackDown } from '../charts/annotate'
import { ZeroLine } from '../charts/Axis'
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
import { frame as makeFrame, linear } from '../charts/scales'
import { BoundaryRule, PROJECTED_DASH, PROJECTED_OPACITY, splitAtBoundary } from '../charts/estimates'
import { TableView } from './TableView'
import type { EconomyYear } from '../../data/types'

/** The x domain both panels are forced onto. Module scope, so its identity is
 *  stable and the memo in `useFrame` holds. */
const X_DOMAIN: [number, number] = [1950, 2036]

const asYear = (v: number) => `${v}`
const asWholePercent = (v: number) => `${v.toFixed(0)}%`

const TOP_LABEL =
  'CPI-U inflation peaked at 13.6% in fiscal 1980 and the fed funds rate at 16.9% in fiscal 1981; both fell to near zero between 2009 and 2021 before rising again, with CPI-U inflation at 2.7% and the fed funds rate at 4.4% in fiscal 2025.'
const BOTTOM_LABEL =
  'The fed funds rate, the 3-month bill and the 10-year note all fell to near-zero fiscal-year values between 2009 and 2021 (the fed funds rate to 0.08% in fiscal 2021 and the 3-month bill to 0.03% in fiscal 2015), on the same zero-anchored axis that holds the fiscal 1981 peak of 16.9%.'

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

  const inflationRows: InflationRow[] = useMemo(
    () =>
      rows.map((r) => ({
        y: r.y,
        actual: r.actual,
        cpiYoy: yoy(rows, 'cpi', r.y),
        pceYoy: yoy(rows, 'core_pce', r.y),
      })),
    [rows],
  )
  const infByYear = useMemo(
    () => new Map(inflationRows.map((r) => [r.y, r])),
    [inflationRows],
  )

  // Each series is split by its own call, so the guard against a row flagged
  // actual past the boundary runs over the derived series as well as the raw one.
  const inf = useMemo(
    () => splitAtBoundary(inflationRows, lastActualFy),
    [inflationRows, lastActualFy],
  )
  const rate = useMemo(() => splitAtBoundary(rows, lastActualFy), [rows, lastActualFy])

  // Top panel: derived inflation. The data minimum (CPI-U FY1955, -0.47%) is
  // negative, so niceExtent leaves the padded low end negative and a ZeroLine
  // makes that legible by position.
  const top = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: inflationRows
      .flatMap((r) => [r.cpiYoy, r.pceYoy])
      .filter((v): v is number => v != null),
    xDomain: X_DOMAIN,
  })

  // Bottom panel: none of the three rate series ever goes negative, so
  // niceExtent anchors this axis at exactly 0 and pads only the high end (#34).
  const bottom = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: rows
      .flatMap((r) => [r.ff, r.t3m, r.t10])
      .filter((v): v is number => v != null),
    xDomain: X_DOMAIN,
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

  /** One row per year, with the actual and the projected branch of every series
   *  in separate keys. Recharts takes one data array per surface, so the split
   *  `splitAtBoundary` expresses as two arrays is expressed here as two keys and
   *  `connectNulls={false}`. The boundary year appears in both, which is what
   *  joins the solid branch to the dashed one. */
  const data = useMemo(() => {
    const infActual = new Set(inf.actual.map((r) => r.y))
    const infProjected = new Set(inf.projected.map((r) => r.y))
    const rateActual = new Set(rate.actual.map((r) => r.y))
    const rateProjected = new Set(rate.projected.map((r) => r.y))
    return rows.map((r) => {
      const i = infByYear.get(r.y) as InflationRow
      return {
        y: r.y,
        cpiActual: infActual.has(r.y) ? i.cpiYoy : null,
        cpiProjected: infProjected.has(r.y) ? i.cpiYoy : null,
        pceActual: infActual.has(r.y) ? i.pceYoy : null,
        pceProjected: infProjected.has(r.y) ? i.pceYoy : null,
        ffActual: rateActual.has(r.y) ? r.ff : null,
        ffProjected: rateProjected.has(r.y) ? r.ff : null,
        t3mActual: rateActual.has(r.y) ? r.t3m : null,
        t3mProjected: rateProjected.has(r.y) ? r.t3m : null,
        t10Actual: rateActual.has(r.y) ? r.t10 : null,
        t10Projected: rateProjected.has(r.y) ? r.t10 : null,
        // Carries the per-year hit rects. The value only has to sit inside the
        // domain, because a dot outside it is never rendered.
        hit: top.yDomain[0],
      }
    })
  }, [rows, infByYear, inf, rate, top.yDomain])

  const xFormat = useTickFormat(asYear, null)
  const yFormat = useTickFormat(asWholePercent, null)

  const lastActualInf = inf.actual[inf.actual.length - 1]
  const lastActualRow = rate.actual[rate.actual.length - 1]
  /** The three end-of-line names, ordered as the lines read at the last actual
   *  year and pushed apart only where they would touch. See `stackDown`. */
  const stackedRates = useMemo(() => {
    if (!lastActualRow) return []
    const series = [
      { label: 'Fed funds', v: lastActualRow.ff as number },
      { label: '3-month bill', v: lastActualRow.t3m as number },
      { label: '10-year note', v: lastActualRow.t10 as number },
    ]
      .filter((r) => Number.isFinite(r.v))
      .sort((a, b) => b.v - a.v)
    const ys = stackDown(series.map((r) => yBottom(r.v) - 8))
    return series.map((r, i) => ({ label: r.label, y: ys[i] as number }))
  }, [lastActualRow, yBottom])

  const active = focus != null ? rows.find((r) => r.y === focus) : null
  const activeInf = focus != null ? infByYear.get(focus) : null

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
    const on = active?.y === r.y ? activeInf : null
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
          aria-label={describe(r, infByYear.get(r.y) as InflationRow)}
          onFocus={() => setFocus(r.y)}
          onBlur={() => setFocus(null)}
          onMouseEnter={() => setFocus(r.y)}
          onMouseLeave={() => setFocus(null)}
        />
        {on?.cpiYoy != null && (
          <circle
            cx={Number(props.cx)}
            cy={top.f.margin.top + top.y(on.cpiYoy)}
            r={4}
            fill="var(--ink)"
          />
        )}
        {on?.pceYoy != null && (
          <circle
            cx={Number(props.cx)}
            cy={top.f.margin.top + top.y(on.pceYoy)}
            r={4}
            fill="var(--disc)"
          />
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
            unit="Percent change from the previous fiscal year"
            format={yFormat}
          />
          <Line
            type="linear"
            dataKey="cpiActual"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="cpiProjected"
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
            dataKey="pceActual"
            stroke="var(--disc)"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="pceProjected"
            stroke="var(--disc)"
            strokeWidth={1.5}
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
            <ZeroLine frame={top.f} y={top.y(0)} />
            {lastActualInf && (
              <>
                <Annotation
                  frame={top.f}
                  x={top.x(lastActualInf.y) - 4}
                  y={top.y(lastActualInf.cpiYoy as number) - 8}
                  anchor="end"
                  halo
                  label="CPI-U"
                />
                <Annotation
                  frame={top.f}
                  x={top.x(lastActualInf.y) - 4}
                  y={top.y(lastActualInf.pceYoy as number) + 14}
                  anchor="end"
                  halo
                  label="Core PCE"
                />
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
            unit="Percent per year"
            format={yFormat}
          />
          <Line
            type="linear"
            dataKey="ffActual"
            stroke="var(--int)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="ffProjected"
            stroke="var(--int)"
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
            dataKey="t3mActual"
            stroke="var(--ink-soft)"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="t3mProjected"
            stroke="var(--ink-soft)"
            strokeWidth={1.5}
            strokeDasharray={PROJECTED_DASH}
            strokeOpacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="t10Actual"
            stroke="var(--mand)"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="t10Projected"
            stroke="var(--mand)"
            strokeWidth={1.5}
            strokeDasharray={PROJECTED_DASH}
            strokeOpacity={PROJECTED_OPACITY}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f2.margin}>
            {/* The three rates converge. In FY2025 they sit within 0.2
                percentage points of each other, so three labels each placed
                against its own line landed on top of one another: `Fed funds`
                crossed `10-year note` by 50.6px at 1440px. They are stacked in
                the order the lines themselves read at that year, each as close
                to its own line as the one above it allows. No name is dropped:
                the name is what identifies a line without colour. */}
            {lastActualRow && (
              <>
                {stackedRates.map((r) => (
                  <Annotation
                    key={r.label}
                    frame={f2}
                    x={bottom.x(lastActualRow.y) - 4}
                    y={r.y}
                    anchor="end"
                    halo
                    label={r.label}
                  />
                ))}
              </>
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
          const i = infByYear.get(r.y) as InflationRow
          return {
            y: r.y,
            cpiYoy: i.cpiYoy != null ? i.cpiYoy.toFixed(1) : null,
            pceYoy: i.pceYoy != null ? i.pceYoy.toFixed(1) : null,
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
