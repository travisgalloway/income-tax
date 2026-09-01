/** Section 2: output per hour, and what a household got.
 *
 *  Two series from two different files, two different sources, two different
 *  calendars, indexed to a shared base year so they can share one axis. The
 *  chart shows that they diverged; it does not, and cannot, show why.
 *
 *  Recharts draws the two lines, the grid and the axes. The band marks, the
 *  focus dots and the two direct labels stay the site's own code, drawn in the
 *  plot coordinates `useFrame` returns. See `../charts/RechartsFrame.tsx` for
 *  the reference-identity rules every Recharts island obeys.
 */
import { useMemo, useState } from 'react'
import { Line, LineChart } from 'recharts'
import { Annotation } from '../charts/Annotation'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
} from '../charts/RechartsFrame'
import { dollars } from '../charts/format'
import { TableView } from './TableView'
import type { EconomyYear, IncomeYear } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

const BASE = 1984

/** Fixed, because the tick array below is fixed. Hoisted so the axis prop keeps
 *  its reference between renders. */
const Y_DOMAIN: [number, number] = [90, 230]
const WIDE_TICKS = [100, 140, 180, 220]
const NARROW_TICKS = [100, 160, 220]

/** The index is a pure number, and its base year is named by the axis title. */
const INDEX_TICK = (v: number) => `${v}`
const YEAR_TICK = (t: number) => `${t}`

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

  const prodByYear = useMemo(
    () => new Map(economyRows.filter((r) => r.actual).map((r) => [r.y, r.prod])),
    [economyRows],
  )
  const mhiByYear = useMemo(() => new Map(incomeRows.map((r) => [r.y, r.mhi])), [incomeRows])

  // The shared window is computed, not hardcoded: the first and last year at
  // which BOTH an actual prod value and a non-null mhi exist. With the shipped
  // data this resolves to [1984, 2024].
  const span = useMemo(() => {
    const years = [...prodByYear.keys()].filter((y) => prodByYear.get(y) != null && mhiByYear.get(y) != null)
    return [Math.min(...years), Math.max(...years)] as [number, number]
  }, [prodByYear, mhiByYear])
  const [winStart, winEnd] = span

  const prodAtBase = prodByYear.get(BASE) as number
  const mhiAtBase = mhiByYear.get(BASE) as number

  // Full FY1950-FY2025 span for the table, with null where a series does not
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

  const {
    boxRef, size, f, narrow, xDomain, yDomain, x, y, xTicks,
    chartMargin, chartStyle, surfaceRef, wrapperProps, mark,
  } = useFrame({
    rows: shown,
    xOf: (r) => r.y,
    yValues: shown.flatMap((r) => [r.prodIndex, r.mhiIndex]).filter((v): v is number => v != null),
    xDomain: span,
    yDomain: Y_DOMAIN,
  })

  // The tick array is fixed rather than derived, so it is memoised here instead
  // of coming from the frame.
  const yTicks = useMemo(() => (narrow ? NARROW_TICKS : WIDE_TICKS), [narrow])

  const lastShown = shown[shown.length - 1]
  const active = focus != null ? fullRows.find((r) => r.y === focus) : null

  const band = f.innerWidth / shown.length
  // Order is data order, and the array is built in this render.
  const markProps = shown.map(() => mark())

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <LineChart
          ref={surfaceRef}
          data={shown}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          style={chartStyle}
          aria-label="Indexed to 1984 = 100, output per hour reached 216.5 by 2024 while real median household income reached 138.6, the two lines separating over the period."
          {...SURFACE_DEFAULTS}
        >
          <PlotGrid />
          <PlotXAxis
            domain={xDomain}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Year"
            format={YEAR_TICK}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="Index, 1984 = 100"
            format={INDEX_TICK}
          />
          <Line
            type="linear"
            dataKey="prodIndex"
            stroke="var(--mand)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="mhiIndex"
            stroke="var(--int)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <PlotOverlay margin={f.margin}>
            {lastShown?.prodIndex != null && (
              <Annotation frame={f} x={x(lastShown.y) - 4} y={y(lastShown.prodIndex) - 6} anchor="end" halo label="Output per hour" />
            )}
            {lastShown?.mhiIndex != null && (
              <Annotation frame={f} x={x(lastShown.y) - 4} y={y(lastShown.mhiIndex) + 14} anchor="end" halo label="Real median household income" />
            )}

            {shown.map((r, i) => (
              <g key={r.y}>
                <rect
                  className="datum"
                  x={x(r.y) - band / 2}
                  y={0}
                  width={band}
                  height={f.innerHeight}
                  fill="transparent"
                  {...markProps[i]}
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
          </PlotOverlay>
        </LineChart>
      </div>

      <p aria-live="polite" className="readout">
        {active ? describe(active) : <ChartHint noun="year" />}
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
