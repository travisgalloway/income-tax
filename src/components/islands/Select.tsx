/** Shared Radix `Select` wrapper: trigger + portal + viewport + items, with
 *  the visible label wired via `aria-labelledby` rather than a `<label>`
 *  element (Radix's trigger renders a `<button>`, not a form control — the
 *  same pattern `DebtChart.tsx` uses to label its `ToggleGroup`). Kept
 *  separate from any one island so later sections' filters reuse it rather
 *  than re-inlining Radix's Select boilerplate. */
import * as RadixSelect from '@radix-ui/react-select'

export interface SelectOption {
  value: string
  label: string
}

export function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
}) {
  return (
    <div className="select-field">
      <span className="controls-label" id={id}>
        {label}
      </span>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger className="select-trigger" aria-labelledby={id}>
          <RadixSelect.Value />
          <RadixSelect.Icon className="select-icon" aria-hidden="true">
            ▾
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          {/* position="popper": the listbox opens beside the trigger rather
             than covering it. */}
          <RadixSelect.Content className="select-content" position="popper" sideOffset={4}>
            <RadixSelect.Viewport className="select-viewport">
              {options.map((o) => (
                <RadixSelect.Item key={o.value} value={o.value} className="select-item">
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="select-indicator">✓</RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  )
}
