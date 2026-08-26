/** Unit tests for the shared number formatters, run by `npm run test:unit`
 *  (`node --test`, which strips the types natively — Node >= 22.18 / >= 23.6).
 *
 *  Two rules are under test (#35), and both exist so that `DebtChart` could stop
 *  carrying private copies of them without any rendered number changing:
 *
 *  1. `tick` returns `"$0"` at exactly zero, not `"$0B"`. Zero has no magnitude,
 *     and `niceExtent` puts an exact-zero tick on every non-negative axis.
 *  2. `trillionsLong` spells the magnitude out, byte-for-byte matching the
 *     `` `$${v.toFixed(2)} trillion` `` that §1 inlined before this change.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tick, trillions, trillionsLong, percent, percentGdp, value } from './format.ts'

/** `tick` as it stood before the zero case landed, kept as the oracle for the
 *  "every other output is unchanged" half of the contract. */
function tickBefore(v: number, unit: 'nominal' | 'real' | 'gdp'): string {
  if (unit === 'gdp') return `${v.toFixed(0)}%`
  return Math.abs(v) < 1 ? `$${(v * 1000).toFixed(0)}B` : `$${v.toFixed(v % 1 === 0 ? 0 : 1)}T`
}

test('tick renders the axis floor as $0, not $0B', () => {
  assert.equal(tick(0, 'nominal'), '$0')
  assert.equal(tick(0, 'real'), '$0')
  // The GDP axis was already correct and must stay a bare percent.
  assert.equal(tick(0, 'gdp'), '0%')
})

test('tick is otherwise byte-identical to its pre-#35 behaviour', () => {
  // Sub-billion, sub-trillion, whole trillions, fractional trillions, negatives.
  const cases = [
    0.001, 0.08, 0.25, 0.5, 0.999, 1, 1.5, 2, 5, 10, 12.5, 20, 30, 40, 40.05,
    -0.5, -1, -2.5, 105, 124,
  ]
  for (const unit of ['nominal', 'real', 'gdp'] as const) {
    for (const v of cases) {
      assert.equal(tick(v, unit), tickBefore(v, unit), `tick(${v}, '${unit}')`)
    }
  }
})

test('tick keeps the magnitudes §1 puts on its nominal axis', () => {
  assert.equal(tick(0.5, 'nominal'), '$500B')
  assert.equal(tick(12.5, 'nominal'), '$12.5T')
  assert.equal(tick(40, 'nominal'), '$40T')
})

test('trillionsLong is byte-exact against the fmtFull it replaces', () => {
  // The two annotated marker years, at the two decimals §1 has always shown.
  assert.equal(trillionsLong(19.57), '$19.57 trillion')
  assert.equal(trillionsLong(40.0491, 2), '$40.05 trillion')
  assert.equal(trillionsLong(5.6746), '$5.67 trillion')
  // Default digits match the old inline `` `$${r.debt.toFixed(2)} trillion` ``.
  assert.equal(trillionsLong(1), '$1.00 trillion')
  assert.equal(trillionsLong(0.61), '$0.61 trillion')
})

test('trillionsLong spells out where trillions abbreviates', () => {
  // Same magnitude, different surface: one is read aloud, the other is not.
  assert.equal(trillions(19.57, 1), '$19.6T')
  assert.equal(trillionsLong(19.57, 1), '$19.6 trillion')
  // `value()` is not a substitute — three digits and a bare "T".
  assert.equal(value(40.0491, 'nominal'), '$40.049T')
})

test('the percent helpers §1 now shares are byte-exact too', () => {
  // `` `${(r.gdp_share).toFixed(1)}% of GDP` `` and `` `${v.toFixed(0)}%` ``.
  assert.equal(percentGdp(123.98, 1), '124.0% of GDP')
  assert.equal(percentGdp(105.04, 1), '105.0% of GDP')
  assert.equal(percent(123.98, 0), '124%')
  assert.equal(percent(0, 0), '0%')
})

test('trillions still switches to billions below one trillion', () => {
  // Unchanged by #35, but §1's narrow-viewport annotation now depends on it.
  assert.equal(trillions(19.57, 1), '$19.6T')
  assert.equal(trillions(0.5, 1), '$500B')
})
