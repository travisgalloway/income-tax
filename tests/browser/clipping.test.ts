/** The chart-text geometry guards, re-homed from the pipeline suite.
 *
 *  WHY THIS LIVES IN THE BROWSER LANE. `pipeline/tests/test_accessibility.py`
 *  reads `dist/`, and Recharts renders no chart during a static build. Four
 *  guards there went vacuous in one commit, and each one records the loss in
 *  its own docstring. `test_the_text_clipping_guard_sees_every_text_class` fell
 *  from 713 `<text>` nodes on three routes to 102 on one.
 *  `test_the_annotation_clipping_guard_sees_the_whole_corpus` now asserts an
 *  equality at zero. `test_no_rotated_axis_title_is_clipped_by_its_svg` and
 *  `test_every_left_axis_tick_fits_its_gutter` walk nothing at all. The nodes
 *  did not go away. They arrive at hydration, which only a browser sees.
 *
 *  WHAT IT HOLDS, at both viewports in `VIEWPORTS`.
 *   1. No `<text>` inside a chart `<svg>` leaves that `<svg>` horizontally.
 *   2. No direct-label annotation leaves its own `<svg>`.
 *   3. No rotated axis title leaves its `<svg>` vertically.
 *   4. Every left-axis tick label fits between the surface edge and the plot.
 *   5. No two `holders-label` nodes on one bar row intersect.
 *
 *  WHY THE MEASUREMENT DIFFERS FROM THE PIPELINE'S. The pipeline estimated a
 *  label's advance width from `ADVANCE_EM`. It compared that estimate against
 *  the `viewBox` in user units, because the served bytes carry nothing else.
 *  Here every box comes from `getBoundingClientRect()`. The comparison is
 *  therefore against painted pixels, and the estimate drops out.
 *
 *  THE NARROW PRESET IS ONLY REACHABLE HERE. `useChartSize` returns the wide
 *  preset before measurement, so a static render only ever emits the 720-unit
 *  geometry. `annotate.test.ts` covers the 360 arithmetic over the pure helper,
 *  and its header says the pytest guard owned the wide half. Running at 390px
 *  is the only check of the 360 geometry against real rendered text.
 *
 *  FONT METRICS. macOS and Linux differ by design. Every assertion here is a
 *  containment with `TOLERANCE_PX` slack, or a one-sided count floor. Metric
 *  drift can only make these stricter. See `harness.ts`'s header.
 *
 *  RELATION TO `smoke.test.ts`. That file sweeps every `<text>` for the same
 *  horizontal containment and carries a vertical budget. This file walks the
 *  same corpus split by `<text>` class, with a floor on every class. A failure
 *  therefore names the class that moved. A class that stops rendering fails the
 *  floor instead of shrinking the sweep quietly.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from 'playwright'
import {
  CHART_ROUTES,
  TOLERANCE_PX,
  VIEWPORTS,
  mountIslands,
  openRoute,
  withSite,
  type Site,
} from './harness.ts'

/** The direct-label family, the classes `Annotation.tsx` places through
 *  `placeAnnotation`. Identical to `ANNOTATION_CLASSES` in
 *  `pipeline/tests/test_accessibility.py`, whose corpus is now empty. */
const ANNOTATION_CLASSES = [
  'annotation',
  'series-label',
  'dotplot-average-label',
  'maturity-marker-label',
]

/** Total `<text>` nodes with a painted box, per route, at the lower of the two
 *  viewports. Measured on this branch. `/government` reads 257 narrow and 387
 *  wide. `LawExplorer`'s control strip and its `datum` labels draw only in the
 *  wide form. */
const TEXT_FLOOR: Record<string, number> = {
  '/economy': 88,
  // 160 before `Top1TaxShare` began thinning by fit. Its five published tax
  // years sit 13 units apart at the 360 preset, so two x ticks and two value
  // labels are dropped there rather than painted across each other.
  '/households': 156,
  '/government': 257,
}

/** `<text>` classes each route renders at BOTH viewports, with the smaller of
 *  the two counts.
 *
 *  Every entry is a floor for one class. A single total would hide a class that
 *  stopped rendering behind another class that grew. The pipeline corpus fell
 *  from 25 classes to two while its assertions stayed green.
 *
 *  `datum` and `control-strip-glyph` are absent by design. Both belong to
 *  `LawExplorer`'s wide form only, so neither has a floor that holds at 390px. */
const CLASS_FLOOR: Record<string, Record<string, number>> = {
  /* `recharts-text` is Recharts' own `Text` component's class, and the rotated
   * left-axis title no longer carries it: `RechartsFrame.AxisTitleY` draws that
   * title itself, off `placeAxisTitleY`, because Recharts centres a label on
   * the AXIS BOX and cannot express the site's placement. Each route's floor is
   * therefore lower by exactly its rotated-title count, 7, 10 and 10. The
   * titles themselves are unchanged in number and still counted under
   * `axis-title` and by ROTATED_FLOOR. */
  '/economy': {
    'recharts-text': 62,
    'recharts-cartesian-axis-tick-value': 55,
    'axis-label': 55,
    'axis-title': 14,
    annotation: 19,
  },
  '/households': {
    'recharts-text': 95,
    /* Two x ticks and two value labels lower than before, all four on
     * `Top1TaxShare` at the 360 preset. Its five published tax years are 13
     * units apart there and a four-digit tick needs 24, so `thinTicks` and
     * `keepUnclashed` drop what would otherwise be painted across a neighbour.
     * All of them still render at 1440px. */
    'recharts-cartesian-axis-tick-value': 85,
    'axis-label': 109,
    'axis-title': 20,
    'panel-title': 5,
    annotation: 22,
  },
  '/government': {
    'recharts-text': 87,
    'recharts-cartesian-axis-tick-value': 77,
    'axis-label': 80,
    'axis-title': 23,
    annotation: 13,
    'holders-label': 4,
    'maturity-label': 3,
    'maturity-marker-label': 2,
    'series-label': 5,
    'attrib-row-label': 6,
    'legend-label': 3,
    'dotplot-average-label': 1,
    'dotplot-label': 10,
    'dotplot-value': 10,
    'dotplot-label-us': 1,
    'dotplot-value-us': 1,
    'state-tile-code': 51,
    'state-tile-mark': 51,
  },
}

/** Direct-label annotations per route, at the lower of the two viewports. */
const ANNOTATION_FLOOR: Record<string, number> = {
  '/economy': 19,
  // 24 before `Top1TaxShare`'s value labels were thinned by collision at the
  // 360 preset. All 24 still render at 1440px.
  '/households': 22,
  '/government': 16,
}

/** Rotated `<text>` nodes per route, at both viewports. Every one is an
 *  `AxisLeft` title, which `RechartsFrame.useAxisLabel` renders at -90 degrees. */
const ROTATED_FLOOR: Record<string, number> = {
  '/economy': 7,
  '/households': 10,
  '/government': 10,
}

/** Left-axis tick labels per route, with the number of gutters they sit in.
 *  Both counts are the lower of the two viewports. */
const GUTTER_FLOOR: Record<string, { ticks: number; gutters: number }> = {
  '/economy': { ticks: 27, gutters: 7 },
  '/households': { ticks: 44, gutters: 9 },
  '/government': { ticks: 38, gutters: 8 },
}

/** Rotated axis titles that leave their `<svg>` vertically today.
 *
 *  EMPTY, AND THAT IS THE REPAIR. The one entry was `/households` section 1's
 *  "Constant 2024 dollars, log scale", whose first glyph sat 4.8px above the
 *  surface at 390px and was cut, because Recharts centres a rotated label on
 *  the AXIS BOX and that box sits below an asymmetric top margin.
 *  `RechartsFrame.AxisTitleY` now places every rotated title through
 *  `placeAxisTitleY`, the site's own arithmetic, which shifts a title along the
 *  axis it runs on until its whole box is inside the surface.
 *  `smoke.test.ts`'s `VERTICAL_CLIP_BASELINE` records the same repair at zero.
 *
 *  The set is exact. A newly clipped title fails it. */
const ROTATED_CLIP_BASELINE: Record<string, readonly string[]> = {
  '/economy|narrow': [],
  '/economy|wide': [],
  '/households|narrow': [],
  '/households|wide': [],
  '/government|narrow': [],
  '/government|wide': [],
}

interface TextNode {
  svgIndex: number
  classes: string[]
  text: string
  rotated: boolean
  box: { left: number; right: number; top: number; bottom: number }
  svg: { left: number; right: number; top: number; bottom: number }
}

/** Every painted `<text>` in every `<svg>`, with four things about it. Its
 *  class list, its own box, its surface's box, and whether a transform rotates
 *  it.
 *
 *  Wider than `harness.ts`'s `textBoxes`, which returns neither the class list
 *  nor the rotation. The clipping rules below split by class, and a rotated
 *  node runs its length down the page. Both are needed here. */
async function chartTexts(page: Page): Promise<TextNode[]> {
  return page.evaluate(() => {
    const out: TextNode[] = []
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    document.querySelectorAll('svg').forEach((svg, svgIndex) => {
      const svgBox = rect(svg)
      svg.querySelectorAll('text').forEach((t) => {
        const box = rect(t)
        if (box.right - box.left === 0 && box.bottom - box.top === 0) return
        let rotated = false
        for (let el: Element | null = t; el !== null && el !== svg; el = el.parentElement) {
          if (/rotate\(/.test(el.getAttribute('transform') ?? '')) {
            rotated = true
            break
          }
        }
        out.push({
          svgIndex,
          classes: (t.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
          text: (t.textContent ?? '').trim(),
          rotated,
          box,
          svg: svgBox,
        })
      })
    })
    return out
  }) as Promise<TextNode[]>
}

function describe(node: TextNode): string {
  const cls = node.classes.join('.') || '(no class)'
  return `svg[${node.svgIndex}] [${cls}] ${JSON.stringify(node.text.slice(0, 46))}`
}

function overrunsHorizontally(node: TextNode): boolean {
  return (
    node.box.left < node.svg.left - TOLERANCE_PX || node.box.right > node.svg.right + TOLERANCE_PX
  )
}

function overrunsVertically(node: TextNode): boolean {
  return node.box.top < node.svg.top - TOLERANCE_PX || node.box.bottom > node.svg.bottom + TOLERANCE_PX
}

let site: Site

before(async () => {
  site = await withSite(8)
})
after(async () => {
  await site?.close()
})

for (const route of CHART_ROUTES) {
  for (const viewport of VIEWPORTS) {
    const where = `${route.path} @ ${viewport.width}x${viewport.height}`

    test(`${where}: no chart text is clipped by its svg`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const nodes = await chartTexts(page)

        const perClass: Record<string, number> = {}
        for (const node of nodes) {
          for (const cls of node.classes) perClass[cls] = (perClass[cls] ?? 0) + 1
        }
        t.diagnostic(
          `${where}: walked ${nodes.length} text nodes across ` +
            `${Object.keys(perClass).length} classes`,
        )

        const floor = TEXT_FLOOR[route.path] as number
        assert.ok(
          nodes.length >= floor,
          `${where}: walked ${nodes.length} <text> nodes, below the measured floor of ${floor}. ` +
            `A shrunken corpus passes every assertion below and says nothing.`,
        )
        const short = Object.entries(CLASS_FLOOR[route.path] as Record<string, number>)
          .filter(([cls, n]) => (perClass[cls] ?? 0) < n)
          .map(([cls, n]) => `  .${cls}: ${perClass[cls] ?? 0}, expected at least ${n}`)
        assert.deepEqual(
          short,
          [],
          `${where}: ${short.length} <text> class(es) render fewer nodes than measured:\n${short.join('\n')}`,
        )

        const clipped = nodes
          .filter(overrunsHorizontally)
          .map(
            (n) =>
              `  ${describe(n)}: text ${n.box.left.toFixed(1)} to ${n.box.right.toFixed(1)}, ` +
              `svg ${n.svg.left.toFixed(1)} to ${n.svg.right.toFixed(1)}`,
          )
        assert.deepEqual(
          clipped,
          [],
          `${where}: ${clipped.length} of ${nodes.length} <text> nodes are cut by their own svg. ` +
            `The svg carries a viewBox and no overflow, so the glyph is cut rather than spilled, ` +
            `and a partial number reads as a whole one:\n${clipped.join('\n')}`,
        )
      } finally {
        await context.close()
      }
    })

    test(`${where}: no annotation is clipped by its svg`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const nodes = (await chartTexts(page)).filter((n) =>
          n.classes.some((c) => ANNOTATION_CLASSES.includes(c)),
        )
        t.diagnostic(`${where}: walked ${nodes.length} direct-label annotations`)
        const floor = ANNOTATION_FLOOR[route.path] as number
        assert.ok(
          nodes.length >= floor,
          `${where}: walked ${nodes.length} annotations, below the measured floor of ${floor}. ` +
            `The pipeline guard already reads zero here, so a second empty walk would leave ` +
            `placeAnnotation's clamp unchecked against a rendered page.`,
        )
        const clipped = nodes
          .filter(overrunsHorizontally)
          .map(
            (n) =>
              `  ${describe(n)}: text ${n.box.left.toFixed(1)} to ${n.box.right.toFixed(1)}, ` +
              `svg ${n.svg.left.toFixed(1)} to ${n.svg.right.toFixed(1)}`,
          )
        assert.deepEqual(
          clipped,
          [],
          `${where}: ${clipped.length} annotation(s) run past their own svg edge:\n${clipped.join('\n')}`,
        )
      } finally {
        await context.close()
      }
    })

    test(`${where}: no rotated axis title is clipped by its svg`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        const nodes = (await chartTexts(page)).filter((n) => n.rotated)
        t.diagnostic(`${where}: walked ${nodes.length} rotated axis titles`)
        const floor = ROTATED_FLOOR[route.path] as number
        assert.ok(
          nodes.length >= floor,
          `${where}: walked ${nodes.length} rotated <text> nodes, below the measured floor of ` +
            `${floor}. A rotated title runs its length down the page, so the horizontal sweep ` +
            `above cannot see it at all.`,
        )
        const clipped = nodes.filter(overrunsVertically).map((n) => n.text)
        const expected = ROTATED_CLIP_BASELINE[`${route.path}|${viewport.name}`] as readonly string[]
        assert.deepEqual(
          [...clipped].sort(),
          [...expected].sort(),
          `${where}: the set of vertically clipped rotated titles changed. ` +
            `Every title in ROTATED_CLIP_BASELINE is a defect under issue #83, so a repaired ` +
            `one must be removed from that table and a newly clipped one must be fixed. ` +
            `Measured: ${JSON.stringify(clipped)}.`,
        )
      } finally {
        await context.close()
      }
    })

    test(`${where}: every left axis tick fits its gutter`, async (t) => {
      const { context, page } = await openRoute(site, route, viewport)
      try {
        await mountIslands(page, route.hydratedSvg)
        /* The gutter is the band between the surface's left edge and the plot
         * rect. `PlotGrid` paints that rect as `CartesianGrid`'s fill. So
         * `.recharts-cartesian-grid-bg` gives the plot's own left edge,
         * measured instead of derived from the margin preset. A left tick is
         * `end`-anchored at the plot edge and nothing clamps it. That is
         * deliberate, because a tick shifted inward lands on its own data. */
        const measured = await page.evaluate((tol: number) => {
          const out = { ticks: 0, gutters: 0, over: [] as string[] }
          document.querySelectorAll('svg').forEach((svg, i) => {
            const grid = svg.querySelector('.recharts-cartesian-grid-bg')
            const ticks = Array.from(
              svg.querySelectorAll('.recharts-yAxis-tick-labels text.axis-label'),
            ).filter((t) => t.getBoundingClientRect().width > 0)
            if (ticks.length === 0) return
            if (grid === null) {
              out.over.push(`svg[${i}] draws ${ticks.length} left ticks and paints no plot rect`)
              return
            }
            out.gutters += 1
            const sb = svg.getBoundingClientRect()
            const gb = grid.getBoundingClientRect()
            for (const tick of ticks) {
              out.ticks += 1
              const b = tick.getBoundingClientRect()
              if (b.left < sb.left - tol || b.right > gb.left + tol) {
                out.over.push(
                  `svg[${i}] ${JSON.stringify((tick.textContent ?? '').trim())}: ` +
                    `${b.left.toFixed(1)} to ${b.right.toFixed(1)}, gutter ` +
                    `${sb.left.toFixed(1)} to ${gb.left.toFixed(1)}`,
                )
              }
            }
          })
          return out
        }, TOLERANCE_PX)

        t.diagnostic(
          `${where}: walked ${measured.ticks} left-axis ticks in ${measured.gutters} gutters`,
        )
        const floor = GUTTER_FLOOR[route.path] as { ticks: number; gutters: number }
        assert.ok(
          measured.gutters >= floor.gutters,
          `${where}: measured ${measured.gutters} gutters, below the floor of ${floor.gutters}`,
        )
        assert.ok(
          measured.ticks >= floor.ticks,
          `${where}: walked ${measured.ticks} left-axis ticks, below the floor of ${floor.ticks}`,
        )
        assert.deepEqual(
          measured.over,
          [],
          `${where}: ${measured.over.length} left-axis tick label(s) do not fit their gutter. ` +
            `A tick wider than its gutter is cut at the surface edge:\n  ${measured.over.join('\n  ')}`,
        )
      } finally {
        await context.close()
      }
    })
  }
}

/** Criterion 2's second half, on the one route that draws the labels.
 *
 *  `DebtHolders` picks each segment label by fit against the distance to its
 *  row-mate's centre. A collision is therefore impossible by construction. This
 *  test asserts the construction holds in painted pixels. Legibility and
 *  correctness are separate claims, and an earlier pass cleared every clipping
 *  assertion while breaking exactly this way.
 *
 *  Rows are keyed on the rounded vertical centre, with a 4px tolerance. Two
 *  labels a fraction of a pixel apart therefore count as one row. */
for (const viewport of VIEWPORTS) {
  test(`/government @ ${viewport.width}px: no two holders labels on one row intersect`, async (t) => {
    const route = CHART_ROUTES.find((r) => r.path === '/government')
    assert.ok(route !== undefined, '/government is not in CHART_ROUTES')
    const { context, page } = await openRoute(site, route, viewport)
    try {
      await mountIslands(page, route.hydratedSvg)
      const measured = await page.evaluate((tol: number) => {
        const out = { labels: 0, rows: 0, pairs: 0, overlaps: [] as string[] }
        document.querySelectorAll('svg').forEach((svg) => {
          const rows: { centre: number; boxes: { label: string; left: number; right: number }[] }[] = []
          svg.querySelectorAll('text.holders-label').forEach((t) => {
            const b = t.getBoundingClientRect()
            if (b.width === 0) return
            out.labels += 1
            const centre = (b.top + b.bottom) / 2
            let row = rows.find((r) => Math.abs(r.centre - centre) <= 4)
            if (row === undefined) {
              row = { centre, boxes: [] }
              rows.push(row)
            }
            row.boxes.push({ label: (t.textContent ?? '').trim().slice(0, 40), left: b.left, right: b.right })
          })
          out.rows += rows.length
          for (const row of rows) {
            row.boxes.sort((a, b) => a.left - b.left)
            for (let i = 1; i < row.boxes.length; i += 1) {
              const earlier = row.boxes[i - 1]!
              const later = row.boxes[i]!
              out.pairs += 1
              if (later.left < earlier.right - tol) {
                out.overlaps.push(
                  `${JSON.stringify(earlier.label)} and ${JSON.stringify(later.label)} overlap by ` +
                    `${(earlier.right - later.left).toFixed(1)}px`,
                )
              }
            }
          }
        })
        return out
      }, TOLERANCE_PX)

      t.diagnostic(
        `/government @ ${viewport.width}px: walked ${measured.labels} holders labels in ` +
          `${measured.rows} rows, comparing ${measured.pairs} adjacent pairs`,
      )
      assert.ok(
        measured.labels >= 4,
        `walked ${measured.labels} holders-label nodes, expected at least 4`,
      )
      assert.ok(
        measured.pairs >= 2,
        `compared ${measured.pairs} adjacent pairs, expected at least 2. With no pair on any ` +
          `row this assertion holds over nothing.`,
      )
      assert.deepEqual(
        measured.overlaps,
        [],
        `/government @ ${viewport.width}px: ${measured.overlaps.length} holders-label ` +
          `collision(s):\n  ${measured.overlaps.join('\n  ')}`,
      )
    } finally {
      await context.close()
    }
  })
}
