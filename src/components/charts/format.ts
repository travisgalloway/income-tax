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

/** Compact axis-tick text for a dollar series with no unit family (no
 *  nominal/real/GDP toggle): `60000 -> "$60k"`. */
export function dollarsCompact(v: number): string {
  return `$${Math.round(v / 1000)}k`
}

/** A unitless ratio (e.g. the Gini index) to three decimal places: `0.456 ->
 *  "0.456"`. The unit itself is not "index points" — it is that there is no
 *  unit, which is why the axis title (`AxisLeft`'s required `label`) is the
 *  only place the 0-to-1 range gets stated, not this formatter. */
export function indexValue(v: number): string {
  return v.toFixed(3)
}

/** A calendar year, printed as-is. Deliberately not `fiscalYear`: the
 *  Households route reads Census/FRED and CBO series, which publish on the
 *  calendar year, and must never carry an `FY` prefix. */
export function calendarYear(y: number): string {
  return `${y}`
}

/** A rate already expressed in percent (not a 0-1 fraction), for statutory
 *  and effective tax rate figures. */
export function percentRate(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}
