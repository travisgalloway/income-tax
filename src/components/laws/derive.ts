/** Pure derivations shared by `LawExplorer.tsx` and its table.
 *
 *  Kept out of the component deliberately: every number the §8 section prints
 *  (the $7.51T / $9.24T totals, the counted margin, the fiscal-year marker
 *  position) is derived here, in one place a reviewer can read without also
 *  reading JSX, and the same functions back the pytest assertions in
 *  `pipeline/tests/test_pipeline.py`. */
import type { ChamberVote, Law, PartySplit } from '../../data/types'
import type { Row } from './join'

export type Basis = 'party' | 'caucus'

export interface Filters {
  character: string
  president: string
  control: string
}

export interface Totals {
  count: number
  scoredCount: number
  unscoredCount: number
  totalT: number
}

/** Federal fiscal year: FY starts 1 October of the PRIOR calendar year. */
export function enactmentFy(date: string): number {
  const [y, m] = date.split('-').map(Number)
  return m >= 10 ? y + 1 : y
}

function fyStartUtc(fy: number): number {
  return Date.UTC(fy - 1, 9, 1) // 1 Oct of the prior calendar year
}

function daysInFy(fy: number): number {
  return (fyStartUtc(fy + 1) - fyStartUtc(fy)) / 86_400_000
}

/**
 * The fractional FY x-coordinate for an enactment-date marker.
 *
 * The chart is annual (one point per fiscal year, plotted at its FY number)
 * but a marker is a date, so it is placed WITHIN its fiscal year rather than
 * on the year's tick: the result sits in `[fy - 1, fy)`. This convention is
 * stated in the Figure's `note` so a reader who disagrees can see it.
 */
export function fyPosition(date: string): number {
  const fy = enactmentFy(date)
  const elapsedDays = (Date.parse(`${date}T00:00:00Z`) - fyStartUtc(fy)) / 86_400_000
  return fy - 1 + elapsedDays / daysInFy(fy)
}

/** The vote tally shown for "the Democrats," on the stated basis.
 *  `'party'` is membership only; `'caucus'` folds in caucusing independents,
 *  which is the convention the House Clerk, Senate roll calls and the press
 *  all use, and this island's default. */
export function demVote(v: ChamberVote, basis: Basis) {
  return basis === 'caucus' ? v.d_caucus : v.d
}

/** `R yea-nay · D yea-nay`, plus an `I` line on the party-membership basis
 *  when independents cast any vote (the caucus basis folds them into `D`).
 *  `null` for a null chamber, NEVER a string; callers decide how "no roll
 *  call" reads (never `0-0`, never blank, never "unanimous"). */
export function chamberLine(v: ChamberVote | null, basis: Basis): string | null {
  if (v == null) return null
  const dem = demVote(v, basis)
  const parts = [`R ${v.r.yea}-${v.r.nay}`, `D ${dem.yea}-${dem.nay}`]
  if (basis === 'party' && (v.i.yea > 0 || v.i.nay > 0)) {
    parts.push(`I ${v.i.yea}-${v.i.nay}`)
  }
  return parts.join(' · ')
}

/** The narrowest passage margin across chambers that HAVE a roll call: the
 *  min, over non-null chambers, of `yea - nay`. This is the COUNTED margin
 *  used for sorting (D6), the derived `character` field is never a sort
 *  key. CARES therefore sorts on its Senate margin (96) rather than dropping
 *  out for want of a House roll call. */
export function margin(s: PartySplit): number | null {
  const chambers = [s.house, s.senate].filter((v): v is ChamberVote => v != null)
  if (chambers.length === 0) return null
  return Math.min(...chambers.map((v) => v.yea - v.nay))
}

/** Passthrough so the null case (the two 1997 laws, which predate the
 *  ten-year scoring convention) has one named home. */
export function scoreOf(l: Law): number | null {
  return l.score_t
}

const PARTY_NAME: Record<string, string> = { D: 'Democratic', R: 'Republican' }

/** `'DRR'` -> `'Democratic president · Republican House · Republican Senate'`.
 *  Callers show the raw code alongside this, in a `<span class="num">`. */
export function controlLabel(code: string): string {
  const [p, h, s] = code.split('')
  return `${PARTY_NAME[p] ?? p} president · ${PARTY_NAME[h] ?? h} House · ${PARTY_NAME[s] ?? s} Senate`
}

export function filterLaws(rows: Row[], f: Filters): Row[] {
  return rows.filter(
    (r) =>
      (f.character === 'all' || r.split.character === f.character) &&
      (f.president === 'all' || r.law.president === f.president) &&
      (f.control === 'all' || r.law.control_at_enactment === f.control),
  )
}

/** `totalT` sums only laws with a non-null `score_t` (E2/D4): the two 1997
 *  laws are excluded from every displayed total while remaining in `count`
 *  and visible with their votes. Formatted with `toFixed(2)`, which is what
 *  yields the published `7.51` / `9.24`. */
export function totalsOf(rows: Row[]): Totals {
  let scoredCount = 0
  let totalT = 0
  for (const r of rows) {
    if (r.law.score_t != null) {
      scoredCount += 1
      totalT += r.law.score_t
    }
  }
  return { count: rows.length, scoredCount, unscoredCount: rows.length - scoredCount, totalT }
}

/** Ascending/descending comparator with nulls sorted LAST in both directions
 *  (E2), a documented, stable rule, not `?? 0`, which would silently rank a
 *  missing score as if it were zero. */
export function compareNullsLast(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a - b : b - a
}
