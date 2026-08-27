/** Section 4: the whole budget on one axis.
 *
 *  BRIEF.md/sections.md §4: outlays stacked into mandatory (net), discretionary
 *  and net interest, revenue drawn across the same panel, the deficit below
 *  zero at the SAME scale, so the deficit reads as the distance between the
 *  revenue line and the top of the stack. A three-row party-control strip
 *  sits above the plot for FY1995-2025 only; era bands mark 2008-09 and
 *  2020-21; every year is inspectable by hover or keyboard focus.
 *
 *  See docs/contracts/interfaces/budget-data.md for the gross-vs-net trap and
 *  the ctl:null boundary this component depends on, and
 *  docs/contracts/interfaces/charts.md for the shared chart-layer contract.
 */
import { useMemo, useState } from 'react'
import { area as d3area, line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft, ZeroLine } from '../charts/Axis'
import { AXIS_LABEL_FONT_PX, firstThatFits, leftGutterRoom } from '../charts/axisFit'
import { linear, niceExtent } from '../charts/scales'
import { UnitToggle } from './UnitToggle'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import { UNIT_LABEL, UNIT_PREFIX, fiscalYear, tick, value, type Unit } from '../charts/format'
import type { BudgetYear, Control, Law } from '../../data/types'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'whole-budget'

interface Row {
  y: number
  mand: number
  disc: number
  int: number
  total: number
  rev: number
  def: number
  ctl: Control | null
  laws: Law[]
}

type NumericField = 'ma' | 'or' | 'di' | 'ni' | 're' | 'de' | 'ot'

/** Tolerance the pipeline's own reconciliation checks use per unit family. */
function toleranceFor(unit: Unit): number {
  return unit === 'gdp' ? 0.02 : unit === 'real' ? 0.004 : 0.002
}

/**
 * `ma` is GROSS mandatory (docs/contracts/interfaces/budget-data.md). The net
 * figure that belongs in the stack is `ma + or` -- never bare `ma`, which is
 * the one substitution that would silently break the stack against `ot`.
 */
function deriveRows(rows: BudgetYear[], unit: Unit): Row[] {
  const p = UNIT_PREFIX[unit]
  const tol = toleranceFor(unit)
  return rows.map((r) => {
    const f = (k: NumericField): number => r[`${p}${k}` as keyof BudgetYear] as number
    const mand = f('ma') + f('or')
    const disc = f('di')
    const int_ = f('ni')
    const total = f('ot')
    // Dev-only: a future field rename should fail loudly, not draw a stack
    // that silently misses the top of the axis.
    if (import.meta.env.DEV && Math.abs(mand + disc + int_ - total) > tol) {
      throw new Error(
        `BudgetChart: FY${r.y} mandatory+discretionary+interest ` +
          `(${(mand + disc + int_).toFixed(3)}) does not match total outlays ` +
          `(${total.toFixed(3)}) in ${unit} units`,
      )
    }
    return { y: r.y, mand, disc, int: int_, total, rev: f('re'), def: f('de'), ctl: r.ctl, laws: r.L }
  })
}

function partyName(p: 'D' | 'R'): string {
  return p === 'D' ? 'Democratic' : 'Republican'
}

/**
 * One function producing both the announced string (hover/focus aria-label)
 * and the structured content of the visible `.inspector` panel, so the two
 * can never diverge.
 */
function describeYear(r: Row, unit: Unit): { label: string; parts: [string, string][] } {
  const v = (n: number) => value(n, unit)
  const outlaysDetail = `${v(r.total)} (mandatory ${v(r.mand)}, discretionary ${v(r.disc)}, net interest ${v(r.int)})`
  const controlText = r.ctl
    ? `${partyName(r.ctl.pp)} president, ${partyName(r.ctl.h)} House, ${partyName(r.ctl.s)} Senate — ${
        r.ctl.ctl === 'M' ? 'divided control' : `unified ${partyName(r.ctl.ctl)}`
      }`
    : 'Party control not curated before FY1995.'
  const lawsText = r.laws.length
    ? r.laws.map((l) => l.name).join('; ')
    : 'No major law enacted this fiscal year.'
  const balanceLabel = r.def >= 0 ? 'Surplus' : 'Deficit'
  const balanceValue = v(Math.abs(r.def))

  const parts: [string, string][] = [
    ['Fiscal year', fiscalYear(r.y)],
    ['Outlays', outlaysDetail],
    ['Revenue', v(r.rev)],
    [balanceLabel, balanceValue],
    ['Control', controlText],
    ['Enacted this fiscal year', lawsText],
  ]

  const label =
    `${fiscalYear(r.y)}. Outlays ${outlaysDetail}. Revenue ${v(r.rev)}. ${balanceLabel} ${balanceValue}. ` +
    `Control: ${controlText}. Enacted this fiscal year: ${lawsText}`

  return { label, parts }
}

const CONTROL_ROWS: { key: 'pp' | 'h' | 's'; label: string; labelNarrow: string }[] = [
  { key: 'pp', label: 'Presidency', labelNarrow: 'Pres.' },
  { key: 'h', label: 'House', labelNarrow: 'House' },
  { key: 's', label: 'Senate', labelNarrow: 'Senate' },
]

const ERA_BANDS: { from: number; to: number; label: string; labelNarrow: string }[] = [
  { from: 2008, to: 2009, label: '2008–09 crisis', labelNarrow: '2008–09' },
  { from: 2020, to: 2021, label: '2020–21 pandemic', labelNarrow: '2020–21' },
]

export function BudgetChart({ rows: source }: { rows: BudgetYear[] }) {
  const [unit, setUnit] = useState<Unit>('nominal')
  const [focus, setFocus] = useState<number | null>(null)

  const rows = useMemo(() => deriveRows(source, unit), [source, unit])
  const active = focus != null ? rows.find((r) => r.y === focus) ?? null : null

  const [boxRef, size] = useChartSize()
  const narrow = size.width < 500

  // ---- Layout: extra top margin for the caption + 3 control rows + a band-
  // label row, none of which the shared `useChartSize` presets anticipate.
  const capH = narrow ? 9 : 10
  const rowH = narrow ? 10 : 12
  const rowGap = 1
  const bandLabelH = narrow ? 10 : 11
  const padB = 6
  const padC = 6
  const rowsH = CONTROL_ROWS.length * rowH + (CONTROL_ROWS.length - 1) * rowGap
  const stripBlockH = capH + rowsH
  const topExtra = stripBlockH + padB + bandLabelH + padC

  const margin = {
    top: topExtra,
    right: narrow ? size.margin.right : size.margin.right + 58,
    bottom: size.margin.bottom,
    left: size.margin.left,
  }
  const W = size.width
  const H = size.height
  const iw = W - margin.left - margin.right
  const ih = H - margin.top - margin.bottom

  const years = rows.map((r) => r.y)
  const x = linear([Math.min(...years), Math.max(...years)], [0, iw])
  const y = linear(niceExtent(rows.flatMap((r) => [r.total, r.def])), [ih, 0])
  const bw = x(years[1]) - x(years[0])

  // y-coordinates above the plot (negative), from the top of the allocated
  // block down to the plot origin at 0.
  const stripAreaTop = -topExtra
  const captionY = stripAreaTop + capH - 2
  const rowsTop = stripAreaTop + capH
  const rowRectY = (i: number) => rowsTop + i * (rowH + rowGap)
  const rowCenterY = (i: number) => rowRectY(i) + rowH / 2
  const bandLabelY = stripAreaTop + stripBlockH + padB + bandLabelH - 3

  const yTicks = y.ticks(narrow ? 4 : 6)
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const controlled = rows.filter((r): r is Row & { ctl: Control } => r.ctl != null)
  const glyphFits = bw >= 7

  const areaBetween = (y0: (r: Row) => number, y1: (r: Row) => number) =>
    d3area<Row>().x((r) => x(r.y)).y0((r) => y(y0(r))).y1((r) => y(y1(r)))
  const mandArea = areaBetween(() => 0, (r) => r.mand)
  const discArea = areaBetween((r) => r.mand, (r) => r.mand + r.disc)
  const intArea = areaBetween((r) => r.mand + r.disc, (r) => r.mand + r.disc + r.int)
  const revLine = d3line<Row>().x((r) => x(r.y)).y((r) => y(r.rev))

  const last = rows[rows.length - 1]
  const seriesLabelY = {
    mand: y(last.mand / 2),
    disc: y(last.mand + last.disc / 2),
    int: y(last.mand + last.disc + last.int / 2),
    rev: y(last.rev),
  }
  // Keep the four labels from colliding when two series' last values sit close
  // together. This used to guard the net-interest/revenue pair alone, on the
  // reasoning that net interest is the smallest segment and the revenue line
  // often sits just above it. On FY2025 data it is DISCRETIONARY and revenue
  // that collide — their centres are 0.24T apart — so the specific pair was the
  // wrong thing to name. Sorting and spacing covers whichever pair the current
  // vintage happens to bring together.
  //
  // This became visible with #64: the labels now sit inside the plot, so a
  // collision is legible as a collision. Before, they hung past the SVG's right
  // edge and the overlap was hidden by the clipping that issue removed.
  // 15, not the font's 11.5: the painted box of an `.annotation` measures 13.3
  // units tall (ascenders and descenders), so spacing baselines by the font
  // size still leaves the boxes touching. Measured in Chromium 151.
  const MIN_LABEL_GAP = 15
  const ordered = (['mand', 'disc', 'int', 'rev'] as const)
    .map((k) => ({ k, at: seriesLabelY[k] }))
    .sort((a, b) => a.at - b.at)
  for (let i = 1; i < ordered.length; i++) {
    const gap = ordered[i].at - ordered[i - 1].at
    if (gap < MIN_LABEL_GAP) ordered[i].at = ordered[i - 1].at + MIN_LABEL_GAP
  }
  for (const { k, at } of ordered) seriesLabelY[k] = at

  const label = `Federal outlays stacked into mandatory (net), discretionary and net interest, with revenue drawn across them and the deficit below zero, fiscal 1962 to 2025, shown in ${UNIT_LABEL[unit].toLowerCase()}.`

  const colUnit = unit === 'gdp' ? 'percent of GDP' : unit === 'real' ? '$ trillions, real FY2025' : '$ trillions, nominal'
  const fmtCell = (v: number) => (unit === 'gdp' ? v.toFixed(2) : v.toFixed(3))

  return (
    <div ref={boxRef}>
      <div className="controls">
        <UnitToggle figure={FIGURE} value={unit} onChange={setUnit} />
      </div>

      <Chart ariaLabel={label} interactive width={W} height={H} margin={margin}>
        {(fr, mark) => (
          <>
            <defs>
              <pattern id="gop-hatch" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={4} height={4} fill="var(--gop)" />
                <line x1={0} y1={0} x2={0} y2={4} stroke="var(--ink)" strokeWidth={1} opacity={0.4} />
              </pattern>
            </defs>

            <AxisLeft frame={fr} ticks={yTicks} format={(v) => tick(v, unit)} label={UNIT_LABEL[unit]} scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Fiscal year" scale={x} />

            {/* 1. Era bands, drawn first so all data sits on top of them. */}
            {ERA_BANDS.map((b) => {
              const x1 = x(b.from)
              const x2 = x(b.to)
              return (
                <g key={b.from}>
                  <rect x={x1} y={0} width={x2 - x1} height={ih} fill="var(--band)" opacity={0.55} />
                  <text x={(x1 + x2) / 2} y={bandLabelY} textAnchor="middle" className="axis-title">
                    {narrow ? b.labelNarrow : b.label}
                  </text>
                </g>
              )
            })}

            {/* The control strip. Cells render ONLY for FY1995-2025 -- years
                outside that range are genuinely empty: no rect, no outline. */}
            <text x={0} y={captionY} textAnchor="start" className="axis-title">
              {narrow ? 'Control: FY1995–2025' : 'Party control curated for FY1995–2025 only'}
            </text>
            {CONTROL_ROWS.map((row, i) => (
              <g key={row.key}>
                {/* Picked by FIT rather than by the `narrow` boolean (#66):
                    `Presidency` needs 68.2 units and the 720 preset's gutter
                    has 66, so the full label was cut at the wide width too —
                    a breakpoint cannot see a gutter it is not measuring. */}
                <text x={-6} y={rowCenterY(i)} dy="0.32em" textAnchor="end" className="axis-label">
                  {firstThatFits([row.label, row.labelNarrow], leftGutterRoom(fr, 6), AXIS_LABEL_FONT_PX) ??
                    row.labelNarrow}
                </text>
                {controlled.map((r) => {
                  const party = r.ctl[row.key]
                  return (
                    <rect
                      key={r.y}
                      x={x(r.y) - bw / 2}
                      y={rowRectY(i)}
                      width={bw}
                      height={rowH}
                      fill={party === 'D' ? 'var(--dem)' : 'url(#gop-hatch)'}
                      aria-hidden="true"
                    />
                  )
                })}
                {glyphFits &&
                  controlled.map((r) => (
                    <text
                      key={r.y}
                      x={x(r.y)}
                      y={rowCenterY(i)}
                      dy="0.3em"
                      textAnchor="middle"
                      className="control-strip-glyph"
                      aria-hidden="true"
                    >
                      {r.ctl[row.key]}
                    </text>
                  ))}
              </g>
            ))}

            {/* 2. The three stacked areas, back to front: mandatory, then
                discretionary, then net interest on top. Straight segments --
                a smoothed curve would invent values between fiscal years. */}
            <path d={mandArea(rows) ?? ''} fill="var(--mand)" />
            <path d={discArea(rows) ?? ''} fill="var(--disc)" />
            <path d={intArea(rows) ?? ''} fill="var(--int)" />

            {/* 3. The deficit, from zero. Surplus years render ABOVE zero
                from the same baseline: sign and position carry the meaning,
                colour (--positive) only reinforces the surplus years. */}
            {rows.map((r) => {
              const y0 = y(0)
              const y1 = y(r.def)
              return (
                <rect
                  key={r.y}
                  x={x(r.y) - (bw * 0.7) / 2}
                  y={Math.min(y0, y1)}
                  width={bw * 0.7}
                  height={Math.max(1, Math.abs(y1 - y0))}
                  fill={r.def >= 0 ? 'var(--positive)' : 'var(--ink-soft)'}
                  opacity={r.def >= 0 ? 0.9 : 0.4}
                />
              )
            })}

            <ZeroLine frame={fr} y={y(0)} />

            {/* 4. Revenue, drawn last of the data so it reads across the stack. */}
            <path d={revLine(rows) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={2} />

            {/* 5. In-chart series labels at wide; a text legend below the
                figure replaces these at narrow (see the <p> after </Chart>).

                These sit INSIDE the plot, right-anchored with a halo, which is
                the treatment RevenueChart's band labels already use two
                sections down. They used to hang at `iw + 6` in a 24-unit right
                margin and were clipped by 10 to 31 units (#64). Letting the
                clamp flip them there would have satisfied the clip guard and
                broken something else: a stacked area chart has no "just above
                the line" free space, so a flipped label lands on the band it
                names. The halo is what makes sitting on the band legible. */}
            {!narrow && (
              <>
                <Annotation frame={fr} x={iw - 6} y={seriesLabelY.mand} dy="0.32em" anchor="end" halo label="Mandatory (net)" />
                <Annotation frame={fr} x={iw - 6} y={seriesLabelY.disc} dy="0.32em" anchor="end" halo label="Discretionary" />
                <Annotation frame={fr} x={iw - 6} y={seriesLabelY.int} dy="0.32em" anchor="end" halo label="Net interest" />
                <Annotation frame={fr} x={iw - 6} y={seriesLabelY.rev} dy="0.32em" anchor="end" halo label="Revenue" />
              </>
            )}

            {/* Focus highlight, then the interactive hit targets on top. */}
            {active && (
              <rect x={x(active.y) - bw / 2} y={0} width={bw} height={ih} fill="var(--ink)" opacity={0.05} />
            )}
            {rows.map((r) => {
              const { label: aria } = describeYear(r, unit)
              return (
                <rect
                  key={r.y}
                  x={x(r.y) - bw / 2}
                  y={0}
                  width={bw}
                  height={ih}
                  fill="transparent"
                  {...mark()}
                  // NOT role="button": focusing a year reveals its
                  // breakdown, it does not activate anything.
                  role="img"
                  aria-label={aria}
                  onFocus={() => setFocus(r.y)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(r.y)}
                  onMouseLeave={() => setFocus(null)}
                />
              )
            })}
          </>
        )}
      </Chart>

      {narrow && (
        <p className="controls-label">Mandatory (net) · Discretionary · Net interest · Revenue</p>
      )}

      <dl aria-live="polite" className="inspector">
        {active ? (
          describeYear(active, unit).parts.map(([dt, dd]) => (
            <div key={dt}>
              <dt>{dt}</dt>
              <dd>{dd}</dd>
            </div>
          ))
        ) : (
          <div>
            <dd>Focus or hover a year to read its full breakdown.</dd>
          </div>
        )}
      </dl>

      <TableView
        caption="Federal outlays, revenue, deficit and party control by fiscal year"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'mand', label: 'Mandatory, net', unit: colUnit },
          { key: 'disc', label: 'Discretionary', unit: colUnit },
          { key: 'int', label: 'Net interest', unit: colUnit },
          { key: 'total', label: 'Total outlays', unit: colUnit },
          { key: 'rev', label: 'Revenue', unit: colUnit },
          { key: 'def', label: 'Deficit or surplus', unit: colUnit },
          { key: 'ctl', label: 'Party control', unit: '' },
          { key: 'laws', label: 'Laws enacted', unit: '' },
        ]}
        rows={rows.map((r) => ({
          y: fiscalYear(r.y),
          mand: fmtCell(r.mand),
          disc: fmtCell(r.disc),
          int: fmtCell(r.int),
          total: fmtCell(r.total),
          rev: fmtCell(r.rev),
          def: fmtCell(r.def),
          ctl: r.ctl
            ? `${partyName(r.ctl.pp)} president, ${partyName(r.ctl.h)} House, ${partyName(r.ctl.s)} Senate`
            : null,
          laws: r.laws.length ? r.laws.map((l) => l.name).join('; ') : null,
        }))}
      />
    </div>
  )
}
