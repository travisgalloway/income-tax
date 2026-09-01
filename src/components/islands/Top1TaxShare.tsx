/** Section 5, figure B: the top 1% share of federal individual income tax paid,
 *  in the five years the IRS has published it, 2001, 2019, 2021, 2022, 2023.
 *
 *  This is NOT an annual series. The gap between 2001 and 2019 is 18 years.
 *  Discrete points on a true linear year axis only, so the gap reads as a
 *  gap. No line, no area, no interpolation of any kind. Recharts draws a
 *  `<Scatter>` here and never a `<Line>`, for that reason.
 *
 *  Drawn on `charts/RechartsFrame.tsx`. Read that file's header before editing
 *  this one. Two reference-identity rules govern the code below, they point in
 *  opposite directions, and both fail silently. `useFrame` and `useTickFormat`
 *  hold the stable half. The `shape` renderer below holds the unstable half and
 *  must stay a new function on every render.
 */
import { useMemo, useState } from 'react'
import { Scatter, ScatterChart, type ScatterShapeProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import { keepUnclashed } from '../charts/annotate'
import { thinTicks } from '../charts/axisFit'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { percent } from '../charts/format'
import { TableView } from './TableView'
import type { Top1IncomeSharePoint } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

/** The published span, forced rather than derived, so the 18-year gap keeps its
 *  true width on the axis. */
const X_DOMAIN: [number, number] = [2001, 2023]

/** Module scope, because a tick formatter written inline remounts the graphical
 *  item and destroys the focused mark. See rule 1 in `RechartsFrame.tsx`. */
const YEAR_FORMAT = (t: number) => `${t}`

/** Radius of the focus ring each point carries. The value label clears it,
 *  rather than sitting on it: at the old offset of 12 the ring's own stroke
 *  ran through the label's descenders. */
const RING_R = 9

export function Top1TaxShare({ rows }: { rows: Top1IncomeSharePoint[] }) {
  const [focus, setFocus] = useState<number | null>(null)

  const {
    boxRef,
    size,
    f,
    x,
    y,
    xDomain,
    yDomain,
    yTicks,
    chartMargin,
    chartStyle,
    surfaceRef,
    wrapperProps,
    mark,
  } = useFrame({
    rows,
    xOf: (p) => p.year,
    yValues: rows.map((p) => p.v),
    xDomain: X_DOMAIN,
    yTickCount: [4, 5],
  })

  /* Published years only. A generated tick set would imply an annual series.
   * Thinned by fit, because the published years are not evenly spaced: 2021,
   * 2022 and 2023 sit 13 units apart at the 360 preset and a four-digit label
   * needs 24, so the three overlapped by about 11px. `thinTicks` keeps the
   * first and the last and drops only what collides. Memoised because rule 1
   * covers a `ticks` array as much as a formatter. */
  /* The dependency list is built from `f`'s own numbers, never from `f`.
   * `useFrame` rebuilds that object on every render, so depending on it would
   * hand the axis a fresh `ticks` array each time, which is rule 1 in
   * `RechartsFrame.tsx` and costs the focused mark. */
  const xTicks = useMemo(
    () => thinTicks(rows.map((p) => p.year), YEAR_FORMAT, x, f),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, x, f.innerWidth, f.margin.left, f.margin.right],
  )
  const yFormat = useTickFormat(percent, 0)

  /** Priority order for the value labels: the first published year, the last,
   *  the peak, then the rest in year order. `keepUnclashed` drops from the end
   *  of that order, so a crowded panel loses an interior year and never an end
   *  of the span. */
  const labelled = useMemo(() => {
    if (rows.length === 0) return []
    const peak = rows.reduce((a, b) => (b.v > a.v ? b : a))
    const first = rows[0] as Top1IncomeSharePoint
    const last = rows[rows.length - 1] as Top1IncomeSharePoint
    const order = [first, last, peak, ...rows].filter(
      (p, i, all) => all.findIndex((q) => q.year === p.year) === i,
    )
    const kept = keepUnclashed(
      order.map((p) => ({ x: x(p.year), y: y(p.v) - RING_R - 6, label: `${p.year}: ${percent(p.v, 1)}`, anchor: 'middle' as const })),
      f,
    )
    const years = new Set(kept.map((i) => (order[i] as Top1IncomeSharePoint).year))
    return rows.filter((p) => years.has(p.year))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, x, y, f.innerWidth, f.margin.left, f.margin.right])

  const active = focus != null ? rows.find((p) => p.year === focus) : null
  const describe = (p: Top1IncomeSharePoint) =>
    `Tax year ${p.year}: ${percent(p.v, 1)} of federal individual income tax paid by the top 1%`

  const ariaLabel =
    'Share of federal individual income tax paid by the top 1%, in the five published tax years ' +
    '2001, 2019, 2021, 2022 and 2023: 33.2%, 38.8%, 45.8%, 40.4% and 38.4%. This is five scattered ' +
    'observations, not a continuous annual series; there is an 18-year gap between 2001 and 2019.'

  // `mark()` runs once per row HERE, in the island's own render, and the results
  // reach the shape renderer by index. The renderer runs inside `<Scatter>`,
  // which subscribes to Recharts' store and can render without this island
  // rendering. Calling `mark()` from there would advance the counter past the
  // end and leave the group with zero focusable marks.
  const markProps = rows.map(() => mark())

  /** A NEW FUNCTION on every render, deliberately. Recharts calls a `shape`
   *  renderer as a plain function, so a memoised one leaves the graphical item
   *  with identical props, React bails out of the subtree, and the marks freeze
   *  at their first paint. See rule 2 in `RechartsFrame.tsx`.
   *
   *  IT DRAWS THE VISIBLE POINT AND NOTHING FOCUSABLE. See the overlay below. */
  const point = (props: ScatterShapeProps) => {
    const p = rows[props.index]
    if (!p || props.cx == null || props.cy == null) return null
    return <circle key={p.year} cx={props.cx} cy={props.cy} r={2.5} fill="var(--ink)" />
  }

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <ScatterChart
          ref={surfaceRef}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={ariaLabel}
        >
          <PlotGrid />
          <PlotXAxis
            dataKey="year"
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Tax year"
            format={YEAR_FORMAT}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="Percent of income tax paid"
            format={yFormat}
          />
          <Scatter data={rows} dataKey="v" isAnimationActive={false} shape={point} />

          <PlotOverlay margin={f.margin}>
            {/* THE FOCUSABLE MARKS, and the reason they are here rather than in
                the `shape` renderer above. Recharts keys each symbol's wrapper
                on its own geometry and rebuilds that subtree on every render of
                this island, so a mark drawn inside `shape` is DESTROYED the
                moment focusing it sets `focus` state, and the arrow keys then
                reach no key handler at all. `WhoPays` states the same rule for
                a different reason.

                The ring sits on the site's own scales, which is where the five
                value labels below are placed from, so it needs none of
                Recharts' geometry. */}
            {rows.map((p, i) => {
              const isActive = active?.year === p.year
              return (
                <circle
                  key={p.year}
                  className="datum"
                  cx={x(p.year)}
                  cy={y(p.v)}
                  r={isActive ? 5 : RING_R}
                  fill={isActive ? 'var(--ink)' : 'transparent'}
                  stroke="var(--ink)"
                  strokeWidth={isActive ? 0 : 1.5}
                  {...markProps[i]}
                  role="img"
                  aria-label={describe(p)}
                  onFocus={() => setFocus(p.year)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(p.year)}
                  onMouseLeave={() => setFocus(null)}
                />
              )
            })}

            {/* The value labels are placed by the site's own clamp, which
                returns nothing for a label too wide to fit. Recharts has no
                equivalent, so they are drawn here in plot coordinates.

                THINNED BY COLLISION at the narrow preset. All five sat on one
                row of 296 units, so `2019: 38.8%`, `2022: 40.4%` and
                `2023: 38.4%` overlapped each other by up to 63px. The priority
                order below keeps the two ends of the published span and the
                peak; every value stays in the TableView, the readout and the
                figure's accessible name. None is ever truncated. */}
            {labelled.map((p) => (
              <Annotation
                key={p.year}
                frame={f}
                x={x(p.year)}
                y={y(p.v) - RING_R - 6}
                anchor="middle"
                halo
                label={`${p.year}: ${percent(p.v, 1)}`}
              />
            ))}
          </PlotOverlay>
        </ScatterChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="point" />}
      </p>

      <TableView
        caption="Share of federal individual income tax paid by the top 1%, published years only"
        columns={[
          { key: 'year', label: 'Tax year', unit: 'calendar year' },
          { key: 'v', label: 'Share of income tax paid', unit: 'percent' },
        ]}
        rows={rows.map((p) => ({ year: p.year, v: percent(p.v, 1) }))}
      />
    </div>
  )
}
