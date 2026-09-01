/** Section 3: a century of brackets.
 *
 *  Three stacked panels over one shared x domain (1913-2025): the top statutory
 *  rate against the raw schedule ladder, the bracket count, and the top-bracket
 *  threshold in constant dollars. The issue asks for exactly these three
 *  things, and BRIEF.md's "pick the handful where interaction genuinely adds
 *  something" argues against a brushable timeline here, because this figure's
 *  whole point is the full 113-year sweep.
 *
 *  RECHARTS DRAWS ONE SURFACE PER CHART, so the three panels that were one
 *  hand-rolled `<svg>` are now three charts. `X_DOMAIN` is computed once from
 *  the data and forced onto all three. A panel that derived its own domain
 *  would disagree with the others by a pixel or two, and reading straight down
 *  a tax year is the whole reason the panels are stacked.
 *
 *  EVERY PANEL CARRIES ITS OWN FULL SET OF HIT MARKS, one per tax year, and
 *  each mark reports all three panels in its `aria-label`, exactly as the
 *  single hand-rolled column did. The roving group is per `<svg>`, so this
 *  figure now costs THREE Tab stops rather than one. That is the price of
 *  touch parity, and it is the right way round: the touch readout resolves the
 *  nearest `[data-mark]` INSIDE THE SURFACE THAT WAS TAPPED, so marks in panel
 *  C alone left two thirds of the figure inert to a finger, which is the
 *  primary input on a phone. Two extra Tab stops cost a keyboard reader far
 *  less than two dead panels cost a touch reader.
 *
 *  Focus or hover on any panel sets the one `focus` state, so all three panels
 *  paint their highlight column together and the single readout reports the
 *  year, whichever panel the reader is in.
 *
 *  PANEL C IS A LOG AXIS. Real dollars span roughly $47,000 to $113 million
 *  across the series, and a linear scale cannot hold both ends legibly. The
 *  scale is Recharts' own, through `PlotYAxis`' `scale` prop, and the four
 *  round dollar amounts are the ticks.
 *
 *  Two reference-identity rules govern this file, both recorded in
 *  `../charts/RechartsFrame.tsx`. `useFrame` memoises every axis value for the
 *  first, and the `dot` renderers below are deliberately fresh on every render
 *  for the second.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart, type DotItemDotProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
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
import { TableView } from './TableView'
import { dollars, dollarsCompact, calendarYear, percentRate } from '../charts/format'
import { AXIS_TITLE_FONT_PX, firstThatFits, spanRoomAt } from '../charts/axisFit'
import { labelHeight } from '../charts/annotate'
import type { BracketYear } from '../../data/types'

/** Fixed tick sets, at module scope so their identity is stable between
 *  renders. A fresh `ticks` array remounts the graphical item and destroys
 *  whichever mark holds focus. */
const RATE_TICKS = [0, 25, 50, 75, 100]
const NB_TICKS = [0, 20, 40, 60]
const THRESHOLD_TICK_VALUES = [1_000_000, 3_000_000, 10_000_000, 30_000_000]

const RATE_DOMAIN: [number, number] = [0, 100]
const NB_DOMAIN: [number, number] = [0, 60]

/**
 * A value label's baseline: above its point, unless that puts it in the panel
 * title's own row.
 *
 * MEASURED. `1918: 56` is the maximum of its panel, so its point sits at the
 * top of the plot and the label above it landed on `Bracket count, single
 * filer`, overlapping by 42.2px at 1440px and 33.4px at 390px. The title is
 * drawn at y=-2 in the same coordinates, so anything whose ascent reaches
 * above zero belongs below its point instead.
 */
function labelY(pointY: number): number {
  const above = pointY - 8
  return above - labelHeight() * 0.8 < 0 ? pointY + labelHeight() : above
}

const asYear = (v: number) => `${v}`
const asPercent = (v: number) => `${v}%`
const asCount = (v: number) => `${v}`

const RATE_LABEL =
  'The top statutory US income tax rate has ranged from 7% at the outset to a wartime peak of 94% in 1944.'
const COUNT_LABEL =
  'The US income tax schedule has run from 2 brackets in 1988 to 56 in 1918.'
const THRESHOLD_LABEL =
  'The income threshold where the top bracket begins has fallen from about $16 million in 1913 to about $600,000 in 2025, in constant 2024 dollars.'

/** `single` spans all 113 years, so it is never null here even though the type
 *  admits it for the other three statuses. */
const singleTop = (r: BracketYear) => r.s.single![r.s.single!.length - 1]
const topThreshold = (r: BracketYear) => singleTop(r).rlo
const nominalTopThreshold = (r: BracketYear) => singleTop(r).lo

export function BracketHistory({ rows }: { rows: BracketYear[] }) {
  const [focus, setFocus] = useState<number | null>(null)

  const xDomain = useMemo((): [number, number] => {
    const years = rows.map((r) => r.y)
    return [Math.min(...years), Math.max(...years)]
  }, [rows])

  // Panel C's domain, in dollars. The clearances are the ones the hand-rolled
  // log scale used.
  const thresholds = rows.map(topThreshold)
  const threshLo = Math.min(...thresholds) * 0.85
  const threshHi = Math.max(...thresholds) * 1.15
  // Memoised because a fresh `ticks` array remounts the graphical item and
  // destroys whichever mark holds focus.
  const threshTicks = useMemo(
    () => THRESHOLD_TICK_VALUES.filter((v) => v >= threshLo && v <= threshHi),
    [threshLo, threshHi],
  )

  const rate = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: rows.map((r) => r.top),
    yDomain: RATE_DOMAIN,
    xDomain,
    xTickCount: [5, 10],
  })
  const count = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: rows.map((r) => r.nb),
    yDomain: NB_DOMAIN,
    xDomain,
    xTickCount: [5, 10],
  })
  const threshold = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: thresholds,
    yDomain: [threshLo, threshHi],
    xDomain,
    xTickCount: [5, 10],
  })

  const { size, narrow } = rate

  // Every panel is the same short height, which is shorter than the size
  // preset's own, so each chart builds one shared frame and each panel's y
  // scale is built against that frame rather than against `useFrame`'s.
  const panelH = narrow ? 108 : 128
  const H = size.margin.top + panelH + size.margin.bottom
  const f = makeFrame(size.width, H, size.margin)
  const yRate = linear(rate.yDomain, [f.innerHeight, 0])
  const yNb = linear(count.yDomain, [f.innerHeight, 0])
  const panelStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${size.width} / ${H}` }),
    [size.width, H],
  )

  // Panel titles are start-anchored at the plot's left edge, so their room is
  // whatever is left between that edge and the surface's right edge: 658 units
  // at the 720 preset but only 298 at 360, where the two long titles below run
  // off the edge and are CUT (#66). The variant is chosen by fit against the
  // frame's own numbers rather than by the `narrow` boolean, so it stays right
  // if either preset ever moves.
  const titleRoom = spanRoomAt(0, f, 'start')
  const panelTitle = (variants: string[]) =>
    firstThatFits(variants, titleRoom, AXIS_TITLE_FONT_PX) ?? variants[variants.length - 1]

  /** One row per tax year, carrying all three panels' series. */
  const data = useMemo(
    () =>
      rows.map((r) => ({
        y: r.y,
        top: r.top,
        sched: r.sched_top,
        nb: r.nb,
        // Clamped because a log scale has no place for zero or a negative.
        thresh: Math.max(topThreshold(r), 1),
      })),
    [rows],
  )

  const divergent = rows.filter((r) => r.adj)
  const minNb = rows.reduce((a, r) => (r.nb < a.nb ? r : a), rows[0])
  const maxNb = rows.reduce((a, r) => (r.nb > a.nb ? r : a), rows[0])

  const xFormat = useTickFormat(asYear, null)
  const rateFormat = useTickFormat(asPercent, null)
  const countFormat = useTickFormat(asCount, null)
  const threshFormat = useTickFormat(dollarsCompact, null)

  const active = focus != null ? rows.find((r) => r.y === focus) : null

  const readout = (r: BracketYear) => {
    const t = singleTop(r)
    const adjNote = r.adj ? ` Published rate reflects ${r.adj.why}` : ''
    return (
      `${calendarYear(r.y)}: top rate ${percentRate(r.top)}` +
      (Math.abs(r.top - r.sched_top) > 0.01 ? ` (schedule ladder ${percentRate(r.sched_top)})` : '') +
      `, ${r.nb} bracket${r.nb === 1 ? '' : 's'}, top bracket begins at ${dollars(t.lo)} nominal ` +
      `(${dollars(t.rlo)} in 2024 dollars).${adjNote}`
    )
  }

  /* One `mark()` call per row per panel, in this render, then handed to that
   * panel's dot renderer by index. `mark()` counts from a counter that resets
   * once per render of the component holding the hook, and a renderer runs
   * inside `<Line>`, which can render without this island rendering.
   *
   * Three sets rather than one, because the roving group and the touch resolver
   * are both scoped to a single `<svg>`. See the file header. */
  const rateMarks = rows.map(() => rate.mark())
  const countMarks = rows.map(() => count.mark())
  const threshMarks = rows.map(() => threshold.mark())

  /** One year's hit column, spanning its panel's full plot height. The three
   *  panels share one x domain and one plot geometry, so one body serves all
   *  three and only the mark set differs. */
  const hitColumn = (props: DotItemDotProps, marks: ReturnType<typeof rate.mark>[]) => {
    const r = rows[props.index]
    if (!r) return null
    const on = active?.y === r.y
    return (
      <rect
        key={r.y}
        className="datum"
        x={Number(props.cx) - 3}
        y={f.margin.top}
        width={6}
        height={f.innerHeight}
        fill={on ? 'var(--ink)' : 'transparent'}
        opacity={on ? 0.08 : 0}
        {...marks[props.index]}
        role="img"
        aria-label={readout(r)}
        onFocus={() => setFocus(r.y)}
        onBlur={() => setFocus(null)}
        onMouseEnter={() => setFocus(r.y)}
        onMouseLeave={() => setFocus(null)}
      />
    )
  }

  /* Three renderers, each a NEW FUNCTION on every render and never wrapped in
   * `useCallback`. An identical `dot` prop makes React bail out of the `<Line>`
   * subtree, and the marks then freeze at their first paint while the readout
   * keeps working. */
  const rateDot = (props: DotItemDotProps) => hitColumn(props, rateMarks)
  const countDot = (props: DotItemDotProps) => hitColumn(props, countMarks)
  const threshDot = (props: DotItemDotProps) => hitColumn(props, threshMarks)

  return (
    <div>
      {/* Panel A: top rate against the schedule ladder. */}
      <div ref={rate.boxRef} {...rate.wrapperProps}>
        <LineChart
          ref={rate.surfaceRef}
          data={data}
          width={size.width}
          height={H}
          margin={rate.chartMargin}
          style={panelStyle}
          {...SURFACE_DEFAULTS}
          aria-label={RATE_LABEL}
        >
          <PlotGrid />
          <PlotXAxis
            domain={rate.xDomain}
            ticks={rate.xTicks}
            gutter={size.margin.bottom}
            unit="Tax year"
            format={xFormat}
          />
          <PlotYAxis
            domain={rate.yDomain}
            ticks={RATE_TICKS}
            gutter={size.margin.left}
            unit="Percent"
            format={rateFormat}
          />
          <Line
            type="monotone"
            dataKey="sched"
            stroke="var(--ink-soft)"
            strokeWidth={1.25}
            strokeDasharray="3,3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="top"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={rateDot}
            activeDot={false}
            isAnimationActive={false}
          />
          <PlotOverlay margin={f.margin}>
            <text className="panel-title" x={0} y={-2}>
              {panelTitle([
                'Top statutory rate vs. schedule ladder top, percent',
                'Top rate vs. schedule ladder, percent',
                'Top rate, percent',
              ])}
            </text>
            {divergent.map((r) => (
              <circle
                key={r.y}
                cx={rate.x(r.y)}
                cy={yRate(r.sched_top)}
                r={2.5}
                fill="none"
                stroke="var(--ink-soft)"
                strokeWidth={1}
              />
            ))}
            {/* One direct label illustrating the divergence pattern. The full
                set is documented in the table and the aria-live readout.
                Placed explicitly rather than carried in by the ancestor's
                translate: an x-less <text> reads as x=0 to the clipping guard,
                which would hide a real overrun (#64, E7). */}
            <Annotation
              frame={f}
              x={rate.x(1981)}
              y={yRate(69.125) - 8}
              anchor="middle"
              halo
              label="1981: 69.125% (part-year cut)"
            />
          </PlotOverlay>
        </LineChart>
      </div>

      {/* Panel B: bracket count. */}
      <div ref={count.boxRef} {...count.wrapperProps}>
        <LineChart
          ref={count.surfaceRef}
          data={data}
          width={size.width}
          height={H}
          margin={count.chartMargin}
          style={panelStyle}
          {...SURFACE_DEFAULTS}
          aria-label={COUNT_LABEL}
        >
          <PlotGrid />
          <PlotXAxis
            domain={count.xDomain}
            ticks={count.xTicks}
            gutter={size.margin.bottom}
            unit="Tax year"
            format={xFormat}
          />
          <PlotYAxis
            domain={count.yDomain}
            ticks={NB_TICKS}
            gutter={size.margin.left}
            unit="Brackets, count"
            format={countFormat}
          />
          <Line
            type="monotone"
            dataKey="nb"
            stroke="var(--disc)"
            strokeWidth={2}
            dot={countDot}
            activeDot={false}
            isAnimationActive={false}
          />
          <PlotOverlay margin={f.margin}>
            <text className="panel-title" x={0} y={-2}>Bracket count, single filer</text>
            <circle cx={count.x(minNb.y)} cy={yNb(minNb.nb)} r={3} fill="var(--disc)" />
            <Annotation
              frame={f}
              x={count.x(minNb.y)}
              y={labelY(yNb(minNb.nb))}
              anchor="middle"
              halo
              label={`${minNb.y}: ${minNb.nb}`}
            />
            <circle cx={count.x(maxNb.y)} cy={yNb(maxNb.nb)} r={3} fill="var(--disc)" />
            <Annotation
              frame={f}
              x={count.x(maxNb.y)}
              y={labelY(yNb(maxNb.nb))}
              anchor="middle"
              halo
              label={`${maxNb.y}: ${maxNb.nb}`}
            />
          </PlotOverlay>
        </LineChart>
      </div>

      {/* Panel C: top-bracket threshold, constant 2024 dollars, log scale. */}
      <div ref={threshold.boxRef} {...threshold.wrapperProps}>
        <LineChart
          ref={threshold.surfaceRef}
          data={data}
          width={size.width}
          height={H}
          margin={threshold.chartMargin}
          style={panelStyle}
          {...SURFACE_DEFAULTS}
          aria-label={THRESHOLD_LABEL}
        >
          <PlotGrid />
          <PlotXAxis
            domain={threshold.xDomain}
            ticks={threshold.xTicks}
            gutter={size.margin.bottom}
            unit="Tax year"
            format={xFormat}
          />
          <PlotYAxis
            domain={threshold.yDomain}
            ticks={threshTicks}
            scale="log"
            gutter={size.margin.left}
            unit="Constant 2024 dollars, log scale"
            format={threshFormat}
          />
          <Line
            type="monotone"
            dataKey="thresh"
            stroke="var(--int)"
            strokeWidth={2}
            dot={threshDot}
            activeDot={false}
            isAnimationActive={false}
          />
          <PlotOverlay margin={f.margin}>
            <text className="panel-title" x={0} y={-2}>
              {panelTitle([
                'Top-bracket threshold, constant 2024 dollars (log scale)',
                'Top-bracket threshold, 2024 dollars (log)',
                'Top bracket, 2024 $ (log)',
              ])}
            </text>
          </PlotOverlay>
        </LineChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? readout(active) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Statutory bracket schedules by tax year, 1913-2025"
        columns={[
          { key: 'y', label: 'Year', unit: 'tax year' },
          { key: 'top', label: 'Top statutory rate', unit: 'percent' },
          { key: 'sched', label: 'Schedule ladder top', unit: 'percent' },
          { key: 'nb', label: 'Brackets', unit: 'count' },
          { key: 'lo', label: 'Top-bracket threshold', unit: 'nominal dollars' },
          { key: 'rlo', label: 'Top-bracket threshold', unit: 'constant 2024 dollars' },
          { key: 'adj', label: 'Adjustment', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          top: percentRate(r.top),
          sched: percentRate(r.sched_top),
          nb: r.nb,
          lo: dollars(nominalTopThreshold(r)),
          rlo: dollars(topThreshold(r)),
          adj: r.adj ? r.adj.why : null,
        }))}
      />
    </div>
  )
}
