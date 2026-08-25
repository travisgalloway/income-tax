/** The tile-grid cartogram: layout and colour scale for the state give/get map.
 *
 *  A geographic choropleth needs a projection library (`topojson-client` +
 *  `us-atlas`), which this repo does not carry, and geographic area is not
 *  population anyway — it would make Wyoming shout and Rhode Island vanish,
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

// Mirrors src/styles/tokens.css `--int` (amber, gives more), `--panel`
// (stone, the zero midpoint) and `--disc` (teal, gets more). A pure data
// module cannot read a CSS custom property's computed value without a DOM,
// so these three stops are kept in sync with tokens.css by hand.
const NEG = { r: 0xc7, g: 0x7d, b: 0x28 } // --int
const MID = { r: 0xf3, g: 0xf4, b: 0xf0 } // --panel
const POS = { r: 0x3e, g: 0x7c, b: 0x86 } // --disc

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** Diverging fill for a balance value against a symmetric [-bound, bound]
 *  domain. Non-partisan by construction: this module reads no party colour
 *  token, only the budget-category ramp declared above. */
export function divergingFill(v: number | null, bound: number): string {
  if (v == null || bound <= 0) return 'var(--rule)'
  const t = Math.max(-1, Math.min(1, v / bound))
  const [from, to, u] = t < 0 ? [NEG, MID, t + 1] : [MID, POS, t]
  return `rgb(${lerp(from.r, to.r, u)}, ${lerp(from.g, to.g, u)}, ${lerp(from.b, to.b, u)})`
}
