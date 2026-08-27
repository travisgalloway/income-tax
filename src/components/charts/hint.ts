/** The chart hint's three sentences, one per input modality. Issue #73.
 *
 *  Before this, every chart said `Focus or hover a year to read its value.` on
 *  every device — 24 occurrences in the served bytes. On a phone that names two
 *  interactions the device does not have, and the reader's only actual route to
 *  a number was "View as table", which the sentence never mentioned.
 *
 *  THREE SPANS, NOT REACT STATE. All three sentences ship in the served HTML and
 *  CSS picks one (`global.css`, `@media (hover: …)`, plus the `<noscript>` block
 *  in `BaseLayout.astro`). That is deliberate and it is not an optimisation:
 *  the hint sits inside `<p aria-live="polite" class="readout">`, so a
 *  `matchMedia`-driven React hint would CHANGE that live region's text at
 *  hydration and announce "Hover a year…" on every chart as it scrolled into
 *  view. Served text and hydrated text are byte-identical here, so nothing
 *  fires. Do not refactor this into state.
 *
 *  WHY `hover`, NOT `pointer: coarse`. `pointer` describes precision; `hover`
 *  describes whether the sentence "hover a year" is a lie. The criterion is
 *  about the sentence, so the query is about hover. A touchscreen laptop
 *  (`hover: hover` AND `any-pointer: coarse`) is told the thing that works for
 *  its primary input, and the touch path still works there because the
 *  INTERACTION never consults a media query — it keys on `e.pointerType`.
 *
 *  WHY THE HOVER SENTENCE CHANGED TOO. #73's own verification greps `dist/` for
 *  the literal `Focus or hover`; a span still carrying it would be in the served
 *  bytes on every device, phone included. Dropping "Focus" for "Tab to it" also
 *  trades jargon for the key the reader actually presses.
 *
 *  Kept in a `.ts` module rather than beside the component in `ChartHint.tsx`
 *  because the unit lane is `node --test`, which strips types but not JSX: a
 *  test cannot import a `.tsx` file at all. `hint.test.ts` (U2) guards these
 *  strings, and `test_accessibility.py` derives its class list from
 *  `HINT_MODES` here rather than from a literal of its own.
 */

/** Every modality, in the order the component renders them. */
export const HINT_MODES = ['nojs', 'hover', 'touch'] as const

export type HintMode = (typeof HINT_MODES)[number]

/** The class the CSS switches on, for one mode. The single place the name is
 *  formed — the component, the stylesheet's guard and the static suite all
 *  count through this shape rather than through three separate literals. */
export function hintClass(mode: HintMode): string {
  return `hint-${mode}`
}

/** One sentence per mode. `{noun}` is the island's own name for a datum and is
 *  substituted by `hintText`; only the hover sentence names one, because the
 *  other two describe the chart as a whole. */
export const HINTS: Record<HintMode, string> = {
  nojs: 'Open "View as table" below for any value in this chart.',
  hover: 'Hover a {noun}, or Tab to it, to read its value.',
  touch: 'Tap or drag across the chart to read a value.',
}

/** The sentence for one mode, with the island's noun substituted. */
export function hintText(mode: HintMode, noun: string): string {
  return HINTS[mode].replace('{noun}', noun)
}
