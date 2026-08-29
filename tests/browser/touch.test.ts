/** The touch half of the browser lane, issue #73. Run by
 *  `npm run test:browser` alongside `smoke`, `keyboard`, `driven` and `scroll`.
 *
 *  WHAT IS UNDER TEST. On a device that cannot hover, a chart's marks stop being
 *  hit targets, at 390px they are 3.317px wide and there are 389 of them across
 *  350px of plot, and the PLOT becomes one target: a tap or a drag anywhere in
 *  the `<svg>` focuses the geometrically nearest visible mark, and the readout
 *  the keyboard already drives reports it. The hint text follows the modality:
 *  `Focus or hover a year to read its value.` named two interactions a phone
 *  does not have, and is gone from the served bytes.
 *
 *  WHY A `hasTouch` CONTEXT AND NOT `isMobile`. `hasTouch: true` alone yields
 *  `(pointer: coarse)`, `(hover: none)`, `(any-pointer: coarse)` and
 *  `maxTouchPoints = 1`, measured. `isMobile` additionally forces a mobile user
 *  agent and a viewport-meta override, neither of which this contract is about,
 *  and both of which would make this file measure a different page than
 *  `keyboard.test.ts` measures at the same width.
 *
 *  WHY EVERY WAIT IS BOUNDED. `node --test` has no default per-test timeout, and
 *  #71's lane hung for fifteen minutes on an unbounded `waitForFunction` and had
 *  to be killed by hand (follow-up #123 owns the general fix). Every `test()`
 *  here carries an explicit timeout and every wait in it is a bounded
 *  `waitForFunction` or a fixed settle delay, there is no unbounded wait in
 *  this file.
 *
 *  THE ORACLE FOR "NEAREST", AND WHY IT IS NOT THE IMPLEMENTATION. B1b taps the
 *  CENTRE of a mark, so the point is inside at least one mark and the correct
 *  answer is forced by a rule far simpler than the resolver: THE LOWEST-INDEX
 *  VISIBLE MARK WHOSE RECT CONTAINS THE POINT. Four comparisons and a tie rule,
 *  no distances, an independent statement of the answer rather than a second
 *  copy of `nearestBox`. It has to be stated that way because the site's marks
 *  OVERLAP: `MedianIncome`'s dots are 15.5px wide on a 7.2px stride, so a dot's
 *  own centre sits inside its left neighbour too, and "tapping mark N focuses
 *  mark N" is simply false there. Ties resolving to data order is the documented
 *  rule, and this is where it is observed.
 *
 *  EVERY SWEEP COUNTS THROUGH A RECORDED INTEGER. `TAPPABLE_CHARTS` and
 *  `HINT_CARRIERS` below are measured facts, asserted as equalities before
 *  anything is measured over them. That is what stops a mistyped selector from
 *  sweeping an empty set and reporting green, the failure shape #72 found twice
 *  and the one this lane is least able to notice on its own.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES, VIEWPORTS, mountIslands, openRoute, withSite, type Route, type Site } from './harness.ts'
import type { Page } from 'playwright'

const NARROW = VIEWPORTS[0]
const WIDE = VIEWPORTS[1]

/** The routes that carry charts, in the order they are swept. */
const CHART_PATHS = ['/economy', '/households', '/government'] as const

/** How many chart `<svg>`s on each route are TAPPABLE, rendered with a non-zero
 *  box and carrying at least one visible mark. Measured at 390x844, hydrated.
 *
 *  Not the same as the svg count in `harness.ts`: `/economy` draws two svgs for
 *  each of two figures and the second of each carries no marks (it is the
 *  inflation strip), and `/government` renders `AttributionSplit`'s inactive tab
 *  panel at 0x0. Both are correctly outside this contract, and both are why the
 *  number is recorded rather than derived from `ROUTES`. */
const TAPPABLE_CHARTS: Record<string, number> = {
  '/economy': 5,
  '/households': 8,
  '/government': 13,
}

/** How many elements on each route carry the three-span hint, `p.readout` for
 *  every figure but `BudgetChart`, whose readout is a `dl.inspector`.
 *
 *  One `p.readout` per route deliberately carries NO hint: `AttributionSplit`'s
 *  idle readout is an announcement of the current tab ("By voting coalition. 3
 *  coalitions, net total ..."), which never named a gesture and so was never
 *  part of #73's defect. That is why `/government` is 12 and not 13. */
const HINT_CARRIERS: Record<string, number> = {
  '/economy': 5,
  '/households': 7,
  '/government': 12,
}

/** The one chart whose own table does not carry every datum it draws.
 *
 *  `StatutoryVsEffective` plots 44 years of the top statutory rate and tables
 *  only the CBO anchor years, so a tap on 1990, 2001 or 2011 reads out a value
 *  that is genuinely in the chart and genuinely absent from the table below it.
 *  That is a `TableView` completeness question, not #73's. It is named
 *  here as an exception rather than
 *  softening B1c's table half into "where present", which would pass over any
 *  number of charts losing their tables. */
const TABLE_INCOMPLETE = new Set(['/households#4'])

/** The three sentences, verbatim from `src/components/charts/hint.ts`. Repeated
 *  here on purpose: a test that imported them could not tell a change in the
 *  strings from a change in which one is displayed, which is the whole subject
 *  of B2. U2 is what guards the module's own copy. */
const TOUCH_SENTENCE = 'Tap or drag across the chart to read a value.'
const NOJS_SENTENCE = 'Open "View as table" below for any value in this chart.'
const HOVER_FRAGMENT = ', or Tab to it, to read its value.'

/** Milliseconds allowed for React to re-render a readout after a focus change.
 *  A fixed settle, not a poll: the assertion that follows is about the text
 *  being right, and a poll would turn "wrong text" into "timed out". */
const SETTLE_MS = 120

const TEST_TIMEOUT = 120_000

function routeFor(path: string): Route {
  const r = ROUTES.find((x) => x.path === path)
  if (r === undefined) throw new Error(`no route ${path}`)
  return r
}

/** The identifier a readout and a table cell must agree on.
 *
 *  The first four-digit year in the mark's `aria-label` where there is one, and
 *  the label up to its first `:`, `,` or `.` otherwise. Deliberately NOT a
 *  formatted number: `$5.2T` and `5.200` are the same datum and a guard that
 *  compared them would fail on a rounding change that is not a defect, while
 *  passing on a genuine mismatch between two figures that happen to round alike. */
function identifier(label: string): string {
  const year = label.match(/\b(1[89]\d\d|20\d\d)\b/)
  if (year !== null) return year[1] as string
  return (label.split(/[:,.]/)[0] ?? '').trim()
}

/** In-page: every tappable chart's index, with its visible marks' indices. */
async function tappableCharts(page: Page): Promise<{ svg: number; marks: number[] }[]> {
  return page.evaluate(() => {
    const out: { svg: number; marks: number[] }[] = []
    document.querySelectorAll('svg.chart').forEach((svg, svgIndex) => {
      const r = svg.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const marks: number[] = []
      svg.querySelectorAll('[data-mark]').forEach((m, j) => {
        const b = m.getBoundingClientRect()
        if (b.width > 0 && b.height > 0) marks.push(j)
      })
      if (marks.length === 0) return
      out.push({ svg: svgIndex, marks })
    })
    return out
  })
}

/** In-page: the readout that belongs to one chart `<svg>`, and its text.
 *
 *  The rule is "the first `.readout`/`.inspector` FOLLOWING the svg inside its
 *  figure", not "the first one in the figure": `MedianIncome` and
 *  `HouseholdSpread` sit under a year-range control whose own
 *  `.year-range-readout` also matches `.readout`, and it PRECEDES the chart.
 *
 *  Written out inside each `page.evaluate` rather than shared, because a
 *  browser-context function cannot close over a Node-context one and the two
 *  alternatives, stringifying it, or an init script, both cost more than the
 *  three lines they save. */
async function readoutText(page: Page, svgIndex: number): Promise<string> {
  return page.evaluate((k) => {
    const svg = document.querySelectorAll('svg.chart')[k] as Element
    const host = svg.closest('figure') ?? svg.parentElement!
    const all = Array.from(host.querySelectorAll('.readout, .inspector'))
    const el = all.find((e) => (svg.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? all[0]
    return el === undefined ? '' : (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
  }, svgIndex)
}

/** Bring a chart into view and hand back its box in viewport coordinates.
 *  Measured AFTER the scroll, because a readout that grew three lines on the
 *  previous tap has already moved everything below it. */
async function chartBox(
  page: Page,
  svgIndex: number,
): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate((k) => {
    const svg = document.querySelectorAll('svg.chart')[k] as Element
    svg.scrollIntoView({ block: 'center' })
    const r = svg.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, svgIndex)
}

async function openChartRoute(
  site: Site,
  path: string,
  opts: { hasTouch?: boolean; javaScriptEnabled?: boolean; wide?: boolean } = {},
) {
  const route = routeFor(path)
  const { context, page } = await openRoute(site, route, opts.wide === true ? WIDE : NARROW, {
    hasTouch: opts.hasTouch,
    javaScriptEnabled: opts.javaScriptEnabled,
  })
  if (opts.javaScriptEnabled !== false) await mountIslands(page, route.hydratedSvg)
  return { context, page, route }
}

let site: Site

before(async () => {
  site = await withSite(4)
})

after(async () => {
  await site.close()
})

// ---------------------------------------------------------------------------
// B1, a reader can obtain the value of any datum, by tapping (DoD 1, DoD 3)
// ---------------------------------------------------------------------------

for (const path of CHART_PATHS) {
  test(`B1a ${path}: a tap at 30% and at 70% of every chart moves its readout off the hint`, { timeout: TEST_TIMEOUT }, async () => {
    const { context, page } = await openChartRoute(site, path, { hasTouch: true })
    try {
      const charts = await tappableCharts(page)
      // The floor, asserted BEFORE anything is measured over it. A selector that
      // stopped matching would otherwise sweep an empty set and report green.
      assert.equal(
        charts.length,
        TAPPABLE_CHARTS[path],
        `${path}: ${charts.length} tappable charts, expected ${TAPPABLE_CHARTS[path]}`,
      )

      for (const { svg } of charts) {
        const idle = await readoutText(page, svg)
        assert.ok(idle.length > 0, `${path}#${svg}: no readout to change`)
        for (const fraction of [0.3, 0.7]) {
          const box = await chartBox(page, svg)
          await page.touchscreen.tap(box.x + box.w * fraction, box.y + box.h * 0.5)
          await page.waitForTimeout(SETTLE_MS)
          const after = await readoutText(page, svg)
          assert.notEqual(
            after,
            idle,
            `${path}#${svg}: a tap at ${fraction * 100}% left the readout unchanged at ${JSON.stringify(idle)}`,
          )
        }
      }
    } finally {
      await context.close()
    }
  })

  test(`B1b/B1c ${path}: a tap selects the right mark, and the readout says so`, { timeout: TEST_TIMEOUT }, async () => {
    const { context, page } = await openChartRoute(site, path, { hasTouch: true })
    try {
      const charts = await tappableCharts(page)
      assert.equal(charts.length, TAPPABLE_CHARTS[path], `${path}: tappable chart count`)

      for (const { svg, marks } of charts) {
        // Five marks spread across the whole index range, deduplicated: first,
        // quartiles, last. Not five in a row, a resolver stuck near one end
        // has to be visible, and that is what "any datum" means.
        const sampled = [...new Set(
          [0, 0.25, 0.5, 0.75, 1].map((f) => marks[Math.round(f * (marks.length - 1))] as number),
        )]
        const seenReadouts = new Set<string>()
        const seenLabels = new Set<string>()
        let keysInTable = 0

        for (const j of sampled) {
          await chartBox(page, svg)
          const point = await page.evaluate(
            ([k, m]) => {
              const b = (document.querySelectorAll('svg.chart')[k] as Element)
                .querySelectorAll('[data-mark]')[m]!
                .getBoundingClientRect()
              return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
            },
            [svg, j] as [number, number],
          )

          // The oracle, computed before the tap.
          const expected = await page.evaluate(
            ([k, x, y]) => {
              const ms = (document.querySelectorAll('svg.chart')[k as number] as Element)
                .querySelectorAll('[data-mark]')
              for (let n = 0; n < ms.length; n += 1) {
                const b = ms[n]!.getBoundingClientRect()
                if (b.width <= 0 || b.height <= 0) continue
                if ((x as number) >= b.left && (x as number) <= b.right && (y as number) >= b.top && (y as number) <= b.bottom) {
                  return { index: n, label: ms[n]!.getAttribute('aria-label') ?? '' }
                }
              }
              return null
            },
            [svg, point.x, point.y] as [number, number, number],
          )
          assert.notEqual(
            expected,
            null,
            `${path}#${svg}: mark ${j}'s own centre lies inside no visible mark, so this sample proves nothing`,
          )
          const want = expected as { index: number; label: string }
          assert.ok(want.label.length > 0, `${path}#${svg} mark ${want.index}: no aria-label to read out`)

          await page.touchscreen.tap(point.x, point.y)
          await page.waitForTimeout(SETTLE_MS)

          const got = await page.evaluate((k) => {
            const svgEl = document.querySelectorAll('svg.chart')[k] as Element
            const ms = svgEl.querySelectorAll('[data-mark]')
            const host = svgEl.closest('figure') ?? svgEl.parentElement!
            const all = Array.from(host.querySelectorAll('.readout, .inspector'))
            const el = all.find((e) => (svgEl.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? all[0]
            return {
              index: Array.prototype.indexOf.call(ms, document.activeElement),
              readout: el === undefined ? '' : (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
              cells: Array.from(host.querySelectorAll('td, th')).map((t) => (t.textContent ?? '').trim()),
            }
          }, svg)

          // B1b: the gesture selected exactly the mark the geometry forces.
          assert.equal(
            got.index,
            want.index,
            `${path}#${svg}: tapping the centre of mark ${j} focused mark ${got.index}, expected ${want.index} (${JSON.stringify(want.label.slice(0, 60))})`,
          )
          // B1c, first half: the live region IS the visual readout, and it is
          // reporting the mark that actually holds focus.
          const key = identifier(want.label)
          assert.ok(
            got.readout.includes(key),
            `${path}#${svg}: focus is on ${JSON.stringify(want.label.slice(0, 50))} but the readout reads ${JSON.stringify(got.readout.slice(0, 70))}`,
          )
          if (got.cells.some((c) => c.includes(key))) keysInTable += 1
          seenLabels.add(want.label)
          seenReadouts.add(got.readout)
        }

        // B1b, the half that stops "any datum" degrading to "one datum": as many
        // distinct readouts as there were distinct marks to land on.
        assert.equal(
          seenReadouts.size,
          seenLabels.size,
          `${path}#${svg}: ${seenLabels.size} distinct marks sampled but only ${seenReadouts.size} distinct readouts`,
        )

        // B1c, second half: the value read out is in the figure's own table.
        if (TABLE_INCOMPLETE.has(`${path}#${svg}`)) {
          assert.ok(
            keysInTable < sampled.length,
            `${path}#${svg} is recorded as a chart whose table omits some of its data, but every sampled value was found — remove it from TABLE_INCOMPLETE`,
          )
        } else {
          assert.equal(
            keysInTable,
            sampled.length,
            `${path}#${svg}: ${sampled.length - keysInTable} of ${sampled.length} tapped values are absent from the figure's own table`,
          )
        }
      }
    } finally {
      await context.close()
    }
  })
}

// ---------------------------------------------------------------------------
// B2, the hint names the gestures the device reading it actually has (DoD 2)
// ---------------------------------------------------------------------------

/** Every hint carrier's VISIBLE text. `innerText`, not `textContent`: all three
 *  sentences are in the DOM on every device and `textContent` would return all
 *  three concatenated, which is precisely the state this guard exists to tell
 *  apart from the correct one. */
async function visibleHints(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.readout, .inspector'))
      .filter((el) => el.querySelector('.hint-nojs') !== null)
      .map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
  )
}

for (const path of CHART_PATHS) {
  test(`B2a ${path}: on touch, every hint names tapping and never hovering`, { timeout: TEST_TIMEOUT }, async () => {
    const { context, page } = await openChartRoute(site, path, { hasTouch: true })
    try {
      const hints = await visibleHints(page)
      assert.equal(hints.length, HINT_CARRIERS[path], `${path}: hint carrier count`)
      for (const text of hints) {
        assert.equal(text, TOUCH_SENTENCE, `${path}: a touch reader is shown ${JSON.stringify(text)}`)
        assert.doesNotMatch(text, /hover/i, `${path}: a touch reader is told to hover`)
      }
    } finally {
      await context.close()
    }
  })

  test(`B2b ${path}: on a desktop pointer, every hint names hovering and Tab`, { timeout: TEST_TIMEOUT }, async () => {
    const { context, page } = await openChartRoute(site, path, { wide: true })
    try {
      const hints = await visibleHints(page)
      assert.equal(hints.length, HINT_CARRIERS[path], `${path}: hint carrier count`)
      for (const text of hints) {
        assert.match(text, /^Hover a .+, or Tab to it, to read its value\.$/, `${path}: ${JSON.stringify(text)}`)
        assert.ok(text.endsWith(HOVER_FRAGMENT), `${path}: ${JSON.stringify(text)}`)
      }
    } finally {
      await context.close()
    }
  })

  test(`B2c ${path}: with scripting off, every hint points at the table`, { timeout: TEST_TIMEOUT }, async () => {
    const { context, page } = await openChartRoute(site, path, { javaScriptEnabled: false })
    try {
      const hints = await visibleHints(page)
      assert.equal(hints.length, HINT_CARRIERS[path], `${path}: hint carrier count`)
      for (const text of hints) {
        assert.equal(text, NOJS_SENTENCE, `${path}: with no scripting a reader is shown ${JSON.stringify(text)}`)
        assert.doesNotMatch(text, /hover/i)
        assert.doesNotMatch(text, /\btap\b/i, `${path}: a gesture that does nothing without scripting is being named`)
      }
    } finally {
      await context.close()
    }
  })
}

// ---------------------------------------------------------------------------
// B3, desktop hover and Tab focus unchanged (DoD 4, behavioural half)
// ---------------------------------------------------------------------------

test('B3a: on desktop a mouse press inside a chart still selects no datum', { timeout: TEST_TIMEOUT }, async () => {
  let checked = 0
  for (const path of CHART_PATHS) {
    const { context, page } = await openChartRoute(site, path, { wide: true })
    try {
      const charts = await tappableCharts(page)
      assert.equal(charts.length, TAPPABLE_CHARTS[path], `${path}: tappable chart count`)
      for (const { svg } of charts) {
        const box = await chartBox(page, svg)
        // A point inside the svg but on no mark. A mark UNDER the cursor takes
        // focus natively and always did, so pressing one would prove nothing;
        // this point is the one where the pointer path would be visible if the
        // `pointerType === 'mouse'` bail were ever dropped.
        const point = { x: box.x + 4, y: box.y + box.h - 4 }
        const onMark = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number)
          return el !== null && el.closest('[data-mark]') !== null
        }, [point.x, point.y] as [number, number])
        assert.equal(onMark, false, `${path}#${svg}: the probe point sits on a mark, so it cannot tell the two behaviours apart`)

        await page.evaluate(() => {
          const b = document.body
          b.setAttribute('tabindex', '-1')
          b.focus()
          b.removeAttribute('tabindex')
        })
        const idle = await readoutText(page, svg)
        // WATCH FOR THE FOCUS EVENT, NOT THE END STATE. Reading
        // `document.activeElement` after the press is a HOLLOW CHECK, and it was
        // written that way first: with the `pointerType === 'mouse'` bail
        // removed, the pointer path focuses a mark on `pointerdown` and
        // Chromium's own `mousedown` focus action then resolves focus away from
        // it a moment later, because the `<svg>` is not focusable. The end state
        // is identical either way and the mutation went green through all
        // eighteen tests. The focus EVENT is what actually differs.
        await page.evaluate(() => {
          const w = window as unknown as { __markFocus?: string[] }
          w.__markFocus = []
          document.addEventListener(
            'focusin',
            (e) => {
              const t = e.target as Element | null
              if (t !== null && t.closest('[data-mark]') !== null) {
                w.__markFocus!.push(t.getAttribute('aria-label')?.slice(0, 40) ?? t.tagName)
              }
            },
            true,
          )
          const b = document.body
          b.setAttribute('tabindex', '-1')
          b.focus()
          b.removeAttribute('tabindex')
        })
        await page.mouse.move(point.x, point.y)
        await page.mouse.down()
        await page.mouse.up()
        await page.waitForTimeout(60)
        const focusedMarks = await page.evaluate(
          () => (window as unknown as { __markFocus: string[] }).__markFocus,
        )
        assert.deepEqual(
          focusedMarks,
          [],
          `${path}#${svg}: a desktop mouse press on empty plot focused ${focusedMarks.length} data mark(s) (${JSON.stringify(focusedMarks)}) — the pointerType bail is gone and the touch path is running on a mouse`,
        )
        assert.equal(
          await readoutText(page, svg),
          idle,
          `${path}#${svg}: a desktop mouse press produced a readout`,
        )
        checked += 1
      }
    } finally {
      await context.close()
    }
  }
  const expected = Object.values(TAPPABLE_CHARTS).reduce((a, b) => a + b, 0)
  assert.equal(checked, expected, `${checked} charts probed, expected ${expected}`)
})

test('B3b: marks are inert to the pointer on touch and live on desktop', { timeout: TEST_TIMEOUT }, async () => {
  const read = async (page: Page) =>
    page.evaluate(() => {
      const mark = document.querySelector('.chart [data-mark]')
      const chart = document.querySelector('svg.chart')
      if (mark === null || chart === null) return null
      return {
        pointerEvents: getComputedStyle(mark).pointerEvents,
        touchAction: getComputedStyle(chart).touchAction,
      }
    })

  for (const path of CHART_PATHS) {
    const touch = await openChartRoute(site, path, { hasTouch: true })
    try {
      const got = await read(touch.page)
      assert.notEqual(got, null, `${path}: no chart mark to measure`)
      assert.equal(got!.pointerEvents, 'none', `${path}: a mark still hit-tests on touch, so the emulated mouseleave will wipe the readout`)
      // `pan-y`, not `none`: B4 is the other half of this decision.
      assert.equal(got!.touchAction, 'pan-y', `${path}: the chart's touch-action is ${got!.touchAction}`)
    } finally {
      await touch.context.close()
    }

    const desktop = await openChartRoute(site, path, { wide: true })
    try {
      const got = await read(desktop.page)
      assert.notEqual(got, null, `${path}: no chart mark to measure`)
      assert.notEqual(got!.pointerEvents, 'none', `${path}: desktop hover is dead — the media query has lost its scope`)
      assert.notEqual(got!.touchAction, 'pan-y', `${path}: the touch-action rule has escaped its media query`)
    } finally {
      await desktop.context.close()
    }
  }
})

// ---------------------------------------------------------------------------
// B4, a phone reader can still scroll past a chart (DoD 6)
// ---------------------------------------------------------------------------

test('B4: a vertical swipe that starts on a chart still scrolls the page', { timeout: TEST_TIMEOUT }, async () => {
  // Included because TAKING the gesture is the obvious way to break the page
  // while every other criterion goes green: `touch-action: none` would make
  // every assertion above pass and make a 26,000px route unreadable.
  for (const path of CHART_PATHS) {
    const { context, page } = await openChartRoute(site, path, { hasTouch: true })
    try {
      const cdp = await context.newCDPSession(page)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(60)
      const box = await chartBox(page, 0)
      const start = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
      const before = await page.evaluate(() => window.scrollY)

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
      for (let i = 1; i <= 8; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x, y: start.y - i * 25 }],
        })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

      // Bounded, because Chromium's fling settles asynchronously and an
      // unbounded wait here is exactly the failure #123 exists for.
      await page.waitForFunction((y) => window.scrollY > (y as number), before, { timeout: 5_000 })
      const after = await page.evaluate(() => window.scrollY)
      assert.ok(after > before, `${path}: a vertical swipe over a chart left scrollY at ${after}`)
    } finally {
      await context.close()
    }
  }
})
