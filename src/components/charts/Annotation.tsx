/** The one way an annotation reaches the DOM. Issue #64.
 *
 *  Every direct label on this site goes through here, so there is a single
 *  place where the clamp in `annotate.ts` is applied and a single place to
 *  audit. That is deliberate: `placeAnnotation` can return `null` for a label
 *  too wide to fit, and a call site that forgot to honour `null` would draw the
 *  very truncated number #64 is about. Here it cannot be forgotten — `null`
 *  renders nothing.
 *
 *  Consequence for reviewers and for the pytest audit: `className="annotation"`
 *  (and the two small-label classes) should appear in exactly ONE file under
 *  `src/components/`, this one. An island writing a bare `<text
 *  className="annotation">` has escaped the clamp.
 */
import type { Frame } from './scales'
import {
  ANNOTATION_FONT_PX,
  SMALL_LABEL_FONT_PX,
  estimateTextWidth,
  placeAnnotation,
  type Anchor,
} from './annotate'

/** Font size per annotation class, from global.css. Must stay in step with
 *  ANNOTATION_FONT_PX in pipeline/tests/test_accessibility.py. */
const FONT_PX_BY_CLASS: Record<string, number> = {
  annotation: ANNOTATION_FONT_PX,
  'series-label': ANNOTATION_FONT_PX,
  'dotplot-average-label': SMALL_LABEL_FONT_PX,
  'maturity-marker-label': SMALL_LABEL_FONT_PX,
}

function fontPxFor(className: string): number {
  for (const token of className.split(/\s+/)) {
    const px = FONT_PX_BY_CLASS[token]
    if (px != null) return px
  }
  return ANNOTATION_FONT_PX
}

export interface AnnotationProps {
  frame: Frame
  /** Where the label WANTS to be, in the local coordinates chart children use. */
  x: number
  y?: number
  dy?: string
  /** The label text. A string, not children, because its width is what the
   *  clamp is computed from — JSX children cannot be measured. */
  label: string
  /** Further lines, rendered as `<tspan>`s sharing one placement. The width
   *  used is the WIDEST line, never the concatenation of them. */
  lines?: string[]
  anchor?: Anchor
  className?: string
  /** The italic end-of-line series name variant (global.css `.series-label`).
   *  A flag rather than a class string, so the class itself is written in this
   *  file and nowhere else — which is the invariant
   *  `test_every_annotation_is_placed_through_the_clamp` greps for. */
  seriesLabel?: boolean
  fill?: string
  /** Set false where flipping the anchor would read worse than sliding. */
  flip?: boolean
  pad?: number
}

export function Annotation({
  frame,
  x,
  y,
  dy,
  label,
  lines,
  anchor = 'start',
  className = 'annotation',
  seriesLabel = false,
  fill,
  flip,
  pad,
}: AnnotationProps) {
  const cls = seriesLabel ? `${className} series-label` : className
  const fontPx = fontPxFor(cls)
  const all = lines?.length ? [label, ...lines] : [label]
  const width = Math.max(...all.map((line) => estimateTextWidth(line, fontPx)))
  const placed = placeAnnotation({ x, label, width, frame, anchor, fontPx, flip, pad })
  if (!placed) return null
  return (
    <text x={placed.x} y={y} dy={dy} textAnchor={placed.textAnchor} className={cls} fill={fill}>
      {lines?.length
        ? all.map((line, i) => (
            <tspan key={line} x={placed.x} dy={i === 0 ? undefined : '1.15em'}>
              {line}
            </tspan>
          ))
        : label}
    </text>
  )
}
