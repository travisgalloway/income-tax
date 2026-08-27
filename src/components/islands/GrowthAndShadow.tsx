/** Section 2: output per hour, and what a household got.
 *
 *  Two series from two different files, two different sources, two different
 *  calendars, indexed to a shared base year so they can share one axis. The
 *  chart shows that they diverged; it does not, and cannot, show why.
 */
import { useMemo, useState } from 'react'
import { line as d3line } from 'd3-shape'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom, AxisLeft } from '../charts/Axis'
import { linear } from '../charts/scales'
import { dollars } from '../charts/format'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { EconomyYear, IncomeYear } from '../../data/types'

const BASE = 1984

interface Row {
  y: number
  prod: number | null
  prodIndex: number | null
  mhi: number | null
  mhiIndex: number | null
}

/** The single source of truth for a year's readout text: reports the raw and
 *  the indexed value for each series, so a reader is never left to trust the
 *  index without seeing what it was computed from. */
function describe(r: Row): string {
  const prod = r.prodIndex != null
    ? `output per hour ${(r.prod as number).toFixed(3)} (index ${r.prodIndex.toFixed(1)})`
    : 'no output-per-hour data'
  const income = r.mhiIndex != null
    ? `real median household income ${dollars(r.mhi as number)} (index ${r.mhiIndex.toFixed(1)})`
    : 'no median household income data'
  return `Year ${r.y}: ${prod}, ${income}, 1984 = 100.`
}

export function GrowthAndShadow({ economyRows, incomeRows }: { economyRows: EconomyYear[]; incomeRows: IncomeYear[] }) {
  const [focus, setFocus] = useState<number | null>(null)

  const [boxRef, size] = useChartSize()
  const { width: W, height: H, margin: f } = size
  const iw = W - f.left - f.right
  const ih = H - f.top - f.bottom
  const narrow = W < 500

  const prodByYear = useMemo(
    () => new Map(economyRows.filter((r) => r.actual).map((r) => [r.y, r.prod])),
    [economyRows],
  )
  const mhiByYear = useMemo(() => new Map(incomeRows.map((r) => [r.y, r.mhi])), [incomeRows])

  // The shared window is computed, not hardcoded: the first and last year at
  // which BOTH an actual prod value and a non-null mhi exist. With the shipped
  // data this resolves to [1984, 2024].
  const window = useMemo(() => {
    const years = [...prodByYear.keys()].filter((y) => prodByYear.get(y) != null && mhiByYear.get(y) != null)
    return [Math.min(...years), Math.max(...years)] as [number, number]
  }, [prodByYear, mhiByYear])
  const [winStart, winEnd] = window

  const prodAtBase = prodByYear.get(BASE) as number
  const mhiAtBase = mhiByYear.get(BASE) as number

  // Full FY1950-FY2025 span for the table, with null where a series doesn't
  // reach: the shared window is stated, not silently truncated away.
  const allYears = economyRows.filter((r) => r.actual).map((r) => r.y)
  const fullRows: Row[] = allYears.map((y) => {
    const prod = prodByYear.get(y) ?? null
    const mhi = mhiByYear.get(y) ?? null
    return {
      y,
      prod,
      prodIndex: prod != null ? (100 * prod) / prodAtBase : null,
      mhi,
      mhiIndex: mhi != null ? (100 * mhi) / mhiAtBase : null,
    }
  })
  const shown = fullRows.filter((r) => r.y >= winStart && r.y <= winEnd)

  const x = linear([winStart, winEnd], [0, iw])
  const yTicks = narrow ? [100, 160, 220] : [100, 140, 180, 220]
  const y = linear([90, Math.max(...yTicks) + 10], [ih, 0])
  const xTicks = x.ticks(narrow ? 4 : 8).filter((t) => Number.isInteger(t))

  const prodLine = d3line<Row>().defined((r) => r.prodIndex != null).x((r) => x(r.y)).y((r) => y(r.prodIndex as number))
  const mhiLine = d3line<Row>().defined((r) => r.mhiIndex != null).x((r) => x(r.y)).y((r) => y(r.mhiIndex as number))

  const lastShown = shown[shown.length - 1]
  const active = focus != null ? fullRows.find((r) => r.y === focus) : null

  return (
    <div ref={boxRef}>
      <Chart
        ariaLabel="Indexed to 1984 = 100, output per hour reached 216.5 by 2024 while real median household income reached 138.6, the two lines separating over the period."
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr, mark) => (
          <>
            <AxisLeft frame={fr} ticks={yTicks} format={(v) => `${v}`} label="Index, 1984 = 100" scale={y} />
            <AxisBottom frame={fr} ticks={xTicks} format={(t) => `${t}`} label="Year" scale={x} />

            <path d={prodLine(shown) ?? ''} fill="none" stroke="var(--mand)" strokeWidth={2} />
            <path d={mhiLine(shown) ?? ''} fill="none" stroke="var(--int)" strokeWidth={2} />

            {lastShown?.prodIndex != null && (
              <Annotation frame={fr} x={x(lastShown.y) - 4} y={y(lastShown.prodIndex) - 6} anchor="end" label="Output per hour" />
            )}
            {lastShown?.mhiIndex != null && (
              <Annotation frame={fr} x={x(lastShown.y) - 4} y={y(lastShown.mhiIndex) + 14} anchor="end" label="Real median household income" />
            )}

            {shown.map((r) => (
              <g key={r.y}>
                <rect
                  className="datum"
                  x={x(r.y) - iw / shown.length / 2}
                  y={0}
                  width={iw / shown.length}
                  height={ih}
                  fill="transparent"
                  {...mark()}
                  role="img"
                  aria-label={describe(r)}
                  onFocus={() => setFocus(r.y)}
                  onBlur={() => setFocus(null)}
                  onMouseEnter={() => setFocus(r.y)}
                  onMouseLeave={() => setFocus(null)}
                />
                {active?.y === r.y && r.prodIndex != null && (
                  <circle cx={x(r.y)} cy={y(r.prodIndex)} r={4} fill="var(--mand)" />
                )}
                {active?.y === r.y && r.mhiIndex != null && (
                  <circle cx={x(r.y)} cy={y(r.mhiIndex)} r={4} fill="var(--int)" />
                )}
              </g>
            ))}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : 'Focus or hover a year to read its value.'}
      </p>

      <TableView
        caption="Output per hour and real median household income, 1950 to 2025"
        columns={[
          { key: 'y', label: 'Year (FY / calendar)', unit: '' },
          { key: 'prodIndex', label: 'Output per hour', unit: 'index, 1984 = 100' },
          { key: 'mhiDollars', label: 'Real median household income', unit: '$, 2024 dollars' },
          { key: 'mhiIndex', label: 'Median income', unit: 'index, 1984 = 100' },
        ]}
        rows={fullRows.map((r) => ({
          y: r.y,
          prodIndex: r.prodIndex != null ? r.prodIndex.toFixed(1) : null,
          mhiDollars: r.mhi != null ? dollars(r.mhi) : null,
          mhiIndex: r.mhiIndex != null ? r.mhiIndex.toFixed(1) : null,
        }))}
      />
    </div>
  )
}
