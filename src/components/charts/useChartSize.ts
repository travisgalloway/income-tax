import { useEffect, useRef, useState } from 'react'

export interface ChartSize {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

const WIDE: ChartSize = { width: 720, height: 396, margin: { top: 20, right: 24, bottom: 52, left: 74 } }
const NARROW: ChartSize = { width: 360, height: 316, margin: { top: 22, right: 12, bottom: 50, left: 52 } }

/**
 * Pick a viewBox that matches the container, rather than scaling one fixed
 * viewBox down to fit.
 *
 * An SVG with a 720-unit viewBox rendered into a 400px column scales by 0.55,
 * which takes 11px axis text down to about 6px and makes it unreadable. Sizing
 * the viewBox to the container keeps label text at its intended size at every
 * width. Returns the wide preset before measurement so the server render and
 * the desktop case agree.
 *
 * `NARROW.margin.right` stays 12, revisited under #64 and deliberately kept.
 * Widening it to hold a label like `Mandatory (net)` (~90 units) would spend
 * 30% of a 296-unit plot on empty gutter at exactly the width where plot area
 * is scarcest. It is also the wrong lever: annotations are clamped to the SVG's
 * edges by `placeAnnotation` (annotate.ts), which flips a right-edge label
 * inward rather than relying on a gutter wide enough to hold it, so no
 * annotation's legibility depends on this number at all. 12 is a margin for the
 * axis rule to breathe in, not a label reservoir.
 *
 * Note that these two presets are NOT symmetric in what the test suite can see:
 * this hook returns WIDE before measurement, so the server render, and every
 * assertion `pipeline/tests/test_accessibility.py` makes against `dist/`, only
 * ever observes 720. The 360 geometry is reachable only from the browser and
 * from `annotate.test.ts` over the pure helper.
 */
export function useChartSize(breakpoint = 560): [React.RefObject<HTMLDivElement | null>, ChartSize] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<ChartSize>(WIDE)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (!w) return
      setSize(w < breakpoint ? NARROW : WIDE)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [breakpoint])

  return [ref, size]
}
