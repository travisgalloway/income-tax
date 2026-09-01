/** Axis text fit. Issue #66.
 *
 *  `annotate.ts` owns the four DIRECT-LABEL classes (#64). This file owns the
 *  other half of the same defect: axis text, left-gutter tick labels, bottom
 *  tick labels, and the rotated axis title, which #64 deliberately scoped out
 *  and which is where the 390px sweep's remaining overruns live.
 *
 *  The failure is the same one, and it is a correctness failure rather than a
 *  layout one: `Chart.tsx` renders with a `viewBox` and no `overflow: visible`,
 *  so a tick label wider than its gutter is CUT MID-GLYPH. `$30,000,000` at
 *  `x={-8}` against a 60-unit gutter shipped as `0,000,000`, a complete-looking
 *  number that is not the number.
 *
 *  Three geometries, three different remedies, and the difference matters:
 *
 *  - **Bottom ticks** are clamped, by `placeTickLabel`. Shift-only, never flip:
 *    an axis tick re-anchored `end` jumps a whole label-width away from its own
 *    gridline, which turns a layout defect into a misreading. The shift is the
 *    minimum the edge forces, at most ~8 units at the 360 preset, so the
 *    label stays visually attached to its tick.
 *
 *  - **Left ticks are NOT clamped.** A left tick pushed inward lands *in the
 *    plot*, on top of the data it labels. There is no placement that rescues a
 *    label too wide for its gutter, so the contract is enforced at the CALL
 *    SITE instead: pick a formatter whose output fits (`leftGutterFits`), or
 *    move the labels out of the gutter altogether. `pipeline/tests/
 *    test_accessibility.py::test_every_left_axis_tick_fits_its_gutter` asserts
 *    the result against the served bytes, and `axisFit.test.ts` asserts every
 *    formatter in `format.ts` against the narrow gutter.
 *
 *  - **The rotated axis title** has its LENGTH on the vertical axis, so a
 *    horizontal guard is blind to it (E7). `placeAxisTitleY` shifts it along
 *    the axis it actually runs on.
 *
 *  Pure by construction, exactly as `annotate.ts` is: no `getBBox`, no
 *  `getComputedTextLength`, no `window`, no `useEffect`. The server render and
 *  the hydrated render therefore produce byte-identical placements.
 */
import type { Frame } from './scales'
import { estimateTextWidth, placeAnnotation, visibleSpan, type Anchor, type Placement } from './annotate.ts'

/** global.css `.axis-label`. */
export const AXIS_LABEL_FONT_PX = 11
/** global.css `.axis-title` and `.panel-title`. */
export const AXIS_TITLE_FONT_PX = 10.5

/** The offset `Axis.tsx` places left-axis ticks at, end-anchored. */
export const TICK_OFFSET = 8

/**
 * Room for a left-axis tick label, in user units.
 *
 * `AxisLeft` draws each tick at `x = -offset`, `end`-anchored, so the label
 * grows leftward and the SVG's own left edge is at `-margin.left`. What is left
 * over is `margin.left - offset - pad`: 64 units at the 720 preset, 42 at 360.
 * At 11px and `ADVANCE_EM = 0.62` that is 9.3 and 6.1 characters respectively,
 * which is the whole reason `dollars()` cannot be an axis formatter.
 */
export function leftGutterRoom(frame: Frame, offset: number = TICK_OFFSET, pad = 2): number {
  return Math.max(0, frame.margin.left - offset - pad)
}

/**
 * Distance from the surface's left edge to the rotated axis title's baseline.
 *
 * The title is drawn `translate(AXIS_TITLE_X, y) rotate(-90)`, so its ADVANCE
 * runs down the page and what sits on the x axis is the font's ascent on one
 * side of the baseline and its descent on the other. MEASURED in Chromium at
 * both presets: the box runs 2.7 to 14.1 for this value, being 9.3 units of
 * ascent and 2.1 of descent.
 */
export const AXIS_TITLE_X = 12

/** The ascent-plus-descent band the rotated title occupies, as a fraction of
 *  the em. See `AXIS_TITLE_X` for the measurement it comes from. */
const TITLE_BAND_EM = 1.09
/** How far the title's box reaches RIGHT of its own baseline, as a fraction of
 *  the em: the font's descent. */
const TITLE_DESCENT_EM = 0.2

/**
 * Room for a left-axis tick label BESIDE the rotated axis title, in user units.
 *
 * `leftGutterRoom` measures to the surface's own edge, which is the right
 * question for clipping and the wrong one for legibility: the title sits in
 * that same gutter, so a label can satisfy `leftGutterFits` and still land on
 * the title. MEASURED at the 360 preset, where the gutter is 52 units and the
 * tick anchor is at 44: `$10.00T` needs 41.4 units, passes `leftGutterFits`'s
 * 42, and starts at 2.6, which is inside the title's own band.
 *
 * The two are therefore both required and neither replaces the other. A tick
 * must fit the gutter (or it is CUT, see this file's header) and it must fit
 * this narrower room (or it is merely unreadable).
 */
export function leftTickRoom(
  frame: Frame,
  offset: number = TICK_OFFSET,
  titleX: number = AXIS_TITLE_X,
  titleFontPx: number = AXIS_TITLE_FONT_PX,
  pad = 2,
): number {
  const titleRight = titleX + titleFontPx * TITLE_DESCENT_EM
  return Math.max(0, frame.margin.left - offset - titleRight - pad)
}

/** The width the rotated title's box occupies across the gutter. */
export function axisTitleBand(fontPx: number = AXIS_TITLE_FONT_PX): number {
  return fontPx * TITLE_BAND_EM
}

/** Whether `label` fits the left gutter without leaving the SVG. */
export function leftGutterFits(
  label: string,
  frame: Frame,
  fontPx: number = AXIS_LABEL_FONT_PX,
  offset: number = TICK_OFFSET,
): boolean {
  return estimateTextWidth(label, fontPx) <= leftGutterRoom(frame, offset)
}

/** Whether EVERY label fits, the all-or-none test a categorical axis needs.
 *
 *  A per-label decision would put some categories in the gutter and others
 *  inside the plot on the same axis, which reads as a rendering fault rather
 *  than as a narrow-viewport treatment. */
export function everyLeftGutterLabelFits(
  labels: readonly string[],
  frame: Frame,
  fontPx: number = AXIS_LABEL_FONT_PX,
  offset: number = TICK_OFFSET,
): boolean {
  return labels.every((label) => leftGutterFits(label, frame, fontPx, offset))
}

/**
 * A bottom-axis tick label, shifted, never flipped, to stay inside the SVG.
 *
 * Returns `null` only when the label is wider than the entire visible span, in
 * which case the caller must render nothing: absent beats a partial number.
 * Returns the tick's own `x` unchanged whenever it already fits, so no
 * currently-correct tick moves (criterion 5).
 */
export function placeTickLabel(
  x: number,
  label: string,
  frame: Frame,
  fontPx: number = AXIS_LABEL_FONT_PX,
): Placement | null {
  return placeAnnotation({ x, label, frame, anchor: 'middle', fontPx, flip: false })
}

/** The horizontal room a label anchored `anchor` at `x` has before it leaves
 *  the SVG, in user units, the width budget a variant ladder must fit. */
export function spanRoomAt(x: number, frame: Frame, anchor: Anchor = 'middle', pad = 2): number {
  const [lo, hi] = visibleSpan(frame, pad)
  if (anchor === 'start') return Math.max(0, hi - x)
  if (anchor === 'end') return Math.max(0, x - lo)
  return Math.max(0, 2 * Math.min(x - lo, hi - x))
}

/**
 * The first variant that fits `maxWidth`, or `null` if none does.
 *
 * The ladder runs long → short, and the choice is recomputed from the frame's
 * own numbers on every render. That is what makes a fit-driven label
 * vintage-proof (E6): `/government` §2's foreign share moves with every
 * Treasury release, so a variant keyed on today's segment widths would regress
 * on the next data refresh while this one re-picks.
 */
export function firstThatFits(
  variants: readonly string[],
  maxWidth: number,
  fontPx: number = AXIS_LABEL_FONT_PX,
): string | null {
  for (const variant of variants) {
    if (estimateTextWidth(variant, fontPx) <= maxWidth) return variant
  }
  return null
}

/**
 * Pairs of adjacent tick labels whose painted boxes overlap, the density check.
 *
 * Reported rather than fixed: thinning a tick set is the caller's decision
 * (`scale.ticks(n)` takes the count), and silently dropping a tick here would
 * change what the axis says without the call site knowing.
 */
export function tickLabelOverlaps(
  ticks: readonly number[],
  format: (v: number) => string,
  scale: (v: number) => number,
  frame: Frame,
  fontPx: number = AXIS_LABEL_FONT_PX,
): Array<[string, string]> {
  const boxes: Array<[string, number, number]> = []
  for (const t of ticks) {
    const label = format(t)
    const placed = placeTickLabel(scale(t), label, frame, fontPx)
    if (!placed) continue
    const w = estimateTextWidth(label, fontPx)
    const half = placed.textAnchor === 'middle' ? w / 2 : 0
    const left = placed.textAnchor === 'end' ? placed.x - w : placed.x - half
    boxes.push([label, left, left + w])
  }
  boxes.sort((a, b) => a[1] - b[1])
  const clashes: Array<[string, string]> = []
  for (let i = 1; i < boxes.length; i++) {
    if (boxes[i][1] < boxes[i - 1][2]) clashes.push([boxes[i - 1][0], boxes[i][0]])
  }
  return clashes
}

/**
 * The ticks that can be labelled without two labels touching.
 *
 * `tickLabelOverlaps` reports collisions and deliberately fixes none, because
 * thinning is the caller's decision. This is the caller's decision, expressed
 * once: keep the first tick, keep the last tick, and keep a middle tick only
 * where its label clears both the tick kept before it and the last one.
 *
 * FOR A TICK SET THE CALLER CHOSE, not for a generated one. `scale.ticks(n)`
 * takes a count and should be given a smaller one. `Top1TaxShare` cannot: its
 * ticks are the five tax years the IRS has published, 2021, 2022 and 2023 are
 * 13 units apart at the 360 preset, and a 4-digit label needs 24, so three of
 * the five overlapped by about 11px. The years that remain are real; none is
 * invented by interpolation.
 */
export function thinTicks(
  ticks: readonly number[],
  format: (v: number) => string,
  scale: (v: number) => number,
  frame: Frame,
  fontPx: number = AXIS_LABEL_FONT_PX,
): number[] {
  if (ticks.length < 3) return [...ticks]
  const box = (t: number): [number, number] | null => {
    const label = format(t)
    const placed = placeTickLabel(scale(t), label, frame, fontPx)
    if (placed === null) return null
    const w = estimateTextWidth(label, fontPx)
    const left = placed.textAnchor === 'end' ? placed.x - w : placed.x - w / 2
    return [left, left + w]
  }
  const first = ticks[0] as number
  const last = ticks[ticks.length - 1] as number
  const lastBox = box(last)
  const kept: number[] = [first]
  let prev = box(first)
  for (const t of ticks.slice(1, -1)) {
    const b = box(t)
    if (b === null) continue
    if (prev !== null && b[0] < prev[1]) continue
    if (lastBox !== null && lastBox[0] < b[1]) continue
    kept.push(t)
    prev = b
  }
  kept.push(last)
  return kept
}

/**
 * Vertical room for `AxisLeft`'s rotated title, in user units (E7).
 *
 * `rotate(-90)` puts the title's ADVANCE on the y axis, so what bounds it is
 * the SVG's height, not its width, and a guard that walks x is blind to it.
 * Measured against the whole viewBox rather than `innerHeight`, because a title
 * is free to sit over the top and bottom margins; it is only forbidden to leave
 * the SVG.
 */
export function rotatedTitleRoom(frame: Frame, pad = 2): number {
  return Math.max(0, frame.height - 2 * pad)
}

/** Whether the rotated axis title fits the SVG's height. */
export function rotatedTitleFits(
  label: string,
  frame: Frame,
  fontPx: number = AXIS_TITLE_FONT_PX,
  pad = 2,
): boolean {
  return estimateTextWidth(label, fontPx) <= rotatedTitleRoom(frame, pad)
}

/**
 * The local y for `AxisLeft`'s rotated title, shifted so its whole box lies
 * inside the SVG.
 *
 * "Local" is the plot's coordinate system, `Chart.tsx` wraps children in
 * `translate(margin.left, margin.top)`, so global y is `margin.top + local`.
 * The plot's vertical centre is the natural home, and it is returned unchanged
 * whenever the title fits there. It often does not on a short panel, because
 * the two margins are asymmetric (50 below, 22 above at the 360 preset), so the
 * plot centre is well above the SVG centre.
 *
 * A title too long for the SVG at all is centred rather than dropped: an axis
 * with no unit violates BRIEF.md rule 2, which is a worse outcome than a
 * clipped word, and no axis title on this site carries a number that could be
 * misread when cut. `rotatedTitleFits` is asserted for every shipped title in
 * `axisFit.test.ts`, so the unfittable case fails CI rather than shipping.
 */
export function placeAxisTitleY(
  label: string,
  frame: Frame,
  fontPx: number = AXIS_TITLE_FONT_PX,
  pad = 2,
): number {
  const half = estimateTextWidth(label, fontPx) / 2
  const centre = frame.innerHeight / 2
  if (!rotatedTitleFits(label, frame, fontPx, pad)) return frame.height / 2 - frame.margin.top
  const lo = pad + half - frame.margin.top
  const hi = frame.height - pad - half - frame.margin.top
  return Math.min(Math.max(centre, lo), hi)
}
