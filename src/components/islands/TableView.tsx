/** "View as table" for every figure.
 *
 *  BRIEF.md: a REAL table anyone can open, not a screen-reader-only one. Native
 *  <details>/<summary> handles the disclosure semantics, focus and keyboard
 *  operation for free, and — unlike a Radix Collapsible, which unmounts its
 *  content while closed — keeps the table present in the server-rendered HTML
 *  even with scripting off. */

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
  return (
    <details className="tableview">
      <summary className="tableview-trigger">
        <span className="tv-open">View as table</span>
        <span className="tv-close">Hide table</span>
      </summary>
      <div className="tableview-content">
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
      </div>
    </details>
  )
}
