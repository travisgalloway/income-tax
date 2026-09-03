/** Section 10: federal revenue by source, FY1962-FY2025, drawn on Recharts.
 *
 *  BRIEF.md rule 3 / edge case 3: `share` (percent of total revenue) sums to
 *  100 BY CONSTRUCTION and is the only normalised view here. `gdp` and
 *  `nominal` are NOT normalised, their y-domain is derived from the real
 *  totals (g_tot ranges 14.5-20.0), so the stack visibly tops out well short
 *  of "the whole thing" and can never be mistaken for the 100%-share view.
 *  The axis title always names which view is active.
 *
 *  Recharts stacks the seven bands from the `stackId`, in the order the
 *  `<Area>` children are declared. The `lo`/`hi` band arithmetic below is kept
 *  because the direct labels and the readout need it, and because the readout
 *  must distinguish a null component from a zero one, which a stacked series
 *  cannot.
 */
import { useMemo, useState } from 'react'
import { Area, AreaChart } from 'recharts'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
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
import { trillions, percentGdp, percent, tick } from '../charts/format'
import { TableView } from './TableView'
import type { RevenueYear } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
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

/** The 100%-share view is normalised by construction, so it takes a fixed
 *  domain rather than a derived one. Module scope: rule 1 compares an axis
 *  prop by reference. */
const SHARE_DOMAIN: [number, number] = [0, 100]

const X_FORMAT = (t: number) => `${t}`

/** Raw field access. Returns null rather than substituting 0, this series has
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

/** One flat row per fiscal year, which is what a Recharts stack reads. The
 *  string keys are deliberate: a `dataKey` written as a closure would be a new
 *  reference on every render, which is the identity trap rule 1 describes. */
type ChartRow = { y: number } & Record<Component, number>

function fmtView(v: number, view: View): string {
  if (view === 'nominal') return trillions(v)
  if (view === 'gdp') return percentGdp(v)
  return percent(v)
}

function axisTick(v: number, view: View): string {
  if (view === 'share') return `${v.toFixed(0)}%`
  return tick(v, view === 'gdp' ? 'gdp' : 'nominal')
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

  const chartRows = useMemo<ChartRow[]>(
    () =>
      stacked.map((s) => {
        const row = { y: s.y } as ChartRow
        for (const k of ORDER) row[k] = s.bands[k].v ?? 0
        return row
      }),
    [stacked],
  )

  const totals = useMemo(
    () => stacked.map((s) => s.total).filter((v): v is number => v != null),
    [stacked],
  )

  const { size, boxRef, f, narrow, xDomain, yDomain, x, y, xTicks, yTicks, chartMargin, chartStyle, surfaceRef, wrapperProps, mark } =
    useFrame({
      rows: chartRows,
      xOf: (r) => r.y,
      yValues: totals,
      yDomain: view === 'share' ? SHARE_DOMAIN : undefined,
    })

  const yFormat = useTickFormat(axisTick, view)
  const bandWidth = chartRows.length > 1 ? f.innerWidth / (chartRows.length - 1) : f.innerWidth

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

      <div {...wrapperProps}>
        <AreaChart
          ref={surfaceRef}
          data={chartRows}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          {...SURFACE_DEFAULTS}
          aria-label={chartLabel}
          style={chartStyle}
        >
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
            unit={AXIS_TITLE[view]}
            format={yFormat}
          />

          {ORDER.map((k) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="revenue"
              stroke="none"
              fill={COLOR[k]}
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
              dot={false}
            />
          ))}

          {/* Everything below sits ON the stack, so it goes through the
              overlay: a plain child renders under the area fill. */}
          <PlotOverlay margin={f.margin}>
            {markers.map((s) => {
              if (s.total == null) return null
              const isLast = s.y === xDomain[1]
              return (
                <g key={s.y}>
                  <circle cx={x(s.y)} cy={y(s.total)} r={3.5} fill="var(--ink)" />
                  <line
                    x1={x(s.y)}
                    x2={x(s.y)}
                    y1={y(s.total) - 6}
                    y2={y(s.total) - (isLast ? 16 : 28)}
                    stroke="var(--ink)"
                    strokeWidth={0.75}
                  />
                  <Annotation
                    frame={f}
                    x={x(s.y) - (isLast ? 4 : 0)}
                    y={y(s.total) - (isLast ? 20 : 32)}
                    anchor={isLast ? 'end' : 'middle'}
                    halo
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
                    x={f.innerWidth - 6}
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
              <line
                x1={x(active.y)}
                x2={x(active.y)}
                y1={0}
                y2={f.innerHeight}
                stroke="var(--ink)"
                strokeWidth={1}
                opacity={0.4}
              />
            )}

            {/* Every fiscal year is Tab-focusable and reports the same thing hover does. */}
            {stacked.map((s) => (
              <rect
                key={s.y}
                className="datum"
                x={x(s.y) - bandWidth / 2}
                y={0}
                width={bandWidth}
                height={f.innerHeight}
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
          </PlotOverlay>
        </AreaChart>
      </div>

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
