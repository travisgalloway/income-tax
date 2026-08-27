/** Unit tests for the pure half of `scrollRegion.ts`, run by
 *  `npm run test:unit` (`node --test`, which strips the types natively).
 *  Issue #71.
 *
 *  `scrollTargetFor` is the whole scroll decision: which keys are ours, how far
 *  each one moves, and where the ends are. It is separated from the hook
 *  precisely so it can be asserted without a DOM, an engine, or a running
 *  server — the browser lane (`tests/browser/scroll.test.ts`) then proves the
 *  wiring, and this file proves the arithmetic.
 *
 *  The one property worth stating twice: a box that does not overflow returns
 *  `null` for EVERY key, including the ones it would otherwise handle. Without
 *  that, a table that fits its column would swallow the reader's arrow presses
 *  and the page would stop scrolling under them.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ARROW_STEP_PX,
  PAGE_FRACTION,
  scrollRegionLabel,
  scrollTargetFor,
  type ScrollBox,
} from './scrollRegion.ts'

/** `/economy` `#prices-rates` at 1440x900, measured: seven columns of table in
 *  a 736px wrapper. The one the issue names. */
const PRICES_RATES: ScrollBox = { scrollLeft: 0, clientWidth: 736, scrollWidth: 1216 }
const MAX = PRICES_RATES.scrollWidth - PRICES_RATES.clientWidth // 480

function at(scrollLeft: number): ScrollBox {
  return { ...PRICES_RATES, scrollLeft }
}

/** Wide enough that a page step is not clamped, so the step size itself is
 *  what is being measured rather than the end of the box. */
function wide(scrollLeft: number): ScrollBox {
  return { scrollLeft, clientWidth: 736, scrollWidth: 3000 }
}

test('each key moves by its own amount', () => {
  assert.equal(scrollTargetFor('ArrowRight', at(0)), ARROW_STEP_PX)
  assert.equal(scrollTargetFor('ArrowLeft', at(200)), 200 - ARROW_STEP_PX)
  assert.equal(scrollTargetFor('PageDown', wide(0)), 736 * PAGE_FRACTION)
  assert.equal(scrollTargetFor('PageUp', wide(2000)), 2000 - 736 * PAGE_FRACTION)
  assert.equal(scrollTargetFor('Home', at(MAX)), 0)
  assert.equal(scrollTargetFor('End', at(0)), MAX)
})

test('a page step is just under a full box, so no column is stepped clean over', () => {
  const step = (scrollTargetFor('PageDown', wide(0)) as number) - 0
  assert.ok(step < 736, `a page step of ${step} is a whole box or more`)
  assert.ok(step > 736 * 0.75, `a page step of ${step} is not a page`)
})

test('End lands exactly on the maximum, and Home exactly on zero', () => {
  assert.equal(scrollTargetFor('End', at(0)), 480)
  assert.equal(scrollTargetFor('End', at(MAX)), 480)
  assert.equal(scrollTargetFor('Home', at(0)), 0)
})

test('it clamps at both ends and never wraps', () => {
  // Past the right edge: the last column stays put, it does not reappear on
  // the left. Same rule `roving.ts` states for marks — a series, not a ring.
  assert.equal(scrollTargetFor('ArrowRight', at(MAX)), MAX)
  assert.equal(scrollTargetFor('ArrowRight', at(MAX - 5)), MAX)
  assert.equal(scrollTargetFor('PageDown', at(MAX)), MAX)
  assert.equal(scrollTargetFor('ArrowLeft', at(0)), 0)
  assert.equal(scrollTargetFor('ArrowLeft', at(5)), 0)
  assert.equal(scrollTargetFor('PageUp', at(0)), 0)
})

test('a key that is not ours returns null', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'a', 'Escape', 'Shift']) {
    assert.equal(scrollTargetFor(key, at(0)), null, `${key} was handled`)
  }
})

test('a box that does not overflow returns null for every key it would handle', () => {
  const fits: ScrollBox = { scrollLeft: 0, clientWidth: 736, scrollWidth: 736 }
  for (const key of ['ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End']) {
    assert.equal(
      scrollTargetFor(key, fits),
      null,
      `${key} was handled on a box that fits — a table that does not scroll ` +
        `would swallow the press and the page would stop moving under the reader`,
    )
  }
  // Sub-pixel: a table one part in a thousand wider than its box is still a
  // scroll box, and one narrower than its box is not.
  assert.equal(scrollTargetFor('End', { scrollLeft: 0, clientWidth: 736, scrollWidth: 736.5 }), 0.5)
  assert.equal(scrollTargetFor('End', { scrollLeft: 0, clientWidth: 736, scrollWidth: 700 }), null)
})

test('a zero-sized box — an inactive Radix tab panel — is not a scroll box', () => {
  // Measured: `/government` §9's by-signing-president table is 0/0 while its
  // tab is inactive, and 545/350 once the tab is clicked.
  const inactive: ScrollBox = { scrollLeft: 0, clientWidth: 0, scrollWidth: 0 }
  assert.equal(scrollTargetFor('ArrowRight', inactive), null)
  assert.equal(scrollTargetFor('End', inactive), null)
})

test('the accessible name says what the region contains, not just that it scrolls', () => {
  const caption = 'Inflation and interest rates by fiscal year'
  const label = scrollRegionLabel(caption)
  assert.ok(label.includes(caption), label)
  assert.notEqual(label.toLowerCase(), 'scrollable region')
  assert.match(label, /scrollable table$/)
})
