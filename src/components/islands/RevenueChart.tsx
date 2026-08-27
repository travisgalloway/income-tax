/** Section 10: federal revenue by source, FY1962-FY2025.
 *
 *  BRIEF.md rule 3 / edge case 3: `share` (percent of total revenue) sums to
 *  100 BY CONSTRUCTION and is the only normalised view here. `gdp` and
 *  `nominal` are NOT normalised — their y-domain is derived from the real
 *  totals (g_tot ranges 14.5-20.0), so the stack visibly tops out well short
 *  of "the whole thing" and can never be mistaken for the 100%-share view.
 *  The axis title always names which view is active.
 */
import { useMemo, useState } from 'react'
import { area as d3area, curveMonotoneX } from 'd3-shape'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { trillions, percentGdp, percent, tick } from '../charts/format'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { RevenueYear } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'revenue'

type View = 'nominal' | 'gdp' | 'share'

const VIEWS: { value: View; label: string }[] = [
  { value: 'nominal', label: 'Nominal dollars' },
  { value: 'gdp', label: '% of GDP' },
  { value: 'share', label: '% of total revenue' },
]

const PREFIX: Record<View, 'n_' | 'g_' | 's_'> = { nominal: 'n_', gdp: 'g_', share: 's_' }
const AXIS_TITLE: Record<View, string> = {
  nominal: '$ trillions',
  gdp: 'Percent of GDP',
  share: 'Percent of total revenue',
}

// Largest-first from the bottom of the stack.
const ORDER = ['ii', 'pr', 'ci', 'ex', 'cu', 'eg', 'mi'] as const
type Component = (typeof ORDER)[number]

const LABEL: Record<Component, string> = {
  ii: 'Individual income tax',
  pr: 'Payroll taxes',
  ci: 'Corporate income tax',
  ex: 'Excise taxes',
  cu: 'Customs duties',
  eg: 'Estate and gift taxes',
  mi: 'Miscellaneous',
}
const LABEL_NARROW: Record<Component, string> = {
  ii: 'Income tax',
  pr: 'Payroll',
  ci: 'Corporate',
  ex: 'Excise',
  cu: 'Customs',
  eg: 'Estate & gift',
  mi: 'Misc.',
}
const COLOR: Record<Component, string> = {
  ii: 'var(--rev-ii)',
  pr: 'var(--rev-pr)',
  ci: 'var(--rev-ci)',
  ex: 'var(--rev-ex)',
  cu: 'var(--rev-cu)',
  eg: 'var(--rev-eg)',
  mi: 'var(--rev-mi)',
}

// The four largest bands get a direct label at the right edge; three at
// narrow widths. Colour is never the only channel, but crowding all seven
// names into a 360-unit viewBox would defeat the purpose. The other three
// are still named in the readout and every table row.
const LABELED_WIDE: Component[] = ['ii', 'pr', 'ci', 'cu']
const LABELED_NARROW: Component[] = ['ii', 'pr', 'ci']

/** Raw field access. Returns null rather than substituting 0 — this series has
 *  no nulls (validated by the pipeline), but a consumer must never assume it. */
function field(r: RevenueYear, key: string): number | null {
  const v = r[key]
  return typeof v === 'number' ? v : null
}

interface Band {
  lo: number
  hi: number
  v: number | null
}

interface StackedYear {
  y: number
  bands: Record<Component, Band>
  total: number | null
}

function fmtView(v: number, view: View): string {
  if (view === 'nominal') return trillions(v)
  if (view === 'gdp') return percentGdp(v)
  return percent(v)
}

/** Shared by aria-label and the live-region readout, so keyboard and pointer
 *  can never announce different text. Names all seven components, including
 *  Miscellaneous, every time (edge case 2 at the presentation layer). */
function describeYear(s: StackedYear, view: View): string {
  const total = s.total == null ? 'no data' : fmtView(s.total, view)
  const parts = ORDER.map((k) => {
    const v = s.bands[k].v
    return `${LABEL[k]} ${v == null ? 'no data' : fmtView(v, view)}`
  }).join(', ')
  return `Fiscal year ${s.y}: total ${total}. ${parts}.`
}

export function RevenueChart({ rows }: { rows: RevenueYear[] }) {
  const [view, setView] = useState<View>('gdp')
  const [focus, setFocus] = useState<number | null>(null)
  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const stacked = useMemo<StackedYear[]>(() => {
    const prefix = PREFIX[view]
    return rows.map((r) => {
      let acc = 0
      const bands = {} as Record<Component, Band>
      for (const k of ORDER) {
        const v = field(r, `${prefix}${k}`)
        const lo = acc
        const hi = acc + (v ?? 0)
        bands[k] = { lo, hi, v }
        acc = hi
      }
      return { y: r.y, bands, total: field(r, `${prefix}tot`) }
    })
  }, [rows, view])

  const years = stacked.map((s) => s.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const yDomain: [number, number] =
    view === 'share' ? [0, 100] : niceExtent(stacked.map((s) => s.total))
  const y = linear(yDomain, [ih, 0])

  const areaFor = (k: Component) =>
    d3area<StackedYear>()
      .x((s) => x(s.y))
      .y0((s) => y(s.bands[k].lo))
      .y1((s) => y(s.bands[k].hi))
      .curve(curveMonotoneX)

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))
  const bandWidth = years.length > 1 ? iw / (years.length - 1) : iw

  const active = focus != null ? stacked.find((s) => s.y === focus) : null
  const last = stacked[stacked.length - 1]
  const labeled = narrow ? LABELED_NARROW : LABELED_WIDE
  const nameFor = narrow ? LABEL_NARROW : LABEL

  // The section's headline claim: the total held roughly flat. Only legible if
  // both endpoints are marked when the total is actually the thing on screen.
  const markerYears = view === 'gdp' ? [1995, 2025] : view === 'nominal' ? [2025] : []
  const markers = stacked.filter((s) => markerYears.includes(s.y))

  const chartLabel =
    view === 'share'
      ? 'Federal revenue by source as a percent of total revenue, fiscal 1962 to fiscal 2025. The individual income tax share rose from about 46% to 51% of the total while payroll and corporate shares fell.'
      : view === 'gdp'
        ? 'Federal revenue by source as a percent of GDP, fiscal 1962 to fiscal 2025. Total revenue stayed near 17 to 18 percent of GDP across three decades while the mix shifted toward the individual income tax and customs duties.'
        : 'Federal revenue by source in nominal dollars, fiscal 1962 to fiscal 2025, rising from about $100 billion to $5.2 trillion.'

  return (
    <div ref={boxRef}>
      <div className="controls">
        <span className="controls-label" id="revenue-units">Measured in</span>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-labelledby={labelledByFigure(FIGURE, 'revenue-units')}
          className="unit-toggle"
        >
          {VIEWS.map((v) => (
            <ToggleGroup.Item key={v.value} value={v.value} className="unit-toggle-item">
              {v.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <Chart ariaLabel={chartLabel} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={(v) => (view === 'share' ? `${v.toFixed(0)}%` : tick(v, view === 'gdp' ? 'gdp' : 'nominal'))}
              label={AXIS_TITLE[view]}
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Fiscal year"
              scale={x}
            />

            {ORDER.map((k) => (
              <path key={k} d={areaFor(k)(stacked) ?? ''} fill={COLOR[k]} />
            ))}

            {markers.map((s) => {
              if (s.total == null) return null
              const isLast = s.y === Math.max(...years)
              return (
                <g key={s.y}>
                  <circle cx={x(s.y)} cy={y(s.total)} r={3.5} fill="var(--ink)" />
                  <line
                    x1={x(s.y)} x2={x(s.y)}
                    y1={y(s.total) - 6} y2={y(s.total) - (isLast ? 16 : 28)}
                    stroke="var(--ink)" strokeWidth={0.75}
                  />
                  <Annotation
                    frame={fr}
                    x={x(s.y) - (isLast ? 4 : 0)}
                    y={y(s.total) - (isLast ? 20 : 32)}
                    anchor={isLast ? 'end' : 'middle'}
                    label={`FY${s.y} ${fmtView(s.total, view)}`}
                  />
                </g>
              )
            })}

            {/* Direct band labels: colour is never the only channel. */}
            {last &&
              labeled.map((k) => {
                const b = last.bands[k]
                const mid = (b.lo + b.hi) / 2
                return (
                  <text
                    key={k}
                    x={iw - 6}
                    y={y(mid)}
                    dy="0.32em"
                    textAnchor="end"
                    className="legend-label"
                    style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}
                  >
                    {nameFor[k]}
                  </text>
                )
              })}

            {active && (
              <line x1={x(active.y)} x2={x(active.y)} y1={0} y2={ih} stroke="var(--ink)" strokeWidth={1} opacity={0.4} />
            )}

            {/* Every fiscal year is Tab-focusable and reports the same thing hover does. */}
            {stacked.map((s) => (
              <rect
                key={s.y}
                className="datum"
                x={x(s.y) - bandWidth / 2}
                y={0}
                width={bandWidth}
                height={ih}
                fill="transparent"
                {...mark()}
                role="img"
                aria-label={describeYear(s, view)}
                onFocus={() => setFocus(s.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(s.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describeYear(active, view) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Federal revenue by source at each fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          ...ORDER.map((k) => ({ key: k, label: LABEL[k], unit: AXIS_TITLE[view] })),
          { key: 'tot', label: 'Total', unit: AXIS_TITLE[view] },
        ]}
        rows={stacked.map((s) => {
          const row: Record<string, string | number | null> = {
            y: `FY${s.y}`,
            tot: s.total == null ? null : s.total.toFixed(view === 'nominal' ? 3 : 2),
          }
          for (const k of ORDER) {
            const v = s.bands[k].v
            row[k] = v == null ? null : v.toFixed(view === 'nominal' ? 3 : 2)
          }
          return row
        })}
      />
    </div>
  )
}
