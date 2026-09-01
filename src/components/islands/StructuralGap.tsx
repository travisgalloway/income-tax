/** Section 5: the structural gap between revenue and outlays, on Recharts.
 *
 *  The deficit/surplus band is read by sign and position FIRST. Colour is the
 *  LAST of four channels: (1) revenue crosses above outlays in surplus years,
 *  which inverts which line is "on top" and survives greyscale entirely,
 *  (2) the surplus band gets a hatch pattern where the deficit fill is flat,
 *  (3) an on-chart text label names the surplus years, (4) --positive vs
 *  --mand reinforces it last. Surplus membership is derived once from
 *  `n_de > 0`, never from the displayed series, so the band is the same
 *  four years in every unit view.
 *
 *  The band is a Recharts RANGE area: a row whose value is `[outlays, revenue]`
 *  fills between the two, and a row whose value is `null` breaks the fill. Two
 *  such areas carry the two fills, because one path cannot hold both. Each run
 *  keeps the previous run's last year, so the two fills meet with no gap.
 */
import { useMemo, useState } from 'react'
import { Area, AreaChart, Line } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { TableView } from './TableView'
import { UnitToggle } from './UnitToggle'
import { UNIT_LABEL, tick, value, fiscalYear, type Unit } from '../charts/format'
import type { BudgetYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'structural-gap'

const START = 1995
const END = 2025

const X_FORMAT = (t: number) => `${t}`

/** A row in the shape Recharts reads. The two band fields are range values,
 *  `[outlays, revenue]`, or null where that fill does not run. String keys, so
 *  no `dataKey` closure is rebuilt per render. */
interface GapRow {
  y: number
  rev: number
  out: number
  deficitBand: [number, number] | null
  surplusBand: [number, number] | null
}

function revenueOf(r: BudgetYear, unit: Unit): number {
  switch (unit) {
    case 'nominal': return r.n_re
    case 'real': return r.r_re
    case 'gdp': return r.g_re
  }
}

function outlaysOf(r: BudgetYear, unit: Unit): number {
  switch (unit) {
    case 'nominal': return r.n_ot
    case 'real': return r.r_ot
    case 'gdp': return r.g_ot
  }
}

/** The Alt text block from sections.md section 5, restated per unit view,
 *  it describes the GDP-share shape, so the dollar views need their own
 *  wording rather than reusing "percent of GDP" text. */
function shapeLabel(unit: Unit): string {
  const basis = unit === 'gdp' ? 'as a percent of GDP' : unit === 'real' ? 'in real FY2025 dollars' : 'in nominal dollars'
  return (
    `Federal outlays ran above revenue ${basis} in every fiscal year from 1995 to 2025 except ` +
    'FY1998-FY2001, when revenue briefly exceeded outlays; the area between the lines is shaded ' +
    'as a deficit, hatched and labelled as a surplus during those years, and both lines spike in ' +
    'FY2009 and FY2020.'
  )
}

export function StructuralGap({ rows }: { rows: BudgetYear[] }) {
  const [unit, setUnit] = useState<Unit>('gdp')
  const [focus, setFocus] = useState<number | null>(null)

  const span = useMemo(() => rows.filter((r) => r.y >= START && r.y <= END), [rows])

  // Surplus membership never depends on the displayed unit, always the sign
  // of the nominal deficit, so the shaded band is identical across all
  // three unit views, rather than working by coincidence in one of them.
  const surplusYears = useMemo(
    () => new Set(span.filter((r) => r.n_de > 0).map((r) => r.y)),
    [span],
  )

  // Segment the span into contiguous surplus/deficit runs: a single area path
  // cannot carry two different fills, and the surplus run is not the whole
  // series. Each segment carries the prior segment's last row too, so the
  // fills meet with no gap at the boundary.
  const segments = useMemo(() => {
    const out: { surplus: boolean; rows: BudgetYear[] }[] = []
    for (const r of span) {
      const surplus = surplusYears.has(r.y)
      const last = out[out.length - 1]
      if (last && last.surplus === surplus) {
        last.rows.push(r)
      } else {
        out.push({ surplus, rows: last ? [last.rows[last.rows.length - 1], r] : [r] })
      }
    }
    return out
  }, [span, surplusYears])

  /* The segment runs, restated as one flat row per year. A year sits in both
   * sets exactly at a run boundary, which is the shared endpoint that closes
   * the gap between the two fills. */
  const chartRows = useMemo<GapRow[]>(() => {
    const inSurplusRun = new Set<number>()
    const inDeficitRun = new Set<number>()
    for (const seg of segments) {
      for (const r of seg.rows) (seg.surplus ? inSurplusRun : inDeficitRun).add(r.y)
    }
    return span.map((r) => {
      const range: [number, number] = [outlaysOf(r, unit), revenueOf(r, unit)]
      return {
        y: r.y,
        rev: revenueOf(r, unit),
        out: outlaysOf(r, unit),
        deficitBand: inDeficitRun.has(r.y) ? range : null,
        surplusBand: inSurplusRun.has(r.y) ? range : null,
      }
    })
  }, [span, segments, unit])

  const yValues = useMemo(() => chartRows.flatMap((r) => [r.rev, r.out]), [chartRows])

  const { size, boxRef, f, xDomain, yDomain, x, y, xTicks, yTicks, chartMargin, chartStyle, surfaceRef, wrapperProps, mark } =
    useFrame({ rows: chartRows, xOf: (r) => r.y, yValues })

  const yFormat = useTickFormat(tick, unit)

  const active = focus != null ? span.find((r) => r.y === focus) : null
  const readoutFor = (r: BudgetYear) => {
    const gap = revenueOf(r, unit) - outlaysOf(r, unit)
    const position = gap >= 0 ? 'surplus' : 'deficit'
    return (
      `FY${r.y}: revenue ${value(revenueOf(r, unit), unit)}, outlays ${value(outlaysOf(r, unit), unit)}, ` +
      `gap ${value(Math.abs(gap), unit)}, a ${position}`
    )
  }

  const last = span[span.length - 1]
  const bandMid = span.find((r) => r.y === 1999) ?? span[0]
  const bandY = (y(revenueOf(bandMid, unit)) + y(outlaysOf(bandMid, unit))) / 2

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} value={unit} onChange={setUnit} />
      </div>

      <div {...wrapperProps}>
        <AreaChart
          ref={surfaceRef}
          data={chartRows}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          {...SURFACE_DEFAULTS}
          aria-label={shapeLabel(unit)}
          style={chartStyle}
        >
          {/* A plain child, not an overlay: `<defs>` renders nothing in place,
              so it needs no plot transform, and the surplus fill below must be
              able to resolve the pattern on the first paint. An overlay is a
              portal and reaches the DOM one render later. */}
          <defs>
            <pattern
              id="gap-surplus-hatch"
              width={6}
              height={6}
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width={6} height={6} fill="var(--positive)" opacity={0.16} />
              <line x1={0} y1={0} x2={0} y2={6} stroke="var(--positive)" strokeWidth={1.5} />
            </pattern>
          </defs>

          <PlotGrid />
          <PlotXAxis
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Fiscal year"
            format={X_FORMAT}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit={UNIT_LABEL[unit]}
            format={yFormat}
          />

          <Area
            className="gap-band"
            type="monotone"
            dataKey="deficitBand"
            stroke="none"
            fill="var(--mand)"
            fillOpacity={0.16}
            isAnimationActive={false}
            activeDot={false}
            dot={false}
            connectNulls={false}
          />
          <Area
            className="gap-band"
            type="monotone"
            dataKey="surplusBand"
            stroke="none"
            fill="url(#gap-surplus-hatch)"
            fillOpacity={1}
            isAnimationActive={false}
            activeDot={false}
            dot={false}
            connectNulls={false}
          />

          <Line
            type="monotone"
            dataKey="out"
            stroke="var(--mand)"
            strokeWidth={2}
            isAnimationActive={false}
            activeDot={false}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rev"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeDasharray="4 3"
            isAnimationActive={false}
            activeDot={false}
            dot={false}
          />

          {/* The three labels and the focusable marks all sit on the band and
              the lines, so they go through the overlay: a plain child renders
              under the area fill. */}
          <PlotOverlay margin={f.margin}>
            {/* Held inside the PLOT. FY1999 sits 39.5 units from the plot's
                left edge at the 360 preset and this label is about 110 wide,
                so centring it put its first word 15 units into the left
                gutter, on top of the `20%` tick: 9.1 by 9.2px of collision
                with nothing clipped. */}
            <Annotation
              frame={f}
              x={x(bandMid.y)}
              y={bandY - 10}
              anchor="middle"
              within="plot"
              halo
              label="Surplus, FY1998-2001"
            />

            <Annotation
              frame={f}
              x={x(last.y) - 4}
              y={y(outlaysOf(last, unit)) - 8}
              anchor="end"
              seriesLabel
              halo
              label="Outlays"
            />
            <Annotation
              frame={f}
              x={x(last.y) - 4}
              y={y(revenueOf(last, unit)) - 8}
              anchor="end"
              seriesLabel
              halo
              label="Revenue"
            />

            {/* Every year is a focusable datum reporting revenue, outlays,
                the gap and the word surplus or deficit. */}
            {span.map((r) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={(y(revenueOf(r, unit)) + y(outlaysOf(r, unit))) / 2}
                r={active?.y === r.y ? 5 : 9}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                {...mark()}
                role="img"
                aria-label={readoutFor(r)}
                onFocus={() => setFocus(r.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(r.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </PlotOverlay>
        </AreaChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? readoutFor(active) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Federal revenue and outlays by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'revenue', label: 'Revenue', unit: UNIT_LABEL[unit] },
          { key: 'outlays', label: 'Outlays', unit: UNIT_LABEL[unit] },
          { key: 'gap', label: 'Gap', unit: UNIT_LABEL[unit] },
          { key: 'position', label: 'Position', unit: '' },
        ]}
        rows={span.map((r) => {
          const gap = revenueOf(r, unit) - outlaysOf(r, unit)
          return {
            y: fiscalYear(r.y),
            revenue: value(revenueOf(r, unit), unit),
            outlays: value(outlaysOf(r, unit), unit),
            gap: value(Math.abs(gap), unit),
            position: gap >= 0 ? 'Surplus' : 'Deficit',
          }
        })}
      />
    </div>
  )
}
