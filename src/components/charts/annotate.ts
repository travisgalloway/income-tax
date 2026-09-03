/** Annotation placement, clamped to the SVG's own edges. Issue #64.
 *
 *  Chart.tsx renders with a `viewBox` and no `overflow: visible`, so a label
 *  drawn past the SVG edge is CLIPPED, not spilled: cut mid-glyph, with no
 *  ellipsis and no scrollbar. That is not a layout blemish. Households Fig 4's
 *  `2022: top 1% 31.5%` was rendering as `2022: top 19`, a complete-looking
 *  label carrying a number that is not the number, on a site whose whole claim
 *  is that every figure traces to a source.
 *
 *  So the contract here is stronger than "keep it visible": no placement may be
 *  capable of emitting a partial number that reads as a whole one. A label that
 *  cannot fit is ABSENT (`placeAnnotation` returns `null`), never truncated. The
 *  finding stays reachable regardless, every figure carries a TableView and a
 *  finding-stating `aria-label`, both enforced by the pytest suite.
 *
 *  Pure by construction: no `getBBox`, no `getComputedTextLength`, no `window`,
 *  no `useEffect`. The server render and the hydrated render therefore produce
 *  byte-identical placements, so nothing shifts under the reader on hydration.
 */
import type { Frame } from './scales'

/** Widest realistic advance per character for var(--font-data) at a given size,
 *  as a fraction of the em. Deliberately an OVER-estimate: the failure this
 *  guards is a label clipped mid-number, so clamping a little too early costs a
 *  few units of whitespace, while clamping a little too late reproduces #64.
 *
 *  NEVER LOWER THIS CONSTANT. If a browser measurement recorded in
 *  docs/contracts/accessibility.md exceeds it, raise it.
 *
 *  Must stay equal to ADVANCE_EM in pipeline/tests/test_accessibility.py, which
 *  reproduces this arithmetic against the served bytes. */
export const ADVANCE_EM = 0.62

/** global.css `.annotation` / `.series-label`. */
export const ANNOTATION_FONT_PX = 11.5
/** global.css `.dotplot-average-label` / `.maturity-marker-label`. */
export const SMALL_LABEL_FONT_PX = 10.5
/** global.css `.holders-label` / `.maturity-label`. */
export const DATA_LABEL_FONT_PX = 11

export type Anchor = 'start' | 'middle' | 'end'

/** Which rectangle a label is held inside.
 *
 *  `surface` is the SVG itself, and it is the right bound for a label whose
 *  only enemy is the clip: an end-of-line series name is free to sit over the
 *  right margin. `plot` is the plot rect, and it is the right bound for a label
 *  that would otherwise slide into a GUTTER THAT IS ALREADY OCCUPIED.
 *  `DebtMaturity`'s bills band starts at year zero, so its centred band label
 *  reached 4 units past the surface's left edge and painted across the y-axis
 *  ticks; nothing was clipped, and the number was still unreadable. */
export type Within = 'surface' | 'plot'

export interface Placement {
  x: number
  textAnchor: Anchor
}

/** Upper bound on the rendered advance width of `label`, in user units. */
export function estimateTextWidth(label: string, fontPx: number = ANNOTATION_FONT_PX): number {
  return label.length * fontPx * ADVANCE_EM
}

/** Height of one painted line, as a fraction of the em: ascent plus descent,
 *  MEASURED in Chromium against `var(--font-data)` at 10.5 and 11.5px. An
 *  over-estimate for the same reason `ADVANCE_EM` is one. */
export const LINE_EM = 1.32

/** The vertical extent of one line of text, in user units. */
export function labelHeight(fontPx: number = ANNOTATION_FONT_PX): number {
  return fontPx * LINE_EM
}

/** A label's painted box, from its placement and its baseline.
 *
 *  The baseline is not the box's centre: glyphs sit mostly above it. The split
 *  here is the same 0.8/0.2 ascent-to-descent ratio the axis-title band uses. */
export function labelBox(
  placed: Placement,
  y: number,
  width: number,
  fontPx: number = ANNOTATION_FONT_PX,
): Box {
  const h = labelHeight(fontPx)
  const left =
    placed.textAnchor === 'end'
      ? placed.x - width
      : placed.textAnchor === 'middle'
        ? placed.x - width / 2
        : placed.x
  return { left, right: left + width, top: y - h * 0.8, bottom: y + h * 0.2 }
}

export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Baselines pushed down the page until no two labels touch.
 *
 * `ys` must already be in the order the labels read, top to bottom, which for
 * a set of end-of-line series names is the order of the series values at that
 * year. Each label stays at its own baseline wherever the one above it allows,
 * so a panel whose series are far apart is unchanged.
 *
 * THIS IS THE ANSWER FOR A SERIES NAME, where `keepUnclashed` is not. Three
 * converging rates on `/economy` §4 sat within 0.2 percentage points of each
 * other in FY2025, and hand-tuned offsets of -8, +14 and -20 put `Fed funds`
 * across `10-year note`. Dropping one would take away the only channel naming
 * a line that is not its colour.
 */
export function stackDown(
  ys: readonly number[],
  fontPx: number = ANNOTATION_FONT_PX,
  gap = 2,
): number[] {
  const step = labelHeight(fontPx) + gap
  const out: number[] = []
  ys.forEach((y, i) => {
    const above = out[i - 1]
    out.push(above == null ? y : Math.max(y, above + step))
  })
  return out
}

export interface Candidate {
  x: number
  y: number
  label: string
  anchor?: Anchor
  fontPx?: number
  flip?: boolean
  gap?: number
  within?: Within
}

/**
 * The candidates that can be painted without landing on one already kept.
 *
 * Returns INDICES into the input, in input order, and the input order is
 * PRIORITY order: the first candidate is never dropped, and each later one is
 * kept only if its box clears every box already kept.
 *
 * The same contract `placeAnnotation` states for the SVG's edges, applied to
 * the labels themselves. An absent label beats one painted across another, for
 * the same reason: two overlapping numbers are two numbers a reader cannot
 * read, and every value on this site is also in the figure's `TableView` and
 * its `aria-label`.
 *
 * NOT FOR A SERIES NAME. Dropping a direct series label removes the channel
 * that identifies a line without colour, so a crowded pair of series names is
 * separated (see `labelHeight`), never thinned.
 */
export function keepUnclashed(
  candidates: readonly Candidate[],
  frame: Frame,
  pad = 1,
): number[] {
  const kept: number[] = []
  const boxes: Box[] = []
  candidates.forEach((c, i) => {
    const fontPx = c.fontPx ?? ANNOTATION_FONT_PX
    const width = estimateTextWidth(c.label, fontPx)
    const placed = placeAnnotation({ ...c, frame, fontPx, width })
    if (placed === null) return
    const box = labelBox(placed, c.y, width, fontPx)
    const clash = boxes.some(
      (b) =>
        box.left < b.right - pad &&
        box.right > b.left + pad &&
        box.top < b.bottom - pad &&
        box.bottom > b.top + pad,
    )
    if (clash) return
    kept.push(i)
    boxes.push(box)
  })
  return kept
}

/** The horizontal span visible inside the SVG, in the local coordinates chart
 *  children work in.
 *
 *  Chart.tsx wraps children in `<g transform="translate(margin.left,
 *  margin.top)">`, so local x = 0 is the left edge of the PLOT, and the SVG's
 *  own left edge is at `-margin.left`. Clipping cares about the SVG edges, not
 *  the plot rect, an annotation is free to sit over the margin, it is only
 *  forbidden to leave the viewBox. */
export function visibleSpan(frame: Frame, pad = 2, within: Within = 'surface'): [number, number] {
  if (within === 'plot') return [pad, frame.innerWidth - pad]
  return [-frame.margin.left + pad, frame.innerWidth + frame.margin.right - pad]
}

function boxFor(x: number, w: number, anchor: Anchor): [number, number] {
  if (anchor === 'start') return [x, x + w]
  if (anchor === 'end') return [x - w, x]
  return [x - w / 2, x + w / 2]
}

const OPPOSITE: Record<Anchor, Anchor> = { start: 'end', end: 'start', middle: 'middle' }

/** A shift lands the box exactly on the span edge, and `x + (lo - x)` is not
 *  bit-identical to `lo` in binary floating point. Without this tolerance a
 *  just-shifted placement re-reads as still overrunning, and placing it a
 *  second time flips it, i.e. the helper would not be idempotent, and a chart
 *  that re-renders (Households' year-range slider, E3) could oscillate. */
const EPS = 1e-9

/**
 * Place an annotation so its whole box lies inside the SVG.
 *
 * Returns `null` when the label cannot fit in the span at all; the caller must
 * then render nothing. Returns the ORIGINAL `{x, anchor}` unchanged whenever
 * the label already fits, so no currently-correct annotation moves.
 *
 * Order matters, flip before shift. A right-edge label re-anchored to `end` at
 * the same reference point stays attached to the thing it names; one slid
 * leftward along the axis can drift over the series it is labelling. `middle`
 * has no opposite, so it shifts, and by the minimum amount the edge forces.
 */
export function placeAnnotation(opts: {
  x: number
  label: string
  frame: Frame
  anchor?: Anchor
  fontPx?: number
  pad?: number
  flip?: boolean
  /** Clearance between the reference point `x` and the near edge of the label,
   *  applied in whichever direction the anchor points.
   *
   *  This exists because a fixed pre-offset does NOT survive a flip. Writing
   *  `x: rule + 4` for a `start`-anchored label reads as "4 units right of the
   *  rule"; flip it to `end` and the same number becomes "overlap the rule by
   *  4", because the label now grows leftward from a point past its reference.
   *  A `gap` flips its sign with the anchor, so the clearance means the same
   *  thing on both sides. */
  gap?: number
  /** Override the measured width, for multi-line `<tspan>` labels whose width
   *  is the widest LINE, not the concatenation of them. */
  width?: number
  /** Which rectangle holds the label. See `Within`. */
  within?: Within
}): Placement | null {
  const {
    x, label, frame, anchor = 'start', fontPx = ANNOTATION_FONT_PX, pad = 2, flip = true, gap = 0,
    within = 'surface',
  } = opts
  const w = opts.width ?? estimateTextWidth(label, fontPx)
  const [lo, hi] = visibleSpan(frame, pad, within)

  // Wider than everything there is. Absent beats truncated, see the header.
  if (w > hi - lo) return null

  /** Where the label's reference sits once `gap` is applied for anchor `a`. */
  const at = (a: Anchor) => (a === 'start' ? x + gap : a === 'end' ? x - gap : x)

  const fits = (a: Anchor) => {
    const [l, r] = boxFor(at(a), w, a)
    return l >= lo - EPS && r <= hi + EPS
  }

  if (fits(anchor)) return { x: at(anchor), textAnchor: anchor }

  if (flip && anchor !== 'middle' && fits(OPPOSITE[anchor])) {
    return { x: at(OPPOSITE[anchor]), textAnchor: OPPOSITE[anchor] }
  }

  const [l, r] = boxFor(at(anchor), w, anchor)
  const dx = l < lo ? lo - l : hi - r
  return { x: at(anchor) + dx, textAnchor: anchor }
}
