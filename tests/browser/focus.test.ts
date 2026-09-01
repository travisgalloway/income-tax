/** The focus-ring half of the browser lane, issue #75. Run by
 *  `npm run test:browser` alongside `smoke.test.ts`, `driven.test.ts`,
 *  `keyboard.test.ts`, `scroll.test.ts`, `legend.test.ts` and `touch.test.ts`.
 *
 *  ONE TOKEN DECIDES THE THICKNESS. `--focus-ring: 2px` lives in
 *  `src/styles/tokens.css` and every ring rule in `global.css` reads it: the
 *  base `:focus-visible`, `.datum:focus-visible`, #69's
 *  `[data-roving] [data-mark]:focus` fallback, `.state-tile:focus-visible` and
 *  `.year-range-thumb:focus-visible`. Before #75 those five declared `1.5px`
 *  four times and `2px` once, and both engines round 1.5 DOWN, Chromium and
 *  WebKit each computed the old rule as **1 device pixel**, so the shipped ring
 *  was half what the stylesheet claimed and under WCAG 2.2 SC 2.4.13's 2px
 *  minimum.
 *
 *  WHY EVERY ASSERTION HERE IS A COMPUTED STYLE AND NEVER CSS SOURCE TEXT. The
 *  build's minifier merges `.datum:focus-visible` and
 *  `[data-roving] [data-mark]:focus` into one rule because their declarations
 *  are identical, confirmed in `dist/_astro/*.css`. No source-level or
 *  built-CSS-level check can see those two apart, which is the same trap
 *  `keyboard.test.ts:512` documents. So: focus the element, read
 *  `getComputedStyle`.
 *
 *  WHY THE TOKEN IS READ AT RUNTIME AND NOT HARDCODED. F1 puts a hidden probe
 *  on `:root` with `outline-width: var(--focus-ring)` and measures it, the way
 *  `harness.ts:531` reads `--target-min` for #65's target-size floor. That is
 *  what makes F1's two halves independent: the equality half asks whether every
 *  rule agrees with the token, and the `>= 2` half asks whether the token
 *  clears the standard. Mutations M2 and M3 below turn exactly one of them red
 *  each; a single assertion written twice could not do that.
 *
 *  WHY `vector-effect` IS REQUIRED. `stroke-width` on an SVG shape resolves
 *  in USER units and every chart `<svg>` is scaled to its container, so the
 *  `stroke` fallback, the only ring WebKit paints on an SVG shape, since it
 *  does not honour `outline` there, rendered **1.944 CSS px at 390px** (screen
 *  CTM scale 0.9722) and 2.044 at 1440px from a bare `stroke-width: 2`. Under
 *  the minimum, in the one engine where that stroke IS the ring, and it would
 *  have stayed under it if only the `outline` had changed.
 *  `vector-effect: non-scaling-stroke` makes it resolve in CSS pixels whatever
 *  the transform. F2 measures that, and refuses to run on a page where no chart
 *  has a scale other than 1, without a non-unit scale a scaling stroke and a
 *  non-scaling one are indistinguishable and the guard would pass vacuously.
 *  Two route/viewport combinations now render every chart at exactly 1:1. The
 *  1120-unit preset meets a 1120px content column at 1440px. `UNSCALED` below
 *  names those two, and the naming is itself asserted, so a chart that quietly
 *  stopped scaling still turns this red.
 *
 *  This closes inventory row 29 in `docs/contracts/accessibility.md` and
 *  retires `smoke.test.ts`'s `#75` expected-failure entry.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHART_ROUTES,
  ROUTES,
  VIEWPORTS,
  mountIslands,
  openRoute,
  withSite,
  type Route,
  type Site,
  type ViewportSize,
} from './harness.ts'
import type { Page } from 'playwright'

/** Everything an engine will actually put focus on. Not a Tab walk: F3 needs
 *  to reach controls inside closed disclosures and inside containers a Tab walk
 *  would take thousands of presses to cross, and every element it focuses is
 *  confirmed to have taken focus (`document.activeElement === el`) rather than
 *  assumed to. */
const FOCUSABLE =
  'a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** The three scroll containers on the site, from `scroll.test.ts`'s `SEL` plus
 *  the narrow-viewport nav panel, which is the only vertically scrolling one. */
const CONTAINERS = '.tableview-scroll, .law-table-scroll, .navbar-panel'

/** WCAG 2.2 SC 2.4.13 Focus Appearance, Level AAA: a focus indicator at least
 *  2 CSS pixels thick. The token must clear this; F1 asserts it separately from
 *  the equality so the two can fail apart. */
const WCAG_MIN_PX = 2

let site: Site

before(async () => {
  site = await withSite(6)
})
after(async () => {
  await site?.close()
})

async function open(route: Route, viewport: ViewportSize) {
  const { context, page } = await openRoute(site, route, viewport)
  await mountIslands(page, route.hydratedSvg)
  return { context, page }
}

/** `--focus-ring`, resolved to CSS pixels by the engine under test.
 *
 *  A probe rather than `getPropertyValue('--focus-ring')`: the custom property
 *  is a string ("2px") and the question this file asks is what an engine
 *  COMPUTES from it, which is the whole reason 1.5px was wrong. */
async function tokenPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:absolute;visibility:hidden;outline-style:solid;outline-width:var(--focus-ring)'
    document.documentElement.appendChild(probe)
    const width = parseFloat(getComputedStyle(probe).outlineWidth)
    probe.remove()
    return width
  })
}

interface Ring {
  outline: number
  /** `solid` is the author's ring; `auto` is Chromium's own UA focus ring,
   *  which paints on ANY keyboard-focused element. */
  style: string
  stroke: number
  color: string
}

/** The site's own ring, as distinct from the browser's.
 *
 *  COPIED from `keyboard.test.ts:484` deliberately, not imported, the same
 *  reason `scroll.test.ts:54` copies #69's stop bounds: that shape is
 *  `keyboard.test.ts`'s contract with #69 and this file must not be able to
 *  change it. A fresh `outlineWidth > 0` check is NOT an acceptable substitute:
 *  #69 and #71 both proved Chromium's UA `outline-style: auto` ring satisfies
 *  one on a page whose stylesheet paints nothing, which is exactly what M1
 *  below re-proves. */
function isAuthorRing(r: Ring): boolean {
  return (r.style === 'solid' && r.outline > 0) || r.stroke >= 2
}

/** The ring on whatever currently holds focus. */
async function ringOfActive(page: Page): Promise<Ring & { desc: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as Element | null
    if (el === null) return { outline: NaN, style: '(nothing focused)', stroke: NaN, color: '', desc: '' }
    const cs = getComputedStyle(el)
    const cls = (el.getAttribute('class') ?? '').split(' ')[0] ?? ''
    return {
      outline: parseFloat(cs.outlineWidth) || 0,
      style: cs.outlineStyle,
      stroke: parseFloat(cs.strokeWidth) || 0,
      color: cs.outlineColor,
      desc: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`,
    }
  })
}

/* ------------------------------------------------------------------------- *
 * F1, every author ring computes the token width, and the token meets the
 * minimum. Definition of done 1, 2 and 8.
 *
 * Seven ring-painting classes, and the count of classes actually MEASURED is
 * asserted before a single width is compared. A representative whose selector
 * stops matching must turn this red rather than silently shrink the sample,
 * the failure mode a guard over "whatever we found" cannot detect.
 *
 * The seven are spread over two routes because two of them exist on one route
 * each: `.state-tile` is §11's cartogram on `/government`, and
 * `.year-range-thumb` is `MedianIncome`/`HouseholdSpread` on `/households`.
 * (The plan named `/economy` for the second; `/economy` renders no
 * `.year-range-thumb` at either viewport, measured, so `/households` carries
 * it.)
 * ------------------------------------------------------------------------- */

/** How each of the seven classes is reached, and on which route.
 *
 *  `roving-mark` is the only one that needs a key press: #69's fallback is
 *  keyed on `data-roving`, which the hook sets on the group only while the last
 *  move came from an arrow key. Focusing a mark directly would measure
 *  `.datum:focus-visible` a second time and prove nothing about the fallback. */
const REPRESENTATIVES: {
  key: string
  routePath: string
  selector: string
  arrow?: boolean
}[] = [
  { key: 'skip-link', routePath: '/government', selector: '.skip-link' },
  { key: 'summary', routePath: '/government', selector: 'summary' },
  { key: 'datum', routePath: '/government', selector: '.datum' },
  { key: 'roving-mark', routePath: '/government', selector: '[data-mark]', arrow: true },
  { key: 'state-tile', routePath: '/government', selector: '.state-tile' },
  {
    key: 'scroll-container',
    routePath: '/government',
    selector: '.tableview-scroll[tabindex="0"], .law-table-scroll[tabindex="0"]',
  },
  { key: 'year-range-thumb', routePath: '/households', selector: '.year-range-thumb' },
]

const RING_CLASSES = REPRESENTATIVES.length // 7

for (const viewport of VIEWPORTS) {
  test(`F1 ${viewport.name}: all ${RING_CLASSES} author ring classes compute --focus-ring`, async () => {
    const token = { px: NaN }
    const measured = new Map<string, Ring & { desc: string }>()

    for (const routePath of ['/government', '/households']) {
      const route = ROUTES.find((r) => r.path === routePath)!
      const { context, page } = await open(route, viewport)
      try {
        const here = await tokenPx(page)
        assert.ok(
          Number.isFinite(here) && here > 0,
          `${routePath}: --focus-ring did not resolve to a length; the probe measured ${here}. ` +
            `The token is missing from tokens.css or never reached the built stylesheet.`,
        )
        if (Number.isFinite(token.px)) assert.equal(here, token.px, 'the token differs between routes')
        token.px = here

        for (const rep of REPRESENTATIVES.filter((r) => r.routePath === routePath)) {
          const present = await page.locator(rep.selector).count()
          if (present === 0) continue

          if (rep.key === 'skip-link') {
            // A REAL Tab from the top of the document. The skip link is the
            // first stop, and pressing the key is what makes `:focus-visible`
            // match without relying on an engine's heuristic for programmatic
            // focus.
            await page.evaluate(() => {
              const body = document.body as HTMLElement
              body.setAttribute('tabindex', '-1')
              body.focus()
              body.removeAttribute('tabindex')
            })
            await page.keyboard.press('Tab')
          } else if (rep.arrow) {
            await page.evaluate((sel) => {
              const el = document.querySelector(`${sel}[tabindex="0"]`) as HTMLElement | null
              el?.focus()
            }, rep.selector)
            await page.keyboard.press('ArrowRight')
            const roving = await page.evaluate(() => {
              const el = document.activeElement
              return el !== null && el.closest('[data-roving]') !== null
            })
            assert.ok(
              roving,
              `${routePath}: ArrowRight did not set data-roving on the focused mark's group, so ` +
                `this measurement would be of .datum:focus-visible and not of #69's fallback`,
            )
          } else {
            // The FIRST match is not always focusable: at 1440px the navbar's
            // `<summary>` is inside a `display: none` bar, and `.focus()` on it
            // is a silent no-op that would leave the previous representative
            // focused and measure it twice. So walk the matches until one
            // actually takes focus.
            const took = await page.evaluate((sel) => {
              for (const el of Array.from(document.querySelectorAll(sel))) {
                ;(el as HTMLElement).focus()
                if (document.activeElement === el) return true
              }
              return false
            }, rep.selector)
            assert.ok(
              took,
              `${routePath} ${rep.key}: none of the ${present} elements matching ${rep.selector} ` +
                `would take focus`,
            )
          }

          const ring = await ringOfActive(page)
          assert.ok(
            await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, rep.selector),
            `${routePath} ${rep.key}: focus landed on ${ring.desc}, which does not match ` +
              `${rep.selector}; the measurement below would be of the wrong element`,
          )
          measured.set(rep.key, ring)
        }
      } finally {
        await context.close()
      }
    }

    // The anti-blindness half, asserted BEFORE any width is compared.
    assert.equal(
      measured.size,
      RING_CLASSES,
      `measured ${measured.size} of ${RING_CLASSES} ring-painting classes at ${viewport.name}: ` +
        `${JSON.stringify([...measured.keys()])}. A representative the selector no longer finds ` +
        `must turn this red, not shrink the sample.`,
    )

    for (const [key, ring] of measured) {
      assert.ok(
        isAuthorRing(ring),
        `${key} at ${viewport.name} paints neither a solid outline (${ring.outline}px ${ring.style}) ` +
          `nor a >=2px stroke (${ring.stroke}px) — that is the browser's ring, not the site's`,
      )
      assert.equal(
        ring.outline,
        token.px,
        `${key} at ${viewport.name} computes outline-width ${ring.outline}px against the ` +
          `--focus-ring token's ${token.px}px. One declaration is supposed to decide the ` +
          `thickness; this rule has picked its own number.`,
      )
    }

    // Independent of the equality above: the token itself must clear the
    // standard. M2 turns the equality red and leaves this green; M3 does the
    // reverse.
    assert.ok(
      token.px >= WCAG_MIN_PX,
      `--focus-ring computes ${token.px}px, under WCAG 2.2 SC 2.4.13's ${WCAG_MIN_PX}px minimum. ` +
        `Every rule may agree with the token and the site still fail the standard.`,
    )
  })
}

test('F1 edge case: the skip link keeps its own colour while inheriting the token width', async () => {
  // Definition of done 8. `.skip-link:focus-visible` overrides `outline-color`
  // ONLY, it paints on `--ink`, where an ink ring is invisible, so it is the
  // one rule that must inherit its width from the base rule rather than declare
  // one. If a later edit gives it a full `outline` shorthand, the width would
  // silently stop tracking the token and the colour override would be lost.
  const { context, page } = await open(ROUTES[3], VIEWPORTS[1])
  try {
    const token = await tokenPx(page)
    await page.evaluate(() => {
      const body = document.body as HTMLElement
      body.setAttribute('tabindex', '-1')
      body.focus()
      body.removeAttribute('tabindex')
    })
    await page.keyboard.press('Tab')
    const ring = await ringOfActive(page)
    assert.ok(ring.desc.startsWith('a.skip-link'), `the first Tab landed on ${ring.desc}`)
    assert.equal(ring.outline, token, 'the skip link does not inherit the token width')

    const { panel, ink } = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const norm = (v: string) => {
        const probe = document.createElement('div')
        probe.style.color = v.trim()
        document.documentElement.appendChild(probe)
        const out = getComputedStyle(probe).color
        probe.remove()
        return out
      }
      return { panel: norm(cs.getPropertyValue('--panel')), ink: norm(cs.getPropertyValue('--ink')) }
    })
    assert.equal(ring.color, panel, `the skip link's ring is ${ring.color}, expected --panel`)
    assert.notEqual(ring.color, ink, 'the skip link paints an ink ring on an ink background')
  } finally {
    await context.close()
  }
})

/* ------------------------------------------------------------------------- *
 * F2, the SVG stroke fallback renders exactly the token width in CSS pixels.
 * Definition of done 3.
 * ------------------------------------------------------------------------- */

/** `.datum`/`[data-mark]`-bearing `<svg>`s per chart route, measured at
 *  `a0eec29`+#75 and asserted as an EQUALITY before anything is measured over
 *  them: a route that stops rendering a chart must turn this red rather than
 *  quietly measure fewer. */
const DATUM_SVGS: Record<string, number> = { '/economy': 5, '/households': 10, '/government': 14 }

/** Of those, the ones that are actually LAID OUT and can therefore be focused.
 *
 *  `/government` renders 14 and measures 13. The missing one is `AttribChart`'s
 *  second panel, "Net ten-year legislative cost by signing president" sits in
 *  a `.attrib-panel` whose sibling is showing, so it computes `display: none`,
 *  its `<svg>` is 0x0 and its marks decline focus. Both numbers are asserted:
 *  the first says no chart vanished, the second says none of the ones on screen
 *  was quietly skipped. */
const RENDERED_SVGS: Record<string, number> = { '/economy': 5, '/households': 10, '/government': 13 }

/** The route/viewport combinations where EVERY chart's screen CTM is exactly 1,
 *  so a scaling stroke and a non-scaling one cannot be told apart there.
 *
 *  Both entries are the 1120-unit preset meeting a 1120px content column at
 *  1440px, measured. `/government` is absent from both viewports because §11's
 *  cartogram and §12's stacked bar keep their own viewBoxes and scale at every
 *  width. An entry removed from here must be measured, not assumed. */
const UNSCALED = new Set(['/economy wide', '/households wide'])

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`F2 ${route.path} ${viewport.name}: the stroke fallback renders the token width`, async () => {
      const { context, page } = await open(route, viewport)
      try {
        const token = await tokenPx(page)

        // Indices into `document.querySelectorAll('svg')`, resolved once here so
        // the two page-side steps below address the same chart by the same
        // number and cannot drift apart between the seed and the read.
        const { all, laidOut, hidden } = await page.evaluate(() => {
          const svgs = Array.from(document.querySelectorAll('svg'))
          const all: number[] = []
          const laidOut: number[] = []
          const hidden: string[] = []
          svgs.forEach((svg, i) => {
            if (svg.querySelector('.datum, [data-mark]') === null) return
            all.push(i)
            const r = svg.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) laidOut.push(i)
            else hidden.push((svg.getAttribute('aria-label') ?? '(no aria-label)').slice(0, 40))
          })
          return { all, laidOut, hidden }
        })

        assert.equal(
          all.length,
          DATUM_SVGS[route.path],
          `${route.path} at ${viewport.name} carries ${all.length} mark-bearing <svg>s, expected ` +
            `${DATUM_SVGS[route.path]}`,
        )
        assert.equal(
          laidOut.length,
          RENDERED_SVGS[route.path],
          `${route.path} at ${viewport.name} laid out ${laidOut.length} of them, expected ` +
            `${RENDERED_SVGS[route.path]}; the ones with no box are ${JSON.stringify(hidden)}. ` +
            `A chart that stops rendering must turn this red rather than shrink the sample.`,
        )

        const charts: {
          label: string
          scale: number | null
          vectorEffect: string
          strokeWidth: number
          desc: string
          roving: boolean
        }[] = []

        // ONE ARROW PRESS PER CHART, not a bare `.focus()`. Three of
        // `/government`'s groups carry `[data-mark]` with NO `.datum` class,
        // `BudgetChart`'s 64 transparent hit rects, §11's 51 `<g.state-tile>`s
        // and `StateTaxMix`'s five segment groups, so `.datum:focus-visible`
        // never matches them and #69's `[data-roving] [data-mark]:focus` is
        // their only ring. `data-roving` is set by the hook only while the last
        // move came from a key, which is why this drives the keyboard rather
        // than calling `focus()`: measured without it, those three report
        // `vector-effect: none`, and the guard would be reading a state no
        // keyboard reader is ever in.
        for (const index of laidOut) {
          const seeded = await page.evaluate((i) => {
            const svg = document.querySelectorAll('svg')[i]
            const first = svg.querySelector('[data-mark][tabindex="0"], .datum[tabindex="0"]')
            if (first === null) return false
            ;(first as HTMLElement).focus()
            return document.activeElement === first
          }, index)
          assert.ok(
            seeded,
            `${route.path} svg[${index}]: no mark carrying tabindex="0" took focus, so the ring ` +
              `read below would belong to whatever was focused before it`,
          )
          await page.keyboard.press('ArrowRight')

          charts.push(
            await page.evaluate((i) => {
              const svg = document.querySelectorAll('svg')[i] as SVGSVGElement
              const mark = document.activeElement as SVGElement
              const cs = getComputedStyle(mark)
              const ctm = svg.getScreenCTM()
              return {
                label: (svg.getAttribute('aria-label') ?? '(no aria-label)').slice(0, 40),
                scale: ctm === null ? null : ctm.a,
                vectorEffect: cs.vectorEffect,
                // `strokeWidth` computes to the used CSS length; with
                // `non-scaling-stroke` that is what is painted on screen.
                strokeWidth: parseFloat(cs.strokeWidth) || 0,
                desc:
                  `${mark.tagName.toLowerCase()}` +
                  `.${(mark.getAttribute('class') ?? '(no class)').split(' ')[0]}`,
                roving: mark.closest('[data-roving]') !== null,
              }
            }, index),
          )
        }

        assert.equal(charts.length, laidOut.length, 'a laid-out chart was skipped uncounted')

        // THE ANTI-BLINDNESS HALF, and the whole point of the guard. Without a
        // chart whose screen CTM scales, a scaling stroke and a non-scaling one
        // are indistinguishable and every assertion below passes vacuously.
        //
        // WHAT CHANGED. The demand used to run on every route at every
        // viewport, and it held at a0eec29+#75, at 0.9722 for 390px and 1.0222
        // for 1440px. `useChartSize` now offers a 1120-unit preset for the
        // 70rem content column the redesign adopted. That column measures
        // 1120px at 1440px, so `/economy`'s and `/households`' surfaces render
        // at EXACTLY 1:1 and their screen CTM is 1. The preset matches the
        // column there; no chart stopped scaling.
        //
        // The demand is therefore scoped to the combinations that can meet it,
        // and the ones that cannot are NAMED. A route/viewport that stops
        // scaling turns this red and has to be added deliberately, so the guard
        // never falls silent on its own. Measured on this branch at 0.9722 for
        // 390px on all three routes, with /government also at 0.7954 there and
        // 2.5454 at 1440px.
        const scaled = charts.filter((c) => c.scale !== null && Math.abs(c.scale - 1) > 1e-6)
        assert.ok(
          scaled.length > 0 || UNSCALED.has(`${route.path} ${viewport.name}`),
          `${route.path} at ${viewport.name}: every chart reports a screen-CTM scale of 1, so this ` +
            `guard cannot tell a scaling stroke from a non-scaling one. It is measuring blind; ` +
            `do not read its silence as a pass.`,
        )
        assert.equal(
          UNSCALED.has(`${route.path} ${viewport.name}`),
          scaled.length === 0,
          `${route.path} at ${viewport.name} reports ${scaled.length} scaled charts of ` +
            `${charts.length}, which disagrees with the UNSCALED list above. A named exception ` +
            `that has started scaling again is a stale exception, not a pass.`,
        )

        for (const c of charts) {
          assert.ok(
            c.roving,
            `${route.path} ${c.label}: ArrowRight left the focused ${c.desc} outside any ` +
              `[data-roving] group, so the fallback rule is not the one being measured`,
          )
          assert.equal(
            c.vectorEffect,
            'non-scaling-stroke',
            `${route.path} ${c.label}: the focused ${c.desc} computes vector-effect ` +
              `${c.vectorEffect}. Its stroke-width would resolve in USER units against a screen ` +
              `CTM of ${c.scale}, which is the ring WebKit paints and nothing else does.`,
          )
          assert.equal(
            c.strokeWidth,
            token,
            `${route.path} ${c.label}: the focused ${c.desc} strokes ${c.strokeWidth}px against ` +
              `the --focus-ring token's ${token}px`,
          )
        }
      } finally {
        await context.close()
      }
    })
  }
}
/* ------------------------------------------------------------------------- *
 * F3(a), no ring is clipped on a container's NON-SCROLLABLE axis.
 * Definition of done 5.
 *
 * THE EXCLUDED EDGES ARE COMPUTED, NOT NAMED. The plan for this issue excluded
 * the right edge by hand, on the reasoning that `overflow-x: auto` makes the
 * right edge scrollable and a control that overhangs it can be scrolled into
 * view. That reasoning is right and the hardcoding was wrong: `.navbar-panel`
 * is the one container that scrolls VERTICALLY (`overflow-y: auto`,
 * scrollHeight - clientHeight = 117px on /government at 390px), and its last
 * link overhangs its BOTTOM edge, 2.48px before this change and 3.48px after.
 * Excluding "right" would have left that as a false failure and excluding
 * "bottom" everywhere would have blinded the guard on the table containers. So
 * each container's scrollable axes are measured and only those edges are
 * exempt; a container that scrolls on neither axis is held to all four.
 *
 * THE CONTAINER RECT IS RE-READ AFTER EVERY FOCUS. Focusing a control inside a
 * scroll container scrolls it, which moves the container's own rect. Reading it
 * once before the loop is how the first draft of this measurement produced a
 * bogus 19,221px clearance.
 * ------------------------------------------------------------------------- */

/** Containers matched, and focusable descendants that actually took focus, per
 *  route and viewport. Equalities, asserted before any clearance is compared,
 *  M7 points the selector at a class matching nothing and this is what bites.
 *
 *  The wide zeros are a fact, not a skip: at 1440px `.navbar-panel` is
 *  `display: none` and `/economy`'s and `/households`' table containers hold no
 *  focusable descendant at all, so those two rows measure nothing and say so.
 *
 *  EACH NARROW NUMBER FELL BY ONE WHEN THE SITE BAR MOVED THE INTRODUCTION TO
 *  THE WORDMARK. The disclosure's route list carries six links now, not seven,
 *  and every one of these counts is one link shorter for that reason alone.
 *  Re-measured against a build, and the difference was isolated rather than
 *  assumed: re-inserting one `.navbar-routes` link at runtime returns all three
 *  routes to 13, 14 and 50 exactly.
 *
 *  The panel's own focusability is NOT what moved, and it could not be. This
 *  walk counts `container.querySelectorAll(...)`, so a container never counts
 *  itself, and `.navbar-panel` carries a static `tabindex="-1"` written in
 *  `BaseLayout.astro` for the disclosure to move focus into. It is not a
 *  `useScrollableRegion` container and never takes a `0`.
 *
 *  Nor did any panel cross the overflow threshold, which would have been the
 *  other way to lose a stop. Against a 776px `max-height`, measured at 390px:
 *  `/economy` 586px and 630px with the link restored, `/households` 630px and
 *  674px, `/government` 850px and 894px. The first two never overflow and the
 *  third always does, in both states. */
const F3A: Record<string, Record<string, { containers: number; focused: number }>> = {
  '/economy': { narrow: { containers: 6, focused: 12 }, wide: { containers: 6, focused: 0 } },
  '/households': { narrow: { containers: 8, focused: 13 }, wide: { containers: 8, focused: 0 } },
  '/government': { narrow: { containers: 16, focused: 49 }, wide: { containers: 16, focused: 31 } },
}

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`F3a ${route.path} ${viewport.name}: no ring clipped on a non-scrollable axis`, async () => {
      const { context, page } = await open(route, viewport)
      try {
        await page.evaluate(() =>
          document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')),
        )
        const result = await page.evaluate(
          ({ csel, fsel }) => {
            const containers = Array.from(document.querySelectorAll(csel as string))
            const clipped: string[] = []
            const exempt: string[] = []
            let focused = 0
            for (const container of containers) {
              for (const el of Array.from(container.querySelectorAll(fsel as string))) {
                ;(el as HTMLElement).focus()
                if (document.activeElement !== el) continue
                const box = el.getBoundingClientRect()
                if (box.width === 0 && box.height === 0) continue
                focused += 1

                const cs = getComputedStyle(el)
                const pad = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0)
                // AFTER the focus, never before: focusing scrolled the container.
                const cr = container.getBoundingClientRect()
                const scrollsX = container.scrollWidth - container.clientWidth > 1
                const scrollsY = container.scrollHeight - container.clientHeight > 1
                const who =
                  `${(container.getAttribute('class') ?? '').split(' ')[0]} > ` +
                  `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0] || '(none)'}`

                const edges: [string, number, boolean][] = [
                  ['top', box.top - pad - cr.top, scrollsY],
                  ['bottom', cr.bottom - (box.bottom + pad), scrollsY],
                  ['left', box.left - pad - cr.left, scrollsX],
                  ['right', cr.right - (box.right + pad), scrollsX],
                ]
                for (const [edge, gap, scrollable] of edges) {
                  if (gap >= 0) continue
                  ;(scrollable ? exempt : clipped).push(`${who} ${edge} by ${gap.toFixed(2)}px`)
                }
              }
            }
            return { containers: containers.length, focused, clipped, exempt }
          },
          { csel: CONTAINERS, fsel: FOCUSABLE },
        )

        const expected = F3A[route.path][viewport.name]
        assert.equal(
          result.containers,
          expected.containers,
          `${route.path} at ${viewport.name} matched ${result.containers} scroll containers, ` +
            `expected ${expected.containers}. A selector matching nothing measures nothing and ` +
            `passes; that is what this equality is for.`,
        )
        assert.equal(
          result.focused,
          expected.focused,
          `${route.path} at ${viewport.name} focused ${result.focused} descendants, expected ` +
            `${expected.focused}`,
        )
        assert.deepEqual(
          result.clipped,
          [],
          `${route.path} at ${viewport.name}: a focus ring is cut off on an axis the reader ` +
            `cannot scroll: ${JSON.stringify(result.clipped, null, 1)}`,
        )
      } finally {
        await context.close()
      }
    })
  }
}

/* ------------------------------------------------------------------------- *
 * F3(b), no focused control adds page overflow. Definition of done 6, and
 * `scroll.test.ts`'s E10 assertion held at the wider ring.
 *
 * The overflow assertion runs over EVERY element that takes focus, scroll
 * containers included, that sweep is the point of the guard and nothing is
 * excluded from it. What is FLOORED is a narrower population, and deliberately.
 *
 * WHY THE FLOOR EXCLUDES #71's SCROLL CONTAINERS. They are focusable **exactly
 * when they overflow**, and overflow is a text-width property. `tokens.css:4-5`
 * commits to a system-font stack with no webfont, so macOS and Linux metrics
 * differ by design and will keep differing, the same fact that makes
 * `harness.ts` carry a tolerance rather than pin a container. Measured:
 * `/government` at 1440px has **two** focusable containers in the default
 * (disclosures-closed) state on macOS and **one** on CI's Linux runner, so an
 * all-in floor of 176 was a macOS number Linux could not meet, and it failed on
 * the first CI run of this spec. Padding the floor with a margin would have
 * hidden a real platform dependence behind a fudge factor; dropping the
 * font-dependent members from the counted population removes it at the source.
 * Their existence is still guarded, a one-sided `>= 1` on the routes that have
 * any, and `scroll.test.ts` in full.
 *
 * The counts below are FLOORS and not equalities, and the precedent is #69's
 * `MAX_STOPS_*`: a content route gains a link and an equality goes red for a
 * reason that has nothing to do with focus rings. IF A MEASURED VALUE FALLS
 * BELOW A FLOOR, DO NOT LOWER IT, controls have stopped being focusable, and
 * this sweep would then be passing over a smaller site than it claims to cover.
 * That instruction now means what it says, because platform drift can no longer
 * be the explanation for crossing one.
 *
 * Measured on this branch, counting only elements that actually took focus. The
 * narrow numbers are lower because the contents rail is `display: none` below
 * 76rem and its links cannot be focused at all there.
 *
 * RAISED, by four to six per row, from the a0eec29+#75 measurement. The
 * redesign puts a site title link and a three-option theme control in the bar
 * at every width. Those are four more controls a reader can reach. The floors
 * record what the site now offers, because a floor under the real count is a
 * sweep claiming less coverage than it has.
 * ------------------------------------------------------------------------- */
const FOCUS_FLOOR: Record<string, Record<string, number>> = {
  '/': { narrow: 14, wide: 26 },
  '/economy': { narrow: 45, wide: 57 },
  '/households': { narrow: 74, wide: 87 },
  '/government': { narrow: 160, wide: 178 },
  '/sources': { narrow: 29, wide: 35 },
  '/glossary': { narrow: 101, wide: 120 },
  '/contents': { narrow: 102, wide: 115 },
}

/** #71's containers, excluded from the floor above and asserted separately. */
const SCROLL_CONTAINER = '.tableview-scroll, .law-table-scroll'

/** The routes carrying at least one focusable #71 scroll container in the
 *  default state, so the population the floor excludes is not left unchecked.
 *  A `>= 1`, never a count: how many overflow is the font-dependent part. */
const HAS_FOCUSABLE_SCROLLER = new Set(['/government'])

for (const viewport of VIEWPORTS) {
  test(`F3b ${viewport.name}: focusing every control on every route adds no page overflow`, async () => {
    for (const route of ROUTES) {
      const { context, page } = await open(route, viewport)
      try {
        const { focused, floored, scrollers, worst, offender } = await page.evaluate(
          ({ sel, scr }) => {
            const els = Array.from(document.querySelectorAll(sel as string)) as HTMLElement[]
            let focused = 0
            let floored = 0
            let scrollers = 0
            let worst = 0
            let offender = ''
            for (const el of els) {
              el.focus()
              if (document.activeElement !== el) continue
              focused += 1
              if (el.matches(scr as string)) scrollers += 1
              else floored += 1
              const root = document.documentElement
              const over = root.scrollWidth - root.clientWidth
              if (over > worst) {
                worst = over
                offender = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0] || '(none)'}`
              }
            }
            return { focused, floored, scrollers, worst, offender }
          },
          { sel: FOCUSABLE, scr: SCROLL_CONTAINER },
        )

        const floor = FOCUS_FLOOR[route.path][viewport.name]
        assert.ok(
          floored >= floor,
          `${route.path} at ${viewport.name} focused ${floored} controls outside #71's scroll ` +
            `containers (${focused} in total), below the recorded floor of ${floor}. Do not lower ` +
            `the floor: controls have stopped being focusable, and this sweep is now covering ` +
            `less of the site than it says it does.`,
        )
        if (HAS_FOCUSABLE_SCROLLER.has(route.path)) {
          assert.ok(
            scrollers >= 1,
            `${route.path} at ${viewport.name} focused no #71 scroll container. How many of them ` +
              `overflow is font-metric dependent and is deliberately not pinned here, but zero ` +
              `means the focusable-when-it-overflows wiring is gone, not that a column got ` +
              `narrower.`,
          )
        }
        assert.equal(
          worst,
          0,
          `${route.path} at ${viewport.name}: focusing ${offender} pushed documentElement ` +
            `${worst}px wider than its client box. scroll.test.ts's E10 assertion is broken by ` +
            `the focus ring.`,
        )
      } finally {
        await context.close()
      }
    }
  })
}

/* ------------------------------------------------------------------------- *
 * F4, the ring does not swallow an adjacent datum at 390px. Definition of
 * done 7.
 *
 * The case the issue names, `/economy`'s 87-mark group, 3.31px marks at a
 * 3.35px pitch, is ZERO at the old 1.5px rule and zero at 2px: the ring box
 * grows from 7.31px to 9.31px and reaches the same two neighbour centres
 * either way. Every offender below is pinned by GROUP IDENTITY rather than by
 * magnitude, so a further chart crossing the line turns this red while ordinary
 * data drift does not.
 * ------------------------------------------------------------------------- */

/** The groups where a focused mark's ring fully encloses a neighbour, measured
 *  at 390px against the old 1.5px rule as well as the new token:
 *
 *  - `BracketHistory`'s THREE panels on `/households`: 113 marks each, 5.83px
 *    hit rects at a **2.465px** pitch, so the rects already overlap each other
 *    by 3.4px. 0 enclosed at 1.5px, 224 at 2px (~2 per focused mark). 0 at
 *    1440px. This is mark density (#73 measured 0.9px per datum at 390px), not
 *    ring width: no ring that meets WCAG can be narrower than a 2.465px pitch.
 *    PARKED, not absorbed by keeping 1.5px there.
 *  - `OecdChart` on `/government`: its first mark is the OECD-average
 *    reference band, a `<rect>` 11.67px wide and **272.21px tall** spanning the
 *    whole plot, so the countries whose dots fall inside its x-span are
 *    enclosed by its ring whatever the width. **2 enclosed at 1.5px, 3 at
 *    2px**, pre-existing, and the plan for this issue did not have it. PARKED.
 *
 *  WHAT CHANGED. The list carried two entries. One named `/households` by the
 *  prefix `The top US income tax bracket has run`. The redesign gives
 *  `BracketHistory` three panels, each with its own finding sentence, and all
 *  three carry the same 2.465px geometry. The one entry became three, and the
 *  old prefix matches none of them. The ring and the density are unchanged;
 *  only the labels moved. */
const F4_EXCEPTIONS = [
  '/government:Total tax revenue as a share of GDP',
  '/households:The top statutory US income tax rate has ranged',
  '/households:The US income tax schedule has run',
  '/households:The income threshold where the top bracket begins',
]

/** Groups with three or more marks per chart route at 390px, asserted as an
 *  equality before any enclosure is counted. (`/households` has ten
 *  mark-bearing `<svg>`s and nine with three or more marks; the tenth is
 *  `TopShare`'s two-mark comparison.) */
const F4_GROUPS: Record<string, number> = { '/economy': 5, '/households': 9, '/government': 14 }

test('F4 narrow: a focused ring encloses no neighbouring mark, outside the pinned groups', async () => {
  const offenders: string[] = []
  for (const route of CHART_ROUTES) {
    const { context, page } = await open(route, VIEWPORTS[0])
    try {
      const groups = await page.evaluate(() => {
        const out: { label: string; marks: number; enclosed: number }[] = []
        for (const svg of Array.from(document.querySelectorAll('svg'))) {
          const marks = Array.from(svg.querySelectorAll('.datum, [data-mark]')) as HTMLElement[]
          if (marks.length < 3) continue
          let enclosed = 0
          for (const mark of marks) {
            mark.focus()
            const cs = getComputedStyle(mark)
            const pad = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0)
            const r = mark.getBoundingClientRect()
            const ring = {
              left: r.left - pad,
              right: r.right + pad,
              top: r.top - pad,
              bottom: r.bottom + pad,
            }
            for (const other of marks) {
              if (other === mark) continue
              const q = other.getBoundingClientRect()
              if (q.width === 0 && q.height === 0) continue
              if (
                q.left >= ring.left &&
                q.right <= ring.right &&
                q.top >= ring.top &&
                q.bottom <= ring.bottom
              )
                enclosed += 1
            }
          }
          out.push({
            label: svg.getAttribute('aria-label') ?? '(no aria-label)',
            marks: marks.length,
            enclosed,
          })
        }
        return out
      })

      assert.equal(
        groups.length,
        F4_GROUPS[route.path],
        `${route.path} at 390px walked ${groups.length} chart groups with three or more marks, ` +
          `expected ${F4_GROUPS[route.path]}`,
      )
      for (const g of groups) {
        if (g.enclosed === 0) continue
        // Identity by the exception's own prefix where one matches, so the
        // comparison below is a SET EQUALITY over stable names rather than over
        // a brittle slice of an aria-label that reads the current data.
        const id = `${route.path}:${g.label}`
        offenders.push(F4_EXCEPTIONS.find((e) => id.startsWith(e)) ?? id)
      }
    } finally {
      await context.close()
    }
  }

  // Set equality, not a count and not a magnitude: a third chart crossing the
  // line must turn this red, and a change in how many neighbours the two known
  // groups swallow must not.
  assert.deepEqual(
    offenders.sort(),
    [...F4_EXCEPTIONS].sort(),
    `the set of chart groups whose focused ring fully encloses a neighbouring mark at 390px is ` +
      `${JSON.stringify(offenders)}, and the carried exceptions are ${JSON.stringify(F4_EXCEPTIONS)}. ` +
      `Every carried exception is geometry, not ring width.`,
  )
})
