/** Households §2: the spread.
 *
 *  One shared YearRange drives two stacked panels: the family Gini index
 *  (1947-2024, a continuous line) and the CBO top 1% income share (1979 and
 *  2022, exactly two published points). They are two separate `<Chart>`s
 *  (each its own `role="group"` SVG with its own finding sentence), not one
 *  combined SVG, so each announces independently to assistive tech — but they
 *  share one x scale, one `YearRange`, and one readout, so they read as one
 *  figure.
 */
import { useMemo, useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear, extent, niceExtent } from '../charts/scales'
import { calendarYear, indexValue, percent } from '../charts/format'
import { seriesSpan, clampToRange } from '../charts/series'
import { giniBasis } from '../../data'
import { YearRange } from './YearRange'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
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

  const [boxRef, size] = useChartSize()
  const { width: W, margin: f } = size
  const iw = W - f.left - f.right
  const narrow = W < 500

  const giniHeight = narrow ? 240 : 260
  const top1Height = narrow ? 190 : 200
  const giniIh = giniHeight - f.top - f.bottom
  const top1Ih = top1Height - f.top - f.bottom

  const x = linear(range, [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  // Read from _meta.gini_basis ("families"), never hardcoded -- but capitalised
  // for use as the subject of a label, so a chart title reads "Families Gini
  // index" rather than the doubled "Family families Gini index" that pasting
  // the raw lowercase noun after the fixed word "Family" would produce.
  const giniLabelWord = giniBasis.charAt(0).toUpperCase() + giniBasis.slice(1)

  // Panel A: the family Gini. extent(), NOT niceExtent(): a ratio anchored at
  // zero would flatten a 0.348-0.462 series into a nearly straight line. The
  // axis title names the 0-to-1 range so the truncation is stated honestly.
  const yGini = linear(extent(shownGini.map((r) => r.gini)), [giniIh, 0])
  const giniPath = d3line<IncomeYear>()
    .defined((r) => r.gini != null)
    .x((r) => x(r.y))
    .y((r) => yGini(r.gini as number))
  const giniYTicks = yGini.ticks(narrow ? 4 : 5)

  // Panel B: the CBO top 1% share. The axis domain comes from the FULL
  // two-point series, not the currently-visible subset, so the axis never
  // collapses to [0, 1] when the range excludes both points — that collapse
  // is exactly the "empty axis that could read as zero" this section must
  // avoid.
  const yTop1 = linear(niceExtent(top1.map((p) => p.v)), [top1Ih, 0])
  const top1YTicks = yTop1.ticks(narrow ? 3 : 4)

  const giniFmtFull = (r: IncomeYear) => `${giniLabelWord} Gini index, ${calendarYear(r.y)}: ${indexValue(r.gini as number)}`
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

  return (
    <div ref={boxRef}>
      <YearRange
        id="spread-range"
        label="Years shown"
        min={domain[0]}
        max={domain[1]}
        value={range}
        onChange={setRange}
      />

      {/* Panel A: family Gini index. */}
      <Chart ariaLabel={giniLabel} interactive width={W} height={giniHeight} margin={f}>
        {(fr) => (
          <>
            <text x={0} y={-6} className="panel-title">{giniLabelWord} Gini index</text>
            <AxisLeft
              frame={fr}
              ticks={giniYTicks}
              format={indexValue}
              label={`${giniLabelWord} Gini index, ratio 0 to 1`}
              scale={yGini}
            />
            <AxisBottom frame={fr} ticks={xTicks} format={calendarYear} label="Calendar year" scale={x} />
            <path d={giniPath(shownGini) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />
            {shownGini.filter((r) => r.gini != null).map((r) => (
              <circle
                key={r.y}
                className="datum"
                cx={x(r.y)}
                cy={yGini(r.gini as number)}
                r={activeGini?.y === r.y ? 5 : 7}
                fill={activeGini?.y === r.y ? 'var(--ink)' : 'transparent'}
                tabIndex={0}
                role="img"
                aria-label={giniFmtFull(r)}
                onFocus={() => setFocus({ series: 'gini', year: r.y })}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus({ series: 'gini', year: r.y })}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </>
        )}
      </Chart>

      {/* Panel B: CBO top 1% share. Exactly two published points -- no line
          generator, no connector. A future revision that adds a third point
          still draws correctly; it never implies more than were published. */}
      <Chart ariaLabel={top1Label} interactive width={W} height={top1Height} margin={f}>
        {(fr) => (
          <>
            <text x={0} y={-6} className="panel-title">Top 1% share of income before transfers and taxes</text>
            <AxisLeft
              frame={fr}
              ticks={top1YTicks}
              format={(v) => percent(v, 0)}
              label="Percent of income before transfers and taxes"
              scale={yTop1}
            />
            <AxisBottom frame={fr} ticks={xTicks} format={calendarYear} label="Calendar year" scale={x} />
            {shownTop1.length === 0 ? (
              <text x={fr.innerWidth / 2} y={fr.innerHeight / 2} textAnchor="middle" className="panel-empty">
                No published observation in this range
              </text>
            ) : (
              shownTop1.map((p) => (
                <g key={p.year}>
                  <circle
                    className="datum"
                    cx={x(p.year)}
                    cy={yTop1(p.v)}
                    r={activeTop1?.year === p.year ? 6 : 5}
                    fill="var(--int)"
                    tabIndex={0}
                    role="img"
                    aria-label={top1FmtFull(p)}
                    onFocus={() => setFocus({ series: 'top1', point: p })}
                    onBlur={() => setFocus(null)}
                    onMouseEnter={() => setFocus({ series: 'top1', point: p })}
                    onMouseLeave={() => setFocus(null)}
                  />
                  <Annotation
                    frame={fr}
                    x={x(p.year) + 8}
                    y={yTop1(p.v) - 8}
                    label={`${calendarYear(p.year)}, ${percent(p.v, 0)}`}
                  />
                </g>
              ))
            )}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {activeGini
          ? giniFmtFull(activeGini)
          : activeTop1
            ? top1FmtFull(activeTop1)
            : 'Focus or hover a datum to read its value.'}
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
