/** Section 10: total tax revenue as a share of GDP, OECD comparison, 2024.
 *
 *  BRIEF.md rule 3: this counts federal, state AND local. It is not comparable
 *  to the CBO 17.2%-of-GDP federal-only figure charted in RevenueChart. That
 *  scope difference is stated in body copy (the criterion), and again here in
 *  the Figure `note` — never only in the note, and never in a tooltip.
 *
 *  No party colour, no diverging good/bad scale: this is one ink hue at two
 *  weights. Nothing here says a higher or lower number is good.
 */
import { useMemo, useState } from 'react'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { AxisBottom } from '../charts/Axis'
import { linear } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { OecdCountry, OecdComparison } from '../../data/types'

const X_DOMAIN: [number, number] = [0, 50]
const ROW_HEIGHT_WIDE = 32
const ROW_HEIGHT_NARROW = 28

type Focus = { kind: 'country'; c: string } | { kind: 'average' } | null

function describeCountry(c: OecdCountry, rank: number, of: number): string {
  const suffix = c.is_us ? `, ranked ${rank} of ${of} OECD members` : ''
  return `${c.c}: ${c.v.toFixed(1)}% of GDP${suffix}.`
}

function describeAverage(avg: number): string {
  return `OECD average: ${avg.toFixed(1)}% of GDP, the mean of 38 members, not a country.`
}

export function OecdChart({ data }: { data: OecdComparison }) {
  const [focus, setFocus] = useState<Focus>(null)
  const [boxRef, size] = useChartSize()
  const narrow = size.width < 500
  const W = size.width

  // The average is drawn as a labelled reference line, not as a country row.
  const countries = useMemo(() => data.countries.filter((c) => !c.is_average), [data])
  const rowHeight = narrow ? ROW_HEIGHT_NARROW : ROW_HEIGHT_WIDE
  const margin = { top: 34, right: 24, bottom: 40, left: narrow ? 96 : 118 }
  const innerHeight = countries.length * rowHeight
  const H = innerHeight + margin.top + margin.bottom
  const iw = W - margin.left - margin.right

  const x = linear(X_DOMAIN, [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 6)

  const rowY = (i: number) => i * rowHeight + rowHeight / 2

  const active =
    focus?.kind === 'country'
      ? countries.find((c) => c.c === focus.c) ?? null
      : null

  const readout =
    focus?.kind === 'average'
      ? describeAverage(data.oecd_average_pct_gdp)
      : active
        ? describeCountry(active, data.us_rank, data.of_countries)
        : 'Focus or hover a country to read its value.'

  const chartLabel =
    `Total tax revenue as a share of GDP across ${countries.length} selected OECD countries and the OECD average, ${data.year} preliminary data. The United States collects ${data.us_pct_gdp.toFixed(1)}% of GDP, ranked ${data.us_rank} of ${data.of_countries} members and below the ${data.oecd_average_pct_gdp.toFixed(1)}% average.`

  return (
    <div ref={boxRef}>
      <Chart ariaLabel={chartLabel} interactive width={W} height={H} margin={margin}>
        {(fr) => (
          <>
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => `${t}%`}
              label="Percent of GDP"
              scale={x}
            />

            {/* OECD average: a labelled reference line, structurally never a country row. */}
            <g>
              <line
                x1={x(data.oecd_average_pct_gdp)}
                x2={x(data.oecd_average_pct_gdp)}
                y1={0}
                y2={innerHeight}
                stroke="var(--ink-soft)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
              {/* Two lines sharing one placement: the clamp uses the WIDER
                  line, not the concatenation of the two (#64, E9). */}
              <Annotation
                frame={fr}
                x={x(data.oecd_average_pct_gdp) + 6}
                y={-22}
                className="dotplot-average-label"
                label={`OECD average, ${data.oecd_average_pct_gdp.toFixed(1)}% of GDP`}
                lines={['(mean of 38 members, not a country)']}
              />
              <rect
                className="datum"
                x={x(data.oecd_average_pct_gdp) - 6}
                y={0}
                width={12}
                height={innerHeight}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={describeAverage(data.oecd_average_pct_gdp)}
                onFocus={() => setFocus({ kind: 'average' })}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setFocus({ kind: 'average' })}
                onMouseLeave={() => setFocus(null)}
              />
            </g>

            {countries.map((c, i) => {
              const cy = rowY(i)
              const isUs = !!c.is_us
              return (
                <g key={c.c}>
                  <text
                    x={-8}
                    y={cy}
                    dy="0.32em"
                    textAnchor="end"
                    className={isUs ? 'dotplot-label dotplot-label-us' : 'dotplot-label'}
                  >
                    {c.c}
                  </text>
                  <line x1={0} x2={x(c.v)} y1={cy} y2={cy} stroke="var(--rule)" strokeWidth={0.5} />
                  <circle
                    className="datum"
                    cx={x(c.v)}
                    cy={cy}
                    r={isUs ? 6 : 4}
                    fill={isUs ? 'var(--ink)' : 'var(--ink-soft)'}
                    tabIndex={0}
                    role="img"
                    aria-label={describeCountry(c, data.us_rank, data.of_countries)}
                    onFocus={() => setFocus({ kind: 'country', c: c.c })}
                    onBlur={() => setFocus(null)}
                    onMouseEnter={() => setFocus({ kind: 'country', c: c.c })}
                    onMouseLeave={() => setFocus(null)}
                  />
                  <text
                    x={x(c.v) + (isUs ? 10 : 8)}
                    y={cy}
                    dy="0.32em"
                    textAnchor="start"
                    className={isUs ? 'dotplot-value dotplot-value-us' : 'dotplot-value'}
                  >
                    {c.v.toFixed(1)}%
                  </text>
                </g>
              )
            })}
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">{readout}</p>

      <TableView
        caption="Total tax revenue as a share of GDP, OECD comparison, 2024"
        columns={[
          { key: 'c', label: 'Country or aggregate', unit: '' },
          { key: 'v', label: 'Total tax revenue', unit: 'percent of GDP' },
          { key: 'basis', label: 'Basis', unit: '' },
        ]}
        rows={data.countries.map((c) => ({
          c: c.c,
          v: c.v.toFixed(1),
          basis: c.is_average ? 'Average of 38 members' : 'Country',
        }))}
      />
    </div>
  )
}
