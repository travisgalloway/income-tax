/** Section 8: the law explorer.
 *
 *  A deficit-as-share-of-GDP chart with every law's enactment date marked,
 *  above a sortable/filterable table of all 23 laws driven by COUNTED
 *  per-party votes (`src/data/party_splits.json`), joined on `public_law`.
 *  This replaces the retired PLR/PLD/XP classification derived from
 *  published vote character, see `docs/contracts/interfaces/law-data.md`.
 *
 *  `client:load`, not `client:visible` (see the page and the plan's Risks):
 *  Astro still server-renders this markup, so the chart, all 23 rows, the
 *  threshold text and the footnotes are present with JavaScript disabled;
 *  only filtering, sorting, selection and the basis toggle are inert. */
import { useMemo, useState } from 'react'
import { Area, AreaChart } from 'recharts'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { Annotation } from '../charts/Annotation'
import { ZeroLine } from '../charts/Axis'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  PlotYAxis,
  SURFACE_DEFAULTS,
  useFrame,
} from '../charts/RechartsFrame'
import { TableView } from './TableView'
import { useScrollableRegion } from './scrollRegion'
import { Select, type SelectOption } from './Select'
import {
  chamberLine,
  compareNullsLast,
  controlLabel,
  filterLaws,
  fyPosition,
  margin as computeMargin,
  scoreOf,
  totalsOf,
  type Basis,
  type Filters,
} from '../laws/derive'
import { joinLawsToSplits, type Row } from '../laws/join'
import type { BudgetYear, Law, PartySplit } from '../../data/types'
import { labelledByFigure } from './figureLabel'
import { ChartHint } from '../charts/ChartHint'

/** This island's figure in `src/data/figures.ts`. Its accessible name is derived from
 *  this key rather than typed, see `figureLabel.ts` (#72). */
const FIGURE = 'law-explorer'

const FY_START = 1995
const FY_END = 2025

/** The chart spans the curated window whatever the data holds, so the domain is
 *  declared rather than derived. Module scope, because rule 1 in
 *  `../charts/RechartsFrame.tsx` compares an axis prop by reference. */
const FY_DOMAIN: [number, number] = [FY_START, FY_END]
const X_FORMAT = (t: number) => `FY${t}`
const Y_FORMAT = (v: number) => `${v.toFixed(0)}%`

type SortKey = 'date' | 'cost' | 'margin'
type SortDir = 'asc' | 'desc'

const CHARACTER_LABEL: Record<string, string> = {
  'cross-party': 'Cross-party',
  'party-line': 'Party-line',
}

/** Shared by the table's House cell and the chart's live-region readout, so
 *  the two never disagree (C3). Never `0-0`, never blank, never "unanimous". */
function houseCellText(split: PartySplit, basis: Basis): string {
  if (split.house == null) return 'no roll call, passed the House by voice vote'
  return chamberLine(split.house, basis) ?? 'no data'
}

/** Shared by the table's Senate cell and the readout. A 50-50 tie is a PASS
 *  (Vice President's tiebreak), never rendered as a failure (E3). */
function senateCellText(split: PartySplit, basis: Basis): string {
  if (split.senate == null) return 'no data'
  const line = chamberLine(split.senate, basis) ?? 'no data'
  if (split.senate.yea === split.senate.nay) {
    return `${line} · 50-50, passed on the Vice President's tiebreak (not in the roll call)`
  }
  return line
}

function scoreCellText(law: Law): string {
  return law.score_t == null ? 'no score' : `$${law.score_t.toFixed(2)}T`
}

function fyReadout(r: BudgetYear): string {
  const kind = r.g_de >= 0 ? 'surplus' : 'deficit'
  const count = r.L.length
  return `Fiscal year ${r.y}: ${Math.abs(r.g_de).toFixed(1)}% of GDP ${kind}, ${count} law${count === 1 ? '' : 's'} enacted`
}

function lawReadout(r: Row, basis: Basis): string {
  const scoreText = r.law.score_t == null
    ? 'no ten-year score (predates the scoring convention)'
    : `$${r.law.score_t.toFixed(2)}T ten-year score`
  return (
    `${r.law.name}, enacted ${r.law.date}. ${scoreText}. ` +
    `House ${houseCellText(r.split, basis)}. Senate ${senateCellText(r.split, basis)}.`
  )
}

function totalsLine(t: ReturnType<typeof totalsOf>): string {
  const base = `${t.count} law${t.count === 1 ? '' : 's'} · $${t.totalT.toFixed(2)}T scored`
  return t.unscoredCount === 0
    ? `${base} · 0 unscored`
    : `${base} · ${t.unscoredCount} unscored, excluded from the total`
}

export function LawExplorer({
  years,
  laws,
  splits,
  threshold,
}: {
  years: BudgetYear[]
  laws: Law[]
  splits: PartySplit[]
  /** `partySplits._meta.cross_party_threshold`, rendered verbatim (D7). Passed
   *  in rather than duplicated here, so the UI text cannot drift from the
   *  dataset that defines it. */
  threshold: string
}) {
  const rows: Row[] = useMemo(() => joinLawsToSplits(laws, splits), [laws, splits])
  /** The CARES Act's `‡` note. A single-split lookup, not a laws-to-splits
   *  join, so it does not go through `join.ts`. */
  const caresNote = useMemo(() => splits.find((s) => s.public_law === '116-136')?.note, [splits])

  const [basis, setBasis] = useState<Basis>('caucus')
  const [filters, setFilters] = useState<Filters>({ character: 'all', president: 'all', control: 'all' })
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'asc' })
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [focusFy, setFocusFy] = useState<number | null>(null)

  const filtered = useMemo(() => filterLaws(rows, filters), [rows, filters])
  // One string for the visible <caption> and the scroll region's accessible
  // name, so the two cannot drift apart (#71).
  const lawTableCaption = 'All 23 major deficit-moving laws, 1997 to 2025'
  const scroll = useScrollableRegion(lawTableCaption)

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      if (sort.key === 'date') {
        return sort.dir === 'asc' ? a.law.date.localeCompare(b.law.date) : b.law.date.localeCompare(a.law.date)
      }
      if (sort.key === 'cost') {
        return compareNullsLast(scoreOf(a.law), scoreOf(b.law), sort.dir)
      }
      return compareNullsLast(computeMargin(a.split), computeMargin(b.split), sort.dir)
    })
    return copy
  }, [filtered, sort])
  const totals = useMemo(() => totalsOf(filtered), [filtered])

  const activePl = selected ?? preview
  const activeRow = activePl ? rows.find((r) => r.law.public_law === activePl) ?? null : null

  const hasActiveFilter = filters.character !== 'all' || filters.president !== 'all' || filters.control !== 'all'
  function clearFilters() {
    setFilters({ character: 'all', president: 'all', control: 'all' })
  }
  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }
  function ariaSortFor(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sort.key !== key) return 'none'
    return sort.dir === 'asc' ? 'ascending' : 'descending'
  }

  const characterOptions: SelectOption[] = useMemo(() => {
    const distinct = Array.from(new Set(rows.map((r) => r.split.character))).sort()
    return [
      { value: 'all', label: 'All vote characters' },
      ...distinct.map((c) => ({ value: c, label: CHARACTER_LABEL[c] ?? c })),
    ]
  }, [rows])

  const byEnactment = useMemo(() => [...rows].sort((a, b) => a.law.date.localeCompare(b.law.date)), [rows])

  const presidentOptions: SelectOption[] = useMemo(() => {
    const seen: string[] = []
    for (const r of byEnactment) if (!seen.includes(r.law.president)) seen.push(r.law.president)
    return [{ value: 'all', label: 'All presidents' }, ...seen.map((p) => ({ value: p, label: p }))]
  }, [byEnactment])

  const controlOptions: SelectOption[] = useMemo(() => {
    const seen: string[] = []
    for (const r of byEnactment) if (!seen.includes(r.law.control_at_enactment)) seen.push(r.law.control_at_enactment)
    return [
      { value: 'all', label: 'All control configurations' },
      ...seen.map((c) => ({ value: c, label: `${controlLabel(c)} (${c})` })),
    ]
  }, [byEnactment])

  const activeFilterLabels: string[] = []
  if (filters.character !== 'all') activeFilterLabels.push(CHARACTER_LABEL[filters.character] ?? filters.character)
  if (filters.president !== 'all') activeFilterLabels.push(filters.president)
  if (filters.control !== 'all') activeFilterLabels.push(`${controlLabel(filters.control)} (${filters.control})`)

  // ---- Chart ----------------------------------------------------------
  const shownYears = useMemo(() => years.filter((y) => y.y >= FY_START && y.y <= FY_END), [years])
  const yearByFy = useMemo(() => new Map(shownYears.map((r) => [r.y, r])), [shownYears])

  const deficits = useMemo(() => shownYears.map((r) => r.g_de), [shownYears])
  const {
    boxRef,
    size,
    f,
    narrow,
    yDomain,
    x,
    y,
    xTicks,
    yTicks,
    chartMargin,
    chartStyle,
    surfaceRef,
    wrapperProps,
    mark,
  } = useFrame({
    rows: shownYears,
    xOf: (r) => r.y,
    yValues: deficits,
    xDomain: FY_DOMAIN,
  })
  const yZero = y(0)

  const readoutText = activeRow
    ? lawReadout(activeRow, basis)
    : focusFy != null && yearByFy.get(focusFy)
      ? fyReadout(yearByFy.get(focusFy)!)
      : <ChartHint noun="fiscal year or a law" />

  const chartAriaLabel =
    'Federal deficit or surplus as a percent of GDP, fiscal year 1995 to 2025, with the enactment ' +
    'date of each of the twenty-three major deficit-moving laws marked; selecting a law in the ' +
    'table below highlights its enactment date on this timeline.'

  return (
    <div ref={boxRef}>
      <div className="controls">
        <span className="controls-label" id="law-basis">
          Democratic votes shown
        </span>
        <ToggleGroup.Root
          type="single"
          value={basis}
          onValueChange={(v) => v && setBasis(v as Basis)}
          aria-labelledby={labelledByFigure(FIGURE, 'law-basis')}
          className="unit-toggle"
        >
          <ToggleGroup.Item value="caucus" className="unit-toggle-item">
            Caucus, incl. independents (D+I)
          </ToggleGroup.Item>
          <ToggleGroup.Item value="party" className="unit-toggle-item">
            Party membership (D)
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <p className="prose">
        Democratic votes are shown on the caucus basis by default: independents who caucus with the
        Democrats are counted with them. Party membership and caucus differ by two Senate seats
        through most of this period.
      </p>

      <div {...wrapperProps}>
        <AreaChart
          ref={surfaceRef}
          data={shownYears}
          width={size.width}
          height={size.height}
          margin={chartMargin}
          {...SURFACE_DEFAULTS}
          aria-label={chartAriaLabel}
          style={chartStyle}
        >
          <PlotGrid />
          <PlotXAxis
            domain={FY_DOMAIN}
            ticks={xTicks}
            gutter={size.margin.bottom}
            unit="Fiscal year"
            format={X_FORMAT}
          />
          <PlotYAxis
            domain={yDomain}
            ticks={yTicks}
            gutter={size.margin.left}
            unit="Percent of GDP"
            format={Y_FORMAT}
          />

          {/* The deficit runs below zero, so the fill is anchored at zero
              rather than at the axis floor. */}
          <Area
            type="monotone"
            dataKey="g_de"
            baseValue={0}
            stroke="var(--ink)"
            strokeWidth={2}
            fill="var(--ink)"
            fillOpacity={0.1}
            isAnimationActive={false}
            activeDot={false}
            dot={false}
            connectNulls={false}
          />

          {/* The zero line, the 23 event markers and every focusable point sit
              on the fill, so they go through the overlay: a plain child
              renders under the area fill. */}
          <PlotOverlay margin={f.margin}>
            <ZeroLine frame={f} y={yZero} />

            {/* All 23 enactment dates, marked faintly. */}
            {rows
              .filter((r) => r.law.public_law !== activePl)
              .map((r) => {
                const px = x(fyPosition(r.law.date))
                return (
                  <line
                    key={r.law.public_law}
                    x1={px}
                    x2={px}
                    y1={0}
                    y2={f.innerHeight}
                    stroke="var(--rule)"
                    strokeWidth={1}
                  />
                )
              })}

            {/* The selected (or previewed) law's enactment date, in full. */}
            {activeRow &&
              (() => {
                const px = x(fyPosition(activeRow.law.date))
                return (
                  <g>
                    <line x1={px} x2={px} y1={0} y2={f.innerHeight} stroke="var(--mix)" strokeWidth={1.5} />
                    <circle cx={px} cy={2} r={3} fill="var(--mix)" />
                    {!narrow && (
                      <Annotation
                        frame={f}
                        x={px + 6}
                        y={12}
                        fill="var(--mix)"
                        label={`${activeRow.law.name}, ${activeRow.law.date}`}
                      />
                    )}
                    <title>{`${activeRow.law.name}, ${activeRow.law.date}`}</title>
                  </g>
                )
              })()}

            {/* Every fiscal-year point is Tab-focusable and reports the same
               text hover does, via the shared fyReadout formatter (C3). The
               hit-target circle keeps a constant radius so hovering the
               focused state does not shrink out from under the pointer and
               flicker; the visible marker is a separate, non-interactive
               circle layered on top. */}
            {shownYears.map((r) => (
              <g key={r.y}>
                <circle
                  className="datum"
                  cx={x(r.y)}
                  cy={y(r.g_de)}
                  r={9}
                  fill="transparent"
                  {...mark()}
                  role="img"
                  aria-label={fyReadout(r)}
                  onFocus={() => setFocusFy(r.y)}
                  onBlur={() => setFocusFy(null)}
                  onMouseEnter={() => setFocusFy(r.y)}
                  onMouseLeave={() => setFocusFy(null)}
                />
                {focusFy === r.y && (
                  <circle
                    cx={x(r.y)}
                    cy={y(r.g_de)}
                    r={5}
                    fill="var(--ink)"
                    pointerEvents="none"
                  />
                )}
              </g>
            ))}
          </PlotOverlay>
        </AreaChart>
      </div>

      <p aria-live="polite" className="readout">
        {readoutText}
      </p>

      <TableView
        caption="Annual deficit or surplus as a share of GDP, with major laws enacted"
        columns={[
          { key: 'y', label: 'Fiscal year', unit: 'FY' },
          { key: 'de', label: 'Deficit or surplus', unit: 'percent of GDP' },
          { key: 'laws', label: 'Laws enacted', unit: 'count' },
        ]}
        rows={shownYears.map((r) => ({ y: r.y, de: r.g_de.toFixed(1), laws: r.L.length }))}
      />

      <div className="filters">
        <Select
          id="filter-character"
          label="Vote character"
          value={filters.character}
          options={characterOptions}
          onChange={(v) => setFilters((f) => ({ ...f, character: v }))}
        />
        <Select
          id="filter-president"
          label="Signing president"
          value={filters.president}
          options={presidentOptions}
          onChange={(v) => setFilters((f) => ({ ...f, president: v }))}
        />
        <Select
          id="filter-control"
          label="Control at enactment"
          value={filters.control}
          options={controlOptions}
          onChange={(v) => setFilters((f) => ({ ...f, control: v }))}
        />
        {hasActiveFilter && (
          <button type="button" className="clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <p className="prose">{threshold}</p>
      <p className="totals-line">{totalsLine(totals)}</p>

      {sorted.length === 0 ? (
        <p className="empty-state">
          No law matches{' '}
          {activeFilterLabels.map((l, i) => (
            <span key={l}>
              {i > 0 && ', '}
              <em>{l}</em>
            </span>
          ))}
          . Clear a filter to see the other {rows.length}.
        </p>
      ) : (
        <div className="law-table-scroll" {...scroll}>
          <table className="law-table">
            <caption>{lawTableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">Law</th>
                <th scope="col">
                  Public law<span className="unit">PL</span>
                </th>
                <th scope="col" aria-sort={ariaSortFor('date')}>
                  <button type="button" className="sort-button" onClick={() => toggleSort('date')}>
                    Enacted<span className="unit">date</span>
                  </button>
                </th>
                <th scope="col" aria-sort={ariaSortFor('cost')}>
                  <button type="button" className="sort-button" onClick={() => toggleSort('cost')}>
                    Ten-year score<span className="unit">$ trillions, at enactment</span>
                  </button>
                </th>
                <th scope="col">
                  House<span className="unit">R yea-nay · D yea-nay</span>
                </th>
                <th scope="col">
                  Senate<span className="unit">R yea-nay · D yea-nay</span>
                </th>
                <th scope="col" aria-sort={ariaSortFor('margin')}>
                  <button type="button" className="sort-button" onClick={() => toggleSort('margin')}>
                    Margin<span className="unit">narrowest chamber, yea minus nay</span>
                  </button>
                </th>
                <th scope="col">
                  Character<span className="unit">counted</span>
                </th>
                <th scope="col">
                  Control at enactment<span className="unit">president · House · Senate</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isSelected = selected === r.law.public_law
                const m = computeMargin(r.split)
                const swatchClass =
                  r.split.character === 'party-line'
                    ? r.law.president_party === 'D'
                      ? 'swatch-dem'
                      : 'swatch-gop'
                    : 'swatch-mix'
                return (
                  <tr key={r.law.public_law ?? r.law.name}>
                    <th scope="row">
                      <button
                        type="button"
                        className="law-name-button"
                        aria-pressed={isSelected}
                        onFocus={() => setPreview(r.law.public_law)}
                        onMouseEnter={() => setPreview(r.law.public_law)}
                        onMouseLeave={() => setPreview(null)}
                        onBlur={() => setPreview(null)}
                        onClick={() => setSelected((s) => (s === r.law.public_law ? null : r.law.public_law))}
                      >
                        {r.law.name}
                      </button>
                    </th>
                    <td>
                      <span className="num">{r.law.public_law}</span>
                    </td>
                    <td>{r.law.date}</td>
                    <td>
                      {scoreCellText(r.law)}
                      {r.law.score_t == null && <sup>†</sup>}
                    </td>
                    <td className="vote-cell">
                      {houseCellText(r.split, basis)}
                      {r.split.house == null && <sup>‡</sup>}
                    </td>
                    <td className="vote-cell">{senateCellText(r.split, basis)}</td>
                    <td>
                      <span className="num">{m == null ? 'no data' : m}</span>
                    </td>
                    <td>
                      {CHARACTER_LABEL[r.split.character] ?? r.split.character}
                      <span className={`character-swatch ${swatchClass}`} aria-hidden="true" />
                    </td>
                    <td>
                      {controlLabel(r.law.control_at_enactment)}{' '}
                      <span className="num">({r.law.control_at_enactment})</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="prose footnote">
        <sup>†</sup> The two 1997 laws (Balanced Budget Act, Taxpayer Relief Act) predate the
        ten-year scoring convention and carry no score. They are excluded from every displayed
        total, and still carry their counted vote.
      </p>
      <p className="prose footnote">
        <sup>‡</sup> {caresNote}
      </p>
    </div>
  )
}
