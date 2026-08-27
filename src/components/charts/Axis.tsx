/** Axes.
 *
 *  BRIEF.md rule 2: both axes carry units. `label` is required on the value axis
 *  for that reason; a chart that renders a bare number scale is a bug.
 *
 *  Text fit is `axisFit.ts`'s, and the three families are NOT treated alike
 *  (#66). Read that file's header before changing a placement here:
 *
 *  - Bottom ticks go through `placeTickLabel`, which shifts and never flips.
 *  - The rotated title goes through `placeAxisTitleY`, because its length runs
 *    down the y axis and no horizontal clamp can see it.
 *  - **Left ticks are deliberately unclamped.** A left tick shifted inward is
 *    pushed onto the data it labels, so there is no placement that rescues a
 *    label wider than `margin.left - 8`. The contract belongs to the CALLER:
 *    pass a formatter whose output satisfies `leftGutterFits` (six characters
 *    at the 360 preset), or move the labels out of the gutter as `WhoPays`
 *    does. Adding a clamp here would hide the defect rather than fix it.
 */
import type { Frame } from './scales'
import {
  AXIS_LABEL_FONT_PX,
  AXIS_TITLE_FONT_PX,
  TICK_OFFSET,
  placeAxisTitleY,
  placeTickLabel,
} from './axisFit'

interface AxisProps {
  frame: Frame
  ticks: number[]
  format: (v: number) => string
  /** Unit label for the axis. Required: no bare numbers. */
  label: string
  scale: (v: number) => number
}

export function AxisLeft({ frame, ticks, format, label, scale }: AxisProps) {
  return (
    <g className="axis axis-left" aria-hidden="true">
      {ticks.map((t) => (
        <g key={t} transform={`translate(0,${scale(t)})`}>
          <line x1={0} x2={frame.innerWidth} stroke="var(--rule)" strokeWidth={0.5} />
          <text x={-TICK_OFFSET} dy="0.32em" textAnchor="end" className="axis-label">
            {format(t)}
          </text>
        </g>
      ))}
      <text
        transform={`translate(${-frame.margin.left + 14},${placeAxisTitleY(label, frame)}) rotate(-90)`}
        textAnchor="middle"
        className="axis-title"
      >
        {label}
      </text>
    </g>
  )
}

export function AxisBottom({ frame, ticks, format, label, scale }: AxisProps) {
  // The bottom axis title is centred on the plot and takes the same shift-only
  // treatment as a tick: a long unit string on a 296-unit plot would otherwise
  // run off both ends at once.
  const title = placeTickLabel(frame.innerWidth / 2, label, frame, AXIS_TITLE_FONT_PX)
  return (
    // The label is RENDERED, not just declared. It previously lived in a <title>
    // inside an aria-hidden group, which meant the required `label` prop was
    // invisible to sighted readers and unreachable by assistive tech: the axis
    // carried no unit at all, defeating the invariant the prop exists to enforce.
    <g className="axis axis-bottom" aria-hidden="true">
      {ticks.map((t) => {
        const text = format(t)
        // A tick at the far right of the domain lands at `innerWidth`, and a
        // middle-anchored label there needs `w/2 <= margin.right`: 24 units at
        // the 720 preset, but only 12 at 360, where `FY2025` overruns by 8.5.
        // Shift-only, so the label stays attached to its own gridline.
        const placed = placeTickLabel(scale(t), text, frame, AXIS_LABEL_FONT_PX)
        if (!placed) return null
        return (
          <text
            key={t}
            x={placed.x}
            y={frame.innerHeight + 18}
            textAnchor={placed.textAnchor}
            className="axis-label"
          >
            {text}
          </text>
        )
      })}
      {title && (
        <text
          x={title.x}
          y={frame.innerHeight + 34}
          textAnchor={title.textAnchor}
          className="axis-title"
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** Emphasised zero line. Deficit versus surplus must be readable by position and
 *  sign, not by colour alone. */
export function ZeroLine({ frame, y }: { frame: Frame; y: number }) {
  return <line x1={0} x2={frame.innerWidth} y1={y} y2={y} stroke="var(--ink)" strokeWidth={1} />
}
