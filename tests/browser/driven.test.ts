/** The driven half of the browser lane, the measurements that only exist once
 *  a control has been operated. Run by `npm run test:browser` alongside
 *  `smoke.test.ts`.
 *
 *  WHY A SEPARATE FILE, for the same reason `axisFit.test.ts` is separate from
 *  `annotate.test.ts`: the smoke lane must stay readable and must not grow a
 *  control-driving vocabulary, and a failure here should read as "an interactive
 *  state regressed", not "the site is broken".
 *
 *  These close the **ASSERTED (driven)** rows of the deferred-measurement
 *  inventory in `docs/contracts/accessibility.md`, #1, #2, #5, #7, #8, #18,
 *  #19, #20 and #25. Every one of them was, until now, a number a person
 *  measured once by hand and nothing re-ran.
 *
 *  The five figures in #25 are the point of this file. A default-state sweep
 *  measures every chart on the site in the one state it ships in; these five
 *  carry a control that changes their geometry, and are the only rows a
 *  default-state sweep would silently leave red.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROUTES,
  TOLERANCE_PX,
  VIEWPORTS,
  mountIslands,
  openRoute,
  textBoxes,
  withSite,
  type Route,
  type Site,
  type Viewport,
} from './harness.ts'

const GOVERNMENT = ROUTES.find((r) => r.path === '/government') as Route
const HOUSEHOLDS = ROUTES.find((r) => r.path === '/households') as Route
const NARROW = VIEWPORTS[0]
const WIDE = VIEWPORTS[1]

let site: Site

before(async () => {
  // Its own port. `node --test` runs spec files in separate processes and may
  // still overlap their setup; two servers on one port is a race that presents
  // as a mystery 404 rather than as a port conflict.
  site = await withSite(1)
})
after(async () => {
  await site?.close()
})

async function open(route: Route, viewport: Viewport) {
  const opened = await openRoute(site, route, viewport)
  await mountIslands(opened.page, route.hydratedSvg)
  return opened
}

/** No `<text>` anywhere on the page overruns its svg horizontally. Re-run after
 *  every control operation, which is the whole point of #25: the clamp is
 *  re-derived on each render and a state nobody sweeps is a state nobody
 *  clamps. */
async function assertNothingClipped(page: import('playwright').Page, where: string) {
  const texts = await textBoxes(page)
  assert.ok(texts.length > 0, `${where}: zero <text> nodes measured`)
  const overruns = texts
    .filter((t) => t.box.left < t.svg.left - TOLERANCE_PX || t.box.right > t.svg.right + TOLERANCE_PX)
    .map(
      (t) =>
        `  svg[${t.svgIndex}] ${JSON.stringify(t.text)}: ${t.box.left.toFixed(1)}→${t.box.right.toFixed(1)} ` +
        `outside ${t.svg.left.toFixed(1)}→${t.svg.right.toFixed(1)}`,
    )
  assert.deepEqual(overruns, [], `${where}: ${overruns.length} <text> nodes overrun their svg:\n${overruns.join('\n')}`)
}

/* ------------------------------------------------------------------------- *
 * Inventory #1, #2, #5, #20, the Radix Select popper.
 *
 * #62 shipped a listbox wider than the viewport at 390px. The fix clamps to
 * `calc(100vw - 1.5rem)` and wraps option text instead of truncating it, and
 * both halves were verified once, by hand, in a browser. This re-runs them.
 * ------------------------------------------------------------------------- */

for (const viewport of [NARROW, WIDE]) {
  test(`select poppers fit the viewport and wrap their options @ ${viewport.width}px`, async () => {
    const { context, page } = await open(GOVERNMENT, viewport)
    const where = `/government @ ${viewport.width}px`
    try {
      const triggers = page.locator('.select-trigger')
      const count = await triggers.count()
      assert.equal(count, 3, `${where}: .select-trigger count`)

      for (let i = 0; i < count; i++) {
        const trigger = triggers.nth(i)
        await trigger.scrollIntoViewIfNeeded()
        const triggerBox = await trigger.boundingBox()
        assert.notEqual(triggerBox, null, `${where}: trigger ${i} has no box`)
        await trigger.click()
        await page.locator('.select-content').first().waitFor({ state: 'visible' })

        const measured = await page.evaluate(() => {
          const content = document.querySelector('.select-content')
          if (content === null) return null
          const box = content.getBoundingClientRect()
          const options = [...content.querySelectorAll('.select-item')].map((o) => {
            const r = o.getBoundingClientRect()
            const cs = getComputedStyle(o)
            return {
              text: (o.textContent ?? '').trim().slice(0, 40),
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              textOverflow: cs.textOverflow,
              whiteSpace: cs.whiteSpace,
            }
          })
          return {
            box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
            options,
            innerWidth: window.innerWidth,
          }
        })
        assert.notEqual(measured, null, `${where}: trigger ${i} opened no .select-content`)
        const m = measured!

        // #1. The listbox itself, and every option in it, inside the viewport.
        assert.ok(
          m.box.left >= -TOLERANCE_PX && m.box.right <= m.innerWidth + TOLERANCE_PX,
          `${where}: popper ${i} spans ${m.box.left.toFixed(1)}→${m.box.right.toFixed(1)} ` +
            `outside a ${m.innerWidth}px viewport — the #62 clamp is not holding`,
        )
        assert.ok(m.options.length > 0, `${where}: popper ${i} rendered no .select-item`)
        const spilling = m.options
          .filter((o) => o.left < -TOLERANCE_PX || o.right > m.innerWidth + TOLERANCE_PX)
          .map((o) => `  ${JSON.stringify(o.text)}: ${o.left.toFixed(1)}→${o.right.toFixed(1)}`)
        assert.deepEqual(
          spilling,
          [],
          `${where}: ${spilling.length} options spill past the viewport:\n${spilling.join('\n')}`,
        )

        // #2. Option text WRAPS, never truncates. `text-overflow: ellipsis` is
        // the shape of the defect #62 replaced: a complete-looking label
        // carrying a partial value.
        const truncating = m.options
          .filter((o) => o.textOverflow !== 'clip' || o.whiteSpace === 'nowrap')
          .map((o) => `  ${JSON.stringify(o.text)}: text-overflow ${o.textOverflow}, white-space ${o.whiteSpace}`)
        assert.deepEqual(
          truncating,
          [],
          `${where}: ${truncating.length} options can truncate rather than wrap:\n${truncating.join('\n')}`,
        )

        // #20 (#65 E2). The open popper does not sit on top of its trigger's
        // 24px hit band, a tap meant for the list must not land on the trigger.
        const band = { top: triggerBox!.y, bottom: triggerBox!.y + triggerBox!.height }
        const intersects =
          Math.min(m.box.bottom, band.bottom) - Math.max(m.box.top, band.top) > TOLERANCE_PX
        assert.ok(
          !intersects,
          `${where}: popper ${i} (${m.box.top.toFixed(1)}→${m.box.bottom.toFixed(1)}) overlaps its ` +
            `trigger's hit band (${band.top.toFixed(1)}→${band.bottom.toFixed(1)})`,
        )

        await page.keyboard.press('Escape')
        await page.locator('.select-content').first().waitFor({ state: 'detached' }).catch(() => {})
      }

      // #5 (#62 E4). At desktop width the clamp is inert: the listbox is
      // narrower than the viewport by a wide margin and nothing wraps. Measured
      // by the same pass rather than argued from the stylesheet.
      if (viewport.width === 1440) {
        await triggers.first().click()
        await page.locator('.select-content').first().waitFor({ state: 'visible' })
        const width = await page.evaluate(
          () => document.querySelector('.select-content')?.getBoundingClientRect().width ?? 0,
        )
        assert.ok(
          width > 0 && width < 1440 / 2,
          `${where}: the desktop listbox measures ${width.toFixed(1)}px; the #62 clamp is no longer inert here`,
        )
        await page.keyboard.press('Escape')
      }
    } finally {
      await context.close()
    }
  })
}

/* ------------------------------------------------------------------------- *
 * Inventory #7, #8, the by-state table, scrolled and sorted.
 *
 * #63 shipped a by-state table whose pinned row header scrolled away with the
 * body, so a reader at full-right scroll could not tell which state a row was.
 * ------------------------------------------------------------------------- */

test('#by-state pins its row header at full-right scroll, through every sort', async () => {
  const { context, page } = await open(GOVERNMENT, NARROW)
  const where = '/government#by-state @ 390px'
  try {
    // `#by-state` carries two tables; the pinned-column one, the jurisdiction
    // table #63 was about, is the first. `querySelector` below picks the same
    // one, so the locator is scoped to match.
    await page.locator('#by-state .tableview-scroll').first().waitFor({ state: 'attached' })

    const geometry = async () =>
      page.evaluate(() => {
        const el = document.querySelector('#by-state .tableview-scroll')
        if (el === null) return null
        const container = el.getBoundingClientRect()
        const firstBodyCell = el.querySelector('tbody tr th, tbody tr td')
        const cell = firstBodyCell?.getBoundingClientRect() ?? null
        const headers = [...el.querySelectorAll('thead th')].map((h) => ({
          text: (h.textContent ?? '').trim().slice(0, 24),
          left: h.getBoundingClientRect().left,
          right: h.getBoundingClientRect().right,
        }))
        return {
          scrollLeft: el.scrollLeft,
          maxScroll: el.scrollWidth - el.clientWidth,
          container: { left: container.left, right: container.right },
          cell: cell === null ? null : { left: cell.left, right: cell.right },
          headers,
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        }
      })

    const before = await geometry()
    assert.notEqual(before, null, `${where}: no .tableview-scroll`)
    // The container overflows its client, that is the design (#63, E6), while
    // the PAGE does not. Both halves asserted together, because the fix for one
    // is the classic way to break the other.
    assert.ok(before!.maxScroll > 0, `${where}: the table no longer overflows its container`)
    assert.equal(
      before!.docScrollWidth,
      before!.docClientWidth,
      `${where}: the page itself scrolls horizontally`,
    )

    // #7. Drive to full-right scroll and re-measure. The pinned column must
    // still start at the container's left edge; if it scrolled with the body it
    // would be off to the left of it.
    await page.evaluate(() => {
      const el = document.querySelector('#by-state .tableview-scroll')!
      el.scrollLeft = el.scrollWidth - el.clientWidth
    })
    const scrolled = await geometry()
    assert.ok(scrolled!.scrollLeft > 0, `${where}: scrollLeft stayed at 0`)
    assert.ok(
      Math.abs(scrolled!.cell!.left - scrolled!.container.left) <= TOLERANCE_PX,
      `${where}: at full-right scroll the row header starts at ${scrolled!.cell!.left.toFixed(1)}, ` +
        `not at the container's left edge ${scrolled!.container.left.toFixed(1)} — it is no longer pinned`,
    )
    assert.ok(
      scrolled!.cell!.right > scrolled!.container.left,
      `${where}: the pinned row header has scrolled out of view entirely`,
    )
    const netBalance = scrolled!.headers.find((h) => h.text.startsWith('Net balance'))
    assert.notEqual(netBalance, undefined, `${where}: no "Net balance" column header`)
    assert.ok(
      netBalance!.left >= scrolled!.container.left - TOLERANCE_PX &&
        netBalance!.right <= scrolled!.container.right + TOLERANCE_PX,
      `${where}: at full-right scroll "Net balance" spans ${netBalance!.left.toFixed(1)}→` +
        `${netBalance!.right.toFixed(1)}, outside the container ` +
        `${scrolled!.container.left.toFixed(1)}→${scrolled!.container.right.toFixed(1)}`,
    )

    // #8 (#63 E4). Every sort button, clicked at full-right scroll, geometry
    // re-measured after each. A sort that re-renders the table is the operation
    // most likely to drop the pin.
    const sorts = page.locator('#by-state .sort-button')
    const sortCount = await sorts.count()
    assert.equal(sortCount, 5, `${where}: .sort-button count`)
    for (let i = 0; i < sortCount; i++) {
      const label = (await sorts.nth(i).textContent())?.trim().slice(0, 24) ?? `#${i}`
      await sorts.nth(i).click()
      await page.evaluate(() => {
        const el = document.querySelector('#by-state .tableview-scroll')!
        el.scrollLeft = el.scrollWidth - el.clientWidth
      })
      const after = await geometry()
      assert.ok(
        Math.abs(after!.cell!.left - after!.container.left) <= TOLERANCE_PX,
        `${where}: after sorting by ${JSON.stringify(label)} the row header is at ` +
          `${after!.cell!.left.toFixed(1)}, not pinned to ${after!.container.left.toFixed(1)}`,
      )
      assert.equal(
        after!.docScrollWidth,
        after!.docClientWidth,
        `${where}: sorting by ${JSON.stringify(label)} made the page scroll horizontally`,
      )
    }
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * Inventory #18, #19, the year-range slider.
 * ------------------------------------------------------------------------- */

test('the year-range track takes taps, and its two thumbs never collide', async () => {
  const { context, page } = await open(HOUSEHOLDS, NARROW)
  const where = '/households#what-a-household-earns @ 390px'
  try {
    const figure = page.locator('#what-a-household-earns')
    await figure.locator('.year-range-thumb').first().scrollIntoViewIfNeeded()

    // #18 (#65 E7). `elementFromPoint` at the centre of the track returns the
    // range, not a thumb: the thumb's 24px overlay is anchored to the thumb and
    // does not swallow taps meant for the track.
    const atCentre = await page.evaluate(() => {
      const track = document.querySelector('#what-a-household-earns .year-range-track')
      if (track === null) return null
      const r = track.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { cls: el?.className?.toString() ?? '', trackWidth: r.width }
    })
    assert.notEqual(atCentre, null, `${where}: no .year-range-track`)
    assert.ok(
      !atCentre!.cls.includes('year-range-thumb'),
      `${where}: elementFromPoint at the track centre returns ${JSON.stringify(atCentre!.cls)} — ` +
        `a thumb overlay is swallowing taps on the track`,
    )

    // #19 (#65 E8). Drive both thumbs to their minimum separation with the
    // keyboard and measure what is left. `minStepsBetweenThumbs` is what keeps
    // two 24px hit areas from overlapping; the separation is asserted against
    // the floor read from the page, not against the 35px a person measured once.
    const floorPx = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--target-min)'
      document.documentElement.appendChild(probe)
      const w = probe.getBoundingClientRect().width
      probe.remove()
      return w
    })
    const thumbs = figure.locator('.year-range-thumb')
    assert.equal(await thumbs.count(), 2, `${where}: thumb count`)
    await thumbs.nth(0).focus()
    for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowRight')
    await thumbs.nth(1).focus()
    for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowLeft')

    const separation = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('#what-a-household-earns .year-range-thumb')].map((t) =>
        t.getBoundingClientRect(),
      )
      if (a === undefined || b === undefined) return null
      const left = a.left <= b.left ? a : b
      const right = a.left <= b.left ? b : a
      return {
        centres: right.left + right.width / 2 - (left.left + left.width / 2),
        values: [...document.querySelectorAll('#what-a-household-earns .year-range-thumb')].map((t) =>
          t.getAttribute('aria-valuenow'),
        ),
      }
    })
    assert.notEqual(separation, null, `${where}: could not measure the thumbs`)
    assert.ok(
      separation!.centres >= floorPx,
      `${where}: at minimum range the thumb centres are ${separation!.centres.toFixed(1)}px apart, ` +
        `under the ${floorPx}px hit-area floor — two adjacent targets now overlap ` +
        `(aria-valuenow: ${separation!.values.join(', ')}). minStepsBetweenThumbs is what holds this.`,
    )

    await assertNothingClipped(page, `${where}, thumbs at minimum range`)
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * Inventory #25, the five figures whose deferral names an INTERACTIVE state.
 *
 * A default-state sweep measures every chart in the one state it ships in.
 * These five carry a control that changes their geometry, and are the only rows
 * such a sweep would silently leave red.
 * ------------------------------------------------------------------------- */

const INTERACTIVE: { route: Route; figure: string; control: string; what: string }[] = [
  { route: GOVERNMENT, figure: '#whole-budget', control: '.unit-toggle-item', what: 'unit toggle' },
  { route: GOVERNMENT, figure: '#the-laws', control: '.select-trigger', what: 'coalition/president filter' },
  { route: GOVERNMENT, figure: '#by-state', control: '.basis-toggle-item', what: 'per-person/total basis' },
  { route: HOUSEHOLDS, figure: '#what-a-household-earns', control: '.year-range-thumb', what: 'year range' },
  { route: HOUSEHOLDS, figure: '#the-spread', control: '.year-range-thumb', what: 'year range' },
]

for (const viewport of [NARROW, WIDE]) {
  for (const { route, figure, control, what } of INTERACTIVE) {
    test(`${figure}'s ${what} re-renders without clipping @ ${viewport.width}px`, async () => {
      const { context, page } = await open(route, viewport)
      const where = `${route.path}${figure} @ ${viewport.width}px, after the ${what}`
      try {
        const target = page.locator(`${figure} ${control}`)
        const count = await target.count()
        assert.ok(count > 0, `${where}: ${figure} has no ${control} to operate`)

        // Operate the control once, in the way a person would.
        if (control === '.year-range-thumb') {
          await target.first().scrollIntoViewIfNeeded()
          await target.first().focus()
          for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
        } else if (control === '.select-trigger') {
          await target.first().scrollIntoViewIfNeeded()
          await target.first().click()
          await page.locator('.select-content').first().waitFor({ state: 'visible' })
          await page.locator('.select-item').nth(1).click()
        } else {
          await target.last().scrollIntoViewIfNeeded()
          await target.last().click()
        }
        await page.waitForFunction(() => true)

        // The whole page is re-measured, not only this figure: a control that
        // widens its own panel can push a neighbour's label past its svg, and
        // the clamp is re-derived per render.
        await assertNothingClipped(page, where)
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          scrollWidth,
          clientWidth,
          `${where}: the page now scrolls horizontally (${scrollWidth} vs ${clientWidth})`,
        )
        const svgs = await page.locator('svg').count()
        assert.equal(svgs, route.hydratedSvg, `${where}: the <svg> count changed`)
      } finally {
        await context.close()
      }
    })
  }
}
