/** Section 11 companion: what each state's own tax collections are made of.
 *
 *  A Census 'X' means a state does not levy that tax at all (Alaska has no
 *  general sales tax) — a FACT, never rendered the same way as a genuinely
 *  missing figure. See docs/contracts/interfaces/state-data.md.
 */
import { useMemo, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { TableView, type Column } from './TableView'
import { useRovingMarks } from '../charts/roving'
import type { StatesTaxMix, TaxMixJurisdiction } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

function cellText(j: TaxMixJurisdiction, k: string): string {
  const v = j.shares[k]
  if (v != null) return `${v.toFixed(1)}%`
  return j.not_levied.includes(k) ? 'none levied' : 'no data'
}

export function StateTaxMix({ data }: { data: StatesTaxMix }) {
  const jurisdictions = data.jurisdictions
  const [code, setCode] = useState(jurisdictions.find((j) => j.code !== 'DC')?.code ?? jurisdictions[0].code)
  const [focusedK, setFocusedK] = useState<string | null>(null)
  const { groupProps, mark } = useRovingMarks()

  const selected = useMemo(
    () => jurisdictions.find((j) => j.code === code) ?? jurisdictions[0],
    [jurisdictions, code],
  )

  const segments = data.categories.map((cat) => ({
    ...cat,
    value: selected.shares[cat.k],
    notLevied: selected.not_levied.includes(cat.k),
  }))

  const readout = focusedK
    ? (() => {
        const cat = data.categories.find((c) => c.k === focusedK)!
        return `${selected.name}, ${cat.label}: ${cellText(selected, cat.k)} of total state tax collections`
      })()
    : <ChartHint noun="segment" />

  const columns: Column[] = [
    { key: 'name', label: 'Jurisdiction', unit: '' },
    { key: 'total_b', label: 'Total state tax collections', unit: '$ billions' },
    ...data.categories.map((c) => ({ key: c.k, label: c.label, unit: 'percent of total' })),
  ]

  const rows = jurisdictions.map((j) => ({
    name: `${j.name} (${j.code})`,
    total_b: j.total_b == null ? null : j.total_b.toFixed(1),
    ...Object.fromEntries(data.categories.map((c) => [c.k, cellText(j, c.k)])),
  }))

  return (
    <div>
      <div className="controls">
        <span className="controls-label" id="tax-mix-state">Jurisdiction</span>
        <Select.Root value={code} onValueChange={setCode}>
          <Select.Trigger className="tax-mix-select" aria-labelledby="tax-mix-state">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            {/* `collisionPadding` is what `--radix-select-content-available-width`
                is measured against, and that var is the `max-width` clamp in
                `.tax-mix-select-content` — the two ship together, as in
                `Select.tsx` (#62). `avoidCollisions` keeps its default `true`. */}
            <Select.Content
              className="tax-mix-select-content"
              position="popper"
              collisionPadding={8}
            >
              <Select.Viewport>
                {jurisdictions.map((j) => (
                  <Select.Item key={j.code} value={j.code} className="tax-mix-select-item">
                    <Select.ItemText>{j.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <svg
        {...groupProps}
        role="group"
        aria-label={`${selected.name}'s state tax collections by category, FY${data.fy}, as a share of its own total.`}
        viewBox="0 0 440 60"
        preserveAspectRatio="xMidYMid meet"
        className="chart tax-mix-bar"
      >
        {(() => {
          let x = 0
          return segments.map((seg, i) => {
            const pct = seg.value ?? 0
            const w = (pct / 100) * 440
            const rect = (
              <g
                key={seg.k}
                {...mark()}
                role="img"
                aria-label={`${seg.label}: ${cellText(selected, seg.k)}`}
                onFocus={() => setFocusedK(seg.k)}
                onBlur={() => setFocusedK(null)}
                onMouseEnter={() => setFocusedK(seg.k)}
                onMouseLeave={() => setFocusedK(null)}
              >
                <rect
                  x={x} y={10} width={Math.max(w, seg.notLevied ? 0 : 1)} height={40}
                  fill={i % 2 === 0 ? 'var(--disc)' : 'var(--int)'}
                  opacity={focusedK === seg.k ? 1 : 0.85}
                  stroke={focusedK === seg.k ? 'var(--ink)' : 'none'}
                  strokeWidth={focusedK === seg.k ? 2 : 0}
                />
              </g>
            )
            x += w
            return rect
          })
        })()}
      </svg>

      <p aria-live="polite" className="readout readout-state">{readout}</p>

      <TableView
        caption={`State tax collections by category as a share of each jurisdiction's own total, FY${data.fy}`}
        columns={columns}
        rows={rows}
      />
    </div>
  )
}
