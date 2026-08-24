/** Number formatting.
 *
 *  BRIEF.md rule 2: every axis is labelled with its unit, no bare numbers. These
 *  helpers always emit the unit so a caller cannot accidentally drop it. */

export type Unit = 'nominal' | 'real' | 'gdp'

export const UNIT_LABEL: Record<Unit, string> = {
  nominal: 'Nominal dollars',
  real: 'Real dollars, FY2025',
  gdp: 'Percent of GDP',
}

/** Field prefix carried by the generated data for each unit. */
export const UNIT_PREFIX: Record<Unit, 'n_' | 'r_' | 'g_'> = {
  nominal: 'n_',
  real: 'r_',
  gdp: 'g_',
}

export function trillions(v: number, digits = 1): string {
  if (Math.abs(v) < 1) return `$${(v * 1000).toFixed(0)}B`
  return `$${v.toFixed(digits)}T`
}

export function percentGdp(v: number, digits = 1): string {
  return `${v.toFixed(digits)}% of GDP`
}

export function percent(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}

export function dollars(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`
}

/** Axis tick text: compact, but never unitless. */
export function tick(v: number, unit: Unit): string {
  if (unit === 'gdp') return `${v.toFixed(0)}%`
  return Math.abs(v) < 1 ? `$${(v * 1000).toFixed(0)}B` : `$${v.toFixed(v % 1 === 0 ? 0 : 1)}T`
}

/** Value formatted in full, for tables, tooltips and screen readers. */
export function value(v: number | null, unit: Unit): string {
  if (v == null) return 'no data'
  return unit === 'gdp' ? percentGdp(v, 2) : trillions(v, 3)
}

export function fiscalYear(y: number): string {
  return `FY${y}`
}

/** A calendar year, unadorned. The Households route runs on tax/calendar
 *  years throughout and must never print an `FY` prefix the way the
 *  Government route's fiscal-year figures do. */
export function calendarYear(y: number): string {
  return `${y}`
}

/** A rate already expressed in percent (not a 0-1 fraction), for statutory
 *  and effective tax rate figures. */
export function percentRate(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}
