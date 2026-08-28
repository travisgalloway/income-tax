/** Keyboard-operable horizontal scroll containers. Issue #71.
 *
 *  WCAG 2.1.1, Level A. Every wide data table sits in a wrapper with
 *  `overflow-x: auto`. Before this hook those wrappers were plain `<div>`s, no
 *  `tabindex`, no role, no name, so a reader without a pointing device could
 *  not scroll them and the columns past the right edge did not exist for them.
 *  On `/economy` `#prices-rates` that was columns 4 to 7 of seven.
 *
 *  WHY THE KEY HANDLER IS WRITTEN OUT AND NOT LEFT TO THE BROWSER. A focused
 *  scroll container scrolls on arrow keys natively, so `tabindex="0"` alone
 *  would appear to be enough. It is not enough HERE: measured on a minimal page
 *  in headless *and* headed Chromium, Playwright's synthetic key events do not
 *  drive Chromium's native scrolling at all, a focused horizontal scroller, a
 *  focused vertical scroller and the document itself all stayed at 0 after
 *  `ArrowRight`/`ArrowDown`/`End`. Relying on the UA default would therefore
 *  ship a behaviour NO CHECK IN THIS REPOSITORY CAN OBSERVE, which is the
 *  hollow-check shape this codebase keeps deleting. The explicit handler is
 *  observable, and it makes the step size the same on every engine.
 *
 *  WHY FOCUSABILITY IS RENDERED FROM REACT STATE AND NOT INSTALLED BY AN
 *  EFFECT. The same reason `roving.ts` records: React owns the prop, and any
 *  re-render, a sort, a filter, a slider drag, clobbers an attribute a
 *  `useEffect` wrote into the DOM.
 *
 *  WHY NOTHING IS FOCUSABLE ON THE SERVER. Overflow is a computed layout
 *  property; no build step can know it. Server-rendering `tabindex="0"` on
 *  every wrapper would add an EMPTY Tab stop for every table that happens to
 *  fit, the thing #68 and #69 spent two issues removing. So the served bytes
 *  carry no `tabindex`, no `role` and no `aria-label` on these classes at all
 *  (asserted by `test_the_served_bytes_carry_no_focusable_scroll_container`),
 *  the cost is stated as a known limitation in
 *  `docs/contracts/accessibility.md`, and the scripting-off Tab order is
 *  unchanged.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from 'react'

/** Chromium's own line-scroll amount, pinned so every engine agrees. */
export const ARROW_STEP_PX = 40

/** PageUp/PageDown move just under a full box, so a column straddling the
 *  fold is not stepped clean over. */
export const PAGE_FRACTION = 0.9

/** The three numbers a scroll decision needs. An `HTMLElement` satisfies it
 *  structurally, which is what keeps the function below pure and testable
 *  without a DOM. */
export interface ScrollBox {
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
}

/** Where a key should take `scrollLeft`, or `null` if this key is not ours.
 *
 *  CLAMP, NEVER WRAP, the same rule `roving.ts` states for marks: a table's
 *  columns are an ordered series and jumping from the last back to the first
 *  reads as a discontinuity.
 *
 *  Returns `null` for EVERY key when the box does not overflow. That is what
 *  stops a container that fits from swallowing an arrow press the page wanted. */
export function scrollTargetFor(key: string, box: ScrollBox): number | null {
  const max = box.scrollWidth - box.clientWidth
  if (max <= 0) return null

  let to: number
  switch (key) {
    case 'ArrowRight':
      to = box.scrollLeft + ARROW_STEP_PX
      break
    case 'ArrowLeft':
      to = box.scrollLeft - ARROW_STEP_PX
      break
    case 'PageDown':
      to = box.scrollLeft + box.clientWidth * PAGE_FRACTION
      break
    case 'PageUp':
      to = box.scrollLeft - box.clientWidth * PAGE_FRACTION
      break
    case 'Home':
      to = 0
      break
    case 'End':
      to = max
      break
    default:
      return null
  }
  return Math.max(0, Math.min(max, to))
}

/** What a scroll container spreads onto itself.
 *
 *  `role`/`aria-label` are absent unless the box overflows: a container that
 *  fits is not a scroll region and must not be announced as one. */
export interface ScrollRegionProps {
  ref: RefObject<HTMLDivElement | null>
  tabIndex?: number
  role?: 'group'
  'aria-label'?: string
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
}

/** The accessible name, in ONE place so it cannot drift across 27 containers.
 *
 *  The caption is what the region CONTAINS, the half a bare "scrollable
 *  region" leaves out, and the half DoD item 2 of #71 is about. */
export function scrollRegionLabel(caption: string): string {
  return `${caption}, scrollable table`
}

/**
 * Props for a `overflow-x: auto` container, focusable exactly when it overflows.
 *
 * `role="group"`, not `role="region"`: a NAMED region is a landmark, and this
 * would mint up to fifteen of them on `/government` alone. `group` takes an
 * accessible name, is announced on focus, and is already the role every chart
 * `<svg>` carries for the same "keyboard-operable composite" reason, so the
 * site says one thing rather than two.
 *
 * A container that stops overflowing renders `tabindex="-1"` rather than
 * dropping the attribute, so a reader focused on it when the window widens past
 * the fit point is not blurred to `<body>`. `-1` is invisible to the Tab order
 * and to every existing guard (`is_focusable` in the Python suite tests
 * `tabindex == "0"`; `markStopsPerSvg` counts `[tabindex="0"]` inside `<svg>`).
 */
export function useScrollableRegion(caption: string): ScrollRegionProps {
  const ref = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<'over' | 'fits' | null>(null)

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>((e) => {
    const el = ref.current
    if (!el) return
    // The same boundary `roving.ts` draws. §10 and §11 both put `.sort-button`s
    // inside the container; an arrow pressed on one of those is the browser's
    // business, not ours.
    if (e.target !== e.currentTarget) return
    const to = scrollTargetFor(e.key, el)
    if (to === null) return
    // Only when we are actually going to act, so a container that fits never
    // eats a key the page wanted for something else.
    e.preventDefault()
    el.scrollLeft = to
  }, [])

  // NO DEPENDENCY ARRAY, deliberately, `roving.ts`'s precedent, for the same
  // class of reason. The observed nodes are not stable across the lifetime of
  // the component that owns this hook: `LawExplorer` removes the container from
  // the DOM entirely when a filter matches nothing and puts it back afterwards,
  // and the `<table>` element itself is replaced when the row set changes. An
  // effect keyed on `[]` would observe the first table forever and measure
  // nothing after a remount.
  //
  // Two observers, because they catch different regressions. The CONTAINER's
  // box changes on viewport resize, on a `<details>` opening in the engines
  // that `display: none` a closed subtree (Firefox, WebKit, Chromium reports
  // true geometry while closed), and on a Radix `Tabs.Content` panel becoming
  // active (§9's by-signing-president table is 0/0 while inactive). The
  // TABLE's width changes when `LawExplorer`'s three filters or `YearRange`'s
  // two thumbs change the rows.
  //
  // A `toggle` listener on the ancestor `<details>` is deliberately NOT added:
  // the observer already fires on the display transition, and one mechanism
  // that covers both engine behaviours beats two that each cover one.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setMeasured(el.scrollWidth > el.clientWidth ? 'over' : 'fits')
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const table = el.firstElementChild
    if (table) ro.observe(table)
    return () => ro.disconnect()
  })

  if (measured === 'over') {
    return {
      ref,
      tabIndex: 0,
      role: 'group',
      'aria-label': scrollRegionLabel(caption),
      onKeyDown,
    }
  }
  if (measured === 'fits') return { ref, tabIndex: -1, onKeyDown }
  return { ref, onKeyDown }
}
