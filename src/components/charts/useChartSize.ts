import { useEffect, useRef, useState } from 'react'

export interface ChartSize {
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

/* HEIGHTS ARE THE SITE'S COMMON GRAPHIC HEIGHT, `--graphic-h` in `tokens.css`,
 * which is 400px. Both presets are shaped so that the rendered height lands
 * there in the container each is chosen for: WIDE is 400 units in a 720px
 * reading column, and WIDER is 402 units in a 996px band, being 400 x 1000/996.
 * The two numbers must move together with the token; there is no way to read a
 * CSS custom property from this module, so it is a hand-held pairing and this
 * comment is the record of it.
 *
 * Widths were retuned with the reading column, which is 45rem since the face
 * became a system sans: the same 76 characters cost 5rem more in a sans than in
 * Baskerville. The hook's
 * whole contract is that the viewBox matches the container, so that an 11-unit
 * axis label renders as 11 CSS pixels. A 720-unit box in the 640px reading
 * column scales by 0.89 and prints that label at 9.8px. */
const WIDE: ChartSize = { width: 720, height: 400, margin: { top: 28, right: 24, bottom: 52, left: 72 } }
const NARROW: ChartSize = { width: 360, height: 316, margin: { top: 30, right: 16, bottom: 50, left: 54 } }
/* The third preset, for a `.figure--wide` figure. Such a figure spans the
 * reading and margin tracks together, about 996px, so the box is 1000 rather
 * than the 1120 it was while every figure took a 70rem content column.
 *
 * The margins grow with the plot rather than staying fixed. Holding `left: 68`
 * at 960 units would spend a smaller share of the width on the gutter and
 * crowd the leftmost tick label against the axis title.
 */
const WIDER: ChartSize = { width: 1000, height: 402, margin: { top: 32, right: 32, bottom: 56, left: 86 } }

/**
 * Pick a viewBox that matches the container, rather than scaling one fixed
 * viewBox down to fit.
 *
 * An SVG with a 640-unit viewBox rendered into a 400px column scales by 0.62,
 * which takes 11px axis text down to about 7px and makes it unreadable. Sizing
 * the viewBox to the container keeps label text at its intended size at every
 * width. Returns the wide preset before measurement so the server render and
 * the desktop case agree.
 *
 * `NARROW.margin.right` is 16, raised from 12 when the chart face became the
 * system sans. A last x-axis tick is centred on its own gridline, so half of it
 * hangs past the plot's right edge, and the sans draws "2023" wider than
 * Georgia did: `/households` Figure 6 overran its surface by 1.9px at 390px.
 * Four units of a 296-unit plot is a cheaper fix than dropping a tick.
 *
 * The reasoning below is why it is not wider than that, and still holds.
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
 * 640-unit WIDE one, so a figure stuck at 640 inside a 960px column draws at
 * the wrong scale and says nothing about why. The hook therefore warns once per
 * container and marks the element with `data-chart-unmeasured`, which the
 * browser lane sees as a console warning (`CONSOLE_ALLOWLIST` is empty) and any
 * static pass sees as an attribute. The preset itself is left alone, so the
 * deliberate "return WIDE before measurement" contract is unchanged.
 *
 * Note that these two presets are NOT symmetric in what the test suite can see:
 * this hook returns WIDE before measurement, so the server render, and every
 * assertion `pipeline/tests/test_accessibility.py` makes against `dist/`, only
 * ever observes 640. The 360 geometry is reachable only from the browser and
 * from `annotate.test.ts` over the pure helper.
 */
export function useChartSize(
  breakpoint = 560,
  wideBreakpoint = 860
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
