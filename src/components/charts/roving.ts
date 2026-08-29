/** Roving tabindex for chart data marks, and the chart's touch readout.
 *  Issues #69 and #73.
 *
 *  The group is ONE KEYBOARD STOP AND ONE TOUCH TARGET. The first half is #69
 *  and is described immediately below; the second is #73 and is described under
 *  "THE TOUCH PATH" further down. They are one mechanism on purpose: touch
 *  activation is nothing but a `.focus()` call on a mark, so the roving state,
 *  the focus ring and every island's readout stay in step without a second code
 *  path to keep in step with the first.
 *
 *  A figure contributes AT MOST ONE TAB STOP PER CHART `<svg>`, however many
 *  marks it draws. Exactly one mark carries `tabindex="0"`; every other carries
 *  `tabindex="-1"`. Left/Up, Right/Down, Home and End move focus between them
 *  inside the group, in DOM order, which is data order, not screen geometry,
 *  and WITHOUT WRAPPING. Tab enters at the active mark and leaves the chart
 *  entirely. No mark is removed from the keyboard; the journey through them is
 *  just no longer the Tab key's job.
 *
 *  WHY THE STATE IS RENDERED AND NOT INSTALLED BY AN EFFECT. Islands mount
 *  `client:visible`, which server-renders the markup and defers only hydration,
 *  so `dist/government/index.html` shipped all 369 marks focusable before a line
 *  of JavaScript ran. A bypass installed at hydration would leave the
 *  scripting-off tab order at ~500 stops while the hydrated one is ~160, the
 *  reader with a slow connection, or with JavaScript off, gets none of the fix.
 *  A `useEffect` that rewrites `tabindex` in the DOM has a second problem on top
 *  of that: React owns the prop, and every hover fires `setFocus`, so the next
 *  re-render clobbers it.
 *
 *  Both problems have one answer: THE ACTIVE INDEX IS REACT STATE AND `tabIndex`
 *  IS DERIVED FROM IT DURING RENDER. On the server `active` is 0, so the first
 *  mark is the stop; hydration finds the same value and there is no mismatch.
 *
 *  The cost is that a mark cannot write `tabIndex={0}` for itself any more, it
 *  spreads `{...mark()}` instead, in render order. `test_no_island_hardcodes_a_
 *  focusable_chart_mark` (P3) makes that unwritable from here on, and
 *  `test_each_chart_svg_offers_exactly_one_tab_stop` (P2) asserts the result
 *  over the served bytes.
 *
 *  ---------------------------------------------------------------------------
 *  THE TOUCH PATH (#73)
 *  ---------------------------------------------------------------------------
 *
 *  A tap or a drag anywhere in the `<svg>` focuses the nearest visible mark, and
 *  the readout the keyboard already drives reports it. At 390px a mark is
 *  3.317px wide and there are 389 of them across 350px of plot, so there is no
 *  geometry that makes a mark tappable, 0.9px per datum. THE PLOT BECOMES THE
 *  HIT TARGET and `nearest.ts` decides which datum a point meant.
 *
 *  A tap is a drag of length zero, so it is one code path. The drag half is not
 *  a flourish: at 0.9px per datum a tap resolves to a band of roughly four
 *  years, so without it a reader could obtain *a* value but never *the* value
 *  they wanted.
 *
 *  FOUR THINGS HERE ARE REQUIRED, AND EACH HAS A REASON:
 *
 *  1. ACTIVATION IS `.focus({ preventScroll: true })`, NOTHING ELSE. Not a
 *     callback, not a second setter. `onFocusCapture` below then sets `active`,
 *     so the roving state and the reader's finger can never disagree, and every
 *     island's existing `onFocus` handler drives its readout unchanged. That is
 *     what makes live-region parity STRUCTURAL rather than a second path someone
 *     has to remember to keep in step. `preventScroll` matters on its own:
 *     without it the browser scrolls the mark into view under the moving finger.
 *
 *  2. MOUSE BAILS OUT IMMEDIATELY. `e.pointerType === 'mouse'` returns before
 *     anything happens, so desktop click and hover behaviour is untouched, a
 *     mouse press on a point of the plot carrying no mark still leaves focus on
 *     `<body>`, as it did before this path existed (B3a). Marks under the
 *     cursor still take focus natively; that was true before #73 and is not
 *     this hook's doing either way.
 *
 *  3. `moved.current` IS STILL SET ONLY BY THE KEY HANDLER, so `data-roving`,
 *     the keyboard-only focus-ring flag, is deliberately NOT set by touch. A
 *     finger does not want a keyboard focus ring.
 *
 *  4. THE RECTS ARE SNAPSHOT ONCE PER GESTURE, not once per move. 389
 *     `getBoundingClientRect()` calls cost 1-3ms and chart geometry is stable
 *     for the length of a gesture; moving the snapshot into `onPointerMove`
 *     turns a scrub into a layout-thrash loop.
 *
 *  WHAT THIS FILE CANNOT DO ON ITS OWN. A tap fires a whole EMULATED MOUSE
 *  SEQUENCE after the pointer events, and it costs the readout twice.
 *
 *  First, `mouseenter`/`mouseleave`: for a tap landing in a gap the sequence is
 *  `pointerdown` -> our `focus(N)` -> `mouseleave(previous mark)` -> the
 *  island's `setFocus(null)`, so the readout the tap just set is wiped one event
 *  later. `preventDefault()` on `pointerdown` does NOT suppress those, spiked
 *  and disproved, do not re-try it. The fix is one CSS rule in `global.css`:
 *  under `@media (hover: none)`, `.chart [data-mark]` gets
 *  `pointer-events: none`, so no emulated boundary event ever reaches a mark.
 *  Programmatic and keyboard focus are unaffected by `pointer-events`, and on a
 *  device that cannot hover a hover state was a lie anyway.
 *
 *  Second, the emulated `mousedown`, which is what `onMouseDown` below is for.
 *  With the marks inert the click target is the `<svg>`, which is not focusable,
 *  so Chromium's default focus action resolves to `<main tabindex="-1">` and
 *  the readout resets. Measured, and the reason a DRAG worked while a TAP did
 *  not on the first build of this. See that handler for the full sequence.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from 'react'
import { nearestBox } from './nearest'

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
  /** The touch readout (#73). All four are needed: `down` answers the tap,
   *  `move` makes it a scrub, `up` ends it, and `cancel` is what Chromium sends
   *  when a vertical drag turns into a page scroll, without it the gesture
   *  would stay live and every later move would re-resolve against a stale
   *  snapshot taken before the page scrolled. */
  onPointerDown: PointerEventHandler<SVGSVGElement>
  onPointerMove: PointerEventHandler<SVGSVGElement>
  onPointerUp: PointerEventHandler<SVGSVGElement>
  onPointerCancel: PointerEventHandler<SVGSVGElement>
  /** Not a second activation path, a repair, and the only one. See
   *  `onMouseDown` below for the measured sequence it defuses. */
  onMouseDown: MouseEventHandler<SVGSVGElement>
  /** Present only while focus arrived by arrow/Home/End, so the CSS fallback
   *  ring can be keyed on it without ringing a mouse click, or a finger. */
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
  // has been seen. Read once, then cleared, it is a hand-off, not a mode.
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

  // Focus that arrived by any route, a click, a Shift-Tab back in, or this
  // hook's own effect, resets the roving state to whatever the reader is
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

  // ---- The touch path (#73) ------------------------------------------------

  /** Live only between `pointerdown` and `pointerup`/`pointercancel`. `boxes` is
   *  measured ONCE, at down; `at` is the index last focused, so a slow drag
   *  across one wide mark does not re-announce the same value on every frame. */
  const gesture = useRef<{ nodes: SVGElement[]; boxes: DOMRect[]; at: number } | null>(null)
  /** The most recent pointer position, and the pending frame that will read it.
   *  Coalescing through a ref rather than dropping moves means a fast scrub
   *  resolves to where the finger IS, not to where it was when the frame was
   *  scheduled. */
  /** The pointer type of the most recent `pointerdown` on this group. Starts at
   *  `'mouse'` so that a `mousedown` with no pointer event before it, which
   *  should not happen, but costs nothing to be safe about, behaves like
   *  desktop and is left alone. */
  const lastPointerType = useRef('mouse')

  const point = useRef({ x: 0, y: 0 })
  const frame = useRef(0)

  const resolveTo = useCallback((x: number, y: number) => {
    const g = gesture.current
    if (g === null) return
    const i = nearestBox(g.boxes, x, y)
    // -1 means every mark is zero-area; there is nothing visible to select and
    // silently focusing mark 0 would report an invisible datum.
    if (i < 0 || i === g.at) return
    g.at = i
    // The ONE activation. Everything else, the roving index, the readout, the
    // live region, follows from this call through `onFocusCapture`.
    g.nodes[i]?.focus({ preventScroll: true })
  }, [])

  const cancelFrame = useCallback(() => {
    if (frame.current === 0) return
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  const endGesture = useCallback<PointerEventHandler<SVGSVGElement>>(
    (e) => {
      if (gesture.current === null) return
      cancelFrame()
      gesture.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      // Focus deliberately STAYS on the mark. That persistence is what makes a
      // tap a read rather than a flash.
    },
    [cancelFrame],
  )

  const onPointerDown = useCallback<PointerEventHandler<SVGSVGElement>>(
    (e) => {
      lastPointerType.current = e.pointerType
      // Desktop is not ours. A mouse press must behave exactly as it did before
      // this hook grew a pointer path, which is what B3a asserts.
      if (e.pointerType === 'mouse') return
      const nodes = marks()
      if (nodes.length === 0) return
      // Capture on the SVG, not on a mark: the marks are `pointer-events: none`
      // here, and capture is what keeps a drag that wanders off the plot edge
      // still delivering moves to us.
      e.currentTarget.setPointerCapture(e.pointerId)
      gesture.current = {
        nodes,
        boxes: nodes.map((n) => n.getBoundingClientRect()),
        at: -1,
      }
      resolveTo(e.clientX, e.clientY)
    },
    [marks, resolveTo],
  )

  const onPointerMove = useCallback<PointerEventHandler<SVGSVGElement>>(
    (e) => {
      if (gesture.current === null) return
      point.current = { x: e.clientX, y: e.clientY }
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        resolveTo(point.current.x, point.current.y)
      })
    },
    [resolveTo],
  )

  const onPointerUp = useCallback<PointerEventHandler<SVGSVGElement>>(
    (e) => {
      // Resolve at the release point BEFORE tearing down, or a flick that ends
      // between frames reports the second-to-last datum the finger crossed.
      if (gesture.current !== null) {
        cancelFrame()
        resolveTo(e.clientX, e.clientY)
      }
      endGesture(e)
    },
    [cancelFrame, resolveTo, endGesture],
  )

  /** THE SECOND HALF OF THE EMULATED-EVENT PROBLEM, and the reason the CSS rule
   *  in `global.css` is necessary but not sufficient.
   *
   *  Measured sequence for a tap, with `pointer-events: none` already keeping
   *  `mouseenter` off the marks:
   *      pointerdown -> focusin(rect)  <- our focus, correct
   *      pointerup
   *      mousedown   -> focusin(MAIN)  <- Chromium's default focus action
   *      mouseup, click
   *  The `<svg>` is not focusable and the marks are inert to the pointer, so
   *  the emulated `mousedown` resolves focus to the nearest focusable ancestor,
   *  `<main tabindex="-1">`, and the readout the tap just set resets one event
   *  later. Without this handler a DRAG works and a TAP does not, which is the
   *  most confusing outcome available.
   *
   *  `preventDefault()` on `mousedown` suppresses exactly the focus action and
   *  nothing else, `click` still fires, so nothing inside a chart that listens
   *  for one is affected. It runs only when the preceding `pointerdown` was not
   *  a mouse, so a real desktop press is untouched, which is what makes this a
   *  repair of our own activation rather than a change to desktop behaviour. */
  const onMouseDown = useCallback<MouseEventHandler<SVGSVGElement>>((e) => {
    if (lastPointerType.current === 'mouse') return
    e.preventDefault()
  }, [])

  // A pending frame outliving the component would call `focus()` on a detached
  // node. Cheap to prevent, invisible when it happens, so easy to leave in.
  useEffect(() => () => cancelFrame(), [cancelFrame])

  // NO DEPENDENCY ARRAY, deliberately: this runs after every render because the
  // mark count changes at runtime, `LawExplorer`'s three filters and
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
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: endGesture,
      onMouseDown,
      ...(keyed ? { 'data-roving': '' as const } : {}),
    },
    mark,
  }
}
