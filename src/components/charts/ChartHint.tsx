/** The chart hint, rendered once per modality. Issue #73.
 *
 *  Three sibling spans, all in the served bytes, exactly one of them displayed,
 *  see `hint.ts` for the strings and for why this is CSS rather than state.
 *  It renders a fragment, not an element, so it drops straight into the
 *  `<p aria-live="polite" class="readout">` each island already had, in place of
 *  the bare string that used to sit there. That is what keeps the desktop DOM
 *  diff for this change to "one text node becomes three spans" and nothing else.
 */
import { HINT_MODES, hintClass, hintText } from './hint'

export interface ChartHintProps {
  /** The island's own name for one datum, "year", "fiscal year", "tile",
   *  "segment", "country", "instrument band", "bar", "point", "datum". Only the
   *  hover sentence uses it. */
  noun: string
}

export function ChartHint({ noun }: ChartHintProps) {
  return (
    <>
      {HINT_MODES.map((mode) => (
        <span key={mode} className={hintClass(mode)}>
          {hintText(mode, noun)}
        </span>
      ))}
    </>
  )
}
