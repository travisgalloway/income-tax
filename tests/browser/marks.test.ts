/** The per-mark accessibility guarantees, re-homed from the pipeline suite.
 *
 *  WHY THIS LIVES IN THE BROWSER LANE. `pipeline/tests/test_accessibility.py`
 *  reads `dist/`. Recharts renders no chart during a static build. A chart's
 *  marks therefore reach the DOM only at hydration.
 *  `test_the_label_coverage_did_not_narrow` records the consequence in writing.
 *  Its corpus fell from 1114 marks to 56. The 1058 marks that left were the
 *  whole of the site's only per-mark `aria-label` assertion. Its own docstring
 *  says the browser lane is where the check belongs. It also says the browser
 *  lane asserted nothing per mark. This file is that assertion.
 *
 *  WHAT IT HOLDS.
 *   1. Every keyboard-reachable mark carries a non-empty `aria-label`.
 *   2. An `<svg>` holding reachable marks carries `role="group"`, never
 *      `role="img"`, whose subtree assistive tech treats as presentational.
 *   3. Every chart `<svg>`'s own `aria-label` states a finding.
 *   4. A single-chart figure's accessible name and its chart's `aria-label`
 *      are the same string. See `NAME_DIVERGENCE` for what that found.
 *
 *  Rules 1 and 2 are the pair `labelled_and_grouped_failures` held in the
 *  pipeline suite. `keyboard.test.ts` already holds rule 2 through
 *  `stopFailures`. Rule 2 is asserted here as well, because it is half of one
 *  property. Splitting one property across two files hides which half stopped
 *  asserting.
 *
 *  WHAT A MARK IS, AND WHY THE PIPELINE'S PREDICATE DOES NOT PORT. The pipeline
 *  read every `tabindex` in `{"0", "-1"}` descendant of an `<svg>`. In a
 *  hand-rolled server-rendered figure the only such nodes were marks. Recharts
 *  breaks that reading. It writes `tabindex="-1"` on every `ZIndexLayer` group.
 *  The hydrated page carries 120 to 144 unlabelled `tabindex="-1"` groups per
 *  route. Each one is a container holding no data. A mark here
 *  is `[data-mark][tabindex]`. `strayFocusables` below asserts that every OTHER
 *  `tabindex` node inside a chart is one of those framework groups. Without
 *  that second walk the narrowing repeats the silent coverage loss this file
 *  exists to repair.
 *
 *  EVERY COUNT IS ASSERTED AS A FLOOR. `MARK_FLOOR` and `LABELLED_SVG_FLOOR`
 *  are measured against this branch's build, not copied from an issue. A future
 *  drop to zero fails rather than passing over an empty corpus.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright'
import { CHART_ROUTES, VIEWPORTS, mountIslands, openRoute, withSite, type Site } from './harness.ts'

/** Keyboard-reachable marks per route, measured on this branch at both
 *  viewports and recorded as the lower of the two.
 *
 *  `/government` differs by viewport, at 366 narrow and 369 wide, because
 *  `LawExplorer` draws three fewer marks in its narrow form. The floor takes
 *  the smaller number so one table serves both widths. */
const MARK_FLOOR: Record<string, number> = {
  '/economy': 389,
  '/households': 582,
  '/government': 366,
}

/** Chart `<svg>` elements carrying a non-empty `aria-label`, per route.
 *  Measured at both viewports, where the two agree. `/government` counts 14
 *  because its two hand-rolled figures label their own `<svg>` directly, while
 *  the other 12 are Recharts surfaces. */
const LABELLED_SVG_FLOOR: Record<string, number> = {
  '/economy': 7,
  '/households': 10,
  '/government': 14,
}

/** The four shape rules a string clears to read as a finding.
 *
 *  Ported from `finding_shape_problems` in
 *  `pipeline/tests/test_accessibility.py`. That module still holds the same
 *  predicate over the 25 `figure.figure` accessible names that still serve.
 *  What it lost is the chart side. `test_every_chart_svg_states_a_finding`
 *  filters on `svg.chart`, and only two such elements survive a static build.
 *  All 31 reach the hydrated DOM. */
function findingProblems(text: string): string[] {
  const problems: string[] = []
  if (text.length < 40) problems.push('is under 40 characters')
  if (!/\d/.test(text)) problems.push('has no digit, so it states no finding')
  if (/^(line|bar|area|pie|stacked|scatter|donut)\s+chart/i.test(text)) {
    problems.push('describes its shape rather than its finding')
  }
  if (text.toLowerCase().includes('chart showing')) {
    problems.push("says 'chart showing', a shape description")
  }
  return problems
}

/** Figures whose accessible name and whose chart's `aria-label` differ today.
 *  Keyed on the manifest key carried in the figure number's `id`.
 *
 *  THESE ARE DEFECTS THIS TEST FOUND. They are not exemptions.
 *  `docs/contracts/interfaces/charts.md:15` states that a figure's `ariaLabel`
 *  becomes the figure's own name. It states that the inner `<svg>` carries the
 *  same sentence. Nineteen of the site's 20 single-chart figures break that
 *  rule. The figure takes its name from the `ariaLabel` prop at the call site.
 *  Each island composes a second sentence for its own surface. A screen reader
 *  therefore announces two different findings for one figure.
 *
 *  The list is enumerated, and the assertion below is an exact set. A newly
 *  divergent figure fails it. Repairing one of these fails it too, which forces
 *  the entry out of the list instead of leaving it stale. */
const NAME_DIVERGENCE: readonly string[] = [
  'growth-shadow',
  'labor-capital',
  'median-income',
  'statutory-vs-effective',
  'who-pays',
  'top1-share',
  'payroll-bill',
  'debt',
  'debt-holders',
  'debt-maturity',
  'whole-budget',
  'structural-gap',
  'voted-and-not',
  'net-interest',
  'law-explorer',
  'revenue',
  'oecd',
  'state-give-get',
  'state-tax-mix',
]

interface MarkRow {
  svgIndex: number
  role: string
  marks: number
  unlabelled: string[]
}

/** Per `<svg>`, its role, its mark count and every unlabelled mark in it.
 *  Plain data, so one walk serves both the guard and its mutation proof. */
async function markRows(page: Page): Promise<MarkRow[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('svg')).map((svg, svgIndex) => {
      const marks = Array.from(svg.querySelectorAll('[data-mark][tabindex]'))
      return {
        svgIndex,
        role: svg.getAttribute('role') ?? '',
        marks: marks.length,
        unlabelled: marks
          .filter((m) => (m.getAttribute('aria-label') ?? '').trim() === '')
          .map((m) => `${m.tagName.toLowerCase()}[${(m.getAttribute('class') ?? '').slice(0, 40)}]`)
          .slice(0, 8),
      }
    }),
  )
}

function labelFailures(rows: MarkRow[]): string[] {
  const failures: string[] = []
  for (const row of rows) {
    if (row.marks === 0) continue
    for (const mark of row.unlabelled) {
      failures.push(`svg[${row.svgIndex}]: a keyboard-reachable mark has no aria-label: ${mark}`)
    }
    if (row.role !== 'group') {
      failures.push(
        `svg[${row.svgIndex}] draws ${row.marks} reachable mark(s) and carries ` +
          `role=${JSON.stringify(row.role)} instead of "group". Assistive tech treats a ` +
          `role="img" subtree as presentational, so those marks go unannounced.`,
      )
    }
  }
  return failures
}

/** Anything focusable inside an `<svg>` that the roving group does not own.
 *
 *  Recharts writes `tabindex="-1"` on each of its `ZIndexLayer` groups. Each
 *  one is a framework container holding no datum, so they are named and passed
 *  over. Every other `tabindex` node has to be a `[data-mark]`. A focusable
 *  element that loses its `data-mark` therefore fails here. Without this walk
 *  it would shrink the corpus above and still report green. */
async function strayFocusables(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const stray: string[] = []
    document.querySelectorAll('svg').forEach((svg, i) => {
      svg.querySelectorAll('[tabindex]').forEach((el) => {
        if (el.hasAttribute('data-mark')) return
        const cls = el.getAttribute('class') ?? ''
        if (el.tagName.toLowerCase() === 'g' && cls.startsWith('recharts-zIndex-layer')) return
        stray.push(
          `svg[${i}]: ${el.tagName.toLowerCase()}[${cls.slice(0, 40)}] carries ` +
            `tabindex="${el.getAttribute('tabindex')}" and no data-mark`,
        )
      })
    })
    return stray
  })
}

let site: Site

before(async () => {
  site = await withSite(7)
})
after(async () => {
  await site?.close()
})

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    const where = `${route.path} @ ${viewport.width}x${viewport.height}`

    test(`${where}: every reachable mark is labelled and grouped`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const rows = await markRows(page)
        const marks = rows.reduce((sum, r) => sum + r.marks, 0)
        const floor = MARK_FLOOR[route.path] as number
        t.diagnostic(`${where}: walked ${marks} marks across ${rows.length} svgs`)
        assert.ok(
          marks >= floor,
          `${where}: walked ${marks} keyboard-reachable marks, below the measured floor of ` +
            `${floor}. A short count means the walk stopped seeing marks, which reads exactly ` +
            `like a page with none.`,
        )
        assert.deepEqual(labelFailures(rows), [], `${where}:\n  ${labelFailures(rows).join('\n  ')}`)

        const stray = await strayFocusables(page)
        assert.deepEqual(
          stray,
          [],
          `${where}: ${stray.length} focusable node(s) inside a chart are neither a mark nor a ` +
            `Recharts layer group:\n  ${stray.join('\n  ')}`,
        )
      } finally {
        await context.close()
      }
    })

    test(`${where}: every chart aria-label states a finding`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const labels = await page.evaluate(() =>
          Array.from(document.querySelectorAll('svg[aria-label]'))
            .map((s) => (s.getAttribute('aria-label') ?? '').trim())
            .filter((l) => l !== ''),
        )
        const floor = LABELLED_SVG_FLOOR[route.path] as number
        t.diagnostic(`${where}: walked ${labels.length} labelled chart svgs`)
        assert.ok(
          labels.length >= floor,
          `${where}: found ${labels.length} labelled chart svgs, below the measured floor of ` +
            `${floor}. At zero this assertion passes over nothing.`,
        )
        const bad = labels.flatMap((label) =>
          findingProblems(label).map((p) => `  aria-label ${p}: ${JSON.stringify(label)}`),
        )
        assert.deepEqual(bad, [], `${where}: ${bad.length} chart label(s) state no finding:\n${bad.join('\n')}`)
      } finally {
        await context.close()
      }
    })
  }
}

/** Rule 4, at one viewport, because an accessible name does not depend on width.
 *
 *  The wide preset is chosen so this walk reads the DOM the rest of this file
 *  measures at 1440px. */
test('a figure and its chart carry the same accessible name', async (t) => {
  const divergent: string[] = []
  const matched: string[] = []
  let singleChart = 0
  let multiPanel = 0

  for (const route of CHART_ROUTES) {
    const { context, page } = await openRoute(site, route, VIEWPORTS[1] as (typeof VIEWPORTS)[number])
    try {
      await mountIslands(page, route.hydratedSvg)
      const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('figure.figure')).map((fig) => {
          const no = fig.querySelector('[id^="fig-"][id$="-no"]')
          const labels = Array.from(fig.querySelectorAll('svg[aria-label]')).map((s) =>
            (s.getAttribute('aria-label') ?? '').trim(),
          )
          return {
            key: (no?.id ?? '').replace(/^fig-/, '').replace(/-no$/, ''),
            name: (fig.getAttribute('aria-label') ?? '').trim(),
            labels,
          }
        }),
      )
      for (const row of rows) {
        assert.notEqual(row.key, '', `${route.path}: a figure renders no fig-<key>-no id`)
        // A multi-panel figure carries one name over two or three surfaces, so
        // no single chart label can equal it. Counted and excluded by shape.
        if (row.labels.length !== 1) {
          multiPanel += 1
          continue
        }
        singleChart += 1
        if (row.labels[0] === row.name) matched.push(row.key)
        else divergent.push(row.key)
      }
    } finally {
      await context.close()
    }
  }

  t.diagnostic(
    `walked ${singleChart} single-chart figures and ${multiPanel} multi-panel figures; ` +
      `${matched.length} names match their chart, ${divergent.length} diverge`,
  )
  assert.ok(singleChart >= 20, `walked ${singleChart} single-chart figures, expected at least 20`)
  assert.ok(multiPanel >= 5, `walked ${multiPanel} multi-panel figures, expected at least 5`)
  assert.deepEqual(
    [...divergent].sort(),
    [...NAME_DIVERGENCE].sort(),
    `the set of figures whose name differs from their chart's aria-label changed. ` +
      `Contract charts.md:15 requires the two to be the same sentence. Every entry in ` +
      `NAME_DIVERGENCE is a defect, so a repaired figure must be removed from that list ` +
      `and a newly divergent one must be fixed rather than added.`,
  )
})

/** The guard bites, proved against the real page rather than a fragment.
 *
 *  Stripping one `aria-label` reproduces the exact shape the pipeline corpus
 *  lost, and the walk has to turn red on it. Written because a walk narrowed to
 *  the wrong selector reports zero failures over 582 marks and reads as a pass. */
test('stripping one mark aria-label turns the walk red', async () => {
  const route = CHART_ROUTES.find((r) => r.path === '/households')
  assert.ok(route !== undefined, '/households is not in CHART_ROUTES')
  const { context, page } = await openRoute(site, route, VIEWPORTS[1] as (typeof VIEWPORTS)[number])
  try {
    await mountIslands(page, route.hydratedSvg)
    assert.deepEqual(labelFailures(await markRows(page)), [], 'the page is not clean before mutation')

    const stripped = await page.evaluate(() => {
      const mark = document.querySelector('svg [data-mark][tabindex][aria-label]')
      if (mark === null) return false
      mark.removeAttribute('aria-label')
      return true
    })
    assert.ok(stripped, 'no labelled mark to mutate')

    const failures = labelFailures(await markRows(page))
    assert.equal(failures.length, 1, `expected exactly one failure, got: ${failures.join('; ')}`)
    assert.match(failures[0] as string, /has no aria-label/, failures[0])
  } finally {
    await context.close()
  }
})
