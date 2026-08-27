/** The driven half of issue #71 — keyboard-operable horizontal scroll
 *  containers. Run by `npm run test:browser` alongside `smoke.test.ts`,
 *  `driven.test.ts` and `keyboard.test.ts`.
 *
 *  WCAG 2.1.1, Level A. Every wide data table sits in a wrapper with
 *  `overflow-x: auto`. Before #71 those wrappers were plain `<div>`s, so a
 *  reader without a pointing device could not scroll them: on `/economy`
 *  `#prices-rates` the per-column visibility vector after `End` was
 *  `[true,true,true,false,false,false,false]` and columns 4 to 7 did not exist
 *  for that reader. B3 below is that measurement, inverted.
 *
 *  WHY THE HANDLER IS ASSERTED RATHER THAN THE BROWSER'S OWN SCROLLING.
 *  Measured on a minimal page in headless *and* headed Chromium: Playwright's
 *  synthetic key events do not drive Chromium's native scrolling at all — a
 *  focused horizontal scroller, a focused vertical scroller and the document
 *  itself all stayed at 0 after `ArrowRight`/`ArrowDown`/`End`. A `tabindex`-
 *  only fix that leaned on the UA default would therefore be invisible to this
 *  lane, and a check that cannot fail is worse than no check. `scrollRegion.ts`
 *  writes the handler out, and this file drives it.
 *
 *  WHY THE MUTATIONS LIVE HERE. Every guard below is paired with a test that
 *  performs the exact regression it exists to catch and asserts the checker
 *  goes red. The checkers are therefore pure functions returning failure
 *  STRINGS — the same shape `keyboard.test.ts` uses — so one function serves
 *  both the guard and its proof.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHART_ROUTES,
  ROUTES,
  TOLERANCE_PX,
  VIEWPORTS,
  mountIslands,
  openRoute,
  tabWalk,
  withSite,
  type Route,
  type Site,
  type Viewport,
} from './harness.ts'
import type { Page } from 'playwright'
import { ARROW_STEP_PX } from '../../src/components/islands/scrollRegion.ts'

/** Every horizontal scroll container the site renders. Two classes, three JSX
 *  sites (`TableView.tsx`, `StateGiveGet.tsx`, `LawExplorer.tsx`). The Python
 *  suite's guard S2 is what keeps this list from going stale: a new
 *  `overflow-x: auto` class with no hook-wired consumer turns pytest red
 *  without anyone editing a selector here. */
const SEL = '.tableview-scroll, .law-table-scroll'

/** Copied from `keyboard.test.ts` deliberately, NOT imported: those constants
 *  are that file's contract with #69, and this file must not be able to change
 *  them. If these two disagree, the disagreement is the finding. */
const MAX_STOPS_TO_SECTION_11 = 160
const MAX_STOPS_GOVERNMENT = 200
const WALK_MAX = 1200
const SECTION_11 = '#by-state, #by-state *'

const GOVERNMENT = ROUTES.find((r) => r.path === '/government') as Route
const ECONOMY = ROUTES.find((r) => r.path === '/economy') as Route
const NARROW = VIEWPORTS[0]
const WIDE = VIEWPORTS[1]

let site: Site

before(async () => {
  // Its own port: two servers on one is a race that presents as a mystery 404.
  site = await withSite(3)
})
after(async () => {
  await site?.close()
})

async function open(route: Route, viewport: Viewport) {
  const opened = await openRoute(site, route, viewport)
  await mountIslands(opened.page, route.hydratedSvg)
  return opened
}

/* ------------------------------------------------------------------------- *
 * Measurement
 * ------------------------------------------------------------------------- */

interface ContainerRow {
  index: number
  cls: string
  /** The container's own `<caption>` text — what the accessible name has to
   *  say, and the reason a bare "scrollable region" is not enough. */
  caption: string
  scrollWidth: number
  clientWidth: number
  overflows: boolean
  /** In the layout at all. A container inside an INACTIVE Radix `Tabs.Content`
   *  is `display: none` and so can never be a Tab stop whatever its
   *  `tabindex` says — the one place a count of attributes and a count of Tab
   *  presses are entitled to disagree. */
  rendered: boolean
  tabIndex: string | null
  role: string | null
  label: string | null
}

async function containers(page: Page): Promise<ContainerRow[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((node, index) => {
      const el = node as HTMLElement
      return {
        index,
        cls: (el.getAttribute('class') ?? '').split(' ')[0] ?? '',
        caption: (el.querySelector('caption')?.textContent ?? '').trim(),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflows: el.scrollWidth > el.clientWidth,
        rendered: el.offsetParent !== null,
        tabIndex: el.getAttribute('tabindex'),
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
      }
    })
  }, SEL)
}

function name(r: ContainerRow): string {
  return `${r.cls}[${r.index}] ${JSON.stringify(r.caption.slice(0, 48))}`
}

/** B1's invariant, as a pure function: **focusable exactly when it overflows.**
 *
 *  Both directions matter and they fail differently. `overflows && !focusable`
 *  is the #71 defect itself — columns off the right edge with no way to reach
 *  them. `!overflows && focusable` is the #68/#69 defect — an empty Tab stop on
 *  a table that does not scroll, which is the cost that made a blanket
 *  `tabindex` unacceptable. */
function focusabilityFailures(rows: ContainerRow[]): string[] {
  const failures: string[] = []
  for (const r of rows) {
    if (r.overflows && r.tabIndex !== '0') {
      failures.push(
        `${name(r)} overflows (${r.scrollWidth}px of table in a ${r.clientWidth}px ` +
          `box) but is not focusable — tabindex=${JSON.stringify(r.tabIndex)}. Its ` +
          `columns past the right edge are unreachable without a pointing device.`,
      )
    }
    if (!r.overflows && r.tabIndex === '0') {
      failures.push(
        `${name(r)} is focusable but does not overflow ` +
          `(${r.scrollWidth}px in ${r.clientWidth}px) — an empty Tab stop`,
      )
    }
  }
  return failures
}

/** B4's half: what a focusable container is announced as.
 *
 *  The name must CONTAIN the table's own caption. "Scrollable region" says a
 *  thing scrolls and not what is in it, which is exactly what #71's DoD item 2
 *  forbids; asserting containment is what turns that from a convention into a
 *  check. */
function nameFailures(rows: ContainerRow[]): string[] {
  const failures: string[] = []
  for (const r of rows) {
    if (!r.overflows) {
      if (r.role !== null || r.label !== null) {
        failures.push(
          `${name(r)} does not overflow but is announced as ` +
            `role=${JSON.stringify(r.role)} / ${JSON.stringify(r.label)}`,
        )
      }
      continue
    }
    if (r.role !== 'group') {
      failures.push(
        `${name(r)} scrolls but carries role=${JSON.stringify(r.role)} instead of ` +
          `"group". A named "region" would be a landmark, and this page would ` +
          `mint one per table.`,
      )
    }
    if (r.caption === '') {
      failures.push(`${name(r)} has no <caption> to be named after`)
      continue
    }
    if (r.label === null || !r.label.includes(r.caption)) {
      failures.push(
        `${name(r)} is named ${JSON.stringify(r.label)}, which does not contain its ` +
          `own caption ${JSON.stringify(r.caption)} — the reader is told a region ` +
          `scrolls and not what is in it`,
      )
    }
  }
  return failures
}

async function openAllDetails(page: Page): Promise<number> {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('details'))
    all.forEach((d) => {
      d.open = true
    })
    return all.length
  })
}

/** Let the hook's effect run and its `ResizeObserver` deliver.
 *
 *  Two stages, and the second one is deliberately allowed to time out. First
 *  wait on a signal that is NOT the invariant — every container carries a
 *  `tabindex` once it has been measured at all — so a hook that never runs
 *  fails loudly here. Then give the observer a bounded chance to converge on
 *  the invariant, and swallow the timeout: the ASSERTION is what reports, so a
 *  container that never converges gets named by `focusabilityFailures` instead
 *  of surfacing as an opaque wait failure. */
async function settleContainers(page: Page): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const els = Array.from(document.querySelectorAll(sel))
      return els.length > 0 && els.every((e) => e.hasAttribute('tabindex'))
    },
    SEL,
    { timeout: 10_000 },
  )
  await page
    .waitForFunction(
      (sel) =>
        Array.from(document.querySelectorAll(sel)).every((node) => {
          const el = node as HTMLElement
          return (el.scrollWidth > el.clientWidth) === (el.getAttribute('tabindex') === '0')
        }),
      SEL,
      { timeout: 3000 },
    )
    .catch(() => undefined)
}

/** Hold an attribute value against React.
 *
 *  A bare `setAttribute` is not a usable mutation here: every one of these
 *  containers is rendered by an island, `tabIndex` is DERIVED DURING RENDER,
 *  and a Tab walk re-renders islands as focus moves through them (the roving
 *  groups call `setActive` on `focusin`). The mutation would be silently undone
 *  part-way through the very walk it is meant to distort. A `MutationObserver`
 *  that re-applies is what makes it stick. It writes only on disagreement, so
 *  it does not re-trigger itself. */
async function pinTabindex(page: Page, selector: string, value: string): Promise<number> {
  return page.evaluate(
    ({ selector, value }) => {
      const apply = () => {
        document.querySelectorAll(selector).forEach((e) => {
          if (e.getAttribute('tabindex') !== value) e.setAttribute('tabindex', value)
        })
      }
      apply()
      new MutationObserver(apply).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['tabindex'],
        childList: true,
        subtree: true,
      })
      return document.querySelectorAll(selector).length
    },
    { selector, value },
  )
}

/** Arrive at a container BY KEYBOARD, so `:focus-visible` is guaranteed rather
 *  than left to an engine heuristic — the trap `roving.ts` needed
 *  `[data-roving]` for. Focus the last focusable element before it in document
 *  order, then Tab until the container is active. */
async function focusScrollRegionByTab(page: Page, index: number): Promise<void> {
  const from = await page.evaluate(
    ({ sel, index }) => {
      const target = document.querySelectorAll(sel)[index] as HTMLElement | undefined
      if (!target) return null
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button, summary, input, select, textarea, [tabindex]',
        ),
      ).filter(
        (e) =>
          e !== target &&
          e.tabIndex >= 0 &&
          e.offsetParent !== null &&
          !!(target.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING),
      )
      const prev = candidates.at(-1)
      if (!prev) return null
      prev.scrollIntoView({ block: 'center' })
      prev.focus()
      return document.activeElement === prev ? prev.tagName.toLowerCase() : null
    },
    { sel: SEL, index },
  )
  assert.ok(from !== null, `no focusable element precedes container ${index}`)

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab')
    const state = await page.evaluate(
      ({ sel, index }) => {
        const target = document.querySelectorAll(sel)[index]
        return {
          active: document.activeElement === target,
          visible: target?.matches(':focus-visible') ?? false,
        }
      },
      { sel: SEL, index },
    )
    if (state.active) {
      assert.ok(
        state.visible,
        `container ${index} took focus from the Tab key but does not match ` +
          `:focus-visible, so no focus ring is painted for a keyboard reader`,
      )
      return
    }
  }
  throw new Error(
    `12 Tab presses from the preceding <${from}> never reached container ${index}. ` +
      `A container that cannot be reached by Tab is the #71 defect itself.`,
  )
}

function scrollLeftOf(page: Page, index: number): Promise<number> {
  return page.evaluate(
    ({ sel, index }) => (document.querySelectorAll(sel)[index] as HTMLElement).scrollLeft,
    { sel: SEL, index },
  )
}

/** Index and geometry of the container with the most to scroll on this page. */
function widest(rows: ContainerRow[]): ContainerRow {
  const over = rows.filter((r) => r.overflows)
  return over.reduce(
    (a, b) => (b.scrollWidth - b.clientWidth > a.scrollWidth - a.clientWidth ? b : a),
    over[0] as ContainerRow,
  )
}

/* ------------------------------------------------------------------------- *
 * B1 — focusable exactly when it overflows, every container, every route,
 *      both viewports, every `<details>` open.
 *
 * ONE test rather than six, because the non-vacuity assertion is over the
 * whole population: at 390px every container on `/economy` overflows, so a
 * per-route "both populations non-empty" check would be false there while the
 * property it protects — that the FITTING half is actually being exercised
 * somewhere — is true across the sweep.
 * ------------------------------------------------------------------------- */

test('every scroll container is focusable exactly when it overflows', async () => {
  const failures: string[] = []
  let overflowing = 0
  let fitting = 0
  let total = 0

  for (const route of CHART_ROUTES) {
    for (const viewport of VIEWPORTS) {
      const { context, page } = await open(route, viewport)
      try {
        await openAllDetails(page)
        await settleContainers(page)
        const rows = await containers(page)
        assert.ok(
          rows.length > 0,
          `${route.path} @ ${viewport.width}px: zero scroll containers measured — ` +
            `nothing was checked`,
        )
        total += rows.length
        overflowing += rows.filter((r) => r.overflows).length
        fitting += rows.filter((r) => !r.overflows).length
        failures.push(
          ...focusabilityFailures(rows).map(
            (f) => `${route.path} @ ${viewport.width}px: ${f}`,
          ),
        )
      } finally {
        await context.close()
      }
    }
  }

  // Both halves of the "exactly when" must actually be exercised. Without
  // this the guard passes on a site where nothing overflows (the `⟹` half is
  // vacuous) or where everything does (the `⟸` half is).
  assert.ok(overflowing > 0, `${total} containers measured and none overflowed`)
  assert.ok(fitting > 0, `${total} containers measured and every one overflowed`)
  assert.deepEqual(failures, [], failures.join('\n  '))
})

test('the focusability guard bites in both directions', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const clean = await containers(page)
    assert.deepEqual(focusabilityFailures(clean), [])
    // The measured split at 1440 with every table open, asserted so the two
    // mutations below each have something real to land on.
    assert.ok(clean.some((r) => r.overflows), 'nothing overflows here')
    assert.ok(clean.some((r) => !r.overflows), 'everything overflows here')

    // (a) a container that FITS is made focusable — the empty Tab stop.
    const fits = clean.find((r) => !r.overflows) as ContainerRow
    await page.evaluate(
      ({ sel, index }) => document.querySelectorAll(sel)[index].setAttribute('tabindex', '0'),
      { sel: SEL, index: fits.index },
    )
    let failures = focusabilityFailures(await containers(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /is focusable but does not overflow/)
    await page.evaluate(
      ({ sel, index }) => document.querySelectorAll(sel)[index].setAttribute('tabindex', '-1'),
      { sel: SEL, index: fits.index },
    )
    assert.deepEqual(focusabilityFailures(await containers(page)), [], 'revert failed')

    // (b) a container that OVERFLOWS loses its tabindex — the #71 defect.
    const over = clean.find((r) => r.overflows) as ContainerRow
    await page.evaluate(
      ({ sel, index }) => document.querySelectorAll(sel)[index].removeAttribute('tabindex'),
      { sel: SEL, index: over.index },
    )
    failures = focusabilityFailures(await containers(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /overflows .* but is not focusable/)
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B2 — the keys actually move the box.
 * ------------------------------------------------------------------------- */

for (const route of CHART_ROUTES) {
  test(`${route.path}: arrows, Home and End scroll its widest container`, async () => {
    const { context, page } = await open(route, WIDE)
    try {
      await openAllDetails(page)
      await settleContainers(page)
      const rows = await containers(page)
      const target = widest(rows)
      assert.ok(target, `${route.path} @ 1440px: no container overflows`)
      const max = target.scrollWidth - target.clientWidth
      const i = target.index

      await focusScrollRegionByTab(page, i)
      assert.equal(await scrollLeftOf(page, i), 0, 'started somewhere other than the left')

      await page.keyboard.press('ArrowRight')
      assert.equal(await scrollLeftOf(page, i), ARROW_STEP_PX, 'ArrowRight did not step right')

      await page.keyboard.press('ArrowLeft')
      assert.equal(await scrollLeftOf(page, i), 0, 'ArrowLeft did not step back')

      // ArrowLeft at the left edge CLAMPS; it does not wrap to the far end.
      await page.keyboard.press('ArrowLeft')
      assert.equal(await scrollLeftOf(page, i), 0, 'ArrowLeft wrapped past the left edge')

      await page.keyboard.press('End')
      assert.ok(
        Math.abs((await scrollLeftOf(page, i)) - max) <= TOLERANCE_PX,
        `End left the box at ${await scrollLeftOf(page, i)} of a possible ${max}`,
      )

      // And at the far end, one more ArrowRight clamps rather than wrapping.
      await page.keyboard.press('ArrowRight')
      assert.ok(
        Math.abs((await scrollLeftOf(page, i)) - max) <= TOLERANCE_PX,
        'ArrowRight wrapped from the right edge back to the left',
      )

      await page.keyboard.press('Home')
      assert.equal(await scrollLeftOf(page, i), 0, 'Home did not return to the left edge')

      // PageDown moves further than an arrow, and still clamps.
      await page.keyboard.press('PageDown')
      const paged = await scrollLeftOf(page, i)
      assert.ok(paged > ARROW_STEP_PX || paged === max, `PageDown moved only ${paged}px`)
      assert.ok(paged <= max + TOLERANCE_PX, `PageDown overshot the end: ${paged} > ${max}`)
    } finally {
      await context.close()
    }
  })
}

test('a sort button inside a container keeps its own arrow keys (E7)', async () => {
  // §10 and §11 both put `.sort-button`s inside the scroll container. An arrow
  // pressed on one of those is the browser's business; the handler acts only
  // when the container itself is the target.
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const rows = await containers(page)
    const found = await page.evaluate(
      ({ sel, indices }) => {
        for (const i of indices) {
          const el = document.querySelectorAll(sel)[i] as HTMLElement
          const button = el.querySelector<HTMLElement>('.sort-button')
          if (!button) continue
          el.scrollLeft = 120
          button.focus()
          return { index: i, focused: document.activeElement === button, at: el.scrollLeft }
        }
        return null
      },
      { sel: SEL, indices: rows.filter((r) => r.overflows).map((r) => r.index) },
    )
    assert.ok(found, 'no overflowing container on /government contains a .sort-button')
    assert.ok(found.focused, 'the sort button did not take focus')
    assert.equal(found.at, 120)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('End')
    assert.equal(
      await scrollLeftOf(page, found.index),
      120,
      'a key pressed on a nested control scrolled the container — the handler is ' +
        'not scoped to its own element and the sort buttons have lost their keys',
    )
  } finally {
    await context.close()
  }
})

test('the scroll guard bites when the key handler never runs', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const rows = await containers(page)
    const target = widest(rows)
    const i = target.index

    // The #69 precedent for "wired up but never fires": a CAPTURE-phase
    // listener that stops the event dead. React's `onKeyDown` is delegated to
    // the root container in the bubble phase.
    await page.evaluate(
      ({ sel, index }) =>
        document
          .querySelectorAll(sel)
          [index].addEventListener('keydown', (e) => e.stopImmediatePropagation(), true),
      { sel: SEL, index: i },
    )

    await focusScrollRegionByTab(page, i)
    for (const key of ['ArrowRight', 'ArrowRight', 'End', 'PageDown']) {
      await page.keyboard.press(key)
    }
    assert.equal(
      await scrollLeftOf(page, i),
      0,
      'with the handler silenced the box still scrolled — the movement asserted ' +
        'above is not being driven by the code under test, and would pass on a ' +
        'container with no handler at all',
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B3 — DoD item 4, by name: `/economy` `#prices-rates`, all seven columns.
 * ------------------------------------------------------------------------- */

const PRICES_RATES = '#prices-rates .tableview-scroll'

/** Which `<th scope="col">` boxes are FULLY inside the container's client box
 *  right now. Partially visible is not reachable: half a heading is half a
 *  column. */
async function visibleColumns(page: Page): Promise<boolean[]> {
  return page.evaluate(
    ({ sel, tol }) => {
      const el = document.querySelector(sel) as HTMLElement
      const box = el.getBoundingClientRect()
      return Array.from(el.querySelectorAll('thead th')).map((th) => {
        const r = th.getBoundingClientRect()
        return r.left >= box.left - tol && r.right <= box.right + tol
      })
    },
    { sel: PRICES_RATES, tol: TOLERANCE_PX },
  )
}

test('/economy #prices-rates: all seven columns are reachable by keyboard alone', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)

    const geometry = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        cols: el.querySelectorAll('thead th').length,
        caption: (el.querySelector('caption')?.textContent ?? '').trim(),
      }
    }, PRICES_RATES)
    assert.ok(geometry, `${PRICES_RATES} is not on the page`)
    // Asserted BEFORE the traversal: a table that stopped overflowing, or that
    // lost columns, would make every check below pass by vacuity — and the
    // reader whose defect this is would never know.
    assert.equal(geometry.cols, 7, `#prices-rates draws ${geometry.cols} columns, expected 7`)
    assert.ok(
      geometry.scrollWidth > geometry.clientWidth,
      `#prices-rates no longer overflows at 1440x900 (${geometry.scrollWidth} in ` +
        `${geometry.clientWidth}) — this guard is measuring nothing`,
    )
    assert.match(geometry.caption, /Inflation and interest rates/)

    const index = await page.evaluate(
      ({ sel, one }) => Array.from(document.querySelectorAll(sel)).indexOf(document.querySelector(one) as Element),
      { sel: SEL, one: PRICES_RATES },
    )
    await focusScrollRegionByTab(page, index)

    const seen = [...(await visibleColumns(page))]
    const merge = (next: boolean[]) => next.forEach((v, i) => (seen[i] = seen[i] || v))

    await page.keyboard.press('Home')
    merge(await visibleColumns(page))
    // Enough presses to cross the whole scroll range at ARROW_STEP_PX a time,
    // with room to spare — then `End`, which is the other way a reader gets
    // to the last column.
    const presses = Math.ceil((geometry.scrollWidth - geometry.clientWidth) / 40) + 2
    for (let i = 0; i < presses; i += 1) {
      await page.keyboard.press('ArrowRight')
      merge(await visibleColumns(page))
    }
    await page.keyboard.press('End')
    merge(await visibleColumns(page))

    const unreachable = seen
      .map((v, i) => (v ? null : i + 1))
      .filter((n): n is number => n !== null)
    assert.deepEqual(
      unreachable,
      [],
      `column(s) ${unreachable.join(', ')} of 7 never came fully into view during a ` +
        `Home -> ${presses}x ArrowRight -> End traversal of #prices-rates. That is ` +
        `the defect #71 was filed for: before the fix the vector after End was ` +
        `[true,true,true,false,false,false,false].`,
    )
  } finally {
    await context.close()
  }
})

test('the seven-column guard bites when the key handler never runs', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const index = await page.evaluate(
      ({ sel, one }) => Array.from(document.querySelectorAll(sel)).indexOf(document.querySelector(one) as Element),
      { sel: SEL, one: PRICES_RATES },
    )
    await page.evaluate(
      ({ sel, index }) =>
        document
          .querySelectorAll(sel)
          [index].addEventListener('keydown', (e) => e.stopImmediatePropagation(), true),
      { sel: SEL, index },
    )
    await focusScrollRegionByTab(page, index)

    const seen = [...(await visibleColumns(page))]
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('ArrowRight')
      const now = await visibleColumns(page)
      now.forEach((v, j) => (seen[j] = seen[j] || v))
    }
    await page.keyboard.press('End')
    const now = await visibleColumns(page)
    now.forEach((v, j) => (seen[j] = seen[j] || v))

    assert.equal(seen.length, 7)
    assert.ok(
      seen.some((v) => !v),
      `with the handler silenced every one of the seven columns still came into ` +
        `view — the traversal is not what is moving the box, and this guard would ` +
        `pass on the unfixed page`,
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B4 — role, name, and a ring a reader can see.
 * ------------------------------------------------------------------------- */

interface Ring {
  outline: number
  /** `solid` is the author's ring; `auto` is Chromium's own UA ring, which
   *  paints on ANY keyboard-focused element and would satisfy a naive
   *  `outline-width > 0` check on a page whose stylesheet forgot. */
  style: string
}

function isAuthorRing(r: Ring): boolean {
  return r.style === 'solid' && r.outline > 0
}

for (const viewport of VIEWPORTS) {
  test(`every focusable container is named after its own table @ ${viewport.width}px`, async () => {
    const failures: string[] = []
    let named = 0
    for (const route of CHART_ROUTES) {
      const { context, page } = await open(route, viewport)
      try {
        await openAllDetails(page)
        await settleContainers(page)
        const rows = await containers(page)
        named += rows.filter((r) => r.overflows).length
        failures.push(...nameFailures(rows).map((f) => `${route.path}: ${f}`))
      } finally {
        await context.close()
      }
    }
    assert.ok(named > 0, `no focusable container measured @ ${viewport.width}px`)
    assert.deepEqual(failures, [], failures.join('\n  '))
  })
}

test('the accessible-name guard bites on a bare "scrollable region" and on no name', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    await settleContainers(page)
    const clean = await containers(page)
    assert.deepEqual(nameFailures(clean), [])
    const target = widest(clean)

    // (a) DoD item 2, asserted rather than assumed: the name that says only
    // that the thing scrolls.
    await page.evaluate(
      ({ sel, index }) =>
        document.querySelectorAll(sel)[index].setAttribute('aria-label', 'Scrollable region'),
      { sel: SEL, index: target.index },
    )
    let failures = nameFailures(await containers(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /does not contain its own caption/)

    // (b) no name at all.
    await page.evaluate(
      ({ sel, index }) => document.querySelectorAll(sel)[index].removeAttribute('aria-label'),
      { sel: SEL, index: target.index },
    )
    failures = nameFailures(await containers(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /is named null/)

    // (c) and the role, which must not become a landmark.
    await page.evaluate(
      ({ sel, index }) => {
        const el = document.querySelectorAll(sel)[index]
        el.setAttribute('aria-label', el.querySelector('caption')?.textContent ?? '')
        el.setAttribute('role', 'region')
      },
      { sel: SEL, index: target.index },
    )
    failures = nameFailures(await containers(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /instead of "group"/)
  } finally {
    await context.close()
  }
})

for (const viewport of VIEWPORTS) {
  test(`a focused container paints a ring the reader can see @ ${viewport.width}px`, async () => {
    const { context, page } = await open(ECONOMY, viewport)
    try {
      await openAllDetails(page)
      await settleContainers(page)
      const target = widest(await containers(page))
      await focusScrollRegionByTab(page, target.index)

      const measured = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const cs = getComputedStyle(el)
        return {
          outline: parseFloat(cs.outlineWidth) || 0,
          style: cs.outlineStyle,
          offset: parseFloat(cs.outlineOffset) || 0,
          box: el.getBoundingClientRect().width,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      assert.ok(
        isAuthorRing(measured),
        `the focused container paints no solid author outline ` +
          `(${measured.outline}px ${measured.style})`,
      )
      // E10: the ring sits OUTSIDE a container that is already the figure's
      // full width. If it introduced page overflow it would be a new
      // horizontal scrollbar on the document, which is #79's defect.
      assert.equal(
        measured.pageOverflow,
        0,
        `the focus ring pushed the document ${measured.pageOverflow}px wide of the ` +
          `viewport at ${viewport.width}px`,
      )
    } finally {
      await context.close()
    }
  })
}

test('the ring guard bites with every :focus-visible rule deleted', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const target = widest(await containers(page))

    const deleted = await page.evaluate(() => {
      const gone: string[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        const rules = sheet.cssRules // same-origin; a throw here is a real failure
        for (let i = rules.length - 1; i >= 0; i -= 1) {
          const selector = (rules[i] as CSSStyleRule).selectorText ?? ''
          if (selector.includes(':focus-visible')) {
            sheet.deleteRule(i)
            gone.push(selector)
          }
        }
      }
      return gone
    })
    assert.ok(deleted.length > 0, 'no :focus-visible rule was found to delete')

    await focusScrollRegionByTab(page, target.index)
    const stripped = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element)
      return { outline: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle }
    })
    assert.ok(
      !isAuthorRing(stripped),
      `with every :focus-visible rule deleted the check still measured ` +
        `${stripped.outline}px ${stripped.style} — it is not reading the element it ` +
        `claims to`,
    )
    // What remains is Chromium's own `outline-style: auto` ring. Recording it
    // is the reason the assertion tests for `solid`: an `outline-width > 0`
    // check would have been satisfied by the browser on a page that paints
    // nothing, which is exactly what happened in #69.
    assert.equal(stripped.style, 'auto', 'expected only the UA focus ring to remain')
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B5 — the Tab order grows by exactly the overflowing count, and no more.
 * ------------------------------------------------------------------------- */

for (const viewport of VIEWPORTS) {
  test(`/government: the Tab order grows by exactly the overflowing count @ ${viewport.width}px`, async () => {
    const { context, page } = await open(GOVERNMENT, viewport)
    try {
      // The DEFAULT state first, because that is the page a reader lands on.
      await settleContainers(page)
      const closed = await tabWalk(page, { max: WALK_MAX })
      assert.ok(
        closed.stops <= MAX_STOPS_GOVERNMENT,
        `${closed.stops} Tab stops on /government @ ${viewport.width}px in its ` +
          `default state, bound is ${MAX_STOPS_GOVERNMENT}`,
      )

      // Then EVERY table open, which is the state the growth claim is about.
      // Thirteen of the fifteen containers live inside a `<details>`, and a
      // closed `<details>` contributes zero Tab stops in Chromium however
      // focusable its contents are — so the default state cannot distinguish
      // "focusable only when it overflows" from "focusable never", and a
      // comparison made there would be measuring the disclosure widget.
      await openAllDetails(page)
      await settleContainers(page)
      const rows = await containers(page)
      const overflowing = rows.filter((r) => r.overflows && r.rendered).length
      assert.ok(overflowing > 0, 'no container overflows, so nothing is being measured')

      const withFeature = await tabWalk(page, { max: WALK_MAX })
      assert.ok(
        withFeature.stops <= MAX_STOPS_GOVERNMENT,
        `${withFeature.stops} Tab stops on /government @ ${viewport.width}px with ` +
          `every table open, bound is ${MAX_STOPS_GOVERNMENT}`,
      )

      // Self-baselining: take the feature away and walk again, rather than
      // pinning a number that goes stale the next time a section gains a link.
      await pinTabindex(page, SEL, '-1')
      const withoutFeature = await tabWalk(page, { max: WALK_MAX })

      assert.equal(
        withFeature.stops - withoutFeature.stops,
        overflowing,
        `#71 added ${withFeature.stops - withoutFeature.stops} Tab stops to ` +
          `/government @ ${viewport.width}px with every table open ` +
          `(${withoutFeature.stops} -> ${withFeature.stops}) but only ${overflowing} ` +
          `of ${rows.length} containers overflow there. Every other one would be an ` +
          `EMPTY stop.`,
      )
    } finally {
      await context.close()
    }
  })
}

test('the growth guard bites when every container is made focusable', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const rows = await containers(page)
    const overflowing = rows.filter((r) => r.overflows).length
    // The empty stops a blanket `tabindex` would ADD: the containers that fit,
    // minus the one inside an inactive tab panel, which `display: none` keeps
    // out of the Tab order however it is marked up.
    const emptyStops = rows.filter((r) => !r.overflows && r.rendered).length
    assert.ok(emptyStops > 0, 'every container overflows; nothing to over-add')

    const baseline = await tabWalk(page, { max: WALK_MAX })
    await pinTabindex(page, SEL, '0')
    const blanket = await tabWalk(page, { max: WALK_MAX })

    const added = blanket.stops - baseline.stops
    assert.equal(
      added,
      emptyStops,
      `a blanket tabindex added ${added} stops; expected the ${emptyStops} ` +
        `containers that fit and are in the layout`,
    )
    assert.ok(
      added > 0,
      'a blanket tabindex on every container did not change the walk at all — the ' +
        'walk is not seeing these containers and the guard above proves nothing',
    )
    // And the invariant reports each one by name, rather than only as a number.
    const failures = focusabilityFailures(await containers(page))
    assert.equal(failures.length, rows.length - overflowing, failures.join('; '))
    assert.ok(failures.every((f) => f.includes('does not overflow')), failures.join('; '))
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B5b — the worst state the site can reach: every one of `/government`'s
 *       thirteen tables open. No existing test exercises it, and
 *       `MAX_STOPS_TO_SECTION_11`'s margin is the thin one.
 * ------------------------------------------------------------------------- */

for (const viewport of VIEWPORTS) {
  test(`/government: both bounds hold with every table open @ ${viewport.width}px`, async () => {
    const { context, page } = await open(GOVERNMENT, viewport)
    try {
      const opened = await openAllDetails(page)
      assert.ok(opened >= 13, `only ${opened} <details> on /government`)
      await settleContainers(page)

      const walk = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
      // "Ran out of presses" and "arrived" produce the same number. Both of
      // these are what stop the bound below reading as a pass when it is not.
      assert.ok(
        walk.reached,
        `Tab never reached §11 in ${walk.stops} presses — the walk ended at ` +
          `${walk.trail.at(-1)}, so the number would be a floor, not a measurement`,
      )
      assert.equal(
        walk.trail.at(-1),
        'button.basis-toggle-item',
        "§11's first Tab stop is no longer its per-person/in-total control",
      )
      assert.ok(
        walk.stops <= MAX_STOPS_TO_SECTION_11,
        `${walk.stops} Tab presses to §11 with every table open @ ` +
          `${viewport.width}px, bound is ${MAX_STOPS_TO_SECTION_11}. Do not raise ` +
          `the bound.`,
      )

      const all = await tabWalk(page, { max: WALK_MAX })
      assert.ok(
        all.stops <= MAX_STOPS_GOVERNMENT,
        `${all.stops} Tab stops on /government with every table open @ ` +
          `${viewport.width}px, bound is ${MAX_STOPS_GOVERNMENT}`,
      )
    } finally {
      await context.close()
    }
  })
}

test('the all-open walk reports a number when the §11 bound is actually threatened', async () => {
  // 390px is the worse viewport: eleven of the thirteen containers above §11
  // overflow there. The mutation is the two things that could spend the
  // remaining margin — a blanket tabindex on the containers that fit, and one
  // chart that stopped roving.
  const { context, page } = await open(GOVERNMENT, NARROW)
  try {
    await openAllDetails(page)
    await settleContainers(page)

    const before = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.ok(before.reached && before.stops <= MAX_STOPS_TO_SECTION_11, `${before.stops}`)

    await pinTabindex(page, SEL, '0')

    // The largest roving group ABOVE §11, un-roved: every mark back in the Tab
    // order, which is what the whole site looked like before #69.
    const marks = await page.evaluate(() => {
      const stop = document.querySelector('#by-state') as Element
      let best: SVGSVGElement | null = null
      let bestN = 0
      for (const svg of Array.from(document.querySelectorAll('svg'))) {
        if (!(stop.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING)) continue
        const n = svg.querySelectorAll('[data-mark]').length
        if (n > bestN) {
          best = svg
          bestN = n
        }
      }
      if (best) best.setAttribute('data-unroved', '')
      return bestN
    })
    assert.ok(marks > 20, `the largest group above §11 draws only ${marks} marks`)
    await pinTabindex(page, '[data-unroved] [data-mark]', '0')

    const after = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.ok(
      after.reached,
      `the mutated walk never reached §11 in ${after.stops} presses (ended at ` +
        `${after.trail.at(-1)}) — it has to report a NUMBER over the bound, not run out`,
    )
    assert.ok(
      after.stops > MAX_STOPS_TO_SECTION_11,
      `a blanket tabindex plus a ${marks}-mark figure that stopped roving left the ` +
        `walk at ${after.stops}, still inside the ${MAX_STOPS_TO_SECTION_11} bound — ` +
        `the bound is too loose to bite`,
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B6 — runtime state. The `ResizeObserver`'s two jobs, and the filters.
 * ------------------------------------------------------------------------- */

test('/government §9: an inactive tab panel is not a scroll box, and becomes one (E3)', async () => {
  const { context, page } = await open(GOVERNMENT, NARROW)
  try {
    await openAllDetails(page)
    await settleContainers(page)
    const before = await containers(page)
    const hidden = before.find((r) => r.clientWidth === 0)
    assert.ok(
      hidden,
      'no zero-width container on /government @390 — §9\'s by-signing-president ' +
        'panel is measured 0/0 while its tab is inactive, and this guard needs it',
    )
    assert.equal(hidden.overflows, false)
    assert.notEqual(hidden.tabIndex, '0', 'a 0x0 panel is focusable')
    assert.equal(hidden.role, null, 'a 0x0 panel is announced as a scroll region')

    // Activate the panel through its own tab, found FROM the container rather
    // than hardcoded — the section that owns it is not this guard's subject.
    const panelId = await page.evaluate(
      ({ sel, index }) => {
        let panel: Element | null = document.querySelectorAll(sel)[index] as HTMLElement
        while (panel && panel.getAttribute('role') !== 'tabpanel') panel = panel.parentElement
        return panel?.getAttribute('id') ?? null
      },
      { sel: SEL, index: hidden.index },
    )
    assert.ok(panelId, 'the zero-width container is not inside a [role=tabpanel]')
    const tab = page.locator(`[role="tab"][aria-controls="${panelId}"]`)
    assert.equal(await tab.count(), 1, `no tab controls ${panelId}`)
    await tab.scrollIntoViewIfNeeded()
    await tab.click()
    await page.waitForFunction(
      (id) => document.getElementById(id)?.getAttribute('data-state') === 'active',
      panelId,
      { timeout: 5000 },
    )

    await settleContainers(page)
    const after = (await containers(page))[hidden.index] as ContainerRow
    assert.ok(after.clientWidth > 0, `the panel is still ${after.clientWidth}px wide`)
    assert.ok(
      after.overflows,
      `once active the panel measures ${after.scrollWidth} in ${after.clientWidth} ` +
        `and does not overflow — pick a different panel or drop this guard`,
    )
    assert.equal(after.tabIndex, '0', 'the panel became a scroll box but not a Tab stop')
    assert.equal(after.role, 'group')
  } finally {
    await context.close()
  }
})

test('/economy: a live resize past the fit point makes a container focusable, keeping focus (E1, E6)', async () => {
  const { context, page } = await open(ECONOMY, WIDE)
  try {
    // Opened, because a closed `<details>` subtree is not focusable at all in
    // Chromium and E6 is about a reader who is standing ON the container.
    await openAllDetails(page)
    await settleContainers(page)
    const before = await containers(page)
    const fits = before.find((r) => !r.overflows)
    assert.ok(fits, 'every /economy container overflows at 1440; nothing to widen into')
    assert.equal(fits.tabIndex, '-1', 'a container that fits should render tabindex="-1"')

    // E6: focused while it fits. `-1` rather than a removed attribute is what
    // keeps this reader on the element instead of dropping them to <body>.
    const focused = await page.evaluate(
      ({ sel, index }) => {
        const el = document.querySelectorAll(sel)[index] as HTMLElement
        el.focus()
        return document.activeElement === el
      },
      { sel: SEL, index: fits.index },
    )
    assert.ok(focused, 'a tabindex="-1" container did not accept programmatic focus')

    // No reload: the observer is what has to notice.
    await page.setViewportSize({ width: NARROW.width, height: NARROW.height })
    await settleContainers(page)

    const after = (await containers(page))[fits.index] as ContainerRow
    assert.ok(after.overflows, `still ${after.scrollWidth} in ${after.clientWidth} at 390px`)
    assert.equal(
      after.tabIndex,
      '0',
      'the container started overflowing on a live resize and did not become ' +
        'focusable — the ResizeObserver is not doing its job',
    )
    assert.equal(after.role, 'group')
    assert.ok(
      await page.evaluate(
        ({ sel, index }) => document.activeElement === document.querySelectorAll(sel)[index],
        { sel: SEL, index: fits.index },
      ),
      'the reader focused on the container was blurred by the resize',
    )
  } finally {
    await context.close()
  }
})

test('the runtime-state guards bite with ResizeObserver stubbed out', async () => {
  const { context, page } = await openRoute(site, ECONOMY, WIDE)
  try {
    // The INITIAL measurement still runs — the effect calls `measure()` before
    // it observes anything — so only the transitions fail. That is precisely
    // the discriminator: a hook that measures once and never again passes every
    // static check on this page and fails the reader who resizes a window.
    await page.addInitScript(() => {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    })
    await page.reload({ waitUntil: 'load' })
    await mountIslands(page, ECONOMY.hydratedSvg)
    await openAllDetails(page)
    await settleContainers(page)

    const before = await containers(page)
    const fits = before.find((r) => !r.overflows) as ContainerRow
    assert.ok(fits, 'nothing fits at 1440 to widen into')
    assert.equal(fits.tabIndex, '-1', 'the initial measurement did not run at all')

    await page.setViewportSize({ width: NARROW.width, height: NARROW.height })
    await settleContainers(page)
    const after = (await containers(page))[fits.index] as ContainerRow
    assert.ok(after.overflows, 'the container did not start overflowing at 390px')
    assert.notEqual(
      after.tabIndex,
      '0',
      'with ResizeObserver stubbed out the container STILL became focusable on ' +
        'resize — something other than the observer is doing the re-measurement, ' +
        'and the guard above is not testing what it claims',
    )
    assert.ok(
      focusabilityFailures(await containers(page)).some((f) => f.includes('is not focusable')),
      'the invariant did not report the un-observed container',
    )
  } finally {
    await context.close()
  }
})

const FILTERS = ['filter-character', 'filter-president', 'filter-control'] as const

test('#the-laws: every option of every filter leaves the invariant intact (E4)', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    await settleContainers(page)
    let sawEmptyState = false

    for (const id of FILTERS) {
      const trigger = page.locator(`#the-laws [aria-labelledby="${id}"]`)
      await trigger.scrollIntoViewIfNeeded()
      await trigger.click()
      await page.locator('.select-content').first().waitFor({ state: 'visible' })
      const options = await page.locator('.select-item').count()
      assert.ok(options > 1, `${id}: ${options} option(s) — nothing to sweep`)
      await page.keyboard.press('Escape')

      for (let i = 0; i < options; i += 1) {
        await trigger.scrollIntoViewIfNeeded()
        await trigger.click()
        await page.locator('.select-content').first().waitFor({ state: 'visible' })
        await page.locator('.select-item').nth(i).click()
        await page.locator('.select-content').first().waitFor({ state: 'detached' })

        const present = await page.locator('.law-table-scroll').count()
        if (present === 0) {
          // The empty-filter state removes the container from the DOM
          // entirely. A null ref is a no-op, not a crash.
          sawEmptyState = true
          continue
        }
        await settleContainers(page)
        const failures = focusabilityFailures(await containers(page))
        assert.deepEqual(failures, [], `#the-laws ${id} option ${i}:\n  ${failures.join('\n  ')}`)
      }
    }
    // Recorded rather than asserted: whether any single filter option empties
    // the table is a property of the data, not of this fix.
    assert.ok(true, `empty-state reached: ${sawEmptyState}`)
  } finally {
    await context.close()
  }
})
