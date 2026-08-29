/** Nominal / real / percent of GDP.
 *
 *  BRIEF.md calls this the single most valuable interaction on the site, because
 *  the choice of unit is the main way this subject gets distorted. Radix
 *  ToggleGroup gives roving tabindex and correct radio semantics. */
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { Unit } from '../charts/format'
import { labelledByFigure } from './figureLabel'

const OPTIONS: { value: Unit; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'real', label: 'Real FY2025' },
  { value: 'gdp', label: '% of GDP' },
]

/** `units` narrows the group to a subset, a series with no real-dollar
 *  denominator (§1's debt) offers nominal and GDP only. Order always comes from
 *  `OPTIONS`, never from the caller, so a narrowed group keeps the same
 *  relative order as the full set, filtering can still shift a remaining
 *  option's position when an earlier one drops out. The generic keeps a
 *  narrowed caller's `onChange` typed to its own union rather than widening
 *  it back to `Unit`. */
export function UnitToggle<U extends Unit = Unit>({
  value,
  onChange,
  figure,
  label = 'Measured in',
  labelId,
  units,
}: {
  value: U
  onChange: (u: U) => void
  /** The caller's manifest key from `src/data/figures.ts`, `'net-interest'`,
   *  not a name. See `figureLabel.ts` for why the name is derived from this
   *  rather than typed. Required: four call sites passing the same
   *  `label="Measured in"` is the bug #72 exists to remove, so omitting the
   *  figure is a type error rather than a silently generic name. */
  figure: string
  /** The visible text beside the toggle, and the second half of its accessible
   *  name. Not a name source on its own, "Measured in" is what three of these
   *  legitimately say. */
  label?: string
  labelId?: string
  units?: readonly U[]
}) {
  const options = units ? OPTIONS.filter((o) => units.includes(o.value as U)) : OPTIONS
  const id = labelId ?? `${figure}-units`
  /* The label is rendered HERE, not left to the caller, so it cannot drift from
   * the id the group references. Three callers used to render their own span
   * with an id nothing pointed at, and a fourth rendered none at all; both
   * shapes are unreachable now. A fragment, so the pair lands in the caller's
   * existing `.controls` flex row and the geometry is unchanged. */
  return (
    <>
      <span className="controls-label" id={id}>
        {label}
      </span>
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as U)}
        aria-labelledby={labelledByFigure(figure, id)}
        className="unit-toggle"
      >
        {options.map((o) => (
          <ToggleGroup.Item key={o.value} value={o.value} className="unit-toggle-item">
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </>
  )
}
