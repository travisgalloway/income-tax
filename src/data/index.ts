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
import bracketHistoryJson from './bracket_history.json'
import cboEffectiveRatesJson from './cbo_effective_rates.json'

import type {
  BracketYear, BudgetYear, CboEffectiveRates, Dataset, DebtHolders, DebtMaturity, DebtYear,
  EconomyYear, IncomeGroupsTop1, IncomeYear, Meta, OecdComparison, PartySplit, RevenueYear,
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
export const incomeGroups = groupsJson as Dataset<Record<string, unknown>>
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
  debtHolders, debtMaturity, oecd, incomeGroups, bracketHistory, cboEffectiveRates,
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

export const laws = budget.data.flatMap((y) => y.L)

/** Party split keyed by public law, for joining to the law list. */
export const splitByLaw = new Map(partySplits.data.map((s) => [s.public_law, s]))

/** _meta.gini_basis, surfaced rather than hardcoded. SOURCES.md: the family
 *  series reads 0.456 for 2024; household series run 0.47-0.49. */
export const giniBasis = income._meta.gini_basis as string

/** The CBO series is TWO PUBLISHED POINTS, not an annual series. `incomeGroups`
 *  itself stays `Dataset<Record<string, unknown>>` above — widening it to a
 *  full typed interface is issue #11's job.
 *
 *  `Record<string, unknown>` and `IncomeGroupsTop1` do not structurally
 *  overlap enough for TypeScript to allow a single assertion here (unlike the
 *  dataset-level `as Dataset<T>` this file otherwise uses everywhere else), so
 *  this one access goes through `unknown` — see docs/parked-findings.md. */
export const cboTop1IncomeShare =
  (incomeGroups.data as unknown as IncomeGroupsTop1).cbo_top1_income_share
