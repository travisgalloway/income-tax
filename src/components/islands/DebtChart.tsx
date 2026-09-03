/** Section 1: the debt series, drawn on Recharts.
 *
 *  BRIEF.md interaction note: nominal and share-of-GDP must be EQUALLY
 *  prominent, not one primary and one buried. Nominal doubles; the ratio goes
 *  105% to 124%. A reader who only sees one has been misled. Hence the toggle
 *  sits above the chart, and the standfirst names both.
 *
 *  `useFrame` supplies the geometry, the memoised ticks and the roving wiring.
 *  Read `../charts/RechartsFrame.tsx` before editing: the two reference-identity
 *  rules it encodes both fail silently, and the second one governs the `dot`
 *  renderer below.
 */
import { useMemo, useState } from 'react'
import { Area, AreaChart, type DotItemDotProps } from 'recharts'
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
import { UnitToggle } from './UnitToggle'
import { TableView } from './TableView'
import {
  fiscalYear,
  percent,
  percentGdp,
  tick,
  trillions,
  trillionsLong,
  type Unit,
} from '../charts/format'
import type { DebtYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'debt'

/** Debt has no real-dollar series, deflating a stock of borrowing to FY2025
 *  dollars would answer no question this section asks, so §1 offers two of the
 *  three shared units, not all three. */
type DebtUnit = Extract<Unit, 'nominal' | 'gdp'>

const UNITS: readonly DebtUnit[] = ['nominal', 'gdp']

/** Module scope, because rule 1 compares an axis prop by reference. */
const X_FORMAT = (t: number) => `${t}`

export function DebtChart({ rows }: { rows: DebtYear[] }) {
  const [unit, setUnit] = useState<DebtUnit>('nominal')
  const [focus, setFocus] = useState<number | null>(null)

  // The share-of-GDP view can only show years with a final GDP denominator.
  // Dropping them is honest; carrying them as zero would not be.
  const shown = useMemo(
    () => (unit === 'gdp' ? rows.filter((r) => r.gdp_share != null) : rows),
    [rows, unit],
  )
  const get = (r: DebtYear) => (unit === 'gdp' ? (r.gdp_share as number) : r.debt)
  const seriesKey = unit === 'gdp' ? 'gdp_share' : 'debt'

  const {
    boxRef,
    size,
    f,
    narrow,
    xDomain,
    yDomain,
    x,
    y,
    xTicks,
    yTicks,
    chartMargin,
    chartStyle,
    surfaceRef,
    wrapperProps,
    mark,
  } = useFrame({ rows: shown, xOf: (r) => r.y, yValues: shown.map(get) })

  // Read aloud by the point `aria-label`s and the live readout, so the nominal
  // magnitude is spelled out rather than abbreviated to a letter.
  const full = (r: DebtYear) =>
    unit === 'gdp' ? percentGdp(r.gdp_share as number, 1) : trillionsLong(r.debt, 2)

  // The ten-year doubling the section leads with.
  const markers = shown.filter((r) => r.y === 2016 || r.y === xDomain[1])
  const active = focus != null ? shown.find((r) => r.y === focus) : null

  const label =
    unit === 'gdp'
      ? 'Gross US federal debt as a share of GDP at each fiscal year end from 1995 to 2025, rising from about 66% to about 124%, with a step up in 2020.'
      : 'Total US public debt outstanding at each fiscal year end from 1995 to 2026 in nominal dollars, rising from about $5 trillion to $40 trillion, with the FY2016 value of $19.6 trillion and the FY2026 value of $40 trillion marked to show the ten-year doubling.'

  const yTitle = unit === 'gdp' ? 'Percent of GDP' : '$ trillions'
  const yFormat = useTickFormat(tick, unit)

  /* `mark()` runs once per row HERE, in the island's own render, and the dot
   * renderer reads the results by index. The counter resets once per render of
   * the component holding the hook, and `<Area>` can render on its own, so a
   * `mark()` call from inside the renderer would run past the end of the
   * group. */
  const markProps = shown.map(() => mark())

  /* Rule 2: this must be a NEW FUNCTION on every render. Recharts calls it as a
   * plain function, so a memoised renderer leaves `<Area>` with identical props
   * and React never re-renders the marks. */
  const dot = (props: DotItemDotProps) => {
    const r = shown[props.index]
    if (!r) return null
    const on = active?.y === r.y
    return (
      <circle
        key={r.y}
        className="datum"
        cx={Number(props.cx)}
        cy={Number(props.cy)}
        r={on ? 5 : 9}
        fill={on ? 'var(--ink)' : 'transparent'}
        {...markProps[props.index]}
        // NOT role="button": focusing a point reveals its value, it does not
        // activate anything. Announcing it as pressable would promise an
        // action that does not exist.
        role="img"
        aria-label={`Fiscal year ${r.y}: ${full(r)}${r.year_end ? '' : ', not a year-end value'}`}
        onFocus={() => setFocus(r.y)}
        onBlur={() => setFocus(null)}
        onMouseEnter={() => setFocus(r.y)}
        onMouseLeave={() => setFocus(null)}
      />
    )
  }

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} units={UNITS} value={unit} onChange={setUnit} />
      </div>

      <div {...wrapperProps}>
        <AreaChart
          ref={surfaceRef}
          data={shown}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          {...SURFACE_DEFAULTS}
          aria-label={label}
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
            unit={yTitle}
            format={yFormat}
          />
          <Area
            type="monotone"
            dataKey={seriesKey}
            stroke="var(--ink)"
            strokeWidth={2}
            fill="var(--mand)"
            fillOpacity={0.16}
            isAnimationActive={false}
            activeDot={false}
            dot={dot}
            connectNulls={false}
          />

          {/* Both labels sit up and to the LEFT of their point, so neither
              crosses the curve, which rises left to right throughout. The
              overlay is required: a plain child renders under the area fill. */}
          <PlotOverlay margin={f.margin}>
            {markers.map((r) => {
              const isLast = r.y === xDomain[1]
              return (
                <g key={r.y}>
                  <circle cx={x(r.y)} cy={y(get(r))} r={4} fill="var(--ink)" />
                  <line
                    x1={x(r.y)}
                    x2={x(r.y)}
                    y1={y(get(r)) - 6}
                    y2={y(get(r)) - (isLast ? 18 : 30)}
                    stroke="var(--ink)"
                    strokeWidth={0.75}
                  />
                  <Annotation
                    frame={f}
                    x={x(r.y) - 6}
                    y={y(get(r)) - (isLast ? 22 : 34)}
                    anchor="end"
                    label={
                      narrow
                        ? `${fiscalYear(r.y)} ${unit === 'gdp' ? percent(r.gdp_share as number, 0) : trillions(r.debt, 1)}`
                        : `${fiscalYear(r.y)} ${full(r)}`
                    }
                  />
                </g>
              )
            })}
          </PlotOverlay>
        </AreaChart>
      </div>

      <p aria-live="polite" className="readout">
        {active
          ? `${fiscalYear(active.y)}: ${full(active)}${active.year_end ? '' : ' (not a fiscal year-end close)'}`
          : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Total US public debt outstanding at fiscal year end"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'debt', label: 'Gross debt', unit: '$ trillions' },
          { key: 'share', label: 'Share of GDP', unit: 'percent' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          debt: r.debt.toFixed(2),
          share: r.gdp_share == null ? null : r.gdp_share.toFixed(1),
          basis: r.year_end ? 'Year-end close' : `As of ${r.as_of ?? 'n/a'}`,
        }))}
      />
    </div>
  )
}
