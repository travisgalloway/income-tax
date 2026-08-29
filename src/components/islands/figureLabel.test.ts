/** Unit tests for `figureLabel.ts`, run by `npm run test:unit` (`node --test`,
 *  which strips the types natively). Issue #72.
 *
 *  These two functions are four lines of string concatenation, which is exactly
 *  why they are worth pinning: they are the JOIN between two files that never
 *  import each other's output. `Figure.astro` writes the id; nine islands write
 *  the reference. If the two spellings drift, every affected control silently
 *  loses its name, `aria-labelledby` pointing at a missing id resolves to
 *  nothing, no error is raised anywhere, and the page still renders. The static
 *  guards in `pipeline/tests/test_accessibility.py` catch that in `dist/`; these
 *  catch it one layer earlier, without a build.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { figureNoId, labelledByFigure } from './figureLabel.ts'

test('the figure-number id is derived from the manifest key', () => {
  assert.equal(figureNoId('net-interest'), 'fig-net-interest-no')
  assert.equal(figureNoId('debt'), 'fig-debt-no')
  assert.equal(figureNoId('state-give-get'), 'fig-state-give-get-no')
})

test('distinct manifest keys give distinct ids — the uniqueness the name inherits', () => {
  // The nine keys that actually carry a choice-set control today. Their
  // distinctness is enforced at `src/data/figures.ts:323`, which throws when a
  // route declares a key twice; this asserts the id derivation preserves it
  // rather than collapsing two keys onto one id.
  const keys = [
    'debt',
    'whole-budget',
    'structural-gap',
    'voted-and-not',
    'net-interest',
    'law-explorer',
    'revenue',
    'state-give-get',
    'payroll-bill',
  ]
  const ids = keys.map(figureNoId)
  assert.equal(new Set(ids).size, keys.length)
})

test('the token list names the figure first, then the control label', () => {
  // Order is announcement order. The figure comes first because it is what
  // disambiguates one "Measured in" from the next.
  assert.equal(
    labelledByFigure('net-interest', 'net-interest-units'),
    'fig-net-interest-no net-interest-units'
  )
  assert.equal(labelledByFigure('law-explorer', 'law-basis'), 'fig-law-explorer-no law-basis')
})

test('an omitted label id falls back to the conventional `${key}-units`', () => {
  assert.equal(labelledByFigure('debt'), 'fig-debt-no debt-units')
  assert.equal(labelledByFigure('whole-budget'), 'fig-whole-budget-no whole-budget-units')
})

test('the two tokens are separated by exactly one space, as an id list must be', () => {
  // `aria-labelledby` is a space-separated ID reference list. A missing or
  // doubled separator makes the whole list resolve to one non-existent id, and
  // the control is left with no accessible name at all, silently.
  const tokens = labelledByFigure('revenue', 'revenue-units').split(' ')
  assert.equal(tokens.length, 2)
  assert.ok(tokens.every((t) => t.length > 0))
})

test('a control inside a figure that already carries one gets a different name', () => {
  // Figure 8 holds three comboboxes. A figure-only name would make all three
  // identical, which is the bug this issue exists to remove, one level down.
  const names = ['law-basis', 'law-president', 'law-control'].map((id) =>
    labelledByFigure('law-explorer', id)
  )
  assert.equal(new Set(names).size, 3)
})
