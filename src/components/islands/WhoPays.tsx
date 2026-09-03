/** Section 5, figure A: who pays the individual income tax.
 *
 *  The six percentile groups are NESTED, not a partition, Top 1% sits inside
 *  Top 5%, inside Top 10%, and so on, so no group's value may ever be added
 *  to another's or drawn as one bar divided into parts. Each group gets its
 *  own pair of independent bars from a common left baseline at 0: AGI share
 *  above, tax share below. Three groups have no published AGI share and one
 *  has no published average rate; those cells render as "no data", never as
 *  a zero-width bar.
 *
 *  Drawn on `charts/RechartsFrame.tsx` as a `<BarChart layout="vertical">`.
 *  Read that file's header before editing this one.
 *
 *  THE MARKS ARE DRAWN IN THE OVERLAY, NOT INSIDE THE TWO `<Bar>` ELEMENTS,
 *  and that is a keyboard decision. Recharts renders one `<Bar>` completely
 *  before the next, so marks nested in them would run as six AGI bars and then
 *  six tax bars. Arrow keys follow DOM order, and this figure has always paired
 *  the AGI and the tax bar of one group next to each other.
 *
 *  The bar LENGTHS come from Recharts, through the x scale it builds from the
 *  domain below. The row geometry stays here, because the group label band and
 *  the pair spacing are this figure's own and no band layout expresses them.
 */
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotOverlay,
  SURFACE_DEFAULTS,
  useAxisLabel,
  useFrame,
  useTickFormat,
} from '../charts/RechartsFrame'
import { percent } from '../charts/format'
import { AXIS_LABEL_FONT_PX, everyLeftGutterLabelFits, placeTickLabel } from '../charts/axisFit'
import { TableView } from './TableView'
import type { IncomeTaxGroup } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

type Metric = 'agi' | 'tax'
type Active = { g: string; metric: Metric } | null

/** The exact text a missing cell renders as. Never a zero-width bar. */
const NO_DATA = 'no data'

const X_DOMAIN: [number, number] = [0, 100]

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

  const {
    size,
    boxRef,
    f,
    x,
    xTicks,
    chartMargin,
    chartStyle,
    surfaceRef,
    wrapperProps,
    mark,
  } = useFrame({
    rows,
    xOf: () => 0,
    yValues: [],
    xDomain: X_DOMAIN,
    xTickCount: [4, 5],
  })

  const xFormat = useTickFormat(percent, 0)
  const yLabel = useAxisLabel('Percentile of tax units', 'y')
  const xLabel = useAxisLabel('Percent', 'x')

  // The six group strings are the axis's CATEGORIES, so they cannot be
  // abbreviated without changing what the figure says. `Bottom 50%`
  // needs 68.2 units and the left gutter has 64 at the 720 preset and
  // 42 at 360, so it shipped clipped, the #64 shape on axis text (#66).
  //
  // The choice is all-or-none and made from the frame's own numbers,
  // never from a viewport constant: a per-label decision would put some
  // categories in the gutter and others in the plot on one axis, which
  // reads as a rendering fault. When they do not fit, each label moves above
  // its own bar pair, start-anchored at x=0, the same in-plot idiom this
  // figure already uses for its AGI and tax markers, and the two markers take
  // the gutter the categories vacated.
  const gutterLabels = everyLeftGutterLabelFits(rows.map((g) => g.g), f)
  const labelBand = gutterLabels ? 0 : 15
  const rowH = f.innerHeight / rows.length
  const avail = rowH - labelBand
  const barH = avail * (gutterLabels ? 0.3 : 0.34)
  const barGap = avail * 0.1
  const agiTop = (i: number) => i * rowH + labelBand + avail * 0.14
  const taxTop = (i: number) => agiTop(i) + barH + barGap

  const activeRow = active ? rows.find((r) => r.g === active.g) : null
  const readoutText = activeRow && active ? describe(activeRow, active.metric) : null

  const ariaLabel =
    'Share of adjusted gross income compared with share of federal individual income tax paid, ' +
    'by income percentile group, tax year 2023. The top 1% earned 20.6% of adjusted gross income ' +
    'and paid 38.4% of the tax. The bottom half paid 3.3% of the tax. AGI share is not published ' +
    'for the Top 5%, Top 25% and Bottom 50% groups.'

  // `mark()` runs once per mark HERE, in this island's own render, in the
  // paired order the arrow keys follow. Every mark then lives in the overlay,
  // so no Recharts subtree ever advances the counter on its own.
  const marks = rows.map((g) => ({
    agi: g.income_share_pct != null ? mark() : null,
    tax: mark(),
  }))

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <BarChart
          ref={surfaceRef}
          layout="vertical"
          data={rows}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={ariaLabel}
        >
          {/* Panel only. This figure draws no horizontal rule, and a grid on a
              category axis would run one through every bar pair. */}
          <CartesianGrid horizontal={false} vertical={false} fill="var(--panel)" fillOpacity={1} />
          {/* The tick VALUES are drawn below rather than by the axis, for the
              reason the category names are: this axis ends at 100%, a
              middle-anchored label there needs half its width in the right
              gutter, and the narrow preset has 12 units against the 13.25 that
              `100%` asks for. It shipped overrunning the surface by 1.6px,
              which `smoke.test.ts`'s horizontal-containment check reports as a
              hard zero. `placeTickLabel` is the site's own shift-only clamp and
              is what `Axis.tsx` applied before this figure moved to Recharts.
              The axis keeps the gutter and the title. */}
          <XAxis
            dataKey="tax_share_pct"
            type="number"
            domain={X_DOMAIN}
            ticks={xTicks}
            height={size.margin.bottom}
            axisLine={false}
            tickLine={false}
            tick={false}
            label={xLabel}
          />
          {/* The category names are drawn below rather than as ticks, because
              this figure moves them out of the gutter when they do not fit and
              a Recharts `tick` renderer is a fresh function on every render,
              which rule 1 forbids. The axis keeps the gutter and the title. */}
          <YAxis
            type="category"
            dataKey="g"
            width={size.margin.left}
            tick={false}
            axisLine={false}
            tickLine={false}
            label={yLabel}
          />

          <Bar
            dataKey="income_share_pct"
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              const g = rows[i]
              // No rect at all when the group has no published income share.
              if (!g || g.income_share_pct == null || !Number.isFinite(props.width)) return null
              return (
                <rect
                  key={g.g}
                  x={props.x}
                  y={agiTop(i)}
                  width={Math.max(0, props.width)}
                  height={barH}
                  fill="var(--disc)"
                />
              )
            }}
          />
          <Bar
            dataKey="tax_share_pct"
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              const g = rows[i]
              if (!g || !Number.isFinite(props.width)) return null
              return (
                <rect
                  key={g.g}
                  x={props.x}
                  y={taxTop(i)}
                  width={Math.max(0, props.width)}
                  height={barH}
                  fill="var(--mand)"
                />
              )
            }}
          />

          <PlotOverlay margin={f.margin}>
            {/* The clamped x tick labels. `Axis.tsx`'s own offsets, so this
                axis reads at the same height as every hand-rolled one. */}
            {xTicks.map((t) => {
              const text = xFormat(t)
              const placed = placeTickLabel(x(t), text, f, AXIS_LABEL_FONT_PX)
              if (placed === null) return null
              return (
                <text
                  key={t}
                  x={placed.x}
                  y={f.innerHeight + 18}
                  textAnchor={placed.textAnchor}
                  className="axis-label"
                >
                  {text}
                </text>
              )
            })}

            {rows.map((g, i) => {
              const agiY = agiTop(i)
              const taxY = taxTop(i)
              const groupCenter = i * rowH + rowH / 2
              const agiCenter = agiY + barH / 2
              const taxCenter = taxY + barH / 2
              const isAgiActive = active?.g === g.g && active.metric === 'agi'
              const isTaxActive = active?.g === g.g && active.metric === 'tax'

              return (
                <g key={g.g}>
                  {gutterLabels ? (
                    <text x={-8} y={groupCenter} dy="0.32em" textAnchor="end" className="axis-label">
                      {g.g}
                    </text>
                  ) : (
                    <text x={0} y={i * rowH + 10} className="axis-label">
                      {g.g}
                    </text>
                  )}

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
                        fill="transparent"
                        stroke={isAgiActive ? 'var(--ink)' : 'none'}
                        strokeWidth={1.5}
                        {...(marks[i].agi ?? {})}
                        role="img"
                        aria-label={describe(g, 'agi')}
                        onFocus={() => setActive({ g: g.g, metric: 'agi' })}
                        onBlur={() => setActive(null)}
                        onMouseEnter={() => setActive({ g: g.g, metric: 'agi' })}
                        onMouseLeave={() => setActive(null)}
                      />
                      <Annotation
                        frame={f}
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
                    fill="transparent"
                    stroke={isTaxActive ? 'var(--ink)' : 'none'}
                    strokeWidth={1.5}
                    {...marks[i].tax}
                    role="img"
                    aria-label={describe(g, 'tax')}
                    onFocus={() => setActive({ g: g.g, metric: 'tax' })}
                    onBlur={() => setActive(null)}
                    onMouseEnter={() => setActive({ g: g.g, metric: 'tax' })}
                    onMouseLeave={() => setActive(null)}
                  />
                  <Annotation
                    frame={f}
                    x={x(g.tax_share_pct) + 6}
                    y={taxCenter}
                    dy="0.32em"
                    label={percent(g.tax_share_pct, 1)}
                  />
                </g>
              )
            })}
          </PlotOverlay>
        </BarChart>
      </div>

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
