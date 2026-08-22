/** Axes.
 *
 *  BRIEF.md rule 2: both axes carry units. `label` is required on the value axis
 *  for that reason; a chart that renders a bare number scale is a bug. */
import type { Frame } from './scales'

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
          <text x={-8} dy="0.32em" textAnchor="end" className="axis-label">
            {format(t)}
          </text>
        </g>
      ))}
      <text
        transform={`translate(${-frame.margin.left + 14},${frame.innerHeight / 2}) rotate(-90)`}
        textAnchor="middle"
        className="axis-title"
      >
        {label}
      </text>
    </g>
  )
}

export function AxisBottom({ frame, ticks, format, label, scale }: AxisProps) {
  return (
    // The label is RENDERED, not just declared. It previously lived in a <title>
    // inside an aria-hidden group, which meant the required `label` prop was
    // invisible to sighted readers and unreachable by assistive tech: the axis
    // carried no unit at all, defeating the invariant the prop exists to enforce.
    <g className="axis axis-bottom" aria-hidden="true">
      {ticks.map((t) => (
        <text
          key={t}
          x={scale(t)}
          y={frame.innerHeight + 18}
          textAnchor="middle"
          className="axis-label"
        >
          {format(t)}
        </text>
      ))}
      <text
        x={frame.innerWidth / 2}
        y={frame.innerHeight + 34}
        textAnchor="middle"
        className="axis-title"
      >
        {label}
      </text>
    </g>
  )
}

/** Emphasised zero line. Deficit versus surplus must be readable by position and
 *  sign, not by colour alone. */
export function ZeroLine({ frame, y }: { frame: Frame; y: number }) {
  return <line x1={0} x2={frame.innerWidth} y1={y} y2={y} stroke="var(--ink)" strokeWidth={1} />
}
