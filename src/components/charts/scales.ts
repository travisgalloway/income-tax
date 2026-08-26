/** Shared chart geometry. Deliberately small: d3-scale and d3-shape do the maths,
 *  this file only fixes the conventions so every chart on the site agrees. */
import { scaleLinear, scaleLog, scalePoint, type ScaleLinear } from 'd3-scale'

export interface Margin { top: number; right: number; bottom: number; left: number }

export const MARGIN: Margin = { top: 16, right: 20, bottom: 32, left: 56 }

export interface Frame {
  width: number
  height: number
  margin: Margin
  innerWidth: number
  innerHeight: number
}

export function frame(width = 720, height = 380, margin: Margin = MARGIN): Frame {
  return {
    width,
    height,
    margin,
    innerWidth: Math.max(0, width - margin.left - margin.right),
    innerHeight: Math.max(0, height - margin.top - margin.bottom),
  }
}

export function linear(domain: [number, number], range: [number, number]): ScaleLinear<number, number> {
  return scaleLinear().domain(domain).range(range)
}

export { scaleLinear, scaleLog, scalePoint }

/** Extent that never collapses to a zero-height band. */
export function extent(values: (number | null | undefined)[]): [number, number] {
  const ok = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!ok.length) return [0, 1]
  const lo = Math.min(...ok)
  const hi = Math.max(...ok)
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi]
}

/** Extent padded outward, and anchored at zero when the data does not cross it. */
export function niceExtent(values: (number | null | undefined)[], pad = 0.08): [number, number] {
  const ok = values.filter((v): v is number => v != null && Number.isFinite(v))
  let [lo, hi] = extent(values)
  const span = hi - lo
  lo -= span * pad
  hi += span * pad
  // A series that never goes below zero gets a floor of exactly 0, whether the pad
  // left the low end above zero or pushed it below it (#34). The sign test reads the
  // raw values, not extent()'s output: extent() widens a degenerate range by ±1, so a
  // single datum at 0.5 would otherwise look signed. `lo > 0` is the original guard,
  // kept so the no-observation fallback extent is untouched.
  if ((ok.length > 0 && ok.every((v) => v >= 0)) || lo > 0) lo = 0
  if (hi < 0) hi = 0
  return [lo, hi]
}
