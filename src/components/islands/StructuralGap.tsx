/** Section 5: the structural gap between revenue and outlays.
 *
 *  The deficit/surplus band is read by sign and position FIRST. Colour is the
 *  LAST of four channels: (1) revenue crosses above outlays in surplus years,
 *  which inverts which line is "on top" and survives greyscale entirely,
 *  (2) the surplus band gets a hatch pattern where the deficit fill is flat,
 *  (3) an on-chart text label names the surplus years, (4) --positive vs
 *  --mand reinforces it last. Surplus membership is derived once from
 *  `n_de > 0` -- never from the displayed series -- so the band is the same
 *  four years in every unit view.
 */
import { useMemo, useState } from 'react'
import { line as d3line, area as d3area, curveMonotoneX } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { TableView } from './TableView'
import { UnitToggle } from './UnitToggle'
import { useChartSize } from '../charts/useChartSize'
import { UNIT_LABEL, tick, value, fiscalYear, type Unit } from '../charts/format'
import type { BudgetYear } from '../../data/types'

const START = 1995
const END = 2025

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

/** The Alt text block from sections.md section 5, restated per unit view --
 *  it describes the GDP-share shape, so the dollar views need their own
 *  wording rather than reusing "percent of GDP" text. */
function shapeLabel(unit: Unit): string {
  const basis = unit === 'gdp' ? 'as a percent of GDP' : unit === 'real' ? 'in real FY2025 dollars' : 'in nominal dollars'
  return (
    `Line chart comparing federal outlays and revenue ${basis}, FY1995 to FY2025. Outlays run ` +
    'consistently above revenue and the area between them is shaded as a deficit, hatched and ' +
    'labelled as a surplus during FY1998-FY2001 when revenue briefly exceeds outlays. Both lines ' +
    'spike in FY2009 and FY2020.'
  )
}

export function StructuralGap({ rows }: { rows: BudgetYear[] }) {
  const [unit, setUnit] = useState<Unit>('gdp')
  const [focus, setFocus] = useState<number | null>(null)

  const span = useMemo(() => rows.filter((r) => r.y >= START && r.y <= END), [rows])

  // Surplus membership never depends on the displayed unit -- always the sign
  // of the nominal deficit -- so the shaded band is identical across all
  // three unit views, rather than working by coincidence in one of them.
  const surplusYears = useMemo(
    () => new Set(span.filter((r) => r.n_de > 0).map((r) => r.y)),
    [span],
  )

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const years = span.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear(
    niceExtent(span.flatMap((r) => [revenueOf(r, unit), outlaysOf(r, unit)])),
    [ih, 0],
  )

  const revenueLine = d3line<BudgetYear>().x((r) => x(r.y)).y((r) => y(revenueOf(r, unit))).curve(curveMonotoneX)
  const outlaysLine = d3line<BudgetYear>().x((r) => x(r.y)).y((r) => y(outlaysOf(r, unit))).curve(curveMonotoneX)
  const bandArea = d3area<BudgetYear>()
    .x((r) => x(r.y))
    .y0((r) => y(outlaysOf(r, unit)))
    .y1((r) => y(revenueOf(r, unit)))
    .curve(curveMonotoneX)

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

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))
  const tickFmt = (v: number) => tick(v, unit)

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
        <span className="controls-label" id="structural-gap-units">Measured in</span>
        <UnitToggle value={unit} onChange={setUnit} label="Structural gap units" />
      </div>

      <Chart ariaLabel={shapeLabel(unit)} interactive width={W} height={H} margin={f}>
        {(fr) => (
          <>
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

            <AxisLeft frame={fr} ticks={yTicks} format={tickFmt} label={UNIT_LABEL[unit]} scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            {segments.map((seg, i) => (
              <path
                key={i}
                className="gap-band"
                d={bandArea(seg.rows) ?? ''}
                fill={seg.surplus ? 'url(#gap-surplus-hatch)' : 'var(--mand)'}
                opacity={seg.surplus ? 1 : 0.16}
              />
            ))}

            <path d={outlaysLine(span) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={2} />
            <path
              d={revenueLine(span) ?? ''}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />

            <text x={x(bandMid.y)} y={bandY - 10} textAnchor="middle" className="annotation">
              Surplus, FY1998-2001
            </text>

            <text
              x={x(last.y) - 4}
              y={y(outlaysOf(last, unit)) - 8}
              textAnchor="end"
              className="annotation series-label"
            >
              Outlays
            </text>
            <text
              x={x(last.y) - 4}
              y={y(revenueOf(last, unit)) - 8}
              textAnchor="end"
              className="annotation series-label"
            >
              Revenue
            </text>

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
                tabIndex={0}
                role="img"
                aria-label={readoutFor(r)}
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
        {active ? readoutFor(active) : 'Focus or hover a year to read its value.'}
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
