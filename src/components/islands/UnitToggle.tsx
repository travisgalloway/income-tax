/** Nominal / real / percent of GDP.
 *
 *  BRIEF.md calls this the single most valuable interaction on the site, because
 *  the choice of unit is the main way this subject gets distorted. Radix
 *  ToggleGroup gives roving tabindex and correct radio semantics. */
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { Unit } from '../charts/format'

const OPTIONS: { value: Unit; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'real', label: 'Real FY2025' },
  { value: 'gdp', label: '% of GDP' },
]

/** `units` narrows the group to a subset — a series with no real-dollar
 *  denominator (§1's debt) offers nominal and GDP only. Order always comes from
 *  `OPTIONS`, never from the caller, so a narrowed group keeps the same
 *  relative order as the full set — filtering can still shift a remaining
 *  option's position when an earlier one drops out. The generic keeps a
 *  narrowed caller's `onChange` typed to its own union rather than widening
 *  it back to `Unit`. */
export function UnitToggle<U extends Unit = Unit>({
  value,
  onChange,
  label = 'Units',
  units,
}: {
  value: U
  onChange: (u: U) => void
  label?: string
  units?: readonly U[]
}) {
  const options = units ? OPTIONS.filter((o) => units.includes(o.value as U)) : OPTIONS
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as U)}
      aria-label={label}
      className="unit-toggle"
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className="unit-toggle-item">
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
