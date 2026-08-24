/** Section 5, figure A: who pays the individual income tax.
 *
 *  The six percentile groups are NESTED, not a partition — Top 1% sits inside
 *  Top 5%, inside Top 10%, and so on — so no group's value may ever be added
 *  to another's or drawn as one bar divided into parts. Each group gets its
 *  own pair of independent bars from a common left baseline at 0: AGI share
 *  above, tax share below. Three groups have no published AGI share and one
 *  has no published average rate; those cells render as "no data", never as
 *  a zero-width bar.
 */
import { useState } from 'react'
import { Chart } from '../charts/Chart'
import { AxisBottom } from '../charts/Axis'
import { linear } from '../charts/scales'
import { percent } from '../charts/format'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { IncomeTaxGroup } from '../../data/types'

type Metric = 'agi' | 'tax'
type Active = { g: string; metric: Metric } | null

/** The exact text a missing cell renders as. Never a zero-width bar. */
const NO_DATA = 'no data'

function describe(g: IncomeTaxGroup, metric: Metric): string {
  if (metric === 'agi') {
    return g.income_share_pct != null
      ? `${g.g}: ${percent(g.income_share_pct, 1)} share of adjusted gross income`
      : `${g.g}: share of adjusted gross income is not published`
  }
  return `${g.g}: ${percent(g.tax_share_pct, 1)} share of federal individual income tax paid`
}

export function WhoPays({ rows }: { rows: IncomeTaxGroup[] }) {
  const [active, setActive] = useState<Active>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const x = linear([0, 100], [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 5)

  const rowH = ih / rows.length
  const barH = rowH * 0.3
  const barGap = rowH * 0.1

  const activeRow = active ? rows.find((r) => r.g === active.g) : null
  const readoutText = activeRow && active ? describe(activeRow, active.metric) : null

  const ariaLabel =
    'Share of adjusted gross income compared with share of federal individual income tax paid, ' +
    'by income percentile group, tax year 2023. The top 1% earned 20.6% of adjusted gross income ' +
    'and paid 38.4% of the tax. The bottom half paid 3.3% of the tax. AGI share is not published ' +
    'for the Top 5%, Top 25% and Bottom 50% groups.'

  return (
    <div ref={boxRef}>
      <Chart ariaLabel={ariaLabel} interactive width={W} height={H} margin={f}>
        {(fr) => (
          <>
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => percent(t, 0)}
              label="Percent"
              scale={x}
            />

            {rows.map((g, i) => {
              const rowTop = i * rowH
              const agiY = rowTop + rowH * 0.14
              const taxY = agiY + barH + barGap
              const groupCenter = rowTop + rowH / 2
              const agiCenter = agiY + barH / 2
              const taxCenter = taxY + barH / 2

              const isAgiActive = active?.g === g.g && active.metric === 'agi'
              const isTaxActive = active?.g === g.g && active.metric === 'tax'

              return (
                <g key={g.g}>
                  <text
                    x={-8}
                    y={groupCenter}
                    dy="0.32em"
                    textAnchor="end"
                    className="axis-label"
                  >
                    {g.g}
                  </text>

                  {/* AGI share bar. No rect at all when the group has no published income share. */}
                  {g.income_share_pct != null ? (
                    <>
                      <text x={4} y={agiY - 3} className="axis-label">AGI</text>
                      <rect
                        className="datum"
                        x={0}
                        y={agiY}
                        width={Math.max(0, x(g.income_share_pct))}
                        height={barH}
                        fill="var(--disc)"
                        stroke={isAgiActive ? 'var(--ink)' : 'none'}
                        strokeWidth={1.5}
                        tabIndex={0}
                        role="img"
                        aria-label={describe(g, 'agi')}
                        onFocus={() => setActive({ g: g.g, metric: 'agi' })}
                        onBlur={() => setActive(null)}
                        onMouseEnter={() => setActive({ g: g.g, metric: 'agi' })}
                        onMouseLeave={() => setActive(null)}
                      />
                      <text
                        x={x(g.income_share_pct) + 6}
                        y={agiCenter}
                        dy="0.32em"
                        className="annotation"
                      >
                        {percent(g.income_share_pct, 1)}
                      </text>
                    </>
                  ) : (
                    <text x={4} y={agiCenter} dy="0.32em" className="axis-label">
                      {`AGI: ${NO_DATA}`}
                    </text>
                  )}

                  {/* Tax share bar. Always present; the field is required. */}
                  <text x={4} y={taxY - 3} className="axis-label">tax</text>
                  <rect
                    className="datum"
                    x={0}
                    y={taxY}
                    width={Math.max(0, x(g.tax_share_pct))}
                    height={barH}
                    fill="var(--mand)"
                    stroke={isTaxActive ? 'var(--ink)' : 'none'}
                    strokeWidth={1.5}
                    tabIndex={0}
                    role="img"
                    aria-label={describe(g, 'tax')}
                    onFocus={() => setActive({ g: g.g, metric: 'tax' })}
                    onBlur={() => setActive(null)}
                    onMouseEnter={() => setActive({ g: g.g, metric: 'tax' })}
                    onMouseLeave={() => setActive(null)}
                  />
                  <text
                    x={x(g.tax_share_pct) + 6}
                    y={taxCenter}
                    dy="0.32em"
                    className="annotation"
                  >
                    {percent(g.tax_share_pct, 1)}
                  </text>
                </g>
              )
            })}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {readoutText ?? 'Focus or hover a bar to read its value.'}
      </p>

      <TableView
        caption="Share of adjusted gross income and share of federal individual income tax paid, by income percentile group, tax year 2023"
        columns={[
          { key: 'group', label: 'Group', unit: 'percentile of tax units' },
          { key: 'agi', label: 'Share of AGI', unit: 'percent' },
          { key: 'tax', label: 'Share of income tax paid', unit: 'percent' },
          { key: 'rate', label: 'Average effective rate', unit: 'percent' },
        ]}
        rows={rows.map((g) => ({
          group: g.g,
          agi: g.income_share_pct != null ? percent(g.income_share_pct, 1) : null,
          tax: percent(g.tax_share_pct, 1),
          rate: g.avg_rate_pct != null ? percent(g.avg_rate_pct, 1) : null,
        }))}
      />
    </div>
  )
}
