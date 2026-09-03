/** The per-figure geometry floor. Every chart has to draw something.
 *
 *  WHY THIS FILE EXISTS. A reviewer reported that some charts do not load, and
 *  all four suites were green. No assertion anywhere counted drawn geometry.
 *  `smoke.test.ts` checks a hard-coded surface total, a zero-width count, a
 *  hidden count, and `texts.length > 0`. That last number is a PAGE-LEVEL
 *  aggregate. A figure that hydrates with axes and tick labels but draws no
 *  data satisfies all four, because the other six to thirteen figures on the
 *  route supply the text. `marks.test.ts` floors `[data-mark]` counts, and it
 *  floors them per route, so the same aggregate hides the same blank figure.
 *
 *  WHAT A GEOMETRY NODE IS. Every `path`, `rect`, `circle`, `line`, `polygon`,
 *  `polyline` or `ellipse` inside a chart surface, minus the named furniture
 *  the axis and grid draw. The subtraction is what makes the guard bite. An
 *  emptied Recharts chart still draws about 30 axis and grid nodes, which a
 *  bare geometry count would read as a healthy figure.
 *
 *  WHY NOT A `.recharts-*` SELECTOR. `/government` carries two hand-rolled
 *  islands, `StateGiveGet`'s tile cartogram and `StateTaxMix`'s stacked bar.
 *  Both draw plain `<rect>` elements through `Chart.tsx` and carry no framework
 *  class at all. A Recharts-shaped counter reads zero for both and reports the
 *  site's two most hand-built figures as blank. The counter is therefore a tag
 *  walk with an exclusion list, and both islands are floored like the rest.
 *
 *  TWO ASSERTIONS, NOT ONE. `FIGURE_FLOOR` holds the per-figure total.
 *  `SURFACE_FLOOR` holds each panel of a multi-panel figure. Six figures draw
 *  two or three panels, and a figure total alone re-creates the aggregate
 *  problem one level down. The smallest panel the site ships draws three nodes,
 *  so a per-panel floor of one stays far below every measurement and still
 *  fails a panel that draws nothing.
 *
 *  EVERY FLOOR IS MEASURED, NOT CHOSEN. Each one is 0.7 of the smaller of the
 *  two viewport counts, rounded down. The 30% headroom absorbs a data refresh
 *  that shortens a series. It does not absorb a chart that stops drawing. The
 *  table below records both numbers so a future change compares against the
 *  measurement rather than against the floor.
 *
 *  | figure                 | narrow | wide | floor |
 *  |------------------------|--------|------|-------|
 *  | real-gdp               |     90 |   90 |    63 |
 *  | growth-shadow          |     43 |   43 |    30 |
 *  | who-works              |     96 |   96 |    67 |
 *  | prices-rates           |    101 |  101 |    70 |
 *  | labor-capital          |     92 |   92 |    64 |
 *  | median-income          |     42 |   42 |    29 |
 *  | the-spread             |     82 |   82 |    57 |
 *  | bracket-history        |    357 |  357 |   249 |
 *  | statutory-vs-effective |     85 |   85 |    59 |
 *  | who-pays               |     18 |   18 |    12 |
 *  | top1-share             |     10 |   10 |     7 |
 *  | payroll-bill           |     66 |   66 |    46 |
 *  | debt                   |     38 |   38 |    26 |
 *  | debt-holders           |     10 |   16 |     7 |
 *  | debt-maturity          |      8 |    8 |     5 |
 *  | whole-budget           |    228 |  228 |   159 |
 *  | structural-gap         |     35 |   35 |    24 |
 *  | voted-and-not          |     35 |   35 |    24 |
 *  | net-interest           |     62 |   62 |    43 |
 *  | law-explorer           |     57 |   57 |    39 |
 *  | attribution            |     32 |   32 |    22 |
 *  | revenue                |     75 |   75 |    52 |
 *  | oecd                   |     22 |   22 |    15 |
 *  | state-give-get         |     51 |   51 |    35 |
 *  | state-tax-mix          |      5 |    5 |     3 |
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright'
import { CHART_ROUTES, VIEWPORTS, mountIslands, openRoute, withSite, type Site } from './harness.ts'

/** Geometry nodes per figure, at 0.7 of the smaller viewport measurement.
 *  Keyed on the manifest key the figure number carries in its `id`. */
const FIGURE_FLOOR: Record<string, number> = {
  'real-gdp': 63,
  'growth-shadow': 30,
  'who-works': 67,
  'prices-rates': 70,
  'labor-capital': 64,
  'median-income': 29,
  'the-spread': 57,
  'bracket-history': 249,
  'statutory-vs-effective': 59,
  'who-pays': 12,
  'top1-share': 7,
  'payroll-bill': 46,
  debt: 26,
  'debt-holders': 7,
  'debt-maturity': 5,
  'whole-budget': 159,
  'structural-gap': 24,
  'voted-and-not': 24,
  'net-interest': 43,
  'law-explorer': 39,
  attribution: 22,
  revenue: 52,
  oecd: 15,
  'state-give-get': 35,
  'state-tax-mix': 3,
}

/** Geometry nodes per panel, applied only where a figure draws two or three.
 *  The site's smallest panel draws three, so one is a floor no laid-out panel
 *  can miss and no blank one can clear. */
const SURFACE_FLOOR = 1

/** Every figure the site ships, so a new one fails rather than going unfloored.
 *  `CHART_ROUTES` sums to 25 figures, and the table above holds 25 rows. */
const EXPECTED_FIGURES = 25

interface FigureRow {
  key: string
  total: number
  perSurface: number[]
}

/** Per `figure.figure`, its manifest key and its geometry counts.
 *
 *  Returned as plain data so one walk serves both the guard and the mutation
 *  proof below. The browser context cannot close over `CHART_SURFACE`, so the
 *  selector is repeated as a literal, the way every other walk in this lane
 *  repeats it. See the constant's own note in `harness.ts`. */
async function figureRows(page: Page): Promise<FigureRow[]> {
  return page.evaluate(() => {
    const GEOMETRY = 'path, rect, circle, line, polygon, polyline, ellipse'
    /* Axis rules, tick marks, grid lines, brush handles, legend swatches and
     * clip-path rectangles. All of them draw with no data behind them, so all
     * of them survive a chart that loses its series. */
    const FURNITURE =
      '.recharts-cartesian-axis, .recharts-cartesian-grid, .recharts-brush, .recharts-legend-wrapper, defs'
    return Array.from(document.querySelectorAll('figure.figure')).map((fig) => {
      const no = fig.querySelector('[id^="fig-"][id$="-no"]')
      const surfaces = Array.from(fig.querySelectorAll('.chart svg, svg.chart'))
      const perSurface = surfaces.map(
        (svg) => Array.from(svg.querySelectorAll(GEOMETRY)).filter((el) => el.closest(FURNITURE) === null).length,
      )
      return {
        key: (no?.id ?? '').replace(/^fig-/, '').replace(/-no$/, ''),
        total: perSurface.reduce((sum, n) => sum + n, 0),
        perSurface,
      }
    })
  })
}

/** Every figure that drew less than its floor, named. A bare count would say a
 *  route is broken without saying which chart on it is blank. */
function geometryFailures(rows: FigureRow[], where: string): string[] {
  const failures: string[] = []
  for (const row of rows) {
    const floor = FIGURE_FLOOR[row.key]
    if (floor === undefined) {
      failures.push(
        `${where}: figure ${JSON.stringify(row.key)} has no entry in FIGURE_FLOOR. ` +
          `Measure it on a good build and add a row, so a new figure cannot ship unfloored.`,
      )
      continue
    }
    if (row.total < floor) {
      failures.push(
        `${where}: figure ${JSON.stringify(row.key)} drew ${row.total} geometry node(s), below its ` +
          `measured floor of ${floor}. Its chart hydrated and drew no data.`,
      )
    }
    // Single-panel figures are already covered: the figure total IS the
    // surface. The panel walk exists for the six figures that draw two or
    // three, where a figure total can hide one blank panel behind two full
    // ones.
    if (row.perSurface.length < 2) continue
    row.perSurface.forEach((n, i) => {
      if (n < SURFACE_FLOOR) {
        failures.push(
          `${where}: figure ${JSON.stringify(row.key)} panel ${i + 1} of ${row.perSurface.length} drew ` +
            `${n} geometry node(s). A blank panel inside a drawn figure hides behind the figure total.`,
        )
      }
    })
  }
  return failures
}

let site: Site

before(async () => {
  site = await withSite(9)
})
after(async () => {
  await site?.close()
})

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    const where = `${route.path} @ ${viewport.width}x${viewport.height}`

    test(`${where}: every figure drew its data`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const rows = await figureRows(page)
        assert.equal(rows.length, route.figures, `${where}: walked ${rows.length} figures`)
        t.diagnostic(`${where}: ${rows.map((r) => `${r.key}=${r.total}`).join(' ')}`)
        const failures = geometryFailures(rows, where)
        assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}`)
      } finally {
        await context.close()
      }
    })
  }
}

/** The floor table covers the site, rather than the figures that happen to
 *  carry a key. An entry for a figure that no longer renders would otherwise
 *  sit in the table forever and floor nothing. */
test('the floor table names every figure the site ships, and nothing else', () => {
  const figures = CHART_ROUTES.reduce((sum, r) => sum + r.figures, 0)
  assert.equal(figures, EXPECTED_FIGURES, `CHART_ROUTES sums to ${figures} figures`)
  assert.equal(Object.keys(FIGURE_FLOOR).length, EXPECTED_FIGURES)
  for (const floor of Object.values(FIGURE_FLOOR)) {
    assert.ok(floor > 0, 'a floor of zero passes over an empty chart')
  }
})

/** The guard bites, proved against the real page rather than a fragment.
 *
 *  Emptying one figure's chart reproduces the exact shape the reviewer saw. The
 *  axes, the tick labels and the surface itself all survive, so `smoke.test.ts`
 *  and `marks.test.ts` still read the page as healthy. This walk has to turn
 *  red, and it has to name the one figure that went blank. Written because a
 *  counter aimed at the wrong selector reports zero failures over 25 figures
 *  and reads as a pass. */
test('emptying one figure chart turns the walk red, and names that figure', async () => {
  const route = CHART_ROUTES.find((r) => r.path === '/households')
  assert.ok(route !== undefined, '/households is not in CHART_ROUTES')
  const wide = VIEWPORTS[1] as (typeof VIEWPORTS)[number]
  const { context, page } = await openRoute(site, route, wide)
  try {
    await mountIslands(page, route.hydratedSvg)
    assert.deepEqual(geometryFailures(await figureRows(page), 'before'), [], 'the page is not clean before mutation')

    const emptied = await page.evaluate(() => {
      const GEOMETRY = 'path, rect, circle, line, polygon, polyline, ellipse'
      const FURNITURE =
        '.recharts-cartesian-axis, .recharts-cartesian-grid, .recharts-brush, .recharts-legend-wrapper, defs'
      const fig = document.getElementById('fig-median-income-no')?.closest('figure.figure')
      if (fig === null || fig === undefined) return 0
      let removed = 0
      for (const svg of Array.from(fig.querySelectorAll('.chart svg, svg.chart'))) {
        for (const el of Array.from(svg.querySelectorAll(GEOMETRY))) {
          if (el.closest(FURNITURE) !== null) continue
          el.remove()
          removed += 1
        }
      }
      return removed
    })
    assert.ok(emptied > 0, 'the median-income figure drew nothing to remove')

    const rows = await figureRows(page)
    // Axes and tick labels survive, which is what makes this the reviewer's
    // shape rather than a missing island.
    const texts = await page.evaluate(
      () => document.querySelectorAll('.chart svg text, svg.chart text').length,
    )
    assert.ok(texts > 0, 'the mutation removed the page text as well, so it proves the wrong guard')

    const failures = geometryFailures(rows, '/households')
    assert.equal(failures.length, 1, `expected exactly one failure, got: ${failures.join('; ')}`)
    assert.match(failures[0] as string, /"median-income" drew 0 geometry node\(s\)/, failures[0])
  } finally {
    await context.close()
  }
})

/** The panel walk bites too, on the case a figure total cannot see.
 *
 *  `the-spread` draws 79 nodes in its Gini panel and 3 in its top-1% panel.
 *  Emptying the small one leaves 79, which clears the figure floor of 57 with
 *  room to spare. Only the per-panel floor fails. Written because the figure
 *  total repeats the page-level aggregate at a smaller size, and a suite that
 *  never proves the second assertion has not closed the hole. */
test('emptying the smaller panel of a two-panel figure turns the walk red', async () => {
  const route = CHART_ROUTES.find((r) => r.path === '/households')
  assert.ok(route !== undefined, '/households is not in CHART_ROUTES')
  const wide = VIEWPORTS[1] as (typeof VIEWPORTS)[number]
  const { context, page } = await openRoute(site, route, wide)
  try {
    await mountIslands(page, route.hydratedSvg)
    const before = (await figureRows(page)).find((r) => r.key === 'the-spread')
    assert.ok(before !== undefined, 'the-spread is not on /households')
    assert.equal(before.perSurface.length, 2, `the-spread draws ${before.perSurface.length} panels`)

    const emptied = await page.evaluate(() => {
      const GEOMETRY = 'path, rect, circle, line, polygon, polyline, ellipse'
      const FURNITURE =
        '.recharts-cartesian-axis, .recharts-cartesian-grid, .recharts-brush, .recharts-legend-wrapper, defs'
      const fig = document.getElementById('fig-the-spread-no')?.closest('figure.figure')
      if (fig === null || fig === undefined) return 0
      const panels = Array.from(fig.querySelectorAll('.chart svg, svg.chart'))
      const smallest = panels
        .map((svg) => ({
          svg,
          nodes: Array.from(svg.querySelectorAll(GEOMETRY)).filter((el) => el.closest(FURNITURE) === null),
        }))
        .sort((a, b) => a.nodes.length - b.nodes.length)[0]
      if (smallest === undefined) return 0
      for (const el of smallest.nodes) el.remove()
      return smallest.nodes.length
    })
    assert.ok(emptied > 0, 'the-spread has no panel geometry to remove')

    const after = (await figureRows(page)).find((r) => r.key === 'the-spread')
    assert.ok(after !== undefined)
    assert.ok(
      after.total >= (FIGURE_FLOOR['the-spread'] as number),
      `the figure total fell to ${after.total}, so this proves the figure floor rather than the panel floor`,
    )

    const failures = geometryFailures(await figureRows(page), '/households')
    assert.equal(failures.length, 1, `expected exactly one failure, got: ${failures.join('; ')}`)
    assert.match(failures[0] as string, /"the-spread" panel \d of 2 drew 0 geometry node\(s\)/, failures[0])
  } finally {
    await context.close()
  }
})
