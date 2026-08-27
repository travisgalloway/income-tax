/** Section 3: a century of brackets.
 *
 *  One SVG, three stacked panels sharing a single x axis (1913-2025) --
 *  bracket count, top-bracket threshold in constant dollars, and the top
 *  statutory rate against the raw schedule ladder. The issue asks for exactly
 *  these three things, and BRIEF.md's "pick the handful where interaction
 *  genuinely adds something" argues against a brushable timeline here: this
 *  figure's whole point is the full 113-year sweep, so narrowing it away
 *  would remove the argument rather than sharpen it.
 */
import { useMemo, useState } from 'react'
import { line as d3line, curveMonotoneX } from 'd3-shape'
import { frame as makeFrame, linear, scaleLog } from '../charts/scales'
import { Annotation } from '../charts/Annotation'
import { useChartSize } from '../charts/useChartSize'
import { TableView } from './TableView'
import { dollars, calendarYear, percentRate } from '../charts/format'
import type { BracketYear } from '../../data/types'

const MARGIN = { top: 8, right: 16, bottom: 34, left: 60 }
const GAP = 30

export function BracketHistory({ rows }: { rows: BracketYear[] }) {
  const [boxRef, size] = useChartSize()
  const narrow = size.width < 500
  const W = size.width
  const panelH = narrow ? 108 : 128
  const innerW = W - MARGIN.left - MARGIN.right
  const H = MARGIN.top + panelH * 3 + GAP * 2 + MARGIN.bottom
  // This figure builds its own <svg> rather than using <Chart>, but its panels
  // use the same `translate(margin.left, …)` convention, so one frame over the
  // shared x axis is the right span for every panel's annotations (#64).
  const fr = makeFrame(W, H, MARGIN)

  const [focus, setFocus] = useState<number | null>(null)

  const years = rows.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, innerW])
  const xTicks = x.ticks(narrow ? 5 : 10).filter((t) => Number.isInteger(t))

  // Panel A: top rate vs schedule ladder top.
  const yRate = linear([0, 100], [panelH, 0])
  const rateTicks = [0, 25, 50, 75, 100]
  const pathTop = useMemo(
    () => d3line<BracketYear>().x((r) => x(r.y)).y((r) => yRate(r.top)).curve(curveMonotoneX)(rows) ?? '',
    [rows, x],
  )
  const pathSched = useMemo(
    () => d3line<BracketYear>().x((r) => x(r.y)).y((r) => yRate(r.sched_top)).curve(curveMonotoneX)(rows) ?? '',
    [rows, x],
  )
  const divergent = rows.filter((r) => r.adj)

  // Panel B: bracket count.
  const yNb = linear([0, 60], [panelH, 0])
  const nbTicks = [0, 20, 40, 60]
  const pathNb = useMemo(
    () => d3line<BracketYear>().x((r) => x(r.y)).y((r) => yNb(r.nb)).curve(curveMonotoneX)(rows) ?? '',
    [rows, x],
  )
  const minNb = rows.reduce((a, r) => (r.nb < a.nb ? r : a), rows[0])
  const maxNb = rows.reduce((a, r) => (r.nb > a.nb ? r : a), rows[0])

  // Panel C: top-bracket threshold, constant 2024 dollars, log scale. Real
  // dollars span roughly $16M (1913) down to about $0.6M (2025); a linear
  // scale cannot hold both ends legibly.
  // `single` spans all 113 years, so it is never null here even though the
  // type admits it for the other three statuses.
  const singleTop = (r: BracketYear) => r.s.single![r.s.single!.length - 1]
  const topThreshold = (r: BracketYear) => singleTop(r).rlo
  const nominalTopThreshold = (r: BracketYear) => singleTop(r).lo
  const thresholds = rows.map(topThreshold)
  const yThresh = scaleLog()
    .domain([Math.min(...thresholds) * 0.85, Math.max(...thresholds) * 1.15])
    .range([panelH, 0])
  const threshTickVals = [1_000_000, 3_000_000, 10_000_000, 30_000_000].filter(
    (v) => v >= Math.min(...thresholds) * 0.85 && v <= Math.max(...thresholds) * 1.15,
  )
  const pathThresh = useMemo(
    () =>
      d3line<BracketYear>()
        .x((r) => x(r.y))
        .y((r) => yThresh(Math.max(topThreshold(r), 1)))
        .curve(curveMonotoneX)(rows) ?? '',
    [rows, x],
  )

  const active = focus != null ? rows.find((r) => r.y === focus) : null

  const label =
    'The top US income tax bracket has run from 2 brackets in 1988 to 56 in 1918. The top ' +
    'statutory rate has ranged from 7% at the outset to a wartime peak of 94% in 1944, while the ' +
    'income threshold where the top bracket begins has fallen from about $16 million in 1913 to ' +
    'about $600,000 in 2025, both in constant 2024 dollars.'

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

  return (
    <div ref={boxRef}>
      <svg
        role="group"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="chart"
      >
        {/* Panel A: top rate */}
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <text className="panel-title" x={0} y={-2}>
            Top statutory rate vs. schedule ladder top, percent
          </text>
          <rect x={0} y={0} width={innerW} height={panelH} fill="var(--panel)" />
          {rateTicks.map((t) => (
            <g key={t} transform={`translate(0,${yRate(t)})`}>
              <line x1={0} x2={innerW} stroke="var(--rule)" strokeWidth={0.5} />
              <text x={-8} dy="0.32em" textAnchor="end" className="axis-label">{t}%</text>
            </g>
          ))}
          <path d={pathSched} fill="none" stroke="var(--ink-soft)" strokeWidth={1.25} strokeDasharray="3,3" />
          <path d={pathTop} fill="none" stroke="var(--ink)" strokeWidth={2} />
          {divergent.map((r) => (
            <circle key={r.y} cx={x(r.y)} cy={yRate(r.sched_top)} r={2.5} fill="none" stroke="var(--ink-soft)" strokeWidth={1} />
          ))}
          {/* One direct label illustrating the divergence pattern -- the full
              set is documented in the table and the aria-live readout. */}
          {/* Placed explicitly rather than carried in by the ancestor's
              translate: an x-less <text> reads as x=0 to the clipping guard,
              which would hide a real overrun (#64, E7). */}
          <Annotation
            frame={fr}
            x={x(1981)}
            y={yRate(69.125) - 8}
            anchor="middle"
            label="1981: 69.125% (part-year cut)"
          />
        </g>

        {/* Panel B: bracket count */}
        <g transform={`translate(${MARGIN.left},${MARGIN.top + panelH + GAP})`}>
          <text className="panel-title" x={0} y={-2}>Bracket count, single filer</text>
          <rect x={0} y={0} width={innerW} height={panelH} fill="var(--panel)" />
          {nbTicks.map((t) => (
            <g key={t} transform={`translate(0,${yNb(t)})`}>
              <line x1={0} x2={innerW} stroke="var(--rule)" strokeWidth={0.5} />
              <text x={-8} dy="0.32em" textAnchor="end" className="axis-label">{t}</text>
            </g>
          ))}
          <path d={pathNb} fill="none" stroke="var(--disc)" strokeWidth={2} />
          <circle cx={x(minNb.y)} cy={yNb(minNb.nb)} r={3} fill="var(--disc)" />
          <Annotation frame={fr} x={x(minNb.y)} y={yNb(minNb.nb) - 8} anchor="middle" label={`${minNb.y}: ${minNb.nb}`} />
          <circle cx={x(maxNb.y)} cy={yNb(maxNb.nb)} r={3} fill="var(--disc)" />
          <Annotation frame={fr} x={x(maxNb.y)} y={yNb(maxNb.nb) - 8} anchor="middle" label={`${maxNb.y}: ${maxNb.nb}`} />
        </g>

        {/* Panel C: top-bracket threshold, constant 2024 dollars, log scale */}
        <g transform={`translate(${MARGIN.left},${MARGIN.top + (panelH + GAP) * 2})`}>
          <text className="panel-title" x={0} y={-2}>
            Top-bracket threshold, constant 2024 dollars (log scale)
          </text>
          <rect x={0} y={0} width={innerW} height={panelH} fill="var(--panel)" />
          {threshTickVals.map((t) => (
            <g key={t} transform={`translate(0,${yThresh(t)})`}>
              <line x1={0} x2={innerW} stroke="var(--rule)" strokeWidth={0.5} />
              <text x={-8} dy="0.32em" textAnchor="end" className="axis-label">{dollars(t)}</text>
            </g>
          ))}
          <path d={pathThresh} fill="none" stroke="var(--int)" strokeWidth={2} />

          {/* Every year is a Tab-focusable datum, spanning the full chart
              height so one column reports all three panels at once. */}
          {rows.map((r) => (
            <rect
              key={r.y}
              className="datum"
              x={x(r.y) - 3}
              y={-(panelH + GAP) * 2}
              width={6}
              height={(panelH + GAP) * 2 + panelH}
              fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
              opacity={active?.y === r.y ? 0.08 : 0}
              tabIndex={0}
              role="img"
              aria-label={readout(r)}
              onFocus={() => setFocus(r.y)}
              onBlur={() => setFocus(null)}
              onMouseEnter={() => setFocus(r.y)}
              onMouseLeave={() => setFocus(null)}
            />
          ))}

          <g aria-hidden="true">
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={panelH + 18} textAnchor="middle" className="axis-label">{t}</text>
            ))}
            <text x={innerW / 2} y={panelH + 34} textAnchor="middle" className="axis-title">Tax year</text>
          </g>
        </g>
      </svg>

      <p aria-live="polite" className="readout">
        {active ? readout(active) : 'Focus or hover a year to read its value.'}
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
