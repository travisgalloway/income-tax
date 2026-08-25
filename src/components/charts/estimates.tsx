/** The actual/projection vocabulary, in one place.
 *
 *  economy.json _meta.notes[0], in capitals: "No chart may draw actual and
 *  projected values as one continuous line." CBO publishes actuals and its
 *  baseline projection in one series running well past the last actual fiscal
 *  year, so every chart that reads economy.json must split at the boundary
 *  rather than draw it through. This file is that split, shared by every
 *  Economy-route chart that touches economy.json (currently §1 and §3).
 */
import type { Frame } from './scales'

export const PROJECTED_DASH = '6 4'
export const PROJECTED_OPACITY = 0.55

export interface Estimated {
  y: number
  actual: boolean
}

/**
 * Split a series at the last actual fiscal year.
 *
 * Throws if a row claims to be actual past the boundary: that would mean CBO's
 * own boundary marker has drifted out of sync with its own flags, and drawing
 * the split anyway would silently mislabel real data as a projection or vice
 * versa.
 *
 * The boundary row is REPEATED as the first point of `projected` so the dashed
 * branch starts exactly where the solid one ends. They remain two separate
 * `<path>` elements with different stroke styles — the note above forbids one
 * continuous line, not visual adjacency.
 */
export function splitAtBoundary<T extends Estimated>(rows: T[], lastActualFy: number) {
  const stray = rows.find((r) => r.actual && r.y > lastActualFy)
  if (stray) {
    throw new Error(`splitAtBoundary: FY${stray.y} is flagged actual past FY${lastActualFy}`)
  }
  return {
    actual: rows.filter((r) => r.actual),
    projected: rows.filter((r) => !r.actual || r.y === lastActualFy),
  }
}

/** A vertical rule marking the last actual fiscal year, with its own label so
 *  the boundary is legible without relying on the dash pattern alone. */
export function BoundaryRule({ frame, x, label }: { frame: Frame; x: number; label: string }) {
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={frame.innerHeight}
        stroke="var(--rule)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <text x={x + 4} y={10} className="annotation">
        {label}
      </text>
    </g>
  )
}
