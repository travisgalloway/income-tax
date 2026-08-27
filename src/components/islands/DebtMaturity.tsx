/** Section 3: how old is the debt.
 *
 *  One shared horizontal axis (years to maturity, 0 to the longest instrument
 *  issued) carries three instrument bands, each drawn only across the years
 *  it actually spans — the 10-20 year stretch is a visible gap, not a
 *  zero-height band, because nothing outstanding covers it.
 *
 *  The finding is the DISTANCE between two markers (average maturity, about
 *  six years; longest instrument, thirty years), never a time series.
 *  sections.md §3: "Do not build this as a time series." The maturity
 *  time-series field is never referenced here — see
 *  docs/contracts/interfaces/curated-snapshots.md.
 */
import { useMemo, useState } from 'react'
import { Chart } from '../charts/Chart'
import { Annotation } from '../charts/Annotation'
import { linear } from '../charts/scales'
import { TableView } from './TableView'
import { useChartSize } from '../charts/useChartSize'
import type { DebtMaturity as DebtMaturityData } from '../../data/types'

type BandKey = 'bills' | 'notes' | 'bonds'

// Presentation only: the curated data carries a maturity STRING ("2 to 10
// years"), not numeric bounds. These bounds are what sections.md specifies
// for the axis layout, not a re-derivation of anything curated.
const RANGES: Record<BandKey, [number, number]> = { bills: [0, 1], notes: [2, 10], bonds: [20, 30] }

const fmtT = (v: number) => (v < 1 ? `$${Math.round(v * 1000)}B` : `$${v.toFixed(2)}T`)

export function DebtMaturity({ d }: { d: DebtMaturityData }) {
  const [boxRef, size] = useChartSize()
  const { width: W, margin: f } = size
  const iw = W - f.left - f.right
  const narrow = W < 500

  const [focus, setFocus] = useState<BandKey | null>(null)

  const comp = useMemo(
    () => Object.fromEntries(d.composition.map((c) => [c.k, c])) as Record<BandKey, (typeof d.composition)[number]>,
    [d],
  )

  const xYears = linear([0, d.longest_instrument_years], [0, iw])
  const maxAmt = Math.max(...d.composition.map((c) => c.amount_t))
  const bandMaxH = narrow ? 56 : 84
  const scaleH = linear([0, maxAmt], [0, bandMaxH])

  const baselineY = bandMaxH + (narrow ? 26 : 34)
  const avgYears = d.avg_maturity_months / 12

  const describe = (k: BandKey): string => {
    const c = comp[k]
    const pct = c.share_pct != null ? `, ${c.share_pct}% of marketable debt (curated share, not derived from the amount)` : ''
    return `${c.label}, maturity ${c.maturity}: ${fmtT(c.amount_t)}${pct}`
  }

  const ariaLabel =
    `US marketable Treasury debt by instrument type: bills under one year, notes two to ten ` +
    `years, bonds twenty to thirty years, against a scale marking the average maturity of ` +
    `${d.avg_maturity_months} months (about ${avgYears.toFixed(0)} years) against the ` +
    `${d.longest_instrument_years}-year maximum.`

  return (
    <div ref={boxRef}>
      <Chart ariaLabel={ariaLabel} interactive width={W} height={baselineY + (narrow ? 40 : 50)} margin={f}>
        {(fr) => (
          <>
            {(Object.keys(RANGES) as BandKey[]).map((k) => {
              const [y0, y1] = RANGES[k]
              const c = comp[k]
              const x0 = xYears(y0)
              const x1 = xYears(y1)
              const h = scaleH(c.amount_t)
              const y = baselineY - h
              return (
                <g key={k}>
                  <rect
                    className="datum"
                    x={x0} y={y} width={x1 - x0} height={h}
                    fill="var(--public)"
                    tabIndex={0} role="img" aria-label={describe(k)}
                    onFocus={() => setFocus(k)} onBlur={() => setFocus(null)}
                    onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)}
                  />
                  <text x={(x0 + x1) / 2} y={y - 8} textAnchor="middle" className="maturity-label">
                    {c.label} {fmtT(c.amount_t)}{c.share_pct != null ? ` (${c.share_pct}%)` : ''}
                  </text>
                </g>
              )
            })}

            {/* ---- The axis: years to maturity, 0 to the longest instrument ---- */}
            <line x1={0} y1={baselineY} x2={iw} y2={baselineY} stroke="var(--rule)" strokeWidth={0.75} />
            {[0, 5, 10, 15, 20, 25, d.longest_instrument_years].map((t) => (
              <g key={t}>
                <line x1={xYears(t)} y1={baselineY} x2={xYears(t)} y2={baselineY + 5} stroke="var(--rule)" />
                <text x={xYears(t)} y={baselineY + 18} textAnchor="middle" className="axis-label">{t}</text>
              </g>
            ))}
            <text x={iw / 2} y={baselineY + 34} textAnchor="middle" className="axis-title">
              Years to maturity
            </text>

            {/* ---- The two markers the section is about: the DISTANCE is the finding ---- */}
            <line
              x1={xYears(avgYears)} y1={baselineY} x2={xYears(avgYears)} y2={baselineY - bandMaxH - 14}
              stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3"
            />
            <Annotation
              frame={fr}
              x={xYears(avgYears)} y={baselineY - bandMaxH - 20} anchor="middle" className="maturity-marker-label"
              label={`Average maturity, ${d.avg_maturity_months} months (about ${avgYears.toFixed(0)} years)`}
            />
            <line
              x1={xYears(d.longest_instrument_years)} y1={baselineY}
              x2={xYears(d.longest_instrument_years)} y2={baselineY - bandMaxH - 14}
              stroke="var(--ink)" strokeWidth={1}
            />
            <Annotation
              frame={fr}
              x={xYears(d.longest_instrument_years) - (narrow ? 4 : 0)} y={baselineY - bandMaxH - 20}
              anchor={narrow ? 'end' : 'middle'} className="maturity-marker-label"
              label={`Longest instrument, ${d.longest_instrument_years}-year bond`}
            />
          </>
        )}
      </Chart>

      <p aria-live="polite" className="readout">
        {focus ? describe(focus) : 'Focus or hover an instrument band to read its value.'}
      </p>

      <TableView
        caption="Maturity structure of marketable Treasury debt"
        columns={[
          { key: 'instrument', label: 'Instrument', unit: 'type' },
          { key: 'range', label: 'Maturity range', unit: 'years' },
          { key: 'amount', label: 'Amount outstanding', unit: '$ trillions' },
          { key: 'share', label: 'Share of marketable debt', unit: 'percent' },
        ]}
        rows={d.composition.map((c) => ({
          instrument: c.label,
          range: c.maturity,
          amount: c.amount_t.toFixed(1),
          // Only bills carries a curated share; notes/bonds are 'no data', never
          // a percentage derived from the amount over the marketable total (EC3).
          share: c.share_pct ?? null,
        }))}
      />
    </div>
  )
}
