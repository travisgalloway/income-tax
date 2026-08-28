/** The keyboard half of the browser lane, issue #69. Run by
 *  `npm run test:browser` alongside `smoke.test.ts` and `driven.test.ts`.
 *
 *  ONE FIGURE, AT MOST ONE TAB STOP. Every chart `<svg>` is a roving-tabindex
 *  group: exactly one mark carries `tabindex="0"`, the rest carry `"-1"`, and
 *  Left/Up, Right/Down, Home and End move focus between them in DOM (data)
 *  order without wrapping. Nothing is removed from the keyboard; the journey
 *  through 87 data points is just no longer the Tab key's job.
 *
 *  WHY THE BOUND IS WALKED AND NOT COUNTED. `MAX_STOPS_*` below is measured by
 *  pressing Tab and reading `document.activeElement`, not by counting selector
 *  matches. The two disagree by around 10%, a `disabled` control, an `inert`
 *  subtree and an element the engine simply declines to focus are all invisible
 *  to a selector and decisive to a person, and the walk is the one that
 *  matches what a keyboard reader experiences.
 *
 *  WHY THE SCRIPTING-OFF PASS IS NOT OPTIONAL. Islands mount `client:visible`,
 *  which server-renders the markup and defers only hydration. Before #69,
 *  `dist/government/index.html` shipped all 369 marks focusable before a line of
 *  JavaScript ran, so a bypass installed at hydration would have left the
 *  scripting-off tab order at ~500 stops while the hydrated one was ~160. The
 *  `javaScriptEnabled: false` passes here are what prove the fix is in the
 *  served bytes rather than in the hydration step.
 *
 *  This closes deferred-measurement inventory row 35 in
 *  `docs/contracts/accessibility.md`.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHART_ROUTES,
  ROUTES,
  VIEWPORTS,
  markStopsPerSvg,
  mountIslands,
  openRoute,
  tabWalk,
  withSite,
  type Route,
  type Site,
  type Viewport,
} from './harness.ts'
import type { Page } from 'playwright'

/** Tab presses from the top of `/government` to the first stop inside §11.
 *
 *  Measured at 1440x900 over `02fcd95`+#71: **142** hydrated (landing on
 *  `.basis-toggle-item`, §11's per-person/in-total control) and **118** with
 *  scripting off. Before #69 it was **438**.
 *
 *  The hydrated number moved 141 -> 142 in #71, which made every horizontal
 *  scroll container focusable exactly when it overflows: one such container is
 *  above §11 and rendered in the page's default state (§10's law table, 1481px
 *  in a 736px box). The scripting-off number is UNCHANGED, and that is an
 *  asserted invariant rather than a coincidence, overflow is a computed
 *  property, so no container is focusable in the served bytes
 *  (`test_the_served_bytes_carry_no_focusable_scroll_container`).
 *
 *  The worst state the site can reach, every one of `/government`'s thirteen
 *  tables open, where eleven containers above §11 overflow at 390px, is
 *  measured by `tests/browser/scroll.test.ts` against this same bound: 144 at
 *  1440px and 153 at 390px.
 *
 *  The headroom to 160 is deliberate: this must not go red when a section gains
 *  a link, while a chart that loses its roving jumps by 30 to 113 stops and
 *  blows straight through it. IF A MEASURED VALUE EXCEEDS THIS, DO NOT RAISE
 *  IT, it means a figure is not roving, and the fix is the figure. */
const MAX_STOPS_TO_SECTION_11 = 160

/** Tab stops on the whole of `/government`. Measured **163** hydrated and
 *  **136** with scripting off, at 1440x900; **145** hydrated at 390x844.
 *  Before #69 it was **512**. Same rule about the headroom.
 *
 *  161 -> 163 and 143 -> 145 are #71's two always-visible scroll containers
 *  (§10's law table and §11's by-state table), both of which genuinely overflow
 *  at both viewports, so neither is an empty stop. The other thirteen sit
 *  inside a closed `<details>`, which contributes zero Tab stops. With every
 *  table open the numbers are 166 and 175, asserted in `scroll.test.ts`. */
const MAX_STOPS_GOVERNMENT = 200

/** The walk's ceiling. Above any plausible bound and far below the pre-#69
 *  512, so a regression reports a number rather than hanging. */
const WALK_MAX = 1200

/** §11's first Tab stop, whatever it turns out to be. Deliberately the SECTION
 *  and not `.basis-toggle-item`: Radix's ToggleGroup ships every item
 *  `tabindex="-1"` and only installs roving focus at hydration, so with
 *  scripting off §11's first reachable thing is the state grid itself. That is
 *  a pre-existing Radix property, unrelated to #69 and parked, and pinning the
 *  target to the toggle would have made the scripting-off half unmeasurable
 *  rather than measured. */
const SECTION_11 = '#by-state, #by-state *'

const GOVERNMENT = ROUTES.find((r) => r.path === '/government') as Route
const HOUSEHOLDS = ROUTES.find((r) => r.path === '/households') as Route
const WIDE = VIEWPORTS[1]

let site: Site

before(async () => {
  // Its own port, for the same reason `driven.test.ts` takes its own: two
  // servers on one port is a race that presents as a mystery 404.
  site = await withSite(2)
})
after(async () => {
  await site?.close()
})

async function open(route: Route, viewport: Viewport) {
  const opened = await openRoute(site, route, viewport)
  await mountIslands(opened.page, route.hydratedSvg)
  return opened
}

type StopRow = Awaited<ReturnType<typeof markStopsPerSvg>>[number]

/** Every way the one-stop rule can be broken, named per svg.
 *
 *  Returns strings rather than asserting, so the same function serves the guard
 *  and its mutation proof. `expectMarks` is asserted by the caller BEFORE this
 *  runs: an svg that stopped drawing marks altogether would satisfy every rule
 *  below by vacuity, which is exactly how a check goes quiet. */
function stopFailures(rows: StopRow[]): string[] {
  const failures: string[] = []
  for (const r of rows) {
    if (r.marks > 0 && r.stops !== 1) {
      failures.push(
        `svg[${r.svgIndex}] ${JSON.stringify(r.label)} draws ${r.marks} mark(s) ` +
          `but offers ${r.stops} Tab stop(s), expected exactly 1`,
      )
    }
    if (r.marks === 0 && r.stops !== 0) {
      failures.push(
        `svg[${r.svgIndex}] ${JSON.stringify(r.label)} draws no marks but offers ` +
          `${r.stops} Tab stop(s)`,
      )
    }
    if (r.marks > 0 && r.role !== 'group') {
      failures.push(
        `svg[${r.svgIndex}] ${JSON.stringify(r.label)} draws marks but carries ` +
          `role=${JSON.stringify(r.role)} instead of "group"`,
      )
    }
  }
  return failures
}

async function assertOneStopPerSvg(page: Page, where: string): Promise<StopRow[]> {
  const rows = await markStopsPerSvg(page)
  const total = rows.reduce((n, r) => n + r.marks, 0)
  assert.ok(total > 0, `${where}: zero chart marks measured — nothing was checked`)
  assert.deepEqual(stopFailures(rows), [], `${where}:\n  ${stopFailures(rows).join('\n  ')}`)
  return rows
}

/* ------------------------------------------------------------------------- *
 * B1, one Tab stop per chart svg, every route, both viewports, scripting on
 *      and off.
 * ------------------------------------------------------------------------- */

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route.path}: one Tab stop per chart svg, hydrated @ ${viewport.width}px`, async () => {
      const { context, page } = await open(route, viewport)
      try {
        const rows = await assertOneStopPerSvg(page, `${route.path} @ ${viewport.width}px`)
        assert.equal(rows.length, route.hydratedSvg)
      } finally {
        await context.close()
      }
    })

    test(`${route.path}: one Tab stop per chart svg, scripting off @ ${viewport.width}px`, async () => {
      const { context, page } = await openRoute(site, route, viewport, {
        javaScriptEnabled: false,
      })
      try {
        const where = `${route.path} @ ${viewport.width}px, scripting off`
        const rows = await assertOneStopPerSvg(page, where)
        // The served bytes, not the hydrated DOM: `ssrSvg` is the count that
        // exists before a line of JavaScript runs.
        assert.equal(rows.length, route.ssrSvg, `${where}: served <svg> count`)
      } finally {
        await context.close()
      }
    })
  }
}

test('the one-stop checker names the svg that grew a second stop', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    await assertOneStopPerSvg(page, '/government @ 1440px')

    // The mutation: a second mark in ONE svg becomes a Tab stop.
    const mutated = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'))
      const i = svgs.findIndex((s) => s.querySelectorAll('[data-mark]').length > 1)
      const target = svgs[i]?.querySelectorAll('[data-mark]')[1]
      target?.setAttribute('tabindex', '0')
      return i
    })
    assert.ok(mutated >= 0, 'no svg with more than one mark to mutate')
    const failures = stopFailures(await markStopsPerSvg(page))
    assert.equal(failures.length, 1, `expected exactly one failure, got: ${failures.join('; ')}`)
    assert.match(failures[0] as string, new RegExp(`^svg\\[${mutated}\\] `), failures[0])
    assert.match(failures[0] as string, /offers 2 Tab stop\(s\)/)
  } finally {
    await context.close()
  }
})

test('the one-stop checker reports the all-minus-one state, which is the worse one', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    // The active index outliving its mark set: every mark `-1`, the figure out
    // of the tab order entirely, its data unreachable. "At most one" would
    // have let this through; the checker asserts exactly one.
    await page.evaluate(() => {
      document
        .querySelectorAll('[data-mark][tabindex="0"]')
        .forEach((m) => m.setAttribute('tabindex', '-1'))
    })
    const failures = stopFailures(await markStopsPerSvg(page))
    assert.equal(failures.length, GOVERNMENT.hydratedSvg, failures.join('; '))
    assert.ok(failures.every((f) => f.includes('offers 0 Tab stop(s)')), failures.join('; '))
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B2, the bound, walked. Criterion 2.
 *
 * The full walk runs on `/government` only, hydrated once and with scripting
 * off once: a real walk is a key press plus an `evaluate` per stop, and every
 * other route/viewport/state is covered exactly by B1's DOM enumeration.
 * ------------------------------------------------------------------------- */

test('/government: Tab reaches §11 within the bound, hydrated @ 1440px', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    const walk = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.ok(
      walk.reached,
      `Tab never reached §11 in ${walk.stops} presses — the walk ended at ` +
        `${walk.trail.at(-1)}, so the number below would be a floor, not a measurement`,
    )
    assert.equal(
      walk.trail.at(-1),
      'button.basis-toggle-item',
      "§11's first Tab stop is no longer its per-person/in-total control",
    )
    assert.ok(
      walk.stops <= MAX_STOPS_TO_SECTION_11,
      `${walk.stops} Tab presses from the top of /government to §11, bound is ` +
        `${MAX_STOPS_TO_SECTION_11} (was 438 before #69). Do not raise the bound: ` +
        `a jump of this size means a figure stopped roving.`,
    )

    const all = await tabWalk(page, { max: WALK_MAX })
    assert.ok(
      all.stops <= MAX_STOPS_GOVERNMENT,
      `${all.stops} Tab stops on /government, bound is ${MAX_STOPS_GOVERNMENT} (was 512)`,
    )
  } finally {
    await context.close()
  }
})

test('/government: the same bound holds with scripting off @ 1440px', async () => {
  const { context, page } = await openRoute(site, GOVERNMENT, WIDE, {
    javaScriptEnabled: false,
  })
  try {
    const walk = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.ok(walk.reached, `scripting off: Tab never reached §11 in ${walk.stops} presses`)
    assert.ok(
      walk.stops <= MAX_STOPS_TO_SECTION_11,
      `scripting off: ${walk.stops} Tab presses to §11, bound is ${MAX_STOPS_TO_SECTION_11}. ` +
        `The roving state has to be in the SERVED BYTES; a hydration-installed ` +
        `bypass fails exactly here and nowhere else.`,
    )
    const all = await tabWalk(page, { max: WALK_MAX })
    assert.ok(
      all.stops <= MAX_STOPS_GOVERNMENT,
      `scripting off: ${all.stops} Tab stops on /government, bound is ${MAX_STOPS_GOVERNMENT}`,
    )
  } finally {
    await context.close()
  }
})

test('the walk would see a figure that stopped roving', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
    const before = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.ok(before.reached)

    // The mutation: every mark of the FIRST chart goes back to `tabindex="0"`,
    // which is what the whole site looked like before #69.
    const added = await page.evaluate(() => {
      const svg = Array.from(document.querySelectorAll('svg')).find(
        (s) => s.querySelectorAll('[data-mark]').length > 1,
      )
      const marks = Array.from(svg?.querySelectorAll('[data-mark]') ?? [])
      marks.forEach((m) => m.setAttribute('tabindex', '0'))
      return marks.length
    })
    assert.ok(added > 1, 'nothing to mutate')

    const after = await tabWalk(page, { max: WALK_MAX, stopAt: SECTION_11 })
    assert.equal(
      after.stops,
      before.stops + added - 1,
      'un-roving one figure did not add its marks to the walk',
    )
    assert.ok(
      after.stops > MAX_STOPS_TO_SECTION_11,
      `un-roving a ${added}-mark figure left the walk at ${after.stops}, still ` +
        `inside the ${MAX_STOPS_TO_SECTION_11} bound — the bound is too loose to bite`,
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B3, every mark is still reachable. Criterion 3, and the one that proves
 *      nothing became unreachable in exchange for a shorter tab order.
 * ------------------------------------------------------------------------- */

/** Index of the svg with the most marks on this page, and how many. */
async function largestGroup(page: Page): Promise<{ index: number; marks: number }> {
  const rows = await markStopsPerSvg(page)
  const best = rows.reduce((a, b) => (b.marks > a.marks ? b : a), rows[0] as StopRow)
  return { index: best.svgIndex, marks: best.marks }
}

/** Focus the first mark of svg `index`, then record which mark each of `presses`
 *  ArrowRight presses lands on. A page-side `focusin` listener does the
 *  recording, so the traversal costs two round trips rather than one per press.
 *  Returns the visited indices in order, INCLUDING the initial focus. */
async function arrowTraversal(page: Page, index: number, presses: number): Promise<number[]> {
  await page.evaluate((i) => {
    const svg = document.querySelectorAll('svg')[i] as SVGSVGElement
    const marks = Array.from(svg.querySelectorAll('[data-mark]'))
    const visited: number[] = []
    ;(window as unknown as { __visited: number[] }).__visited = visited
    svg.addEventListener('focusin', (e) => {
      const at = marks.indexOf(e.target as Element)
      if (at >= 0) visited.push(at)
    })
    ;(marks[0] as SVGElement).focus()
  }, index)
  for (let i = 0; i < presses; i += 1) await page.keyboard.press('ArrowRight')
  return page.evaluate(() => (window as unknown as { __visited: number[] }).__visited)
}

for (const route of CHART_ROUTES) {
  test(`${route.path}: arrows reach every mark of its largest group`, async () => {
    const { context, page } = await open(route, WIDE)
    try {
      const { index, marks } = await largestGroup(page)
      assert.ok(marks > 1, `${route.path}: no group with more than one mark`)

      const visited = await arrowTraversal(page, index, marks - 1)
      assert.deepEqual(
        visited,
        Array.from({ length: marks }, (_, i) => i),
        `${route.path} svg[${index}]: ${marks - 1} ArrowRight presses visited ` +
          `${new Set(visited).size} distinct marks of ${marks}`,
      )

      // One more ArrowRight at the end must CLAMP, not wrap: a chart's marks
      // are a series, and jumping from the last year to the first reads as a
      // discontinuity in the data.
      await page.keyboard.press('ArrowRight')
      assert.equal(
        await page.evaluate(
          (i) =>
            Array.from(document.querySelectorAll('svg')[i].querySelectorAll('[data-mark]')).indexOf(
              document.activeElement as Element,
            ),
          index,
        ),
        marks - 1,
        'ArrowRight wrapped from the last mark to the first',
      )

      await page.keyboard.press('Home')
      const atHome = await page.evaluate(
        (i) =>
          Array.from(document.querySelectorAll('svg')[i].querySelectorAll('[data-mark]')).indexOf(
            document.activeElement as Element,
          ),
        index,
      )
      assert.equal(atHome, 0, 'Home did not focus the first mark')

      await page.keyboard.press('End')
      const atEnd = await page.evaluate(
        (i) =>
          Array.from(document.querySelectorAll('svg')[i].querySelectorAll('[data-mark]')).indexOf(
            document.activeElement as Element,
          ),
        index,
      )
      assert.equal(atEnd, marks - 1, 'End did not focus the last mark')

      // ArrowLeft is the mirror; ArrowDown/ArrowUp are the same two moves, for
      // the vertical dot plot in `OecdChart` where "next" reads downward.
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowUp')
      const backTwo = await page.evaluate(
        (i) =>
          Array.from(document.querySelectorAll('svg')[i].querySelectorAll('[data-mark]')).indexOf(
            document.activeElement as Element,
          ),
        index,
      )
      assert.equal(backTwo, marks - 3, 'ArrowLeft and ArrowUp did not each step back one')
    } finally {
      await context.close()
    }
  })
}

test('the traversal guard bites when the key handler never runs', async () => {
  const { context, page } = await open(HOUSEHOLDS, WIDE)
  try {
    const { index, marks } = await largestGroup(page)

    // The mutation: a CAPTURE-phase listener on the svg that stops the event
    // dead. React's `onKeyDown` is delegated to the root container in the
    // bubble phase, so this is what it looks like when the handler is wired up
    // but never fires, the failure a traversal test exists to catch.
    await page.evaluate((i) => {
      const svg = document.querySelectorAll('svg')[i] as SVGSVGElement
      svg.addEventListener('keydown', (e) => e.stopImmediatePropagation(), true)
    }, index)

    const visited = await arrowTraversal(page, index, marks - 1)
    assert.deepEqual(
      visited,
      [0],
      `with the key handler silenced, ${marks - 1} ArrowRight presses still ` +
        `visited ${new Set(visited).size} marks — the traversal is not being ` +
        `driven by the handler under test`,
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B4, the active mark is visible. Criterion 4's second half.
 *
 * Asserts NON-ZERO, not >= 2px, because B4's subject is WHETHER A RING PAINTS
 * on a programmatically focused mark, an engine's :focus-visible heuristic is
 * entitled to decline that focus, and #69's fallback is what covers it. The
 * WIDTH is `focus.test.ts` F1's, over all seven ring-painting classes and both
 * viewports, against the `--focus-ring` token. #75 is closed.
 * ------------------------------------------------------------------------- */

interface Ring {
  outline: number
  /** `solid` is the author's ring; `auto` is Chromium's own UA focus ring,
   *  which paints on ANY keyboard-focused element and would make an
   *  `outline-width > 0` assertion pass on a chart the stylesheet forgot. */
  style: string
  stroke: number
}

async function ringOfActiveMark(page: Page): Promise<Ring> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as Element)
    return {
      outline: parseFloat(cs.outlineWidth) || 0,
      style: cs.outlineStyle,
      stroke: parseFloat(cs.strokeWidth) || 0,
    }
  })
}

/** The site's own ring, as distinct from the browser's. */
function isAuthorRing(r: Ring): boolean {
  return (r.style === 'solid' && r.outline > 0) || r.stroke >= 2
}

for (const route of CHART_ROUTES) {
  test(`${route.path}: the mark an arrow key moves to paints a ring`, async () => {
    const { context, page } = await open(route, WIDE)
    try {
      const { index, marks } = await largestGroup(page)
      assert.ok(marks > 1)
      await arrowTraversal(page, index, 1)
      const ring = await ringOfActiveMark(page)
      assert.ok(
        isAuthorRing(ring),
        `${route.path}: after ArrowRight the active mark paints neither a solid ` +
          `outline (${ring.outline}px ${ring.style}) nor a >=2px stroke ` +
          `(${ring.stroke}px). Arrow movement is PROGRAMMATIC focus, which an ` +
          `engine's :focus-visible heuristic may decline — that is what the ` +
          `[data-roving] fallback is for.`,
      )
    } finally {
      await context.close()
    }
  })
}

test('the focus-ring guard bites, and the data-roving fallback alone carries it', async () => {
  const { context, page } = await open(HOUSEHOLDS, WIDE)
  try {
    const { index } = await largestGroup(page)

    // Every rule that can paint a ring on a mark, DELETED from the stylesheet.
    // Not an `!important` override: the build's minifier merges
    // `.datum:focus-visible` and `[data-roving] [data-mark]:focus` into one
    // rule because their declarations are identical, so any override lands on
    // both at once and proves nothing about either. Deletion, then selective
    // restoration below, is what separates them.
    const deleted = await page.evaluate(() => {
      const gone: string[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        const rules = sheet.cssRules // same-origin; a throw here is a real failure
        for (let i = rules.length - 1; i >= 0; i -= 1) {
          const selector = (rules[i] as CSSStyleRule).selectorText ?? ''
          if (selector.includes('[data-roving]') || selector.includes(':focus-visible')) {
            sheet.deleteRule(i)
            gone.push(selector)
          }
        }
      }
      return gone
    })
    assert.ok(
      deleted.some((s) => s.includes('[data-roving] [data-mark]:focus')),
      `the [data-roving] fallback is not in the built CSS at all; deleted ${JSON.stringify(deleted)}`,
    )

    await arrowTraversal(page, index, 1)
    const stripped = await ringOfActiveMark(page)
    assert.ok(
      !isAuthorRing(stripped),
      `with every ring rule deleted the check still measured outline ` +
        `${stripped.outline}px ${stripped.style} / stroke ${stripped.stroke}px — ` +
        `it is not reading the element it claims to, and would pass on a chart ` +
        `with no ring at all`,
    )
    // What remains is Chromium's own `outline-style: auto` ring. Recording it
    // here is the reason the assertion above tests for `solid`: an
    // `outline-width > 0` check would have been satisfied by the browser on a
    // page whose stylesheet paints nothing.
    assert.equal(stripped.style, 'auto', 'expected only the UA focus ring to remain')

    // Now put back ONLY the fallback, no `:focus-visible` anywhere. This is
    // the engine that declines to treat a programmatic `.focus()` as
    // keyboard-visible, and the mark must still be ringed for that reader.
    await page.addStyleTag({
      content:
        '[data-roving] [data-mark]:focus { outline: var(--focus-ring) solid var(--ink); ' +
        'outline-offset: 1px; stroke: var(--ink); stroke-width: var(--focus-ring); ' +
        'vector-effect: non-scaling-stroke; }',
    })
    await arrowTraversal(page, index, 1)
    const fallbackOnly = await ringOfActiveMark(page)
    assert.ok(
      isAuthorRing(fallbackOnly),
      `the [data-roving] fallback alone painted neither a solid outline ` +
        `(${fallbackOnly.outline}px ${fallbackOnly.style}) nor a >=2px stroke ` +
        `(${fallbackOnly.stroke}px) — the ring depends entirely on the engine's ` +
        `:focus-visible heuristic`,
    )
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * B5, the bound holds in every runtime state. Criterion E4, E5 and E8.
 *
 * `LawExplorer`'s three filters and `YearRange`'s two thumbs change how many
 * marks exist WHILE THE PAGE IS OPEN. An active index left past the end of a
 * shrunken mark set leaves the group with zero Tab stops, the figure drops out
 * of the tab order and its data becomes unreachable. Every assertion here is
 * EXACTLY one, never "at most one".
 * ------------------------------------------------------------------------- */

const FILTERS = ['filter-character', 'filter-president', 'filter-control'] as const

test('#the-laws: every option of every filter leaves exactly one stop per svg', async () => {
  const { context, page } = await open(GOVERNMENT, WIDE)
  try {
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
        await assertOneStopPerSvg(page, `/government #the-laws, ${id} option ${i}`)
      }
    }
  } finally {
    await context.close()
  }
})

for (const figure of ['#what-a-household-earns', '#the-spread']) {
  test(`${figure}: both year-range extremes leave exactly one stop per svg`, async () => {
    const { context, page } = await open(HOUSEHOLDS, WIDE)
    try {
      const thumbs = page.locator(`${figure} .year-range-thumb`)
      assert.equal(await thumbs.count(), 2, `${figure}: expected two slider thumbs`)

      // Minimum separation: drive the low thumb all the way up. Radix's
      // `minStepsBetweenThumbs={4}` stops it five years short of the high one,
      // which is the fewest data points the figure ever draws.
      await thumbs.first().scrollIntoViewIfNeeded()
      await thumbs.first().focus()
      await page.keyboard.press('End')
      await assertOneStopPerSvg(page, `/households ${figure}, thumbs at minimum separation`)

      // Full extent, back out again.
      await page.keyboard.press('Home')
      await thumbs.nth(1).focus()
      await page.keyboard.press('End')
      await assertOneStopPerSvg(page, `/households ${figure}, thumbs at full extent`)
    } finally {
      await context.close()
    }
  })
}

test('the driven check reports a figure whose marks all went to -1', async () => {
  const { context, page } = await open(HOUSEHOLDS, WIDE)
  try {
    const { index } = await largestGroup(page)
    await page.evaluate((i) => {
      document
        .querySelectorAll('svg')
        [i].querySelectorAll('[data-mark]')
        .forEach((m) => m.setAttribute('tabindex', '-1'))
    }, index)
    const failures = stopFailures(await markStopsPerSvg(page))
    assert.equal(failures.length, 1, failures.join('; '))
    assert.match(failures[0] as string, /offers 0 Tab stop\(s\)/)
  } finally {
    await context.close()
  }
})
