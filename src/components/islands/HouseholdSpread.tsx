/** Households §2: the spread.
 *
 *  One shared YearRange drives two stacked panels: the family Gini index
 *  (1947-2024, a continuous line) and the CBO top 1% income share (1979 and
 *  2022, exactly two published points). They are two separate charts, each its
 *  own `role="group"` surface with its own finding sentence, so each announces
 *  independently to assistive tech. They share one x domain, one `YearRange`
 *  and one readout, so they read as one figure.
 *
 *  RECHARTS DRAWS ONE SURFACE PER CHART, so the shared x scale is expressed as
 *  a forced `xDomain` on both panels, taken from the brush range itself. Two
 *  derived domains would disagree by a pixel or two and a reader could no
 *  longer read straight down a year.
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
import { frame as makeFrame, linear, extent, niceExtent } from '../charts/scales'
import { calendarYear, indexValue, percent } from '../charts/format'
import { seriesSpan, clampToRange } from '../charts/series'
import { giniBasis } from '../../data'
import { YearRange } from './YearRange'
import { TableView } from './TableView'
import { AXIS_TITLE_FONT_PX, firstThatFits } from '../charts/axisFit'
import type { IncomeYear, Top1IncomeSharePoint } from '../../data/types'

type Focus = { series: 'gini'; year: number } | { series: 'top1'; point: Top1IncomeSharePoint } | null

export function HouseholdSpread({ rows, top1 }: { rows: IncomeYear[]; top1: Top1IncomeSharePoint[] }) {
  const domain = useMemo(() => seriesSpan(rows, 'gini'), [rows])
  const [range, setRange] = useState<[number, number]>(domain)
  const [focus, setFocus] = useState<Focus>(null)

  const shownGini = useMemo(() => clampToRange(rows, range), [rows, range])
  const shownTop1 = useMemo(
    () => top1.filter((p) => p.year >= range[0] && p.year <= range[1]),
    [top1, range],
  )

  // Panel A: the family Gini. extent(), NOT niceExtent(): a ratio anchored at
  // zero would flatten a 0.348-0.462 series into a nearly straight line. The
  // axis title names the 0-to-1 range so the truncation is stated honestly.
  const gini = useFrame({
    rows: shownGini,
    xOf: (r) => r.y,
    yValues: shownGini.map((r) => r.gini).filter((v): v is number => v != null),
    yDomain: extent(shownGini.map((r) => r.gini)),
    xDomain: range,
    yTickCount: [4, 5],
  })

  // Panel B: the CBO top 1% share. The axis domain comes from the FULL
  // two-point series, not the currently-visible subset, so the axis never
  // collapses to [0, 1] when the range excludes both points. That collapse is
  // exactly the empty axis that could read as zero this section must avoid.
  const spread = useFrame({
    rows: top1,
    xOf: (p) => p.year,
    yValues: top1.map((p) => p.v),
    yDomain: niceExtent(top1.map((p) => p.v)),
    xDomain: range,
    yTickCount: [3, 4],
  })

  const { size, narrow } = gini

  // Each panel is shorter than the size preset's own height, and they differ
  // from each other, so each builds its own frame and its own y scale.
  const giniHeight = narrow ? 240 : 260
  const top1Height = narrow ? 190 : 200
  const fGini = makeFrame(size.width, giniHeight, size.margin)
  const fTop1 = makeFrame(size.width, top1Height, size.margin)
  const yGini = linear(gini.yDomain, [fGini.innerHeight, 0])
  const yTop1 = linear(spread.yDomain, [fTop1.innerHeight, 0])
  const giniStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${size.width} / ${giniHeight}` }),
    [size.width, giniHeight],
  )
  const top1Style = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${size.width} / ${top1Height}` }),
    [size.width, top1Height],
  )

  // A panel title is start-anchored at the plot's left edge, so its room is
  // `W - margin.left - pad`: 644 units at the 720 preset but 306 at 360, where
  // the Top 1% title needs 312 and is CUT (#66). Chosen by fit against the
  // frame's own numbers, so it stays right if either preset moves.
  const titleRoom = size.width - size.margin.left - 2
  const panelTitle = (variants: string[]) =>
    firstThatFits(variants, titleRoom, AXIS_TITLE_FONT_PX) ?? variants[variants.length - 1]

  // Read from _meta.gini_basis ("families"), never hardcoded, but capitalised
  // for use as the subject of a label, so a chart title reads "Families Gini
  // index" rather than the doubled "Family families Gini index" that pasting
  // the raw lowercase noun after the fixed word "Family" would produce.
  const giniLabelWord = giniBasis.charAt(0).toUpperCase() + giniBasis.slice(1)

  const giniFmtFull = (r: { y: number; gini: number | null }) =>
    `${giniLabelWord} Gini index, ${calendarYear(r.y)}: ${indexValue(r.gini as number)}`
  const top1FmtFull = (p: Top1IncomeSharePoint) =>
    `Top 1% share of income before transfers and taxes, ${calendarYear(p.year)}: ${percent(p.v, 0)}`

  const activeGini = focus?.series === 'gini' ? shownGini.find((r) => r.y === focus.year) : null
  const activeTop1 = focus?.series === 'top1' ? focus.point : null

  const giniFirst = shownGini.find((r) => r.gini != null)
  const giniLast = [...shownGini].reverse().find((r) => r.gini != null)
  const giniLabel =
    giniFirst && giniLast
      ? `${giniLabelWord} Gini index at each year from ${range[0]} to ${range[1]}, from ${indexValue(giniFirst.gini as number)} in ${giniFirst.y} to ${indexValue(giniLast.gini as number)} in ${giniLast.y}.`
      : `${giniLabelWord} Gini index.`
  const top1Label = shownTop1.length
    ? `Top 1% share of income before transfers and taxes: ${shownTop1.map((p) => `${percent(p.v, 0)} in ${p.year}`).join(', ')}.`
    : `Top 1% share of income before transfers and taxes: no published observation between ${range[0]} and ${range[1]}.`

  const xFormat = useTickFormat(calendarYear, null)
  const giniYFormat = useTickFormat(indexValue, null)
  const top1YFormat = useTickFormat(percent, 0)

  /** Panel A's data. Every row is kept, so a year with no published Gini leaves
   *  a gap under `connectNulls={false}` rather than a drawn-through segment. */
  const giniData = useMemo(
    () => shownGini.map((r) => ({ y: r.y, gini: r.gini })),
    [shownGini],
  )

  /** Panel B's data. Both published points are always present, and one outside
   *  the brush range carries a null value. Recharts renders no dot for a null,
   *  so the array is never empty and the panel keeps its axes at every range. */
  const top1Data = useMemo(
    () =>
      top1.map((p) => ({
        y: p.year,
        v: p.year >= range[0] && p.year <= range[1] ? p.v : null,
      })),
    [top1, range],
  )

  /* One `mark()` call per RENDERED mark, in data order, so the roving group's
   * call order and its DOM order are the same list. A discarded call would
   * leave the group with a `tabindex="0"` that belongs to no element. */
  const giniMarked = giniData.filter((r) => r.gini != null)
  const giniMarkProps = giniMarked.map(() => gini.mark())
  const giniMarkIndex = new Map(giniMarked.map((r, i) => [r.y, i]))

  const top1Marked = top1Data.filter((p) => p.v != null)
  const top1MarkProps = top1Marked.map(() => spread.mark())
  const top1MarkIndex = new Map(top1Marked.map((p, i) => [p.y, i]))

  /** Fresh on every render, and never wrapped in `useCallback`: an identical
   *  `dot` prop makes React bail out of the `<Line>` subtree, and the marks
   *  then freeze at their first paint while the readout keeps working. */
  const giniDot = (props: DotItemDotProps) => {
    const r = giniData[props.index]
    if (!r || r.gini == null) return null
    const mi = giniMarkIndex.get(r.y)
    if (mi == null) return null
    const on = activeGini?.y === r.y
    return (
      <circle
        key={r.y}
        className="datum"
        cx={Number(props.cx)}
        cy={Number(props.cy)}
        r={on ? 5 : 7}
        fill={on ? 'var(--ink)' : 'transparent'}
        {...giniMarkProps[mi]}
        role="img"
        aria-label={giniFmtFull(r)}
        onFocus={() => setFocus({ series: 'gini', year: r.y })}
        onBlur={() => setFocus(null)}
        onMouseEnter={() => setFocus({ series: 'gini', year: r.y })}
        onMouseLeave={() => setFocus(null)}
      />
    )
  }

  /** Same rule as `giniDot`. */
  const top1Dot = (props: DotItemDotProps) => {
    const d = top1Data[props.index]
    if (!d || d.v == null) return null
    const mi = top1MarkIndex.get(d.y)
    if (mi == null) return null
    const point = top1.find((p) => p.year === d.y) as Top1IncomeSharePoint
    return (
      <circle
        key={d.y}
        className="datum"
        cx={Number(props.cx)}
        cy={Number(props.cy)}
        r={activeTop1?.year === d.y ? 6 : 5}
        fill="var(--int)"
        {...top1MarkProps[mi]}
        role="img"
        aria-label={top1FmtFull(point)}
        onFocus={() => setFocus({ series: 'top1', point })}
        onBlur={() => setFocus(null)}
        onMouseEnter={() => setFocus({ series: 'top1', point })}
        onMouseLeave={() => setFocus(null)}
      />
    )
  }

  return (
    <div>
      <YearRange
        id="spread-range"
        label="Years shown"
        min={domain[0]}
        max={domain[1]}
        value={range}
        onChange={setRange}
      />

      {/* Panel A: family Gini index. */}
      <div ref={gini.boxRef} {...gini.wrapperProps}>
        <LineChart
          ref={gini.surfaceRef}
          data={giniData}
          width={size.width}
          height={giniHeight}
          margin={gini.chartMargin}
          style={giniStyle}
          {...SURFACE_DEFAULTS}
          aria-label={giniLabel}
        >
          <PlotGrid />
          <PlotXAxis
            domain={gini.xDomain}
            ticks={gini.xTicks}
            gutter={size.margin.bottom}
            unit="Calendar year"
            format={xFormat}
          />
          <PlotYAxis
            domain={gini.yDomain}
            ticks={gini.yTicks}
            gutter={size.margin.left}
            unit={`${giniLabelWord} Gini index, ratio 0 to 1`}
            format={giniYFormat}
          />
          <Line
            type="linear"
            dataKey="gini"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={giniDot}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <PlotOverlay margin={fGini.margin}>
            <text x={0} y={-6} className="panel-title">
              {panelTitle([`${giniLabelWord} Gini index`])}
            </text>
          </PlotOverlay>
        </LineChart>
      </div>

      {/* Panel B: CBO top 1% share. Exactly two published points, no line
          generator, no connector. A future revision that adds a third point
          still draws correctly; it never implies more than were published. */}
      <div ref={spread.boxRef} {...spread.wrapperProps}>
        <LineChart
          ref={spread.surfaceRef}
          data={top1Data}
          width={size.width}
          height={top1Height}
          margin={spread.chartMargin}
          style={top1Style}
          {...SURFACE_DEFAULTS}
          aria-label={top1Label}
        >
          <PlotGrid />
          <PlotXAxis
            domain={spread.xDomain}
            ticks={spread.xTicks}
            gutter={size.margin.bottom}
            unit="Calendar year"
            format={xFormat}
          />
          <PlotYAxis
            domain={spread.yDomain}
            ticks={spread.yTicks}
            gutter={size.margin.left}
            unit="Percent of income"
            format={top1YFormat}
          />
          {/* `stroke="none"` because the two published points are not a series.
              A connector between 1979 and 2022 would draw 42 years CBO did not
              publish. */}
          <Line
            dataKey="v"
            stroke="none"
            dot={top1Dot}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <PlotOverlay margin={fTop1.margin}>
            <text x={0} y={-6} className="panel-title">
              {panelTitle([
                'Top 1% share of income before transfers and taxes',
                'Top 1% share of pre-tax, pre-transfer income',
                'Top 1% income share',
              ])}
            </text>
            {shownTop1.length === 0 ? (
              <text
                x={fTop1.innerWidth / 2}
                y={fTop1.innerHeight / 2}
                textAnchor="middle"
                className="panel-empty"
              >
                No published observation in this range
              </text>
            ) : (
              shownTop1.map((p) => (
                <Annotation
                  key={p.year}
                  frame={fTop1}
                  x={spread.x(p.year) + 8}
                  y={yTop1(p.v) - 8}
                  label={`${calendarYear(p.year)}, ${percent(p.v, 0)}`}
                />
              ))
            )}
          </PlotOverlay>
        </LineChart>
      </div>

      <p aria-live="polite" className="readout">
        {activeGini
          ? giniFmtFull(activeGini)
          : activeTop1
            ? top1FmtFull(activeTop1)
            : <ChartHint noun="datum" />}
      </p>

      <TableView
        caption={`${giniLabelWord} Gini index and CBO top 1% income share`}
        columns={[
          { key: 'y', label: 'Year', unit: 'calendar year' },
          { key: 'gini', label: `${giniLabelWord} Gini index`, unit: 'ratio, 0 to 1' },
          { key: 'top1', label: 'Top 1% share of income before transfers and taxes', unit: 'percent' },
        ]}
        rows={shownGini.map((r) => {
          const pt = top1.find((p) => p.year === r.y)
          return {
            y: calendarYear(r.y),
            gini: r.gini == null ? null : indexValue(r.gini),
            top1: pt == null ? null : percent(pt.v, 0),
          }
        })}
      />
    </div>
  )
}
