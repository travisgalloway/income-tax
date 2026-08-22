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
