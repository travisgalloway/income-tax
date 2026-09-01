import { useEffect, useRef, useState } from 'react'

export interface ChartSize {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

const WIDE: ChartSize = { width: 720, height: 396, margin: { top: 20, right: 24, bottom: 52, left: 74 } }
const NARROW: ChartSize = { width: 360, height: 316, margin: { top: 22, right: 12, bottom: 50, left: 52 } }
/* The third preset, added for the wide content column the redesign adopted.
 * That column is 70rem, being 1120px, and a 720-unit viewBox stretched to it
 * scales by 1.56, which takes an 11px axis
 * label to 17px and prints chart furniture larger than the body text beside it.
 *
 * The threshold is 900 rather than a round 800 so the two presets stay well
 * apart. Below it a figure keeps the 720-unit geometry every annotation and
 * axis-fit constant was tuned against.
 *
 * The margins grow with the plot rather than staying fixed. Holding
 * `left: 74` at 1120 units would spend a smaller share of the width on the
 * gutter and crowd the leftmost tick label against the axis title.
 */
const WIDER: ChartSize = { width: 1120, height: 520, margin: { top: 24, right: 32, bottom: 56, left: 88 } }

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
 * A measurement of zero is reported rather than swallowed. A container that
 * measures 0 keeps whatever preset is current, which before measurement is the
 * 720-unit WIDE one, so a figure stuck at 720 inside a 1120px column draws at
 * the wrong scale and says nothing about why. The hook therefore warns once per
 * container and marks the element with `data-chart-unmeasured`, which the
 * browser lane sees as a console warning (`CONSOLE_ALLOWLIST` is empty) and any
 * static pass sees as an attribute. The preset itself is left alone, so the
 * deliberate "return WIDE before measurement" contract is unchanged.
 *
 * Note that these two presets are NOT symmetric in what the test suite can see:
 * this hook returns WIDE before measurement, so the server render, and every
 * assertion `pipeline/tests/test_accessibility.py` makes against `dist/`, only
 * ever observes 720. The 360 geometry is reachable only from the browser and
 * from `annotate.test.ts` over the pure helper.
 */
export function useChartSize(
  breakpoint = 560,
  wideBreakpoint = 900
): [React.RefObject<HTMLDivElement | null>, ChartSize] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<ChartSize>(WIDE)
  const warned = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (!w) {
        el.setAttribute('data-chart-unmeasured', '')
        if (!warned.current) {
          warned.current = true
          console.warn(
            'useChartSize measured a width of 0; the chart keeps its current viewBox preset ' +
              'and may draw at the wrong scale. Container:',
            el,
          )
        }
        return
      }
      el.removeAttribute('data-chart-unmeasured')
      if (w < breakpoint) setSize(NARROW)
      else if (w >= wideBreakpoint) setSize(WIDER)
      else setSize(WIDE)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [breakpoint, wideBreakpoint])

  return [ref, size]
}
