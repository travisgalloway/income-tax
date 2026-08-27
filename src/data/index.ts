/** Typed access to the generated data.
 *
 *  Imported at BUILD time: Astro bakes these into the prerendered HTML, so no
 *  chart depends on a runtime fetch and the static render is complete. */
import budgetJson from './budget.json'
import debtJson from './debt.json'
import economyJson from './economy.json'
import incomeJson from './income_inequality.json'
import revenueJson from './revenue_sources.json'
import splitsJson from './party_splits.json'
import holdersJson from './debt_holders.json'
import maturityJson from './debt_maturity.json'
import oecdJson from './oecd.json'
import groupsJson from './income_tax_by_group.json'
import statesBalanceJson from './states_balance.json'
import statesTaxMixJson from './states_tax_mix.json'
import bracketHistoryJson from './bracket_history.json'
import cboEffectiveRatesJson from './cbo_effective_rates.json'

import type {
  BracketYear, BudgetYear, CboEffectiveRates, Dataset, DebtHolders, DebtMaturity, DebtYear,
  EconomyYear, IncomeGroups, IncomeYear, Meta, OecdComparison, PartySplit, RevenueYear,
  StatesBalance, StatesTaxMix,
} from './types'

export const budget = budgetJson as Dataset<BudgetYear[]>
export const debt = debtJson as Dataset<DebtYear[]>
export const economy = economyJson as Dataset<EconomyYear[]>
export const income = incomeJson as Dataset<IncomeYear[]>
export const revenue = revenueJson as Dataset<RevenueYear[]>
export const partySplits = splitsJson as Dataset<PartySplit[]>
export const debtHolders = holdersJson as Dataset<DebtHolders>
export const debtMaturity = maturityJson as Dataset<DebtMaturity>
export const oecd = oecdJson as Dataset<OecdComparison>
export const incomeGroups = groupsJson as Dataset<IncomeGroups>
export const statesBalance = statesBalanceJson as Dataset<StatesBalance>
export const statesTaxMix = statesTaxMixJson as Dataset<StatesTaxMix>
export const bracketHistory = bracketHistoryJson as Dataset<BracketYear[]>
// astro check rejects a single `as Dataset<CboEffectiveRates>` assertion here for
// insufficient structural overlap with the raw JSON's inferred type, the same
// situation issue #9 hit for its own non-tabular snapshots. Narrow through
// `unknown` once here rather than reaching for `as unknown as` at every call site.
export const cboEffectiveRates = cboEffectiveRatesJson as unknown as Dataset<Record<string, unknown>>

/** Narrowing accessor for `cboEffectiveRates.data`, typed through `unknown` per
 *  the comment above. */
export function cboEffectiveRatesData(): CboEffectiveRates {
  return cboEffectiveRates.data as unknown as CboEffectiveRates
}

/**
 * Build-time guard on the one invariant the whole site depends on.
 *
 * Astro imports this module while prerendering, so a dataset that lost its
 * source line fails the BUILD rather than shipping a figure with an empty
 * caption. The type assertions above cannot catch this; the pipeline can and
 * does, but this is the last line of defence on the consuming side.
 */
function assertDataset(name: string, d: { _meta?: { source?: string } }): void {
  if (!d?._meta?.source) {
    throw new Error(
      `src/data/${name}.json has no _meta.source. Every figure renders its source ` +
        `verbatim (BRIEF.md rule 1); refusing to build without one.`,
    )
  }
}

for (const [name, d] of Object.entries({
  budget, debt, economy, income, revenue, partySplits,
  debtHolders, debtMaturity, oecd, incomeGroups, statesBalance, statesTaxMix,
  bracketHistory, cboEffectiveRates,
})) {
  assertDataset(name, d)
}

/** The source line for a dataset, rendered verbatim. BRIEF.md rule 1. */
export function sourceOf(meta: Meta): string {
  return meta.source
}

/** Vintage-stamped caption suffix, so a reader can see how current a figure is. */
export function vintageOf(meta: Meta): string | null {
  const p = meta.provenance
  return p.vintage ? `Vintage ${p.vintage}.` : p.retrieved_at ? `Retrieved ${p.retrieved_at.slice(0, 10)}.` : null
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** `2026-08-07` -> `7 August 2026`, the site's date register. */
function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** Freshness stamp for a CURATED snapshot (`_meta.refresh.mode === 'curated'`).
 *  `vintageOf` returns null for these: they carry neither `vintage` nor
 *  `retrieved_at`, which would otherwise ship a figure with no way to see it
 *  is stale. Names the as-of date AND that it is hand-refreshed, not fetched. */
export function curatedVintage(meta: Meta, asOf: string): string {
  if (meta.refresh?.mode !== 'curated') {
    throw new Error(
      `curatedVintage called on a non-curated dataset (_meta.refresh.mode is ` +
        `${JSON.stringify(meta.refresh?.mode)}); use vintageOf instead.`,
    )
  }
  return `Curated snapshot, as of ${longDate(asOf)}. Refreshed by hand, not auto-fetched.`
}

/** `2025-11` -> `November 2025`. A release month, not a day. */
function longMonth(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(isoMonth)
  if (!match) {
    throw new Error(`longMonth: ${JSON.stringify(isoMonth)} is not a YYYY-MM release month.`)
  }
  const [, yStr, mStr] = match
  const y = Number(yStr)
  const name = MONTHS[Number(mStr) - 1]
  if (!name) {
    throw new Error(`longMonth: ${JSON.stringify(isoMonth)} is not a YYYY-MM release month.`)
  }
  return `${name} ${y}`
}

/** Freshness stamp for a MIXED dataset (`_meta.refresh.mode === 'mixed'`): part
 *  fetched, part curated, and the two parts are as of DIFFERENT dates.
 *
 *  `debt_holders` is the case this exists for (#54). Its foreign holdings come
 *  from the Treasury International Capital release pinned in
 *  `_meta.provenance.vintage` (a month), while its public/intragovernmental
 *  split comes from Debt to the Penny as of `data.as_of` (a day). Naming one of
 *  those two dates and letting the reader assume it covers both is the failure;
 *  this names both.
 *
 *  `debt_maturity` is the second (#56): its instrument composition comes from
 *  the Monthly Statement of the Public Debt month pinned in the same place,
 *  while its average maturity is curated from the Joint Economic Committee's
 *  monthly update — and that second date is a MONTH, not a day, which is why
 *  `curatedAs` says which of the two to render. Passing a `YYYY-MM` to the
 *  day-precision branch is what put "as of **undefined** June 2026" on the
 *  published source line for as long as this figure used `curatedVintage`.
 *
 *  Throws when the mode is not `'mixed'`, and when the vintage is missing — a
 *  mixed dataset with no release month has nothing to render here, and a blank
 *  date is worse than a loud failure. */
export function mixedVintage(
  meta: Meta,
  asOf: string,
  labels: {
    /** the fetched half's publisher, named before its pinned release month */
    fetched: string
    /** the curated half's publisher, named before its own as-of date */
    curated: string
    /** whether `asOf` is a full `YYYY-MM-DD` day or a `YYYY-MM` release month */
    curatedAs?: 'day' | 'month'
  } = { fetched: 'Treasury International Capital', curated: 'Debt to the Penny' },
): string {
  if (meta.refresh?.mode !== 'mixed') {
    throw new Error(
      `mixedVintage called on a dataset whose _meta.refresh.mode is ` +
        `${JSON.stringify(meta.refresh?.mode)}; use curatedVintage or vintageOf instead.`,
    )
  }
  const vintage = meta.provenance.vintage
  if (!vintage) {
    throw new Error(
      'mixedVintage: _meta.provenance.vintage is missing. A fetched figure without its ' +
        'release month is the trap SOURCES.md exists to prevent.',
    )
  }
  const curatedDate =
    labels.curatedAs === 'month' ? longMonth(asOf) : longDate(asOf)
  return (
    `${labels.fetched}, ${longMonth(vintage)} release. ` +
    `${labels.curated} as of ${curatedDate}.`
  )
}

export const laws = budget.data.flatMap((y) => y.L)

// The laws-to-splits join lives in src/components/laws/join.ts (issue #33) —
// the one implementation, shared by §8 and §9. No map is exported from here.

/** _meta.gini_basis, surfaced rather than hardcoded. SOURCES.md: the family
 *  series reads 0.456 for 2024; household series run 0.47-0.49. */
export const giniBasis = income._meta.gini_basis as string

/** The CBO series is TWO PUBLISHED POINTS, not an annual series. `incomeGroups`
 *  is fully typed as `IncomeGroups` above (issue #11), so this field reads
 *  straight off `.data` — no narrowing cast needed. */
export const cboTop1IncomeShare = incomeGroups.data.cbo_top1_income_share
