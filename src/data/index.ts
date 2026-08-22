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

import type {
  BudgetYear, Dataset, DebtYear, EconomyYear, IncomeYear, Meta, PartySplit, RevenueYear,
} from './types'

export const budget = budgetJson as unknown as Dataset<BudgetYear[]>
export const debt = debtJson as unknown as Dataset<DebtYear[]>
export const economy = economyJson as unknown as Dataset<EconomyYear[]>
export const income = incomeJson as unknown as Dataset<IncomeYear[]>
export const revenue = revenueJson as unknown as Dataset<RevenueYear[]>
export const partySplits = splitsJson as unknown as Dataset<PartySplit[]>
export const debtHolders = holdersJson as unknown as Dataset<Record<string, unknown>>
export const debtMaturity = maturityJson as unknown as Dataset<Record<string, unknown>>
export const oecd = oecdJson as unknown as Dataset<Record<string, unknown>>
export const incomeGroups = groupsJson as unknown as Dataset<Record<string, unknown>>

/** The source line for a dataset, rendered verbatim. BRIEF.md rule 1. */
export function sourceOf(meta: Meta): string {
  return meta.source
}

/** Vintage-stamped caption suffix, so a reader can see how current a figure is. */
export function vintageOf(meta: Meta): string | null {
  const p = meta.provenance
  return p.vintage ? `Vintage ${p.vintage}.` : p.retrieved_at ? `Retrieved ${p.retrieved_at.slice(0, 10)}.` : null
}

export const laws = budget.data.flatMap((y) => y.L)

/** Party split keyed by public law, for joining to the law list. */
export const splitByLaw = new Map(partySplits.data.map((s) => [s.public_law, s]))
