/** Unit tests for the axis-domain helpers, run by `npm run test:unit`
 *  (`node --test`, which strips the types natively, Node >= 22.18 / >= 23.6).
 *
 *  The rule under test (#34): `niceExtent` pads a range outward by a fraction of
 *  its span, then anchors the low end at exactly `0` for any series with no
 *  negative observation. A series that does go negative keeps the padded
 *  negative low end it has always had, those domains must not move, because
 *  they are what every `<ZeroLine>` panel on the site is drawn against.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extent, niceExtent } from './scales.ts'

/** The implementation as it stood before #34, kept here as the oracle for the
 *  "a signed series is bit-for-bit unchanged" contract. */
function niceExtentBefore(values: (number | null | undefined)[], pad = 0.08): [number, number] {
  let [lo, hi] = extent(values)
  const span = hi - lo
  lo -= span * pad
  hi += span * pad
  if (lo > 0) lo = 0
  if (hi < 0) hi = 0
  return [lo, hi]
}

const close = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, want ${expected}`)

/** Every domain this file produces must be a usable band. */
function assertUsable(domain: [number, number], label: string) {
  const [lo, hi] = domain
  assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `${label}: domain is finite`)
  assert.ok(hi > lo, `${label}: domain is neither inverted nor collapsed (got [${lo}, ${hi}])`)
}

test('extent never collapses to a zero-height band', () => {
  assert.deepEqual(extent([5, 5, 5]), [4, 6])
  assert.deepEqual(extent([0, 0]), [-1, 1])
  assert.deepEqual(extent([2]), [1, 3])
  assert.deepEqual(extent([]), [0, 1])
  assert.deepEqual(extent([null, undefined]), [0, 1])
  assert.deepEqual(extent([1, null, 4, undefined]), [1, 4])
})

test('all-positive with a small minimum floors at exactly zero', () => {
  // The RevenueChart nominal shape: min 0.0997 against a max of 5.229, so the
  // 8% pad used to push the low end to -0.311 and leave it there.
  const domain = niceExtent([0.0997, 1.2, 3.4, 5.229])
  assert.equal(domain[0], 0)
  close(domain[1], 5.229 + (5.229 - 0.0997) * 0.08, 'high end still padded')
  assertUsable(domain, 'all-positive')
})

test('a minimum of exactly zero floors at zero, not below', () => {
  const domain = niceExtent([0, 4, 9])
  assert.equal(domain[0], 0)
  close(domain[1], 9 + 9 * 0.08, 'high end still padded')
  assertUsable(domain, 'minimum exactly zero')
})

test('an all-negative series keeps its padded negative floor', () => {
  const domain = niceExtent([-9, -4, -1])
  const before = niceExtentBefore([-9, -4, -1])
  assert.deepEqual(domain, before)
  close(domain[0], -9 - 8 * 0.08, 'low end padded below the minimum')
  assert.equal(domain[1], 0, 'high end clamps up to zero')
  assertUsable(domain, 'all-negative')
})

test('a mixed-sign series is bit-for-bit unchanged (the real CPI-U / core-PCE domain)', () => {
  // Derived from src/data/economy.json: the year-over-year rates run from
  // -0.4721540634991408 (FY1955) to 13.555713271823985 (FY1980).
  const values = [-0.4721540634991408, 2.5, 7.1, 13.555713271823985]
  const domain = niceExtent(values)
  close(domain[0], -1.594383450324991, 'negative low end preserved')
  close(domain[1], 14.677942658649835, 'padded high end preserved')
  assert.deepEqual(domain, niceExtentBefore(values), 'identical to the pre-#34 implementation')
  assertUsable(domain, 'mixed-sign')
})

test('a signed series with a tiny negative excursion still keeps a negative floor', () => {
  const values = [-0.01, 5, 12]
  assert.deepEqual(niceExtent(values), niceExtentBefore(values))
  assert.ok(niceExtent(values)[0] < 0, 'one negative observation is enough to keep the floor')
})

test('a single datum is not misread as signed by extent()\'s widening', () => {
  // extent([0.5]) is [-0.5, 1.5]; the sign test must read the raw value, not that.
  const domain = niceExtent([0.5])
  assert.equal(domain[0], 0)
  assertUsable(domain, 'single datum')

  const negative = niceExtent([-0.5])
  assert.deepEqual(negative, niceExtentBefore([-0.5]))
  assert.ok(negative[0] < 0, 'a single negative datum keeps a negative floor')
})

test('an all-zero series yields a zero-anchored band, with no division by a zero span', () => {
  const domain = niceExtent([0, 0, 0])
  assert.equal(domain[0], 0)
  close(domain[1], 1 + 2 * 0.08, 'extent widened to [-1, 1], then padded')
  assertUsable(domain, 'all-zero')
})

test('an empty or all-null series keeps the pre-#34 fallback domain', () => {
  for (const values of [[], [null, undefined, null], [NaN, null]]) {
    const domain = niceExtent(values as (number | null | undefined)[])
    assert.deepEqual(domain, niceExtentBefore(values as (number | null | undefined)[]))
    close(domain[0], -0.08, 'fallback low end untouched')
    close(domain[1], 1.08, 'fallback high end untouched')
    assertUsable(domain, 'empty / all-null')
  }
})

test('nulls interleaved with real values are ignored by the sign test', () => {
  const nonNegative = niceExtent([null, 0.2, undefined, 8, null])
  assert.equal(nonNegative[0], 0, 'nulls do not make a non-negative series look signed')
  assertUsable(nonNegative, 'nulls interleaved, non-negative')

  const signed = [null, -3, undefined, 8, null] as (number | null | undefined)[]
  assert.deepEqual(niceExtent(signed), niceExtentBefore(signed))
  assert.ok(niceExtent(signed)[0] < 0, 'a real negative among nulls still keeps the floor')
})
