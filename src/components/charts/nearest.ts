/** Nearest-mark resolution for the touch readout. Issue #73.
 *
 *  WHY THIS EXISTS AT ALL. At 390px a chart draws 389 marks across 350px of
 *  plot — 0.9px per datum, against a 3.317px mark. No per-mark geometry change
 *  reaches 24px, let alone 44px, so on a device that cannot hover the marks stop
 *  being hit targets and the plot becomes ONE 350x237px target with the nearest
 *  mark resolved from the pointer's position (`roving.ts`).
 *
 *  WHAT "NEAREST" MEANS, EXACTLY. Minimum Euclidean distance from the point to
 *  the box, zero when the point is inside it:
 *      dx = max(left - x, 0, x - right)
 *      dy = max(top - y, 0, y - bottom)
 *      d  = hypot(dx, dy)
 *  Ties resolve to the LOWER index, which is data order.
 *
 *  TWO DIMENSIONS, NOT ONE. The naive resolver compares x only, and it passes
 *  every band-chart case — full-height bands degenerate to nearest-in-x on their
 *  own. It is wrong on every cartogram and every treemap, where a point below a
 *  tile must pick that tile and not the leftmost one in the row. `nearest.test.ts`
 *  carries that case (U1-e) because the wrong implementation is the tempting one.
 *
 *  ZERO-AREA BOXES ARE SKIPPED. `/government` renders 7 focusable `[data-mark]`
 *  elements with no rendered box (5 presidential-term rects in `LawExplorer`,
 *  2 "none levied" groups in `StateTaxMix`, measured at `c6c867d`). They are
 *  reachable by keyboard and invisible on screen; a tap must never select one,
 *  because the reader would be told about a datum they cannot see. WHY they
 *  exist is #30/#80's question, parked, not this module's.
 *
 *  THE SNAP IS UNCONDITIONAL. There is no "missed" outcome and no maximum
 *  distance: a pointerdown anywhere inside the `<svg>` selects a mark, because a
 *  reader who taps a chart wants a number, not silence. `-1` comes back only
 *  when there is no non-degenerate box to pick at all.
 *
 *  Pure: no DOM types, no React. `DOMRect` satisfies `Box` structurally, so the
 *  caller passes `getBoundingClientRect()` results straight in.
 */

/** The four edges, in the same client coordinates as the pointer. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Index of the box nearest `(x, y)`, or `-1` when none is selectable. */
export function nearestBox(boxes: readonly Box[], x: number, y: number): number {
  let winner = -1
  let best = Infinity
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    if (b === undefined) continue
    // A box with no area is not on screen. Skipped before it can win at d = 0.
    if (b.right - b.left <= 0 || b.bottom - b.top <= 0) continue
    const dx = Math.max(b.left - x, 0, x - b.right)
    const dy = Math.max(b.top - y, 0, y - b.bottom)
    const d = Math.hypot(dx, dy)
    // STRICTLY less than: a tie keeps the earlier box, so ties resolve to data
    // order rather than to whichever box the browser happened to lay out last.
    if (d < best) {
      best = d
      winner = i
    }
  }
  return winner
}
