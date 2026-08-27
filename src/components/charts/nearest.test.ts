/** Unit guard U1 for the touch readout's nearest-mark resolver (#73), run by
 *  `npm run test:unit`.
 *
 *  Five mutations were performed against this file during exec, each observed to
 *  turn a named case red and then reverted:
 *
 *    U1-a  `nearestBox` returns 0 unconditionally  -> "point inside box 2"
 *    U1-b  `d < best` becomes `d > best`           -> the gap between two boxes
 *    U1-c  the zero-area skip is removed           -> the degenerate box case
 *    U1-d  `-1` becomes `0` for an empty list      -> empty and all-degenerate
 *    U1-e  `dy` is dropped, comparing x only       -> the 2D grid case
 *
 *  U1-e is the one that matters. An x-only resolver passes every band-chart case
 *  in this file and is wrong on every cartogram, so a suite made only of band
 *  cases would go green over it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearestBox, type Box } from './nearest.ts'

/** Three adjacent full-height bands, as a band chart draws them: 10px wide,
 *  gapless, spanning the plot's height. */
const BANDS: Box[] = [
  { left: 0, top: 0, right: 10, bottom: 100 },
  { left: 10, top: 0, right: 20, bottom: 100 },
  { left: 20, top: 0, right: 30, bottom: 100 },
]

/** A 2x2 grid of tiles with gaps, as the state cartogram draws them. */
const GRID: Box[] = [
  { left: 0, top: 0, right: 20, bottom: 20 }, // 0: top-left
  { left: 30, top: 0, right: 50, bottom: 20 }, // 1: top-right
  { left: 0, top: 30, right: 20, bottom: 50 }, // 2: bottom-left
  { left: 30, top: 30, right: 50, bottom: 50 }, // 3: bottom-right
]

test('a point inside a box picks that box, at distance zero', () => {
  // U1-a: a resolver that returns 0 unconditionally fails here.
  assert.equal(nearestBox(BANDS, 25, 50), 2)
  assert.equal(nearestBox(BANDS, 15, 50), 1)
})

test('a point in the gap between two boxes picks the nearer one', () => {
  // U1-b: flipping the comparison fails here.
  const gapped: Box[] = [
    { left: 0, top: 0, right: 10, bottom: 100 },
    { left: 40, top: 0, right: 50, bottom: 100 },
  ]
  assert.equal(nearestBox(gapped, 18, 50), 0, 'nearer the left box')
  assert.equal(nearestBox(gapped, 32, 50), 1, 'nearer the right box')
})

test('a tie resolves to the lower index, which is data order', () => {
  const gapped: Box[] = [
    { left: 0, top: 0, right: 10, bottom: 100 },
    { left: 30, top: 0, right: 40, bottom: 100 },
  ]
  assert.equal(nearestBox(gapped, 20, 50), 0, 'exactly 10px from each')
})

test('a point outside the whole set still resolves — the snap is unconditional', () => {
  assert.equal(nearestBox(BANDS, -500, 50), 0)
  assert.equal(nearestBox(BANDS, 5000, 50), 2)
  assert.equal(nearestBox(BANDS, 15, -900), 1, 'far above the plot')
})

test('a zero-area box directly under the point is skipped', () => {
  // U1-c: without the skip, the degenerate box wins at d = 0 and the reader is
  // told about a datum with no rendered mark. These are the 7 measured on
  // /government.
  const withDegenerate: Box[] = [
    { left: 50, top: 50, right: 50, bottom: 50 }, // 0: zero-area, on the point
    { left: 0, top: 0, right: 10, bottom: 100 }, // 1: real, 40px away
  ]
  assert.equal(nearestBox(withDegenerate, 50, 50), 1)
})

test('a zero-width box is skipped even where it has height, and vice versa', () => {
  const slivers: Box[] = [
    { left: 20, top: 0, right: 20, bottom: 100 }, // zero width
    { left: 0, top: 20, right: 100, bottom: 20 }, // zero height
    { left: 80, top: 80, right: 90, bottom: 90 }, // the only real box
  ]
  assert.equal(nearestBox(slivers, 20, 20), 2)
})

test('an empty list and an all-degenerate list both return -1', () => {
  // U1-d: returning 0 here hands the caller an index into nothing.
  assert.equal(nearestBox([], 10, 10), -1)
  assert.equal(
    nearestBox([{ left: 5, top: 5, right: 5, bottom: 5 }], 5, 5),
    -1,
  )
})

test('on a 2D grid, a point below a tile picks that tile, not the leftmost', () => {
  // U1-e. An x-only resolver returns 0 for all four of these, because tiles 0
  // and 2 share a column and tiles 1 and 3 share a column. This case is the
  // whole reason the resolver is 2D.
  assert.equal(nearestBox(GRID, 10, 24), 0, 'just below the top-left tile')
  assert.equal(nearestBox(GRID, 10, 28), 2, 'further down, the tile below wins')
  assert.equal(nearestBox(GRID, 40, 60), 3, 'below the bottom-right tile')
  assert.equal(nearestBox(GRID, 25, 40), 2, 'right of the bottom-left tile')
})

test('the diagonal case: distance is to the corner, not to an edge', () => {
  const two: Box[] = [
    { left: 0, top: 0, right: 10, bottom: 10 }, // 0
    { left: 100, top: 100, right: 110, bottom: 110 }, // 1
  ]
  // (13, 14) is hypot(3, 4) = 5 from box 0's corner; box 1 is ~123 away.
  assert.equal(nearestBox(two, 13, 14), 0)
})
