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

export function UnitToggle({
  value,
  onChange,
  label = 'Units',
}: {
  value: Unit
  onChange: (u: Unit) => void
  label?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as Unit)}
      aria-label={label}
      className="unit-toggle"
    >
      {OPTIONS.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className="unit-toggle-item">
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
