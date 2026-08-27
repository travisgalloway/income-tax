/** The browser lane — six checks, seven routes, two viewports, plus a
 *  scripting-off pass. Run by `npm run test:browser` (`node --test`, the same
 *  runner as `npm run test:unit`; one runner, two lanes).
 *
 *  WHY THIS EXISTS. Every other lane in this repository asserts geometry it
 *  cannot see. `pipeline/tests/test_accessibility.py` reads the served bytes;
 *  `src/**\/*.test.ts` exercises pure functions. Neither can measure a box, so
 *  every computed value — a popper's width, a table's `scrollWidth`, a `<text>`
 *  node's rendered right edge, a `::before` hit area, a console warning during
 *  hydration — was recorded in `docs/contracts/accessibility.md` as a
 *  measurement a person took once, and nothing re-ran it. #62, #63 and #64 were
 *  each one `getBoundingClientRect()` away from being caught automatically, and
 *  all three were found by a human looking at the deployed site.
 *
 *  BOUNDARIES, DELIBERATE. This lane does not re-derive what
 *  `annotate.test.ts` and `axisFit.test.ts` already hold about NARROW placement,
 *  and does not re-derive what the pytest suite already holds statically. It
 *  measures only what a rendered box can tell you.
 *
 *  FONT METRICS. macOS and Linux differ by design — `src/styles/tokens.css:4-5`
 *  ships a system-font stack with no webfont. Every assertion here is an integer,
 *  a one-sided inequality, or a containment with `TOLERANCE_PX` slack, so metric
 *  drift can only ever make this stricter. See `harness.ts`'s header.
 *
 *  The disposition of each of the 34 measurements this lane was built to close
 *  is in `docs/contracts/accessibility.md`, section "The browser lane, and what
 *  it now asserts". Ten of them stay human-judged; this spec claims none of them.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { ADVANCE_EM } from '../../src/components/charts/annotate.ts'
import {
  CONSOLE_ALLOWLIST,
  ROUTES,
  TARGET_SELECTOR,
  TOLERANCE_PX,
  VIEWPORTS,
  collectConsole,
  hitAreas,
  mountIslands,
  openRoute,
  textBoxes,
  withSite,
  type Site,
} from './harness.ts'

let site: Site

before(async () => {
  site = await withSite()
})
after(async () => {
  await site?.close()
})

/** Check 1. Horizontal overflow, on `documentElement` ONLY.
 *  `.tableview-scroll` and `.law-table-scroll` legitimately exceed their
 *  clients — walking every element would fire on intended scroll containers. */
async function assertNoHorizontalOverflow(page: import('playwright').Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert.equal(
    scrollWidth,
    clientWidth,
    `${where}: the page scrolls horizontally — documentElement.scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  )
}

/** Check 6. The skip link is the first tab stop, its target exists and is
 *  focusable, and the next two stops are the nav disclosure and something
 *  inside `<main>`. Inventory #27; the contract already records this order at
 *  `docs/contracts/accessibility.md:1181`. */
async function assertTabOrder(page: import('playwright').Page, where: string) {
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => {
    const a = document.activeElement as HTMLAnchorElement | null
    return { cls: a?.className ?? '', href: a?.getAttribute('href') ?? '' }
  })
  assert.ok(
    first.cls.split(' ').includes('skip-link'),
    `${where}: the first tab stop is ${JSON.stringify(first.cls)}, expected a.skip-link`,
  )
  const target = await page.evaluate((href: string) => {
    const el = document.querySelector(href)
    return el === null ? null : { tabindex: el.getAttribute('tabindex') }
  }, first.href)
  assert.notEqual(target, null, `${where}: the skip link points at ${first.href}, which does not exist`)
  assert.equal(
    target?.tabindex,
    '-1',
    `${where}: ${first.href} is missing tabindex="-1", so skipping to it does not move focus`,
  )

  await page.keyboard.press('Tab')
  const second = await page.evaluate(() => document.activeElement?.className ?? '')
  assert.ok(
    second.split(' ').includes('navbar-trigger'),
    `${where}: the second tab stop is ${JSON.stringify(second)}, expected summary.navbar-trigger`,
  )
  await page.keyboard.press('Tab')
  const thirdInMain = await page.evaluate(() => document.activeElement?.closest('main') !== null)
  assert.ok(thirdInMain, `${where}: the third tab stop is outside <main>`)
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    const where = `${route.path} @ ${viewport.width}x${viewport.height}`

    test(`${where}`, async () => {
      const { context, page } = await openRoute(site, route, viewport)
      const consoleMessages = collectConsole(page)
      try {
        // --- Check 2, chart mount. The count is WAITED ON, never sampled: a
        // short count means an island never mounted, and measuring anyway is a
        // green run over nothing — the most expensive outcome available here.
        const figures = await page.locator('figure').count()
        assert.equal(figures, route.figures, `${where}: <figure> count`)
        await mountIslands(page, route.hydratedSvg)

        const svgs = await page.evaluate(() => {
          const all = [...document.querySelectorAll('svg')]
          return {
            total: all.length,
            zeroWidthVisible: all
              .filter((s) => (s as SVGElement & { checkVisibility?: () => boolean }).checkVisibility?.() !== false)
              .filter((s) => s.getBoundingClientRect().width === 0).length,
            hiddenCount: all.filter(
              (s) => (s as SVGElement & { checkVisibility?: () => boolean }).checkVisibility?.() === false,
            ).length,
            narrowViewBox: all.filter((s) => (s.getAttribute('viewBox') ?? '').startsWith('0 0 360 ')).length,
          }
        })
        assert.equal(svgs.total, route.hydratedSvg, `${where}: hydrated <svg> count`)
        assert.equal(
          svgs.zeroWidthVisible,
          0,
          `${where}: ${svgs.zeroWidthVisible} visible <svg> measured zero width — an island rendered but never laid out`,
        )
        // `/government`'s second attribution tab panel is display:none until its
        // tab is chosen; it is the only legitimately unlaid-out chart on the
        // site and is asserted as an exact number so a second one cannot appear
        // silently.
        assert.equal(
          svgs.hiddenCount,
          route.path === '/government' ? 1 : 0,
          `${where}: hidden <svg> count changed`,
        )

        // --- Criterion 5, the NARROW path proved exercised. `useChartSize`
        // returns the 720-unit WIDE preset before measurement, so a run that
        // measured unmounted islands would report zero 360-unit viewBoxes even
        // at 390px. This is the tell the contract itself uses (`:650`).
        if (route.figures > 0) {
          if (viewport.width === 390) {
            assert.ok(
              svgs.narrowViewBox > 0,
              `${where}: no chart reports a 360-unit viewBox, so the NARROW path was never exercised`,
            )
          } else {
            assert.equal(
              svgs.narrowViewBox,
              0,
              `${where}: a chart reports a 360-unit viewBox at desktop width`,
            )
          }
        }

        // --- Check 1, horizontal overflow.
        await assertNoHorizontalOverflow(page, where)

        // --- Check 3, clipping. EVERY `<text>` in EVERY `<svg>`, not only
        // `.annotation` — that widening is what closes #66's unrun pass and #64's
        // rendered-pixel row. Failures name route, viewport, svg and text; a bare
        // count is unactionable.
        const texts = await textBoxes(page)
        // E14, the corpus-size guard: a spec that passes because it measured
        // nothing is the failure this mirrors from
        // `test_the_annotation_clipping_guard_sees_the_whole_corpus`.
        if (route.figures > 0) {
          assert.ok(texts.length > 0, `${where}: zero <text> nodes measured across ${route.hydratedSvg} svgs`)
        } else {
          assert.equal(texts.length, 0, `${where}: this route renders no svg, so it can carry no <text>`)
        }
        const overruns = texts
          .filter(
            (t) =>
              t.box.left < t.svg.left - TOLERANCE_PX ||
              t.box.right > t.svg.right + TOLERANCE_PX ||
              t.box.top < t.svg.top - TOLERANCE_PX ||
              t.box.bottom > t.svg.bottom + TOLERANCE_PX,
          )
          .map(
            (t) =>
              `  svg[${t.svgIndex}] ${JSON.stringify(t.text)}: ` +
              `text ${t.box.left.toFixed(1)}→${t.box.right.toFixed(1)} ` +
              `outside svg ${t.svg.left.toFixed(1)}→${t.svg.right.toFixed(1)}`,
          )
        assert.deepEqual(
          overruns,
          [],
          `${where}: ${overruns.length} of ${texts.length} <text> nodes overrun their svg:\n${overruns.join('\n')}`,
        )

        // --- The advance-width constant, measured. A one-sided inequality, so
        // font drift can only make it stricter; the contract's rule is that
        // ADVANCE_EM is raised, never lowered (`:732`).
        if (route.figures > 0) {
          const worst = await page.evaluate(() => {
            let ratio = 0
            let carrier = ''
            document.querySelectorAll('svg text').forEach((t) => {
              const chars = (t.textContent ?? '').length
              if (chars === 0) return
              const fontPx = parseFloat(getComputedStyle(t).fontSize)
              if (!Number.isFinite(fontPx) || fontPx === 0) return
              const len = (t as SVGTextElement).getComputedTextLength()
              const r = len / (chars * fontPx)
              if (r > ratio) {
                ratio = r
                carrier = t.textContent ?? ''
              }
            })
            return { ratio, carrier }
          })
          assert.ok(
            worst.ratio <= ADVANCE_EM,
            `${where}: worst measured advance ratio ${worst.ratio.toFixed(4)} exceeds ADVANCE_EM ` +
              `${ADVANCE_EM}, carried by ${JSON.stringify(worst.carrier)}. Raise the constant in ` +
              `src/components/charts/annotate.ts AND pipeline/tests/test_accessibility.py — never lower it.`,
          )
        }

        // --- Check 4, target size. The floor is READ from `--target-min` at
        // runtime, never hardcoded: its value is #65's decision, and this lane
        // reads it rather than restating it.
        const { floorPx, areas } = await hitAreas(page, TARGET_SELECTOR)
        assert.ok(floorPx > 0, `${where}: --target-min resolved to ${floorPx}px`)
        assert.ok(areas.length > 0, `${where}: no controls matched ${TARGET_SELECTOR}`)
        const undersized = areas
          .filter((a) => a.width < floorPx - TOLERANCE_PX || a.height < floorPx - TOLERANCE_PX)
          .map((a) => `  ${a.label}: ${a.width.toFixed(1)} x ${a.height.toFixed(1)}`)
        assert.deepEqual(
          undersized,
          [],
          `${where}: ${undersized.length} hit areas fall under the ${floorPx}px floor:\n${undersized.join('\n')}`,
        )

        // Inventory #16, the case #65 could not settle from the stylesheet: an
        // 8px row gap plus a 16px line box is a 24px pitch against a 24px floor.
        // No `.controls` row wraps today, so it does not arise — asserting ZERO
        // intersecting pairs is what makes it bite the day one does.
        const overlaps: string[] = []
        for (let i = 0; i < areas.length; i++) {
          for (let j = i + 1; j < areas.length; j++) {
            const a = areas[i]!
            const b = areas[j]!
            const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (dx > TOLERANCE_PX && dy > TOLERANCE_PX) {
              overlaps.push(`  ${a.label} ∩ ${b.label} by ${dx.toFixed(1)} x ${dy.toFixed(1)}`)
            }
          }
        }
        assert.deepEqual(
          overlaps,
          [],
          `${where}: ${overlaps.length} pairs of control hit areas intersect:\n${overlaps.join('\n')}`,
        )

        // --- Check 6, the skip link and the first three tab stops.
        await assertTabOrder(page, where)

        // --- Check 5, console. Over load AND hydration, against the production
        // build, `error` and `warning` plus uncaught page errors. The allowlist
        // is empty by construction; a benign message earns a named entry with a
        // reason, never a widened severity filter.
        assert.deepEqual(
          consoleMessages,
          [],
          `${where}: the production build logged ${consoleMessages.length} console message(s) ` +
            `during load and hydration:\n  ${consoleMessages.join('\n  ')}\n` +
            `(allowlist has ${CONSOLE_ALLOWLIST.length} entries; add a justified entry rather than widening the filter)`,
        )
      } finally {
        await context.close()
      }
    })
  }
}

/** The scripting-off pass — inventory #10 (#63 E4) and #34 (M12).
 *  Checks 2-5 do not apply with no islands mounted; checks 1 and 6 do, and so
 *  does the by-state table's geometry, which is server-rendered. */
test('scripting off @ 390x844', async () => {
  for (const route of ROUTES) {
    const { context, page } = await openRoute(site, route, VIEWPORTS[0], { javaScriptEnabled: false })
    const where = `${route.path} @ 390x844, javaScriptEnabled: false`
    try {
      await assertNoHorizontalOverflow(page, where)
      await assertTabOrder(page, where)
      const svgs = await page.locator('svg').count()
      assert.equal(svgs, route.ssrSvg, `${where}: server-rendered <svg> count`)

      if (route.path === '/government') {
        // #63's by-state geometry, unchanged with scripting off: the scroll
        // container overflows its client, and the PAGE does not.
        const geometry = await page.evaluate(() => {
          const el = document.querySelector('#by-state .tableview-scroll')
          return el === null ? null : { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }
        })
        assert.notEqual(geometry, null, `${where}: #by-state has no .tableview-scroll`)
        assert.ok(
          geometry!.scrollWidth > geometry!.clientWidth,
          `${where}: #by-state's table no longer overflows its scroll container (${geometry!.scrollWidth} vs ${geometry!.clientWidth}) — the pinned-column layout has changed shape`,
        )
      }
    } finally {
      await context.close()
    }
  }
})

/** Inventory #29 — a KNOWN FAILURE, carried explicitly rather than omitted.
 *
 *  `:focus-visible { outline: 1.5px solid var(--ink) }` (`src/styles/global.css:863`)
 *  is under WCAG 2.2 Focus Appearance's 2px minimum. That is #75, open, and
 *  `docs/contracts/accessibility.md:411-414` records it as a standing FAIL.
 *
 *  This entry asserts the failure so the suite arrives green and #75 flips it:
 *  when the ring reaches 2px this test fails loudly, and the assertion is
 *  inverted in the same change. Chromium computes the 1.5px rule as `1px`. */
test('the focus ring is still under WCAG 2.2 Focus Appearance (#75, expected failure)', async () => {
  const { context, page } = await openRoute(site, ROUTES[0], VIEWPORTS[1])
  try {
    await page.keyboard.press('Tab')
    const width = await page.evaluate(() => {
      const el = document.activeElement
      return el === null ? NaN : parseFloat(getComputedStyle(el).outlineWidth)
    })
    assert.ok(Number.isFinite(width), 'no element took focus on the first Tab')
    assert.ok(
      width < 2,
      `the focus ring now computes ${width}px, at or above WCAG 2.2's 2px minimum. #75 is fixed — ` +
        `invert this assertion to \`width >= 2\` and update docs/contracts/accessibility.md's M8 rows.`,
    )
  } finally {
    await context.close()
  }
})
