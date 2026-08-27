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
import { Annotation } from '../charts/Annotation'
import { AxisBottom } from '../charts/Axis'
import { linear } from '../charts/scales'
import { percent } from '../charts/format'
import { everyLeftGutterLabelFits } from '../charts/axisFit'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { IncomeTaxGroup } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

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
        {(fr, mark) => {
          // The six group strings are the axis's CATEGORIES, so they cannot be
          // abbreviated without changing what the figure says. `Bottom 50%`
          // needs 68.2 units and the left gutter has 64 at the 720 preset and
          // 42 at 360 — so it shipped clipped, the #64 shape on axis text (#66).
          //
          // The choice is all-or-none and made from the frame's own numbers,
          // never from a viewport constant: a per-label decision would put some
          // categories in the gutter and others in the plot on one axis, which
          // reads as a rendering fault. When they fit, this is byte-identical
          // to what shipped before. When they do not, each label moves above
          // its own bar pair, start-anchored at x=0 — the same in-plot idiom
          // this figure already uses for its AGI and tax markers — and the two
          // markers take the gutter the categories vacated.
          const gutterLabels = everyLeftGutterLabelFits(rows.map((g) => g.g), fr)
          const labelBand = gutterLabels ? 0 : 15
          const rowH = ih / rows.length
          const avail = rowH - labelBand
          const barH = avail * (gutterLabels ? 0.3 : 0.34)
          const barGap = avail * 0.1
          return (
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
              const agiY = rowTop + labelBand + avail * 0.14
              const taxY = agiY + barH + barGap
              const groupCenter = rowTop + rowH / 2
              const agiCenter = agiY + barH / 2
              const taxCenter = taxY + barH / 2

              const isAgiActive = active?.g === g.g && active.metric === 'agi'
              const isTaxActive = active?.g === g.g && active.metric === 'tax'

              return (
                <g key={g.g}>
                  {gutterLabels ? (
                    <text
                      x={-8}
                      y={groupCenter}
                      dy="0.32em"
                      textAnchor="end"
                      className="axis-label"
                    >
                      {g.g}
                    </text>
                  ) : (
                    <text x={0} y={rowTop + 10} className="axis-label">
                      {g.g}
                    </text>
                  )}

                  {/* AGI share bar. No rect at all when the group has no published income share. */}
                  {g.income_share_pct != null ? (
                    <>
                      {gutterLabels ? (
                        <text x={4} y={agiY - 3} className="axis-label">AGI</text>
                      ) : (
                        <text x={-4} y={agiCenter} dy="0.32em" textAnchor="end" className="axis-label">
                          AGI
                        </text>
                      )}
                      <rect
                        className="datum"
                        x={0}
                        y={agiY}
                        width={Math.max(0, x(g.income_share_pct))}
                        height={barH}
                        fill="var(--disc)"
                        stroke={isAgiActive ? 'var(--ink)' : 'none'}
                        strokeWidth={1.5}
                        {...mark()}
                        role="img"
                        aria-label={describe(g, 'agi')}
                        onFocus={() => setActive({ g: g.g, metric: 'agi' })}
                        onBlur={() => setActive(null)}
                        onMouseEnter={() => setActive({ g: g.g, metric: 'agi' })}
                        onMouseLeave={() => setActive(null)}
                      />
                      <Annotation
                        frame={fr}
                        x={x(g.income_share_pct) + 6}
                        y={agiCenter}
                        dy="0.32em"
                        label={percent(g.income_share_pct, 1)}
                      />
                    </>
                  ) : (
                    <text x={gutterLabels ? 4 : 0} y={agiCenter} dy="0.32em" className="axis-label">
                      {`AGI: ${NO_DATA}`}
                    </text>
                  )}

                  {/* Tax share bar. Always present; the field is required. */}
                  {gutterLabels ? (
                    <text x={4} y={taxY - 3} className="axis-label">tax</text>
                  ) : (
                    <text x={-4} y={taxCenter} dy="0.32em" textAnchor="end" className="axis-label">
                      tax
                    </text>
                  )}
                  <rect
                    className="datum"
                    x={0}
                    y={taxY}
                    width={Math.max(0, x(g.tax_share_pct))}
                    height={barH}
                    fill="var(--mand)"
                    stroke={isTaxActive ? 'var(--ink)' : 'none'}
                    strokeWidth={1.5}
                    {...mark()}
                    role="img"
                    aria-label={describe(g, 'tax')}
                    onFocus={() => setActive({ g: g.g, metric: 'tax' })}
                    onBlur={() => setActive(null)}
                    onMouseEnter={() => setActive({ g: g.g, metric: 'tax' })}
                    onMouseLeave={() => setActive(null)}
                  />
                  <Annotation
                    frame={fr}
                    x={x(g.tax_share_pct) + 6}
                    y={taxCenter}
                    dy="0.32em"
                    label={percent(g.tax_share_pct, 1)}
                  />
                </g>
              )
            })}
          </>
          )
        }}
      </Chart>

      <p aria-live="polite" className="readout">
        {readoutText ?? <ChartHint noun="bar" />}
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
