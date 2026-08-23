/** The chart primitive.
 *
 *  Accessibility is structural here, not decorative:
 *   - `ariaLabel` states the FINDING, not the shape, and is required.
 *   - The SVG is role="img" so assistive tech reads the label rather than
 *     announcing dozens of unlabelled path elements.
 *   - Anything interactive inside is exposed separately; see TableView for the
 *     non-visual equivalent every figure is obliged to carry.
 */
import type { ReactNode } from 'react'
import { frame as makeFrame, MARGIN, type Margin } from './scales'

export interface ChartProps {
  /** The finding, in a sentence. Not a description of the shape. */
  ariaLabel: string
  /**
   * True when the chart contains focusable data points.
   *
   * This changes the SVG's role, and the reason is not cosmetic: assistive tech
   * treats the subtree of a role="img" element as presentational, so focusable
   * children inside one are announced inconsistently or not at all. A chart with
   * keyboard-reachable points is a group that has a label, not a single image.
   * Static charts keep role="img" per BRIEF.md.
   */
  interactive?: boolean
  width?: number
  height?: number
  margin?: Margin
  children: (f: ReturnType<typeof makeFrame>) => ReactNode
  className?: string
}

export function Chart({
  ariaLabel,
  interactive = false,
  width = 720,
  height = 380,
  margin = MARGIN,
  children,
  className,
}: ChartProps) {
  const f = makeFrame(width, height, margin)
  return (
    <svg
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ? `chart ${className}` : 'chart'}
    >
      <rect
        x={f.margin.left}
        y={f.margin.top}
        width={f.innerWidth}
        height={f.innerHeight}
        fill="var(--panel)"
      />
      <g transform={`translate(${f.margin.left},${f.margin.top})`}>{children(f)}</g>
    </svg>
  )
}
