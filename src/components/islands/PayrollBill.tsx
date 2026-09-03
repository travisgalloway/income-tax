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
 *
 *  Recharts draws the two lines, the grid and the axes. The year bands, the two
 *  direct labels, the readout and the table stay the site's own code.
 */
import { useState } from 'react'
import { Line, LineChart } from 'recharts'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Annotation } from '../charts/Annotation'
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

const YEAR_TICK = (t: number) => `${t}`

export function PayrollBill({ rows }: { rows: RevenueYear[] }) {
  const [view, setView] = useState<View>('gdp')
  const [focus, setFocus] = useState<number | null>(null)

  const fields = FIELDS[view]
  const prOf = (r: RevenueYear) => r[fields.pr] as number
  const iiOf = (r: RevenueYear) => r[fields.ii] as number

  const {
    boxRef, size, f, xDomain, yDomain, x, y, xTicks, yTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows,
    xOf: (r) => r.y,
    yValues: rows.flatMap((r) => [prOf(r), iiOf(r)]),
  })

  // Rule 1 in `RechartsFrame.tsx` names `tickFormatter`: written inline it
  // reproduces the focus loss on its own.
  const yFormat = useTickFormat(percent, 0)

  const last = rows[rows.length - 1]
  const active = focus != null ? rows.find((r) => r.y === focus) : null

  const describe = (r: RevenueYear) =>
    `Fiscal year ${r.y}: payroll tax ${percent(prOf(r), 1)}, individual income tax ${percent(iiOf(r), 1)}, ${fields.axis.toLowerCase()}`

  const ariaLabel =
    'Payroll tax and individual income tax, each as a share of GDP and as a share of total ' +
    'federal revenue, fiscal 1962 to fiscal 2025. In FY2025 payroll tax was 5.76% of GDP and ' +
    '33.4% of all federal revenue; individual income tax was 8.75% of GDP and 50.7% of revenue. ' +
    'The chart in section 5 counts none of the payroll line.'

  // Order is data order, and the array is built in this render.
  const markProps = rows.map(() => mark())

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

      <div {...wrapperProps}>
        <LineChart
          ref={surfaceRef}
          data={rows}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          aria-label={ariaLabel}
          {...SURFACE_DEFAULTS}
        >
          <PlotGrid />
          <PlotXAxis
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Fiscal year"
            format={YEAR_TICK}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit={fields.axis}
            format={yFormat}
          />

          <Line
            type="monotone"
            dataKey={fields.pr}
            stroke="var(--mand)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={fields.ii}
            stroke="var(--disc)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            <Annotation frame={f} x={x(last.y) - 6} y={y(prOf(last)) - 8} anchor="end" halo label="Payroll" />
            <Annotation frame={f} x={x(last.y) - 6} y={y(iiOf(last)) - 8} anchor="end" halo label="Individual income" />

            {/* One focusable element per YEAR, reporting both series together. */}
            {rows.map((r, i) => (
              <rect
                key={r.y}
                className="datum"
                x={x(r.y) - 3}
                y={0}
                width={6}
                height={f.innerHeight}
                fill={active?.y === r.y ? 'var(--ink)' : 'transparent'}
                opacity={active?.y === r.y ? 0.08 : 0}
                {...markProps[i]}
                role="img"
                aria-label={describe(r)}
                onFocus={() => setFocus(r.y)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus(r.y)}
                onMouseLeave={() => setFocus(null)}
              />
            ))}
          </PlotOverlay>
        </LineChart>
      </div>

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
