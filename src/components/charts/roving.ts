/** Roving tabindex for chart data marks. Issue #69.
 *
 *  A figure contributes AT MOST ONE TAB STOP PER CHART `<svg>`, however many
 *  marks it draws. Exactly one mark carries `tabindex="0"`; every other carries
 *  `tabindex="-1"`. Left/Up, Right/Down, Home and End move focus between them
 *  inside the group, in DOM order — which is data order, not screen geometry —
 *  and WITHOUT WRAPPING. Tab enters at the active mark and leaves the chart
 *  entirely. No mark is removed from the keyboard; the journey through them is
 *  just no longer the Tab key's job.
 *
 *  WHY THE STATE IS RENDERED AND NOT INSTALLED BY AN EFFECT. Islands mount
 *  `client:visible`, which server-renders the markup and defers only hydration,
 *  so `dist/government/index.html` shipped all 369 marks focusable before a line
 *  of JavaScript ran. A bypass installed at hydration would leave the
 *  scripting-off tab order at ~500 stops while the hydrated one is ~160 — the
 *  reader with a slow connection, or with JavaScript off, gets none of the fix.
 *  A `useEffect` that rewrites `tabindex` in the DOM has a second problem on top
 *  of that: React owns the prop, and every hover fires `setFocus`, so the next
 *  re-render clobbers it.
 *
 *  Both problems have one answer: THE ACTIVE INDEX IS REACT STATE AND `tabIndex`
 *  IS DERIVED FROM IT DURING RENDER. On the server `active` is 0, so the first
 *  mark is the stop; hydration finds the same value and there is no mismatch.
 *
 *  The cost is that a mark cannot write `tabIndex={0}` for itself any more — it
 *  spreads `{...mark()}` instead, in render order. `test_no_island_hardcodes_a_
 *  focusable_chart_mark` (P3) makes that unwritable from here on, and
 *  `test_each_chart_svg_offers_exactly_one_tab_stop` (P2) asserts the result
 *  over the served bytes.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type RefObject,
} from 'react'

/** What a mark spreads onto itself. `data-mark` is both the live-list selector
 *  the key handler reads and the subject of every guard. */
export interface MarkProps {
  tabIndex: number
  'data-mark': ''
}

/** Called once per mark, in render order. */
export type MarkFn = () => MarkProps

export interface RovingGroupProps {
  ref: RefObject<SVGSVGElement | null>
  onKeyDown: KeyboardEventHandler<SVGSVGElement>
  onFocusCapture: FocusEventHandler<SVGSVGElement>
  /** Present only while focus arrived by arrow/Home/End, so the CSS fallback
   *  ring can be keyed on it without ringing a mouse click. */
  'data-roving'?: ''
}

export interface Roving {
  /** Spread on the chart `<svg>`. */
  groupProps: RovingGroupProps
  /** Spread on each data mark, in render order. */
  mark: MarkFn
}

export function useRovingMarks(): Roving {
  const ref = useRef<SVGSVGElement | null>(null)
  const [active, setActive] = useState(0)
  // True from the moment a key asks for a move until the resulting focus event
  // has been seen. Read once, then cleared — it is a hand-off, not a mode.
  const moved = useRef(false)
  const [keyed, setKeyed] = useState(false)

  const marks = useCallback(
    (): SVGElement[] =>
      ref.current ? Array.from(ref.current.querySelectorAll<SVGElement>('[data-mark]')) : [],
    [],
  )

  const onKeyDown = useCallback<KeyboardEventHandler<SVGSVGElement>>(
    (e) => {
      const nodes = marks()
      if (nodes.length === 0) return
      const from = nodes.indexOf(document.activeElement as SVGElement)
      // Focus is inside the svg but not on a mark (a `<foreignObject>` control,
      // say). Not ours to intercept.
      if (from < 0) return

      let to: number
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          to = from + 1
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          to = from - 1
          break
        case 'Home':
          to = 0
          break
        case 'End':
          to = nodes.length - 1
          break
        default:
          return
      }

      // CLAMP, NEVER WRAP. A chart's marks are a series; jumping from the last
      // year to the first reads as a discontinuity in the data, and the claim
      // made to the ARIA composite-widget pattern in the contract says so.
      to = Math.max(0, Math.min(nodes.length - 1, to))
      // The arrow keys scroll the page by default, and a chart that swallows
      // focus while the page scrolls under it is worse than one that does
      // nothing. Prevented even at the ends, where `to === from`.
      e.preventDefault()
      if (to === from) return
      moved.current = true
      setActive(to)
    },
    [marks],
  )

  // Focus that arrived by any route — a click, a Shift-Tab back in, or this
  // hook's own effect — resets the roving state to whatever the reader is
  // actually on, so the two can never disagree.
  const onFocusCapture = useCallback<FocusEventHandler<SVGSVGElement>>(
    (e) => {
      const i = marks().indexOf(e.target as SVGElement)
      if (i >= 0) setActive(i)
      setKeyed(moved.current)
      moved.current = false
    },
    [marks],
  )

  useEffect(() => {
    if (!moved.current) return
    marks()[active]?.focus()
  }, [active, marks])

  // NO DEPENDENCY ARRAY, deliberately: this runs after every render because the
  // mark count changes at runtime — `LawExplorer`'s three filters and
  // `YearRange`'s two thumbs both add and remove marks. An `active` left past
  // the end leaves the group with ZERO `tabindex="0"` marks: the chart drops out
  // of the tab order altogether and its data becomes unreachable. That is why
  // the guard for this asserts EXACTLY one stop per svg and never "at most one".
  useEffect(() => {
    const n = marks().length
    if (n > 0 && active > n - 1) setActive(n - 1)
  })

  let index = 0
  const mark: MarkFn = () => ({ tabIndex: index++ === active ? 0 : -1, 'data-mark': '' })

  return {
    groupProps: {
      ref,
      onKeyDown,
      onFocusCapture,
      ...(keyed ? { 'data-roving': '' as const } : {}),
    },
    mark,
  }
}
