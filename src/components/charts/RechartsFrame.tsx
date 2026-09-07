/** The shared Recharts layer.
 *
 *  Every converted island builds on this, and the reason it exists is not
 *  convenience. Recharts 3 has two undocumented reference-identity rules that
 *  point in OPPOSITE directions, both fail silently, and both survive type
 *  checking. Encoding them once is the only way 23 islands do not each
 *  rediscover them. They were bisected in Chromium against
 *  `src/components/islands/demo/DebtChartRecharts.tsx`.
 *
 *  RULE 1, STABILITY. An axis `ticks` array or a `tickFormatter` with a fresh
 *  identity on each render makes Recharts unmount and remount the graphical
 *  item. The remount destroys whichever mark holds focus, so a roving group
 *  answers ONE arrow press and then leaves focus on `<body>`. `useFrame` below
 *  memoises every such value, and a caller that computes ticks itself must do
 *  the same.
 *
 *  RULE 2, INSTABILITY. A `dot` renderer must be a NEW FUNCTION on every
 *  render. Recharts calls it as a plain function in `component/Dots.js`, so a
 *  `useCallback([])` renderer leaves the graphical item with identical props,
 *  React bails out of the subtree, and the marks never re-render. The focused
 *  point then never grows and the roving `tabindex="0"` never moves, while the
 *  readout and the aria-labels keep working, which is what makes it easy to
 *  miss. Never wrap a dot renderer in `useCallback`.
 *
 *  THREE STRUCTURAL FACTS, each of which looks like a style choice and is not.
 *
 *  1. `svgPropertiesNoEvents` strips every event handler from the chart's prop
 *     bag. Only `ref`, `role`, `aria-label` and `data-*` reach the surface. The
 *     roving group's handlers therefore ride a wrapper `<div>` and reach the
 *     marks by bubbling. `useFrame` returns them already split.
 *  2. The plot panel is `fill` on `<CartesianGrid>`. A hand-drawn first-child
 *     `<rect>` does not work, because the grid renders at zIndex -100 into a
 *     portal appended before every plain child, so the rect would cover the
 *     gridlines.
 *  3. An annotation must sit inside `<ZIndexLayer zIndex={DefaultZIndexes.label}>`.
 *     A plain child renders at zIndex 0 and an area fill paints over it at 100.
 *
 *  WHAT THIS LAYER DOES NOT DO. It draws no chart. Scales, ticks and geometry
 *  still come from `scales.ts`, formatting from `format.ts`, keyboard access
 *  from `roving.ts`, and annotation placement from `annotate.ts` through
 *  `Annotation.tsx`. Recharts draws the marks and the axes and nothing else,
 *  which is why swapping it out again would be a contained change.
 */
import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  CartesianGrid,
  DefaultZIndexes,
  XAxis,
  YAxis,
  ZIndexLayer,
  usePlotArea,
} from 'recharts'
import { AXIS_TITLE_FONT_PX, AXIS_TITLE_X, firstThatFits } from './axisFit'
import { frame as makeFrame, linear, niceExtent } from './scales'
import { useChartSize } from './useChartSize'
import { useRovingMarks } from './roving'

/** Baseline-to-plot-edge gap for the horizontal left-axis title, in viewBox
 *  units. It is one em plus a half-leading rather than the two thirds of an em
 *  it started at, because the topmost y tick is CENTRED on the plot's top edge
 *  and reaches 5.5 units above it. At 7 the title's descender crossed that tick
 *  by 2.1px on `/households` §3 ("Percent" over "100%", "Brackets, count" over
 *  "60") and by 0.8px on `/economy` §2 ("Percent per year" over "18%"). MEASURED
 *  in Chromium at 1440px and 390px; 11 leaves about 2 units of daylight at both.
 *
 *  It cannot grow much further: the baseline is `plot.y - AXIS_TITLE_GAP` and
 *  the smallest top margin on the site is 28, so the glyph box's own 9.3 units
 *  of ascent leave 7.7 units of headroom at 11. */
const AXIS_TITLE_GAP = 11

/** Padding between the axis title's right end and the plot's right edge, in
 *  viewBox units, used when picking which variant of the title fits. */
const AXIS_TITLE_PAD = 2

/** Below this the chart takes fewer ticks. Matches the `narrow` test the
 *  hand-rolled islands already used, so tick density does not change per form. */
const NARROW_PX = 500

/** The tick `<text>` every axis uses. Module scope, because rule 1 applies to
 *  this object as much as to the arrays. */
export const TICK_TEXT = {
  className: 'axis-label',
  fill: 'var(--ink-soft)',
} as const

export interface FrameOptions<T> {
  /** The rows the chart draws, already filtered to what is shown. */
  rows: T[]
  /** The horizontal value, usually a year. */
  xOf: (row: T) => number
  /** Every vertical value that must fit, across every series in the panel. */
  yValues: number[]
  /** Force a y domain instead of deriving one, for a shared or zero-anchored axis. */
  yDomain?: [number, number]
  /** Force an x domain, for panels that must share one. */
  xDomain?: [number, number]
  /** Tick counts. The defaults match the hand-rolled islands. */
  xTickCount?: [narrow: number, wide: number]
  yTickCount?: [narrow: number, wide: number]
  /** Keep only whole-number x ticks. True for a year axis, which is most of them. */
  xTicksInteger?: boolean
  /** This panel's share of the figure's common graphic height. Defaults to 1,
   *  the whole of it. A figure that stacks panels passes a fraction per panel,
   *  and the fractions sum to 1. */
  heightShare?: number
}

/**
 * Geometry, scales, ticks and the roving wiring for one Recharts panel.
 *
 * Returns everything a caller needs and memoises everything rule 1 covers, so
 * an island that spreads these values onto its axes cannot reintroduce the
 * focus loss by accident.
 */
export function useFrame<T>({
  rows,
  xOf,
  yValues,
  yDomain: forcedY,
  xDomain: forcedX,
  xTickCount = [4, 8],
  yTickCount = [4, 6],
  xTicksInteger = true,
  heightShare = 1,
}: FrameOptions<T>) {
  const [boxRef, rawSize] = useChartSize()
  /* `heightShare` is how a figure that stacks panels divides the site's common
   * graphic height instead of multiplying it. A two-panel figure whose lower
   * panel is two thirds of the upper one passes 1 / 1.66 and 0.66 / 1.66; the
   * ratio between the panels is unchanged and the pair now sums to one preset
   * height. Before this, each panel took the full preset and the figure drew
   * 664 units against a 400-unit norm.
   *
   * It is applied HERE rather than at the render site because `f`, `y`,
   * `chartStyle` and every tick derive from `size.height`. Overriding the
   * height downstream would leave the scales built against the old one and the
   * marks would be drawn off the plot. */
  const size = { ...rawSize, height: Math.round(rawSize.height * heightShare) }
  const f = makeFrame(size.width, size.height, size.margin)
  const narrow = size.width < NARROW_PX

  const xs = rows.map(xOf)
  const xKey = xs.length ? `${Math.min(...xs)}:${Math.max(...xs)}` : 'empty'
  const yKey = yValues.length ? `${Math.min(...yValues)}:${Math.max(...yValues)}:${yValues.length}` : 'empty'
  const forcedXKey = forcedX ? forcedX.join(':') : ''
  const forcedYKey = forcedY ? forcedY.join(':') : ''

  /* Rule 1 lives here. The dependency list is deliberately built from value
   * keys rather than from the arrays themselves: `rows` and `yValues` are new
   * arrays on most renders, and depending on them directly would defeat the
   * memo and take the focus loss back. */
  const scales = useMemo(() => {
    const xd: [number, number] =
      forcedX ?? (xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1])
    const yd: [number, number] = forcedY ?? niceExtent(yValues)
    const x = linear(xd, [0, f.innerWidth])
    const y = linear(yd, [f.innerHeight, 0])
    const rawX = x.ticks(narrow ? xTickCount[0] : xTickCount[1])
    return {
      xDomain: xd,
      yDomain: yd,
      x,
      y,
      xTicks: xTicksInteger ? rawX.filter((t) => Number.isInteger(t)) : rawX,
      yTicks: y.ticks(narrow ? yTickCount[0] : yTickCount[1]),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xKey, yKey, forcedXKey, forcedYKey, f.innerWidth, f.innerHeight, narrow])

  /* Recharts adds each axis's own width or height to this margin, so the site's
   * left and bottom gutters are declared on the axes and zeroed here. The plot
   * rect then matches `makeFrame`'s exactly, which is what lets a hand-drawn
   * annotation share its coordinates. */
  const chartMargin = useMemo(
    () => ({ top: size.margin.top, right: size.margin.right, bottom: 0, left: 0 }),
    [size.margin.top, size.margin.right],
  )

  /* Without this the wrapper is a fixed pixel box and overflows a narrow
   * column. `aspectRatio` is what gives Recharts the scaling its own surface
   * would otherwise get from a viewBox it does not write. */
  const chartStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${size.width} / ${size.height}` }),
    [size.width, size.height],
  )

  /* Structural fact 1: the handlers cannot reach the surface, so they ride the
   * wrapper and catch the same events by bubbling. */
  const { groupProps, mark } = useRovingMarks()
  const { ref: surfaceRef, 'data-roving': roving, ...handlers } = groupProps

  const wrapperProps = {
    className: 'chart',
    ...(handlers as unknown as React.HTMLAttributes<HTMLDivElement>),
    ...(roving != null ? { 'data-roving': '' } : {}),
  }

  return { boxRef, size, f, narrow, ...scales, chartMargin, chartStyle, surfaceRef, wrapperProps, mark }
}

/**
 * The plot panel and the horizontal rules, in one element.
 *
 * `fill` here is how the `var(--panel)` rect that `Chart.tsx` paints is
 * expressed. See structural fact 2 for why a hand-drawn rect is wrong.
 */
export function PlotGrid() {
  return (
    <CartesianGrid
      horizontal
      vertical={false}
      stroke="var(--rule)"
      strokeWidth={0.5}
      fill="var(--panel)"
      fillOpacity={1}
      syncWithTicks
    />
  )
}

/**
 * The left-axis title, set horizontally above the top-left of the plot.
 *
 * It used to run vertically up the axis, and the rotation was the whole source
 * of its trouble. Recharts' `position: 'insideLeft'` centres a rotated title on
 * the AXIS BOX rather than on the surface, and the two vertical margins are
 * asymmetric, so a title longer than the panel ran off the top: `/households`
 * §1 shipped "Constant 2024 dollars, log scale" with 4.8px of its first glyph
 * cut away, recorded under issue #83. `placeAxisTitleY` answered that by
 * sliding the title along the axis until its box fitted.
 *
 * A horizontal title cannot have the defect at all. It is also what the
 * publications this site was measured against do: the Financial Times, Our
 * World in Data and Asterisk all set the unit as a line above the plot rather
 * than as a rotated label beside it. At 10.5px and rotated at the far left of
 * a 640-unit surface, the old title was the least legible text on the page.
 *
 * `x = 0` puts it at the surface's left edge, so it heads the gutter its tick
 * labels sit in. The chart margins reserve the room above the plot.
 *
 * IT IS THE ONLY TEXT ON THAT LINE. A stacked figure used to draw a second
 * label there, `.panel-title`, from the plot's left edge, and any title wider
 * than the left gutter printed straight through it: `/households` §2 shipped
 * "Families Gini index, ratio 0 to 1" over "Families Gini index" with 107.5px
 * of the two boxes on top of each other. The panel's name now arrives as a
 * VARIANT LADDER in this title, longest first, so one line carries the panel
 * and its unit together. See `useAxisLabel`.
 *
 * The frame is rebuilt from Recharts' own layout rather than passed in, so no
 * island has to hand this layer a second copy of geometry it already declares.
 */
function makeAxisTitleY(variants: readonly string[]) {
  return function AxisTitleY() {
    const plot = usePlotArea()
    if (plot == null || variants.length === 0) return null
    /* The title starts at the surface's left edge and the plot's right edge is
     * where the room ends, so the ladder is measured against the whole of it.
     * The shortest rung is drawn when even that does not fit: an axis with no
     * unit breaks BRIEF.md rule 2, which is worse than a tight line. */
    const room = Math.max(0, plot.x + plot.width - AXIS_TITLE_PAD)
    const value =
      firstThatFits(variants, room, AXIS_TITLE_FONT_PX) ?? variants[variants.length - 1]
    /* The baseline sits `AXIS_TITLE_GAP` above the plot's top edge, floored so a
     * chart with an unusually tight top margin cannot push the glyph box off the
     * surface. */
    const y = Math.max(AXIS_TITLE_FONT_PX, plot.y - AXIS_TITLE_GAP)
    return (
      <text x={0} y={y} textAnchor="start" className="axis-title" fill="var(--ink-soft)">
        {value}
      </text>
    )
  }
}

/**
 * An axis title, memoised because rule 1 covers this object too.
 *
 * `value` is one string, or a ladder of them longest first. A ladder is how a
 * stacked panel names itself AND its unit on the one line above the plot: the
 * y title picks the longest rung that fits the plot's width, so 1440px reads
 * "Top-bracket threshold, constant 2024 dollars (log scale)" and 390px reads
 * "Top bracket, 2024 $ (log)". The x title takes the longest rung as written.
 */
export function useAxisLabel(
  value: string | readonly string[],
  axis: 'x' | 'y',
  offset = AXIS_TITLE_X,
) {
  /* Rule 1 again: `variants` is a fresh array whenever the caller writes the
   * ladder inline, so the memo is keyed on the TEXT rather than on the array. */
  const key = typeof value === 'string' ? value : value.join('')
  // `offset` is read only by the x axis now; the y title anchors to the plot.
  return useMemo(() => {
    const variants = typeof value === 'string' ? [value] : [...value]
    return axis === 'y'
      ? {
          value: variants[0],
          /* Recharts cannot express this placement, so the title is drawn
           * here off the site's own arithmetic. See `makeAxisTitleY`. */
          content: makeAxisTitleY(variants),
        }
      : {
          value: variants[0],
          position: 'insideBottom' as const,
          /* Not zero. `insideBottom` puts the text ANCHOR on the axis box's
           * bottom edge, and the glyph box then hangs 2px below the surface,
           * which `smoke.test.ts`'s vertical-containment check reported on
           * every x axis on the site. The offset lifts the whole title back
           * inside. Measured at 390px and 1440px. */
          offset: 4,
          className: 'axis-title',
          fill: 'var(--ink-soft)',
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, axis, offset])
}

/** A tick formatter with a stable identity. Rule 1 names `tickFormatter`
 *  specifically: written inline it reproduces the focus loss on its own. */
export function useTickFormat<A>(format: (v: number, arg: A) => string, arg: A) {
  return useCallback((v: number) => format(v, arg), [format, arg])
}

export interface AxisProps {
  domain: [number, number]
  ticks: number[]
  /** `log` for an axis whose values span orders of magnitude. Passed through to
   *  Recharts rather than reimplemented, and verified against d3 to the pixel. */
  scale?: 'linear' | 'log'
  /** Gutter, from `size.margin`. Declared here because the chart margin is zeroed. */
  gutter: number
  /** The axis title. Required: `Figure.astro` already throws on a missing axis
   *  unit, and a bare number axis is the defect that throw exists to prevent.
   *
   *  One string, or a ladder of them longest first. A panel inside a stacked
   *  figure passes a ladder that names the panel AND its unit, because this
   *  title is the only text on the line above the plot. See `useAxisLabel`. */
  unit: string | readonly string[]
  format: (v: number) => string
  dataKey?: string
}

export function PlotXAxis({ domain, ticks, gutter, unit, format, scale = 'linear', dataKey = 'y' }: AxisProps) {
  const label = useAxisLabel(unit, 'x')
  return (
    <XAxis
      dataKey={dataKey}
      type="number"
      scale={scale}
      domain={domain}
      ticks={ticks}
      /* MEASURED. Recharts defaults to `interval="preserveEnd"`, which DROPS
       * ticks it judges too close together. On a log axis whose round values
       * are unevenly spaced it kept two of four, leaving the axis naming a
       * third of its own range. The caller already chose these ticks, through
       * d3, so the axis renders all of them. */
      interval={0}
      height={gutter}
      axisLine={false}
      tickLine={false}
      tickFormatter={format}
      tick={TICK_TEXT}
      label={label}
    />
  )
}

export function PlotYAxis({ domain, ticks, gutter, unit, format, scale = 'linear' }: Omit<AxisProps, 'dataKey'>) {
  const label = useAxisLabel(unit, 'y')
  return (
    <YAxis
      type="number"
      scale={scale}
      domain={domain}
      ticks={ticks}
      /* See the note on the x axis. `preserveEnd` silently dropping half a log
       * axis's labels is the case that found this. */
      interval={0}
      width={gutter}
      axisLine={false}
      tickLine={false}
      tickFormatter={format}
      tick={TICK_TEXT}
      label={label}
    />
  )
}

/**
 * Wrapper for anything drawn in the site's own plot coordinates.
 *
 * Structural fact 3: without the `ZIndexLayer` an annotation renders at zIndex
 * 0 and an area fill paints over it at 100. The inner `<g>` translates into the
 * plot rect, so a child positions with the same scales the island already has.
 */
export function PlotOverlay({
  margin,
  children,
}: {
  margin: { left: number; top: number }
  children: ReactNode
}) {
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label}>
      <g transform={`translate(${margin.left},${margin.top})`}>{children}</g>
    </ZIndexLayer>
  )
}

/** Props every chart surface takes. `accessibilityLayer` is off in all of them:
 *  left on, it puts `tabindex="0"` and `role="application"` on the surface and
 *  drives its own arrow-key cursor through a Tooltip these figures never
 *  render, which would fight the roving group for the same keys. */
export const SURFACE_DEFAULTS = {
  accessibilityLayer: false as const,
  role: 'group' as const,
}
