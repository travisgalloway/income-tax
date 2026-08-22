/** "View as table" for every figure.
 *
 *  BRIEF.md: a REAL table anyone can open, not a screen-reader-only one. Radix
 *  Collapsible handles the disclosure semantics and focus; the styling is ours. */
import * as Collapsible from '@radix-ui/react-collapsible'
import { useState } from 'react'

export interface Column {
  key: string
  label: string
  /** Unit for this column. Required: a bare number column is a bug. */
  unit: string
}

export interface TableViewProps {
  caption: string
  columns: Column[]
  rows: Record<string, string | number | null>[]
}

export function TableView({ caption, columns, rows }: TableViewProps) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="tableview">
      <Collapsible.Trigger className="tableview-trigger">
        {open ? 'Hide table' : 'View as table'}
      </Collapsible.Trigger>
      <Collapsible.Content className="tableview-content">
        <div className="tableview-scroll">
          <table>
            <caption>{caption}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                    <span className="unit">{c.unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c, j) =>
                    j === 0 ? (
                      <th key={c.key} scope="row">{r[c.key] ?? 'no data'}</th>
                    ) : (
                      <td key={c.key}>{r[c.key] ?? 'no data'}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
