/** Section 6: the payroll tax bill that section 5's chart never counts.
 *
 *  Two lines over `revenue_sources`, FY1962-FY2025, payroll and individual
 *  income tax, with a toggle between percent of GDP and percent of total
 *  revenue. Individual income is drawn alongside payroll because the
 *  comparison is what makes the scale concrete.
 *
 *  One focusable element per YEAR, not per point: 64 tab stops report both
 *  series together, rather than 128 stops that would force a reader to pair
 *  them up themselves.
 */
import { useMemo, useState } from 'react'
import { line as d3line, curveMonotoneX } from 'd3-shape'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisLeft, AxisBottom } from '../charts/Axis'
import { linear, niceExtent } from '../charts/scales'
import { percent } from '../charts/format'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { RevenueYear } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'payroll-bill'

type View = 'gdp' | 'revenue'

const FIELDS = {
  gdp:     { pr: 'g_pr', ii: 'g_ii', axis: 'Percent of GDP' },
  revenue: { pr: 's_pr', ii: 's_ii', axis: 'Percent of total revenue' },
} as const

const VIEWS: { value: View; label: string }[] = [
  { value: 'gdp', label: 'Percent of GDP' },
  { value: 'revenue', label: 'Percent of total revenue' },
]

export function PayrollBill({ rows }: { rows: RevenueYear[] }) {
  const [view, setView] = useState<View>('gdp')
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const fields = FIELDS[view]
  const prOf = (r: RevenueYear) => r[fields.pr] as number
  const iiOf = (r: RevenueYear) => r[fields.ii] as number

  const years = rows.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear(niceExtent(rows.flatMap((r) => [prOf(r), iiOf(r)])), [ih, 0])

  const prPath = useMemo(
    () => d3line<RevenueYear>().x((r) => x(r.y)).y((r) => y(prOf(r))).curve(curveMonotoneX)(rows) ?? '',
    [rows, view, x, y],
  )
  const iiPath = useMemo(
    () => d3line<RevenueYear>().x((r) => x(r.y)).y((r) => y(iiOf(r))).curve(curveMonotoneX)(rows) ?? '',
    [rows, view, x, y],
  )

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const last = rows[rows.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  const describe = (r: RevenueYear) =>
    `Fiscal year ${r.y}: payroll tax ${percent(prOf(r), 1)}, individual income tax ${percent(iiOf(r), 1)}, ${fields.axis.toLowerCase()}`

  const ariaLabel =
    'Payroll tax and individual income tax, each as a share of GDP and as a share of total ' +
    'federal revenue, fiscal 1962 to fiscal 2025. In FY2025 payroll tax was 5.76% of GDP and ' +
    '33.4% of all federal revenue; individual income tax was 8.75% of GDP and 50.7% of revenue. ' +
    'The chart in section 5 counts none of the payroll line.'

  return (
    <div ref={boxRef}>
      <div className="controls">
        <span className="controls-label" id="payroll-bill-units">Measured in</span>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-labelledby={labelledByFigure(FIGURE, 'payroll-bill-units')}
          className="unit-toggle"
        >
          {VIEWS.map((v) => (
            <ToggleGroup.Item key={v.value} value={v.value} className="unit-toggle-item">
              {v.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <Chart ariaLabel={ariaLabel} interactive width={W} height={H} margin={f}>
        {(fr, mark) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={yTicks}
              format={(v) => percent(v, 0)}
              label={fields.axis}
              scale={y}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}`}
              label="Fiscal year"
              scale={x}
            />

            <path d={prPath} fill="none" stroke="var(--mand)" strokeWidth={2} />
            <path d={iiPath} fill="none" stroke="var(--disc)" strokeWidth={2} />

            <Annotation frame={fr} x={x(last.y) - 6} y={y(prOf(last)) - 8} anchor="end" label="Payroll" />
            <Annotation frame={fr} x={x(last.y) - 6} y={y(iiOf(last)) - 8} anchor="end" label="Individual income" />

            {/* One focusable element per YEAR, reporting both series together. */}
            {rows.map((r) => (
              <rect
                key={r.y}
                className="datum"
                x={x(r.y) - 3}
                y={0}
                width={6}
                height={ih}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                opacity={active?.y === r.y ? 0.08 : 0}
                {...mark()}
                role="img"
                aria-label={describe(r)}
                onFocus={() => setFocus(r.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(r.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="year" />}
      </p>

      <TableView
        caption="Payroll tax and individual income tax, share of GDP and share of total revenue, by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'pr_gdp', label: 'Payroll tax', unit: 'percent of GDP' },
          { key: 'pr_rev', label: 'Payroll tax', unit: 'percent of total revenue' },
          { key: 'ii_gdp', label: 'Individual income tax', unit: 'percent of GDP' },
          { key: 'ii_rev', label: 'Individual income tax', unit: 'percent of total revenue' },
        ]}
        rows={rows.map((r) => ({
          y: r.y,
          pr_gdp: percent(r.g_pr as number, 2),
          pr_rev: percent(r.s_pr as number, 1),
          ii_gdp: percent(r.g_ii as number, 2),
          ii_rev: percent(r.s_ii as number, 1),
        }))}
      />
    </div>
  )
}
