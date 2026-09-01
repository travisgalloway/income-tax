/** Section 10: total tax revenue as a share of GDP, OECD comparison, 2024.
 *
 *  BRIEF.md rule 3: this counts federal, state AND local. It is not comparable
 *  to the CBO 17.2%-of-GDP federal-only figure charted in RevenueChart. That
 *  scope difference is stated in body copy (the criterion), and again here in
 *  the Figure `note`, never only in the note, and never in a tooltip.
 *
 *  No party colour, no diverging good/bad scale: this is one ink hue at two
 *  weights. Nothing here says a higher or lower number is good.
 *
 *  Drawn on `charts/RechartsFrame.tsx`, as a `<ScatterChart>` whose y axis is
 *  the country list and whose x axis is the share of GDP. Read that file's
 *  header before editing this one.
 *
 *  THE FIGURE OWNS ITS OWN HEIGHT, so `useFrame`'s frame is not used. One row
 *  is a fixed 32 or 28 units and the count of countries sets the rest, which no
 *  viewBox preset can express. The scales, the ticks and the chart margin are
 *  therefore memoised here, and the memo is required rather than tidy. See
 *  rule 1 in `RechartsFrame.tsx` for what a fresh `ticks` array costs.
 */
import { useMemo, useState } from 'react'
import { Scatter, ScatterChart, YAxis } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotOverlay,
  PlotXAxis,
  SURFACE_DEFAULTS,
  useAxisLabel,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { frame as makeFrame, linear } from '../charts/scales'
import { TableView } from './TableView'
import type { OecdCountry, OecdComparison } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

const X_DOMAIN: [number, number] = [0, 50]
const ROW_HEIGHT_WIDE = 32
const ROW_HEIGHT_NARROW = 28

type Focus = { kind: 'country'; c: string } | { kind: 'average' } | null

const PERCENT_TICK = (t: number) => `${t}%`

function describeCountry(c: OecdCountry, rank: number, of: number): string {
  const suffix = c.is_us ? `, ranked ${rank} of ${of} OECD members` : ''
  return `${c.c}: ${c.v.toFixed(1)}% of GDP${suffix}.`
}

function describeAverage(avg: number): string {
  return `OECD average: ${avg.toFixed(1)}% of GDP, the mean of 38 members, not a country.`
}

export function OecdChart({ data }: { data: OecdComparison }) {
  const [focus, setFocus] = useState<Focus>(null)

  // The average is drawn as a labelled reference line, not as a country row.
  const countries = useMemo(() => data.countries.filter((c) => !c.is_average), [data])

  /* `useFrame` supplies the container measurement, the roving group and the
   * wrapper that carries the handlers Recharts strips off the surface. Its own
   * frame and scales are discarded, because this figure sizes itself by row
   * count rather than by a viewBox preset. */
  const { boxRef, size, narrow, surfaceRef, wrapperProps, mark } = useFrame({
    rows: countries,
    xOf: (c) => c.v,
    yValues: [],
    xDomain: X_DOMAIN,
  })
  const W = size.width

  const rowHeight = narrow ? ROW_HEIGHT_NARROW : ROW_HEIGHT_WIDE
  const innerHeight = countries.length * rowHeight
  const gutterLeft = narrow ? 96 : 118
  const H = innerHeight + 34 + 40
  const f = useMemo(
    () => makeFrame(W, H, { top: 34, right: 24, bottom: 40, left: gutterLeft }),
    [W, H, gutterLeft],
  )
  const iw = f.innerWidth

  const { x, xTicks } = useMemo(() => {
    const scale = linear(X_DOMAIN, [0, iw])
    return { x: scale, xTicks: scale.ticks(narrow ? 4 : 6) }
  }, [iw, narrow])

  const chartMargin = useMemo(() => ({ top: 34, right: 24, bottom: 0, left: 0 }), [])
  const chartStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }),
    [W, H],
  )
  const xFormat = useTickFormat(PERCENT_TICK, null)
  const yLabel = useAxisLabel('Country', 'y')

  const rowY = (i: number) => i * rowHeight + rowHeight / 2

  const active =
    focus?.kind === 'country'
      ? countries.find((c) => c.c === focus.c) ?? null
      : null

  const readout =
    focus?.kind === 'average'
      ? describeAverage(data.oecd_average_pct_gdp)
      : active
        ? describeCountry(active, data.us_rank, data.of_countries)
        : <ChartHint noun="country" />

  const chartLabel =
    `Total tax revenue as a share of GDP across ${countries.length} selected OECD countries and the OECD average, ${data.year} preliminary data. The United States collects ${data.us_pct_gdp.toFixed(1)}% of GDP, ranked ${data.us_rank} of ${data.of_countries} members and below the ${data.oecd_average_pct_gdp.toFixed(1)}% average.`

  /* The average keeps its place as the FIRST mark, ahead of every country, so
   * Home and the first arrow press land where they did before. Recharts appends
   * every z-index portal after the plain children, so the average's hit target
   * is a plain child and the country dots are in the label overlay. The dashed
   * rule and the row rules ride with the average for the same reason, and they
   * then paint UNDER the dots, as they did before. Arrow keys follow DOM order,
   * so that placement is what fixes the order, not a sort. */
  const averageX = x(data.oecd_average_pct_gdp)

  // `mark()` runs once per mark HERE, in this island's render, in mark order.
  // The shape renderer runs inside `<Scatter>` and may render on its own, so
  // calling `mark()` from there would advance the counter past the end.
  const averageMark = mark()
  const countryMarks = countries.map(() => mark())

  /** A NEW FUNCTION on every render, deliberately. A memoised `shape` leaves
   *  the graphical item with identical props, React bails out of the subtree,
   *  and the dots freeze at their first paint. See rule 2 in
   *  `RechartsFrame.tsx`.
   *
   *  IT DRAWS NOTHING. Recharts keys each symbol's wrapper on its own geometry
   *  and rebuilds that subtree on every render of this island, so a mark drawn
   *  here is DESTROYED the moment focusing it sets `focus` state, and the arrow
   *  keys then reach no key handler at all. The dots are drawn in the overlay
   *  below, off the site's own scales; `<Scatter>` stays because it is what
   *  gives the category axis its rows. `WhoPays` states the same rule for a
   *  different reason. */
  const dot = () => null

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <ScatterChart
          ref={surfaceRef}
          width={W}
          height={H}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={chartLabel}
        >
          {/* No `PlotGrid`. This figure carries no horizontal rules of its own,
              and a grid on a category axis would draw one straight through
              every dot. The row rules below run from zero to the dot instead. */}
          <PlotXAxis
            dataKey="v"
            domain={X_DOMAIN}
            ticks={xTicks}
            gutter={40}
            unit="Percent of GDP"
            format={xFormat}
          />
          {/* The country names are drawn below rather than as ticks, because a
              Recharts `tick` renderer is a fresh function on every render and
              rule 1 forbids that. The axis keeps the gutter and the title. */}
          <YAxis
            type="category"
            dataKey="c"
            width={gutterLeft}
            tick={false}
            axisLine={false}
            tickLine={false}
            label={yLabel}
          />

          <g transform={`translate(${f.margin.left},${f.margin.top})`}>
            {countries.map((c, i) => (
              <line
                key={c.c}
                x1={0}
                x2={x(c.v)}
                y1={rowY(i)}
                y2={rowY(i)}
                stroke="var(--rule)"
                strokeWidth={0.5}
              />
            ))}
            {/* OECD average: a labelled reference line, structurally never a
                country row. */}
            <line
              x1={averageX}
              x2={averageX}
              y1={0}
              y2={innerHeight}
              stroke="var(--ink-soft)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <rect
              className="datum"
              x={averageX - 6}
              y={0}
              width={12}
              height={innerHeight}
              fill="transparent"
              {...averageMark}
              role="img"
              aria-label={describeAverage(data.oecd_average_pct_gdp)}
              onFocus={() => setFocus({ kind: 'average' })}
              onBlur={() => setFocus(null)}
              onMouseEnter={() => setFocus({ kind: 'average' })}
              onMouseLeave={() => setFocus(null)}
            />
          </g>

          <Scatter data={countries} dataKey="v" isAnimationActive={false} shape={dot} />

          {/* Text sits above the dots, so it goes through the z-index layer. */}
          <PlotOverlay margin={f.margin}>
            {/* Two lines sharing one placement: the clamp uses the WIDER
                line, not the concatenation of the two (#64, E9). */}
            <Annotation
              frame={f}
              x={averageX + 6}
              y={-22}
              className="dotplot-average-label"
              label={`OECD average, ${data.oecd_average_pct_gdp.toFixed(1)}% of GDP`}
              lines={['(mean of 38 members, not a country)']}
            />
            {countries.map((c, i) => {
              const isUs = !!c.is_us
              return (
                <g key={c.c}>
                  <circle
                    className="datum"
                    cx={x(c.v)}
                    cy={rowY(i)}
                    r={isUs ? 6 : 4}
                    fill={isUs ? 'var(--ink)' : 'var(--ink-soft)'}
                    {...countryMarks[i]}
                    role="img"
                    aria-label={describeCountry(c, data.us_rank, data.of_countries)}
                    onFocus={() => setFocus({ kind: 'country', c: c.c })}
                    onBlur={() => setFocus(null)}
                    onMouseEnter={() => setFocus({ kind: 'country', c: c.c })}
                    onMouseLeave={() => setFocus(null)}
                  />
                  <text
                    x={-8}
                    y={rowY(i)}
                    dy="0.32em"
                    textAnchor="end"
                    className={isUs ? 'dotplot-label dotplot-label-us' : 'dotplot-label'}
                  >
                    {c.c}
                  </text>
                  <text
                    x={x(c.v) + (isUs ? 10 : 8)}
                    y={rowY(i)}
                    dy="0.32em"
                    textAnchor="start"
                    className={isUs ? 'dotplot-value dotplot-value-us' : 'dotplot-value'}
                  >
                    {c.v.toFixed(1)}%
                  </text>
                </g>
              )
            })}
          </PlotOverlay>
        </ScatterChart>
      </div>

      <p aria-live="polite" className="readout">{readout}</p>

      <TableView
        caption="Total tax revenue as a share of GDP, OECD comparison, 2024"
        columns={[
          { key: 'c', label: 'Country or aggregate', unit: '' },
          { key: 'v', label: 'Total tax revenue', unit: 'percent of GDP' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={data.countries.map((c) => ({
          c: c.c,
          v: c.v.toFixed(1),
          basis: c.is_average ? 'Average of 38 members' : 'Country',
        }))}
      />
    </div>
  )
}
