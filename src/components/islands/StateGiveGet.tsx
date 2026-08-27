/** Section 11: which states give more to the federal government than they get
 *  back, and which get more than they give.
 *
 *  "Give" is IRS gross tax collections classified by filer address. "Get" is
 *  USASpending award spending classified by place of performance. Both are
 *  FY-matched by construction (see pipeline/monthly/states.py), but this is
 *  NOT a balance of payments on either side — the three trap paragraphs that
 *  say so live in the page body (src/pages/government/index.astro), never
 *  here or in a tooltip.
 *
 *  Chart.tsx is not reused: it paints an x/y plot area and margin frame for a
 *  cartesian chart, which a tile grid has no use for.
 */
import { useMemo, useState } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
// stateGrid.ts supplies TILES (each jurisdiction's grid position) and
// divergingFill (the non-partisan amber/stone/teal colour ramp).
import { TILES, divergingFill } from '../charts/stateGrid'
import { useRovingMarks } from '../charts/roving'
import { useScrollableRegion } from './scrollRegion'
import { dollars } from '../charts/format'
import type { StateJurisdiction, StatesBalance } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed — see `figureLabel.ts` (#72). */
const FIGURE = 'state-give-get'

type Basis = 'per_capita' | 'absolute'

// Labels are lower case deliberately: they double as the exact phrase used in
// every tile's aria-label and the live-region readout ("... per person" /
// "... in total"), so hover, focus and the toggle button all describe the
// basis with the same words.
const BASES: { value: Basis; label: string }[] = [
  { value: 'per_capita', label: 'per person' },
  { value: 'absolute', label: 'in total' },
]

const TILE = 36
const GAP = 2
const PITCH = TILE + GAP
const ORIGIN_X = 8
const ORIGIN_Y = 8

/** Whole-dollar totals in $ billions, e.g. "$39.6 billion". Kept local rather
 *  than added to charts/format.ts: that module's formatters are trillion- or
 *  bare-percent-scaled and this section's totals are billions. */
function billions(v: number): string {
  return `$${v.toFixed(1)} billion`
}

function perPerson(v: number): string {
  return `${dollars(v)} per person`
}

function describe(j: StateJurisdiction, basis: Basis): string {
  if (j.give_b == null || j.get_b == null) {
    return j.get_b == null && j.give_b == null
      ? 'no data'
      : j.give_b == null
        ? `receives ${basis === 'per_capita' ? perPerson(j.get_pc ?? 0) : billions(j.get_b ?? 0)} in federal award spending; no IRS collections figure exists for this jurisdiction`
        : `pays ${basis === 'per_capita' ? perPerson(j.give_pc ?? 0) : billions(j.give_b)} in gross federal collections; no award-spending figure exists for this jurisdiction`
  }
  const get = basis === 'per_capita' ? perPerson(j.get_pc ?? 0) : billions(j.get_b)
  const give = basis === 'per_capita' ? perPerson(j.give_pc ?? 0) : billions(j.give_b)
  const bal = basis === 'per_capita' ? (j.balance_pc ?? 0) : (j.balance_b ?? 0)
  const net = basis === 'per_capita' ? perPerson(Math.abs(bal)) : billions(Math.abs(bal))
  const dir = bal > 0 ? 'more than it pays' : bal < 0 ? 'less than it pays' : 'exactly what it pays'
  return `receives ${get} and pays ${give}, a net ${net} ${dir}`
}

function markFor(j: StateJurisdiction): string {
  if (j.balance_pc == null) return '?'
  if (j.balance_pc > 0) return '+'
  if (j.balance_pc < 0) return '−'
  return '·'
}

type SortKey = 'code' | 'give_b' | 'get_b' | 'balance_b' | 'ratio'
type SortDir = 'asc' | 'desc'

export function StateGiveGet({ data }: { data: StatesBalance }) {
  const [basis, setBasis] = useState<Basis>('per_capita')
  const [focused, setFocused] = useState<string | null>(null)
  const { groupProps, mark } = useRovingMarks()
  const [sortKey, setSortKey] = useState<SortKey>('balance_b')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const gridJurisdictions = useMemo(
    () => data.jurisdictions.filter((j) => j.in_grid),
    [data.jurisdictions],
  )
  const bound = Math.max(Math.abs(data.color_domain.min), Math.abs(data.color_domain.max))
  const active = focused ? data.jurisdictions.find((j) => j.code === focused) ?? null : null

  const sorted = useMemo(() => {
    const rows = [...data.jurisdictions]
    const key = sortKey
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key]
      const bv = (b as unknown as Record<string, unknown>)[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1)
      }
      return ((av as number) - (bv as number)) * (sortDir === 'asc' ? 1 : -1)
    })
    return rows
  }, [data.jurisdictions, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'code', label: 'Jurisdiction' },
    { key: 'give_b', label: 'Gives (gross collections)' },
    { key: 'get_b', label: 'Gets (award spending)' },
    { key: 'balance_b', label: 'Net balance' },
    { key: 'ratio', label: 'Get / give ratio' },
  ]

  const findingLabel =
    `Federal gross tax collections against federal award spending by state, FY${data.fy_give}. ` +
    `${data.summary.n_get_more} jurisdictions receive more than they pay and ` +
    `${data.summary.n_give_more} pay more than they receive.`

  // Lifted out of the JSX so the accessible name of the scroll region and the
  // visible <caption> cannot drift apart (#71).
  const caption = `Every jurisdiction: 50 states, DC and territories, FY${data.fy_give} give against get`
  const scroll = useScrollableRegion(caption)

  return (
    <div>
      <div className="controls">
        <span className="controls-label" id="state-basis">Measured</span>
        <ToggleGroup.Root
          type="single"
          value={basis}
          onValueChange={(v) => v && setBasis(v as Basis)}
          aria-labelledby={labelledByFigure(FIGURE, 'state-basis')}
          className="basis-toggle"
        >
          {BASES.map((b) => (
            <ToggleGroup.Item
              key={b.value}
              value={b.value}
              data-basis={b.value}
              className="basis-toggle-item"
            >
              {b.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <svg
        {...groupProps}
        role="group"
        aria-label={findingLabel}
        viewBox="0 0 440 320"
        preserveAspectRatio="xMidYMid meet"
        className="chart state-grid"
      >
        {gridJurisdictions.map((j) => {
          const pos = TILES[j.code]
          if (!pos) return null
          const x = ORIGIN_X + pos.col * PITCH
          const y = ORIGIN_Y + pos.row * PITCH
          const isFocused = focused === j.code
          return (
            <g
              key={j.code}
              data-state-tile={j.code}
              {...mark()}
              role="img"
              aria-label={`${j.name}: ${describe(j, basis)}`}
              onFocus={() => setFocused(j.code)}
              onBlur={() => setFocused(null)}
              onMouseEnter={() => setFocused(j.code)}
              onMouseLeave={() => setFocused(null)}
              className="state-tile"
            >
              <rect
                x={x} y={y} width={TILE} height={TILE}
                fill={divergingFill(j.balance_pc, bound)}
                stroke={isFocused ? 'var(--ink)' : 'none'}
                strokeWidth={isFocused ? 2 : 0}
              />
              <text x={x + TILE / 2} y={y + TILE / 2 - 3} textAnchor="middle" className="state-tile-code">
                {j.code}
              </text>
              <text x={x + TILE / 2} y={y + TILE / 2 + 12} textAnchor="middle" className="state-tile-mark">
                {markFor(j)}
              </text>
            </g>
          )
        })}
      </svg>

      <p aria-live="polite" className="readout readout-state">
        {active ? `${active.name}: ${describe(active, basis)}` : <ChartHint noun="tile" />}
      </p>

      <div className="state-legend">
        <span className="state-legend-swatch" style={{ background: divergingFill(-bound, bound) }} />
        <span>Gives more, up to {basis === 'per_capita' ? perPerson(bound) : 'the state maximum'}</span>
        <span className="state-legend-swatch" style={{ background: divergingFill(0, bound) }} />
        <span>Even</span>
        <span className="state-legend-swatch" style={{ background: divergingFill(bound, bound) }} />
        <span>Gets more, up to {basis === 'per_capita' ? perPerson(bound) : 'the state maximum'}</span>
      </div>
      <p className="prose">
        Midpoint: zero net balance, equivalently $1.00 received per $1.00 paid. Washington DC is
        drawn but excluded from the colour range; its balance is an outlier by construction. Grid
        squares are equal size regardless of population or land area: the shape is a locator, not
        a measure.
      </p>

      <div className="tableview-scroll" {...scroll}>
        <table className="sortable-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={
                  sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }>
                  <button type="button" className="sort-button" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((j) => (
              <tr key={j.code} data-jur-row={j.code}>
                <th scope="row">{j.name} ({j.code})</th>
                <td>{j.give_b == null ? 'no data' : billions(j.give_b)}</td>
                <td>{j.get_b == null ? 'no data' : billions(j.get_b)}</td>
                <td>{j.balance_b == null ? 'no data' : billions(j.balance_b)}</td>
                <td>{j.ratio == null ? 'no data' : j.ratio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
