/** The chart primitive.
 *
 *  Accessibility is structural here, not decorative:
 *   - `ariaLabel` states the FINDING, not the shape, and is required.
 *   - A static chart is role="img" so assistive tech reads the label rather
 *     than announcing dozens of unlabelled path elements.
 *   - An `interactive` chart is role="group", and its focusable marks are ONE
 *     ROVING-TABINDEX GROUP: the whole figure costs one Tab stop, and arrow
 *     keys move between the marks inside it (#69). The render prop receives
 *     `mark` as its second argument for exactly that; every focusable mark
 *     spreads `{...mark()}` and none writes `tabIndex` for itself. See
 *     `roving.ts` for why the state is rendered rather than installed at
 *     hydration.
 *   - See TableView for the non-visual equivalent every figure is obliged to
 *     carry. The roving rule may never shorten that route.
 */
import type { ReactNode } from 'react'
import { frame as makeFrame, MARGIN, type Margin } from './scales'
import { useRovingMarks, type MarkFn } from './roving'

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
   *
   * It is also what a roving group is: `role="group"` and `interactive` both
   * mean "this chart has focusable marks". A `[data-mark]` inside a role="img"
   * svg is a failure, asserted by P2.
   */
  interactive?: boolean
  width?: number
  height?: number
  margin?: Margin
  children: (f: ReturnType<typeof makeFrame>, mark: MarkFn) => ReactNode
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
  const { groupProps, mark } = useRovingMarks()
  return (
    <svg
      {...groupProps}
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
      <g transform={`translate(${f.margin.left},${f.margin.top})`}>{children(f, mark)}</g>
    </svg>
  )
}
