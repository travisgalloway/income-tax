/** The tile-grid cartogram: layout and colour scale for the state give/get map.
 *
 *  A geographic choropleth needs a projection library (`topojson-client` +
 *  `us-atlas`), which this repo does not carry, and geographic area is not
 *  population anyway, it would make Wyoming shout and Rhode Island vanish,
 *  the exact "absolute favours large states" distortion §11 asks readers to
 *  be able to reverse. This is a plain 11x8 grid of equal squares instead:
 *  one per jurisdiction, at its familiar relative position, drawn with plain
 *  `<rect>`s. Zero new dependencies, legible at 390px.
 */

export const GRID_COLS = 11
export const GRID_ROWS = 8

/** row/col position of each of the 50 states plus DC. No territory is drawn
 *  on the grid (see docs/contracts/interfaces/state-data.md). */
export const TILES: Record<string, { row: number; col: number }> = {
  AK: { row: 0, col: 0 }, ME: { row: 0, col: 10 },
  VT: { row: 1, col: 9 }, NH: { row: 1, col: 10 },
  WA: { row: 2, col: 0 }, ID: { row: 2, col: 1 }, MT: { row: 2, col: 2 }, ND: { row: 2, col: 3 },
  MN: { row: 2, col: 4 }, WI: { row: 2, col: 6 }, MI: { row: 2, col: 7 }, NY: { row: 2, col: 8 },
  MA: { row: 2, col: 9 }, RI: { row: 2, col: 10 },
  OR: { row: 3, col: 0 }, NV: { row: 3, col: 1 }, WY: { row: 3, col: 2 }, SD: { row: 3, col: 3 },
  IA: { row: 3, col: 4 }, IL: { row: 3, col: 5 }, IN: { row: 3, col: 6 }, OH: { row: 3, col: 7 },
  PA: { row: 3, col: 8 }, NJ: { row: 3, col: 9 }, CT: { row: 3, col: 10 },
  CA: { row: 4, col: 0 }, UT: { row: 4, col: 1 }, CO: { row: 4, col: 2 }, NE: { row: 4, col: 3 },
  MO: { row: 4, col: 4 }, KY: { row: 4, col: 5 }, WV: { row: 4, col: 6 }, VA: { row: 4, col: 7 },
  MD: { row: 4, col: 8 }, DE: { row: 4, col: 9 },
  AZ: { row: 5, col: 1 }, NM: { row: 5, col: 2 }, KS: { row: 5, col: 3 }, AR: { row: 5, col: 4 },
  TN: { row: 5, col: 5 }, NC: { row: 5, col: 7 }, DC: { row: 5, col: 8 },
  OK: { row: 6, col: 3 }, LA: { row: 6, col: 4 }, MS: { row: 6, col: 5 }, AL: { row: 6, col: 6 },
  GA: { row: 6, col: 7 }, SC: { row: 6, col: 8 },
  HI: { row: 7, col: 0 }, TX: { row: 7, col: 3 }, FL: { row: 7, col: 9 },
}

/* The ramp's three stops, NAMED rather than copied. `--int` is the amber a
 * state that gives more takes, `--panel` is the zero midpoint, and `--disc` is
 * the teal a state that gets more takes.
 *
 * They were three hardcoded RGB triples until the site shipped a working dark
 * palette. Two defects came with the copy, and one of them is the reason the
 * copy is now gone rather than merely refreshed:
 *
 *  1. IT WAS THEME-BLIND. A hex triple cannot know which palette is in force,
 *     so the cartogram painted the light ramp in dark mode. `--panel` at
 *     `#f3f4f0` is near-white and every mid-range tile glared against the dark
 *     ground at `#16130f`.
 *  2. IT WAS STALE IN LIGHT MODE TOO. The triples were the pre-Financial-Times
 *     values. `tokens.css` had moved to `--int: #a85c11`, `--panel: #eae2d4`
 *     and `--disc: #0d7680`, and no test compared the two files.
 *
 * `color-mix()` removes the copy instead of maintaining it. The browser
 * resolves `var(--int)` and `var(--panel)` at paint time, in whichever palette
 * the cascade has settled on, so a theme switch repaints the tiles with no
 * JavaScript, no `getComputedStyle`, and no observer watching `data-theme`. It
 * also keeps this module PURE, which is what let the server render the
 * cartogram with correct fills in `dist/` rather than a fallback ramp the
 * island would have to correct on hydration.
 *
 * `in srgb` is the same interpolation space the hand-written lerp used, so the
 * ramp's geometry is unchanged; only the endpoints move with the theme. */

/** Diverging fill for a balance value against a symmetric [-bound, bound]
 *  domain. Non-partisan by construction: this module names no party colour
 *  token, only the budget-category ramp described above. */
export function divergingFill(v: number | null, bound: number): string {
  if (v == null || bound <= 0) return 'var(--rule)'
  const t = Math.max(-1, Math.min(1, v / bound))
  /* The weight is the DISTANCE from the midpoint, so both halves read the same
   * way: 0 is pure `--panel` and 1 is the pure endpoint. Rounded to two places
   * because an unrounded ratio prints 17 digits into every one of 51 tiles. */
  const weight = (Math.abs(t) * 100).toFixed(2)
  const stop = t < 0 ? 'var(--int)' : 'var(--disc)'
  return `color-mix(in srgb, ${stop} ${weight}%, var(--panel))`
}
