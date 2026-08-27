/** Unit guard U2 for the per-modality chart hint (#73), run by
 *  `npm run test:unit`.
 *
 *  Three mutations were performed against this file during exec, each observed
 *  to turn a named assertion red and then reverted:
 *
 *    U2-a  `HINTS.touch` is given the hover sentence
 *          -> "no non-hover mode's string mentions hovering"
 *    U2-b  `Focus or hover` is restored in `HINTS.hover`
 *          -> "no string contains the literal `Focus or hover`"
 *    U2-c  a member of `HINT_MODES` is deleted
 *          -> the arity assertion AND the HINTS-keys set equality
 *
 *  U2-c is the anti-blindness one. Every sweep below iterates `HINT_MODES`
 *  rather than a literal list of its own, which is what stops a typo in one
 *  place from quietly shrinking the sweep — so the arity and the set equality
 *  are asserted explicitly, and a mode that stops being covered fails loudly
 *  instead of being covered zero times in silence.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HINT_MODES, HINTS, hintClass, hintText, type HintMode } from './hint.ts'

test('there are exactly three modes and HINTS covers precisely them', () => {
  // U2-c: deleting a mode fails both halves.
  assert.equal(HINT_MODES.length, 3)
  assert.deepEqual([...HINT_MODES].sort(), ['hover', 'nojs', 'touch'])
  assert.deepEqual(Object.keys(HINTS).sort(), [...HINT_MODES].sort())
})

test('no mode but `hover` mentions hovering', () => {
  // U2-a. The whole criterion is that a touch reader is never told to hover, so
  // this sweeps every mode rather than checking `touch` alone.
  for (const mode of HINT_MODES) {
    const text = HINTS[mode]
    if (mode === 'hover') {
      assert.match(text, /hover/i, 'the hover sentence should name hovering')
      continue
    }
    assert.doesNotMatch(text, /hover/i, `${mode}: "${text}" tells a non-hover device to hover`)
  }
})

test('no mode carries the literal `Focus or hover`', () => {
  // U2-b. #73's own verification greps dist/ for this literal; a span still
  // carrying it would be in the served bytes on every device.
  for (const mode of HINT_MODES) {
    assert.ok(
      !HINTS[mode].includes('Focus or hover'),
      `${mode} still carries the pre-#73 sentence`,
    )
  }
})

test('every mode has a non-empty sentence ending in a full stop', () => {
  for (const mode of HINT_MODES) {
    assert.ok(HINTS[mode].length > 0, `${mode} has no sentence`)
    assert.ok(HINTS[mode].endsWith('.'), `${mode} does not end in a full stop`)
  }
})

test('the class name is derived from the mode, one per mode, all distinct', () => {
  const classes = HINT_MODES.map(hintClass)
  assert.deepEqual(classes, ['hint-nojs', 'hint-hover', 'hint-touch'])
  assert.equal(new Set(classes).size, HINT_MODES.length)
})

test('the noun is substituted only where a sentence asks for one', () => {
  assert.equal(hintText('hover', 'fiscal year'), 'Hover a fiscal year, or Tab to it, to read its value.')
  for (const mode of HINT_MODES) {
    assert.ok(
      !hintText(mode, 'tile').includes('{noun}'),
      `${mode} left its placeholder unsubstituted`,
    )
  }
})

test('the touch sentence names a gesture a touch device actually has', () => {
  // DoD 1 and 2 are joined here: the gesture the hint names must be the gesture
  // `roving.ts` implements, which is tap-or-drag on the chart itself.
  assert.match(HINTS.touch, /\btap\b/i)
  assert.match(HINTS.touch, /\bdrag\b/i)
})

test('the scripting-off sentence points at the table, the only route that works', () => {
  assert.match(HINTS.nojs, /View as table/)
})

test('the modes are a closed set the type system agrees with', () => {
  // A compile-time claim made checkable at runtime: indexing HINTS by every
  // member of HINT_MODES must never produce undefined.
  for (const mode of HINT_MODES satisfies readonly HintMode[]) {
    assert.equal(typeof HINTS[mode], 'string')
  }
})
