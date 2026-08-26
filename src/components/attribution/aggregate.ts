/** Section 9: the same $16.75 trillion, two ways.
 *
 *  Pure derivation, no React and no DOM. Joins `laws` (src/data/index.ts) to
 *  the counted per-party roll-call splits (src/data/party_splits.json) on
 *  `public_law` — through `../laws/join`, the one implementation of that join,
 *  shared with §8's law explorer — drops the two laws that predate the ten-year scoring
 *  convention, and buckets the rest two ways: by the counted voting coalition
 *  and by the signing president. Both ways must land on the same total, to the
 *  cent — see the invariant thrown at the bottom of this module.
 *
 *  Astro imports this module while prerendering (via AttributionSplit.tsx), so
 *  a drift between the two breakdowns fails `npm run build`. It cannot ship.
 *  This is the same defence-in-depth shape as `assertDataset` in
 *  src/data/index.ts:38.
 */
import { laws, partySplits } from '../../data'
import { joinLawsToSplits } from '../laws/join'
import type { PartySplit } from '../../data/types'

export interface Bucket {
  /** 'cross-party' | 'party-line-r' | 'party-line-d' | a president name. */
  key: string
  label: string
  /** The non-colour carrier of the party fact — read aloud and printed even
   *  where colour is absent or, in the president view, deliberately unused. */
  detail: string
  /** $T, sum of positive scores. */
  increases: number
  /** $T, sum of negative scores. Kept NEGATIVE. */
  reductions: number
  /** increases + reductions. */
  net: number
  /** Scored laws in the bucket. */
  laws: number
  /** Coalition view only: total laws in the coalition, including the two
   *  scoreless 1997 laws where the coalition is cross-party. `laws` above is
   *  always the SCORED count; this is the larger, "16 laws" count the
   *  verbatim finding cites for cross-party. */
  lawsInCoalition?: number
}

/** Sum a chamber's yeas by counted party, treating a null chamber (no roll
 *  call, e.g. the CARES Act's House voice vote) as contributing NOTHING —
 *  never as a zero vote. */
function countedYeas(split: PartySplit): { r: number; d: number } {
  let r = 0
  let d = 0
  for (const chamber of [split.house, split.senate]) {
    if (chamber == null) continue
    r += chamber.r.yea
    d += chamber.d_caucus.yea
  }
  return { r, d }
}

/** The counted coalition key for one law. Reads ONLY `character` and the yea
 *  counts in `party_splits.json` — never any field carrying a hand-classified
 *  (not counted) vote character. See docs/contracts/interfaces/attribution.md
 *  for which fields those are and why they are excluded. */
function coalitionKey(split: PartySplit): 'cross-party' | 'party-line-r' | 'party-line-d' {
  if (split.character === 'cross-party') return 'cross-party'
  if (split.character === 'no recorded vote') {
    // No law has this today. If one ever does, it must be triaged by hand
    // rather than silently bucketed as party-line or dropped.
    throw new Error(
      `aggregate.ts: ${split.public_law} has character 'no recorded vote'; ` +
        'this coalition key is not handled and must not be silently bucketed.',
    )
  }
  const { r, d } = countedYeas(split)
  return r > d ? 'party-line-r' : 'party-line-d'
}

const COALITION_META: Record<string, { label: string; detail: string }> = {
  'cross-party': { label: 'Cross-party', detail: 'Counted cross-party majority' },
  'party-line-r': { label: 'Party-line Republican', detail: 'Counted Republican-only majority' },
  'party-line-d': { label: 'Party-line Democratic', detail: 'Counted Democratic-only majority' },
}

const COALITION_ORDER = ['cross-party', 'party-line-r', 'party-line-d']

const PRESIDENT_PARTY_LABEL: Record<'D' | 'R', string> = {
  D: 'Democratic president',
  R: 'Republican president',
}

interface Accum {
  incThou: number
  redThou: number
  laws: number
  lawsInCoalition: number
  firstDate: string
  detail: string
}

function newAccum(detail: string, date: string): Accum {
  return { incThou: 0, redThou: 0, laws: 0, lawsInCoalition: 0, firstDate: date, detail }
}

const coalitionAccum = new Map<string, Accum>()
const presidentAccum = new Map<string, Accum>()

let excluded = 0
let scoredLaws = 0
let totalIncThou = 0
let totalRedThou = 0

// The unmatched-law rule (throw, with the law named) lives in join.ts and is
// shared with §8 — see docs/contracts/interfaces/attribution.md "## Join key".
for (const { law, split } of joinLawsToSplits(laws, partySplits.data)) {
  const cKey = coalitionKey(split)
  const cMeta = COALITION_META[cKey]
  if (!coalitionAccum.has(cKey)) coalitionAccum.set(cKey, newAccum(cMeta.detail, law.date))
  const cBucket = coalitionAccum.get(cKey)!
  cBucket.lawsInCoalition += 1

  // 105-33 and 105-34 predate the ten-year scoring convention and carry no
  // comparable figure (laws.yaml's _comment; sections.md §9 body). Excluded
  // from every sum, but still counted toward the coalition's law count so the
  // "16 laws" figure in the verbatim finding reconciles against the 14 scored.
  if (law.score_t == null) {
    excluded += 1
    continue
  }

  const thousandths = Math.round(law.score_t * 1000)
  scoredLaws += 1
  if (thousandths >= 0) totalIncThou += thousandths
  else totalRedThou += thousandths

  cBucket.laws += 1
  if (thousandths >= 0) cBucket.incThou += thousandths
  else cBucket.redThou += thousandths

  const pKey = law.president
  if (!presidentAccum.has(pKey)) {
    presidentAccum.set(pKey, newAccum(PRESIDENT_PARTY_LABEL[law.president_party], law.date))
  }
  const pBucket = presidentAccum.get(pKey)!
  pBucket.laws += 1
  pBucket.lawsInCoalition += 1
  if (thousandths >= 0) pBucket.incThou += thousandths
  else pBucket.redThou += thousandths
  if (law.date < pBucket.firstDate) pBucket.firstDate = law.date
}

function toBucket(key: string, label: string, a: Accum, coalitionView: boolean): Bucket {
  return {
    key,
    label,
    detail: a.detail,
    increases: a.incThou / 1000,
    reductions: a.redThou / 1000,
    net: (a.incThou + a.redThou) / 1000,
    laws: a.laws,
    ...(coalitionView ? { lawsInCoalition: a.lawsInCoalition } : {}),
  }
}

export const byCoalition: Bucket[] = COALITION_ORDER.filter((k) => coalitionAccum.has(k)).map((k) =>
  toBucket(k, COALITION_META[k].label, coalitionAccum.get(k)!, true),
)

export const byPresident: Bucket[] = [...presidentAccum.entries()]
  .sort((a, b) => (a[1].firstDate < b[1].firstDate ? -1 : 1))
  .map(([name, a]) => toBucket(name, name, a, false))

export const TOTALS = {
  net: (totalIncThou + totalRedThou) / 1000,
  increases: totalIncThou / 1000,
  reductions: totalRedThou / 1000,
  scoredLaws,
  excluded,
}

// ---- The reconciliation invariant, thrown at import time -----------------
//
// Astro evaluates this module during prerender (AttributionSplit.tsx imports
// it, and every government page render imports that). A drift between the
// two breakdowns, or between either breakdown and the all-laws total, fails
// `npm run build` rather than shipping a figure whose two halves disagree.
// Compared as INTEGER thousandths of a trillion — never as the rounded,
// already-displayed values, which is exactly the rounding-order artifact
// (`$5.21T + $2.31T` = `$7.52T` but `5.206 + 2.306` = `$7.51T`) this guards.
function sumThou(buckets: Bucket[], field: 'increases' | 'reductions' | 'net'): number {
  return Math.round(buckets.reduce((s, b) => s + b[field] * 1000, 0))
}

for (const field of ['increases', 'reductions', 'net'] as const) {
  const cSum = sumThou(byCoalition, field)
  const pSum = sumThou(byPresident, field)
  const totalThou = Math.round(TOTALS[field === 'net' ? 'net' : field] * 1000)
  if (cSum !== pSum || cSum !== totalThou) {
    throw new Error(
      `aggregate.ts: the two §9 breakdowns disagree on ${field} — ` +
        `byCoalition=${cSum}, byPresident=${pSum}, TOTALS=${totalThou} (thousandths of a trillion)`,
    )
  }
}

if (excluded !== 2) {
  throw new Error(`aggregate.ts: expected exactly 2 excluded (scoreless) laws, found ${excluded}`)
}
