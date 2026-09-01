/** Section 3: how old is the debt.
 *
 *  One shared horizontal axis (years to maturity, 0 to the longest instrument
 *  issued) carries three instrument bands, each drawn only across the years
 *  it actually spans, the 10-20 year stretch is a visible gap, not a
 *  zero-height band, because nothing outstanding covers it.
 *
 *  The finding is the DISTANCE between two markers (average maturity, about
 *  six years; longest instrument, thirty years), never a time series.
 *  sections.md §3: "Do not build this as a time series." The maturity
 *  time-series field is never referenced here, see
 *  docs/contracts/interfaces/curated-snapshots.md.
 *
 *  Drawn on `charts/RechartsFrame.tsx` as a `<BarChart>`. Read that file's
 *  header before editing this one.
 *
 *  EACH BAND SPANS A RANGE OF YEARS, so its x extent comes from the site's own
 *  scale and not from a band layout. Recharts places a bar at one category
 *  position and gives it one width, which cannot express "2 to 10 years", and
 *  closing the 10-to-20 gap is exactly what this figure must not do. Recharts
 *  supplies the axes, the panel and each band's HEIGHT, which is the amount
 *  outstanding.
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, type BarShapeProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { AXIS_LABEL_FONT_PX, firstThatFits, leftTickRoom } from '../charts/axisFit'
import { frame as makeFrame, linear } from '../charts/scales'
import { TableView } from './TableView'
import type { DebtMaturity as DebtMaturityData } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

type BandKey = 'bills' | 'notes' | 'bonds'

// Presentation only: the curated data carries a maturity STRING ("2 to 10
// years"), not numeric bounds. These bounds are what sections.md specifies
// for the axis layout, not a re-derivation of anything curated.
const RANGES: Record<BandKey, [number, number]> = { bills: [0, 1], notes: [2, 10], bonds: [20, 30] }

const BAND_ORDER = Object.keys(RANGES) as BandKey[]

const fmtT = (v: number) => (v < 1 ? `$${Math.round(v * 1000)}B` : `$${v.toFixed(2)}T`)

/** The same magnitudes, from the longest form down to the shortest.
 *  `axisTickT` picks by fit; nothing here chooses on a breakpoint. */
const tickVariants = (v: number): string[] =>
  v < 1
    ? [`$${Math.round(v * 1000)}B`]
    : [`$${v.toFixed(2)}T`, `$${v.toFixed(1)}T`, `$${v.toFixed(0)}T`]

/**
 * A y tick that fits BESIDE the rotated axis title, not merely inside the
 * gutter.
 *
 * MEASURED at the 360 preset. `$10.00T` is 41.4 units wide, the gutter holds
 * 42, so it passed `leftGutterFits` and shipped starting at x=2.6, which is
 * inside the axis title's own band: the number painted across
 * "$ trillions outstanding". `leftTickRoom` is the narrower budget, and the
 * ladder above resolves to `$10T` at 27.3 units. See `axisFit.ts`.
 */
function axisTickT(v: number, room: number): string {
  const variants = tickVariants(v)
  return firstThatFits(variants, room, AXIS_LABEL_FONT_PX) ?? (variants[variants.length - 1] as string)
}

const YEAR_TICK = (t: number) => `${t}`

export function DebtMaturity({ d }: { d: DebtMaturityData }) {
  const [focus, setFocus] = useState<BandKey | null>(null)

  const comp = useMemo(
    () => Object.fromEntries(d.composition.map((c) => [c.k, c])) as Record<BandKey, (typeof d.composition)[number]>,
    [d],
  )
  const bands = useMemo(
    () => BAND_ORDER.map((k) => ({ ...comp[k], k, mid: (RANGES[k][0] + RANGES[k][1]) / 2 })),
    [comp],
  )

  /* `useFrame` supplies the container measurement, the roving group and the
   * wrapper that carries the handlers Recharts strips off the surface. Its own
   * frame is discarded, because this figure is short by design and no viewBox
   * preset expresses a 56 or 84 unit plot. */
  const { boxRef, size, narrow, surfaceRef, wrapperProps, mark } = useFrame({
    rows: bands,
    xOf: (b) => b.mid,
    yValues: [],
  })

  const W = size.width
  const bandMaxH = narrow ? 56 : 84
  // The headroom the two marker labels used to take inside the plot now sits in
  // the top margin, so the plot rect is exactly the tallest band.
  const marginTop = size.margin.top + (narrow ? 26 : 34)
  const gutterBottom = narrow ? 40 : 50
  const H = marginTop + bandMaxH + gutterBottom

  const f = useMemo(
    () =>
      makeFrame(W, H, {
        top: marginTop,
        right: size.margin.right,
        bottom: gutterBottom,
        left: size.margin.left,
      }),
    [W, H, marginTop, gutterBottom, size.margin.right, size.margin.left],
  )
  const iw = f.innerWidth

  const maxAmt = Math.max(...d.composition.map((c) => c.amount_t))
  const longest = d.longest_instrument_years

  const { xYears, xTicks, xDomain, yDomain, yTicks } = useMemo(() => {
    const scale = linear([0, longest], [0, iw])
    const amounts = linear([0, maxAmt], [bandMaxH, 0])
    return {
      xYears: scale,
      xTicks: [0, 5, 10, 15, 20, 25, longest],
      xDomain: [0, longest] as [number, number],
      yDomain: [0, maxAmt] as [number, number],
      yTicks: amounts.ticks(narrow ? 3 : 4),
    }
  }, [iw, longest, maxAmt, bandMaxH, narrow])

  const chartMargin = useMemo(
    () => ({ top: marginTop, right: size.margin.right, bottom: 0, left: 0 }),
    [marginTop, size.margin.right],
  )
  const chartStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }),
    [W, H],
  )
  /* Rule 1: the formatter's identity must survive a render, so the fit budget
   * is the memo key rather than a fresh closure. */
  const yFormat = useTickFormat(axisTickT, leftTickRoom(f))

  const avgYears = d.avg_maturity_months / 12

  const describe = (k: BandKey): string => {
    const c = comp[k]
    const pct = c.share_pct != null ? `, ${c.share_pct}% of marketable debt (curated share, not derived from the amount)` : ''
    return `${c.label}, maturity ${c.maturity}: ${fmtT(c.amount_t)}${pct}`
  }

  const ariaLabel =
    `US marketable Treasury debt by instrument type: bills under one year, notes two to ten ` +
    `years, bonds twenty to thirty years, against a scale marking the average maturity of ` +
    `${d.avg_maturity_months} months (about ${avgYears.toFixed(0)} years) against the ` +
    `${longest}-year maximum.`

  // `mark()` runs once per band HERE, in this island's own render, and the
  // results reach the shape renderer by index. The renderer runs inside
  // `<Bar>`, which may render without this island rendering.
  const markProps = bands.map(() => mark())

  /** A NEW FUNCTION on every render, deliberately. A memoised `shape` leaves
   *  the graphical item with identical props, React bails out of the subtree,
   *  and the bands freeze at their first paint. See rule 2 in
   *  `RechartsFrame.tsx`.
   *
   *  IT DRAWS THE VISIBLE BAND AND NOTHING FOCUSABLE. See the overlay below. */
  const band = (props: BarShapeProps) => {
    const i = props.originalDataIndex
    const b = bands[i]
    if (!b || !Number.isFinite(props.y) || !Number.isFinite(props.height)) return null
    const [y0, y1] = RANGES[b.k]
    return (
      <rect
        key={b.k}
        x={xYears(y0)}
        y={props.y}
        width={xYears(y1) - xYears(y0)}
        height={props.height}
        fill="var(--public)"
      />
    )
  }

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <BarChart
          ref={surfaceRef}
          data={bands}
          width={W}
          height={H}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={ariaLabel}
        >
          {/* Panel only. Three bands of different heights read against the
              baseline and the direct labels, and a rule across them all would
              invite reading a band's top off the grid instead. */}
          <CartesianGrid horizontal={false} vertical={false} fill="var(--panel)" fillOpacity={1} />
          <PlotXAxis
            dataKey="mid"
            domain={xDomain}
            ticks={xTicks}
            gutter={gutterBottom}
            unit="Years to maturity"
            format={YEAR_TICK}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="$ trillions outstanding"
            format={yFormat}
          />
          <Bar
            dataKey="amount_t"
            isAnimationActive={false}
            activeBar={false}
            shape={band}
          />

          <PlotOverlay margin={f.margin}>
            {/* THE FOCUSABLE MARKS, and the reason they are here rather than in
                the `shape` renderer above. Recharts keys each band's wrapper on
                its own geometry and rebuilds that subtree on every render of
                this island, so a mark drawn inside `shape` is DESTROYED the
                moment focusing it sets `focus` state, and the arrow keys then
                reach no key handler at all. `WhoPays` states the same rule for
                a different reason.

                Each hit target covers its own band exactly, from the site's own
                scale and the same band height the labels below are placed
                against, so it needs none of Recharts' geometry. */}
            {bands.map((b, i) => {
              const [y0, y1] = RANGES[b.k]
              const h = (b.amount_t / maxAmt) * bandMaxH
              return (
                <rect
                  key={b.k}
                  className="datum"
                  x={xYears(y0)}
                  y={f.innerHeight - h}
                  width={xYears(y1) - xYears(y0)}
                  height={h}
                  fill="transparent"
                  {...markProps[i]}
                  role="img"
                  aria-label={describe(b.k)}
                  onFocus={() => setFocus(b.k)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(b.k)}
                  onMouseLeave={() => setFocus(null)}
                />
              )
            })}

            {/* Held inside the PLOT, not the surface. The bills band starts at
                year zero, so a centred label on it reached 4 units past the
                surface's left edge and painted across the `$5T` and `$10T`
                ticks: 31.5px of collision at the 360 preset, with nothing
                clipped. `within="plot"` is the shift that answers it. */}
            {bands.map((b) => {
              const [y0, y1] = RANGES[b.k]
              const top = f.innerHeight - (b.amount_t / maxAmt) * bandMaxH
              return (
                <Annotation
                  key={b.k}
                  frame={f}
                  x={(xYears(y0) + xYears(y1)) / 2}
                  y={top - 8}
                  anchor="middle"
                  within="plot"
                  className="maturity-label"
                  label={`${b.label} ${fmtT(b.amount_t)}${b.share_pct != null ? ` (${b.share_pct}%)` : ''}`}
                />
              )
            })}

            {/* The two markers the section is about. The DISTANCE is the
                finding, so both lines run the full height of the plot.

                THE TWO LABELS SHARE A ROW ONLY WHERE THE ROW HOLDS BOTH. At
                the 360 preset they need 280 and 208 units against 308 of
                plot, and they shipped overlapping by 60.8px, so the longest
                marker takes a second row above the first and its line grows
                to meet it. Neither label is shortened: both name a marker the
                section's finding is the distance between. */}
            <line
              x1={xYears(avgYears)}
              y1={f.innerHeight}
              x2={xYears(avgYears)}
              y2={-14}
              stroke="var(--ink)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <Annotation
              frame={f}
              x={xYears(avgYears)}
              y={-20}
              anchor="middle"
              className="maturity-marker-label"
              label={`Average maturity, ${d.avg_maturity_months} months (about ${avgYears.toFixed(0)} years)`}
            />
            <line
              x1={xYears(longest)}
              y1={f.innerHeight}
              x2={xYears(longest)}
              y2={narrow ? -28 : -14}
              stroke="var(--ink)"
              strokeWidth={1}
            />
            <Annotation
              frame={f}
              x={xYears(longest) - (narrow ? 4 : 0)}
              y={narrow ? -34 : -20}
              anchor={narrow ? 'end' : 'middle'}
              className="maturity-marker-label"
              label={`Longest instrument, ${longest}-year bond`}
            />
          </PlotOverlay>
        </BarChart>
      </div>

      <p aria-live="polite" className="readout">
        {focus ? describe(focus) : <ChartHint noun="instrument band" />}
      </p>

      <TableView
        caption="Maturity structure of marketable Treasury debt"
        columns={[
          { key: 'instrument', label: 'Instrument', unit: 'type' },
          { key: 'range', label: 'Maturity range', unit: 'years' },
          { key: 'amount', label: 'Amount outstanding', unit: '$ trillions' },
          { key: 'share', label: 'Share of marketable debt', unit: 'percent' },
        ]}
        rows={d.composition.map((c) => ({
          instrument: c.label,
          range: c.maturity,
          amount: c.amount_t.toFixed(1),
          // Only bills carries a curated share; notes/bonds are 'no data', never
          // a percentage derived from the amount over the marketable total (EC3).
          share: c.share_pct ?? null,
        }))}
      />
    </div>
  )
}
