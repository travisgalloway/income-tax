/** Section 4: statutory is not effective.
 *
 *  One panel, one unit (percent), 1979-2022. The top statutory rate draws as a
 *  continuous line -- bracket_history has every year. The CBO average federal
 *  tax rates are PUBLISHED ANCHOR POINTS, not an annual series, so they draw
 *  as discrete markers with no connecting line; joining them would assert a
 *  series that was never observed. Marker SHAPE plus a legend distinguishes
 *  the six income groups, so colour never carries meaning alone -- none of
 *  this data is partisan, so no --dem/--gop/--mix token belongs here either.
 */
import { useMemo, useState } from 'react'
import { line as d3line, curveMonotoneX } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear } from '../charts/scales'
import { useChartSize } from '../charts/useChartSize'
import { TableView } from './TableView'
import { percentRate, calendarYear } from '../charts/format'
import type { BracketYear, CboEffectiveRates } from '../../data/types'

const GROUPS: { key: keyof CboEffectiveRates['rows'][number]['v']; label: string }[] = [
  { key: 'lowest', label: 'Lowest quintile' },
  { key: 'second', label: 'Second quintile' },
  { key: 'middle', label: 'Middle quintile' },
  { key: 'fourth', label: 'Fourth quintile' },
  { key: 'highest', label: 'Highest quintile' },
  { key: 'top1', label: 'Top 1 percent' },
]

const COLOR: Record<string, string> = {
  lowest: 'var(--positive)', second: 'var(--foreign)', middle: 'var(--mand)',
  fourth: 'var(--disc)', highest: 'var(--domestic)', top1: 'var(--int)',
}

function Marker({ shape, x, y, fill }: { shape: string; x: number; y: number; fill: string }) {
  const s = 4.5
  switch (shape) {
    case 'lowest':
      return <circle cx={x} cy={y} r={s} fill={fill} />
    case 'second':
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={fill} />
    case 'middle':
      return <polygon points={`${x},${y - s * 1.2} ${x - s * 1.1},${y + s} ${x + s * 1.1},${y + s}`} fill={fill} />
    case 'fourth':
      return <polygon points={`${x},${y - s * 1.2} ${x + s * 1.2},${y} ${x},${y + s * 1.2} ${x - s * 1.2},${y}`} fill={fill} />
    case 'highest':
      return (
        <g stroke={fill} strokeWidth={2}>
          <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} />
          <line x1={x - s} y1={y + s} x2={x + s} y2={y - s} />
        </g>
      )
    case 'top1':
      return (
        <g stroke={fill} strokeWidth={2}>
          <line x1={x - s * 1.3} y1={y} x2={x + s * 1.3} y2={y} />
          <line x1={x} y1={y - s * 1.3} x2={x} y2={y + s * 1.3} />
        </g>
      )
    default:
      return <circle cx={x} cy={y} r={s} fill={fill} />
  }
}

export function StatutoryVsEffective({
  statutory, cbo,
}: {
  statutory: BracketYear[]
  cbo: CboEffectiveRates
}) {
  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const [focusYear, setFocusYear] = useState<number | null>(null)

  const span = useMemo(() => statutory.filter((r) => r.y >= 1979 && r.y <= 2022), [statutory])
  const years = span.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear([0, 45], [ih, 0])

  const path = useMemo(
    () => d3line<BracketYear>().x((r) => x(r.y)).y((r) => y(r.top)).curve(curveMonotoneX)(span) ?? '',
    [span, x, y],
  )

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const active = focusYear != null ? span.find((r) => r.y === focusYear) : null
  const activeAnchor = focusYear != null ? cbo.rows.find((r) => r.year === focusYear) : null

  const label =
    'The top statutory income tax rate ran from 70% in 1979 to 37% in 2022, while the average ' +
    'federal tax rate actually paid by the top 1 percent -- which includes payroll tax -- moved ' +
    'far less, from 35.1% to 31.5%. Nobody pays the top statutory rate on their whole income.'

  return (
    <div ref={boxRef}>
      <div className="controls" role="list" aria-label="CBO income group legend">
        {GROUPS.map((g) => (
          <span key={g.key} className="controls-label" role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width={14} height={14} aria-hidden="true"><Marker shape={g.key} x={7} y={7} fill={COLOR[g.key]} /></svg>
            {g.label}
          </span>
        ))}
      </div>

      <Chart ariaLabel={label} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft frame={fr} ticks={yTicks} format={(v) => `${v}%`} label="Percent" scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Tax / calendar year" scale={x} />

            <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} />
            {/* End-anchored and lifted clear of the curve, which is
                VotedAndNot's idiom for naming a line. At `+ 6` past the last
                point this overran the SVG by 110 units and was clipped to two
                characters (#64); letting the clamp flip it in place would have
                laid it along the flat right-hand end of the very line it
                names. */}
            <Annotation
              frame={fr}
              x={x(span[span.length - 1].y) - 4}
              y={y(span[span.length - 1].top) - 8}
              anchor="end"
              label="Top statutory rate"
            />

            {cbo.rows.map((r) =>
              GROUPS.map((g) => (
                <Marker key={`${r.year}-${g.key}`} shape={g.key} x={x(r.year)} y={y(r.v[g.key])} fill={COLOR[g.key]} />
              )),
            )}

            {/* Direct labels on the two endpoint years the issue names as the
                hard floor: 1979 and 2022. */}
            {[1979, 2022].map((yr) => {
              const row = cbo.rows.find((r) => r.year === yr)
              if (!row) return null
              return (
                <Annotation
                  key={yr}
                  frame={fr}
                  x={x(yr)}
                  y={y(row.v.top1) - 10}
                  anchor="middle"
                  label={`${yr}: top 1% ${percentRate(row.v.top1)}`}
                />
              )
            })}

            {span.map((r) => (
              <rect
                key={r.y}
                className="datum"
                x={x(r.y) - 4}
                y={0}
                width={8}
                height={ih}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                opacity={active?.y === r.y ? 0.06 : 0}
                {...mark()}
                role="img"
                aria-label={
                  `${calendarYear(r.y)}: top statutory rate ${percentRate(r.top)}` +
                  (activeAnchor && r.y === focusYear
                    ? `. CBO average federal tax rate this year: lowest quintile ${percentRate(
                        cbo.rows.find((c) => c.year === r.y)!.v.lowest,
                      )}, top 1 percent ${percentRate(cbo.rows.find((c) => c.year === r.y)!.v.top1)}.`
                    : cbo.rows.some((c) => c.year === r.y)
                      ? ''
                      : ' No CBO anchor point for this year.')
                }
                onFocus={() => setFocusYear(r.y)}
                onBlur={() => setFocusYear(null)}
                onMouseEnter={() => setFocusYear(r.y)}
                onMouseLeave={() => setFocusYear(null)}
              />
            ))}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active
          ? `${calendarYear(active.y)}: top statutory rate ${percentRate(active.top)}` +
            (activeAnchor
              ? `. CBO anchor point: lowest quintile ${percentRate(activeAnchor.v.lowest)}, top 1% ${percentRate(activeAnchor.v.top1)} (includes payroll tax).`
              : '. No CBO anchor point for this year.')
          : 'Focus or hover a year to read its value.'}
      </p>

      <TableView
        caption="Top statutory rate vs. CBO average federal tax rate by income group, published anchor years"
        columns={[
          { key: 'year', label: 'Year', unit: 'tax year' },
          { key: 'top', label: 'Top statutory rate', unit: 'percent' },
          { key: 'lowest', label: 'Lowest quintile', unit: 'percent, incl. payroll tax' },
          { key: 'second', label: 'Second quintile', unit: 'percent, incl. payroll tax' },
          { key: 'middle', label: 'Middle quintile', unit: 'percent, incl. payroll tax' },
          { key: 'fourth', label: 'Fourth quintile', unit: 'percent, incl. payroll tax' },
          { key: 'highest', label: 'Highest quintile', unit: 'percent, incl. payroll tax' },
          { key: 'top1', label: 'Top 1 percent', unit: 'percent, incl. payroll tax' },
        ]}
        rows={cbo.rows.map((r) => ({
          year: r.year,
          top: percentRate(statutory.find((s) => s.y === r.year)?.top ?? NaN),
          lowest: percentRate(r.v.lowest),
          second: percentRate(r.v.second),
          middle: percentRate(r.v.middle),
          fourth: percentRate(r.v.fourth),
          highest: percentRate(r.v.highest),
          top1: percentRate(r.v.top1),
        }))}
      />
    </div>
  )
}
