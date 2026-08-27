/** The legend half of the browser lane — issue #74. Run by
 *  `npm run test:browser` alongside `smoke`, `keyboard`, `driven`, `scroll` and
 *  `touch`.
 *
 *  WHAT IS UNDER TEST. A legend key is a swatch and the words that say what it
 *  means. `.state-legend` used to be six loose siblings — swatch, label,
 *  swatch, label, swatch, label — under one `flex-wrap: wrap`, so the wrap fell
 *  wherever the sixth box happened to land. Measured at `2b4efe1`: at 320px the
 *  "Even" swatch stranded at the end of row 1 (swatch 23532-23546, its text's
 *  first line 23556-23577 — no overlap at all), and at 390px and 414px the
 *  third swatch stranded from "Gets more, up to $113,122 per person". Read left
 *  to right, a stranded swatch sits beside the NEXT label and inverts the
 *  direction the colour ramp encodes.
 *
 *  WHY OVERLAP AND NOT EQUAL `top`. The issue asked for "every swatch and its
 *  label share a `getBoundingClientRect().top`". That is false of a CORRECT
 *  legend: the swatch is 13.6px and a line box is ~21px, so the two tops differ
 *  by a few pixels even when everything is right. The assertion here is that
 *  the marker's box VERTICALLY OVERLAPS the line box of the text it abuts,
 *  which is what "on the same line" means, and which was red at 320/390/414 and
 *  green at 360/768/1440 before the fix.
 *
 *  WHY THIS FILE DECLARES ITS OWN WIDTHS. `VIEWPORTS` is the accessibility
 *  contract's two committed widths and stays that way; widening it would change
 *  every other spec's cost and coverage silently. #74's definition of done says
 *  "every viewport from 320px up", so this file commits 320px FOR THE
 *  LEGEND-INTEGRITY INVARIANT AND NOTHING ELSE, locally and in writing
 *  (`docs/contracts/accessibility.md`, row 11).
 *
 *  EVERY SWEEP COUNTS THROUGH A RECORDED INTEGER. The per-route and per-class
 *  totals below are measured facts, asserted as equalities BEFORE any geometry
 *  is read — the same rule `touch.test.ts` follows with `TAPPABLE_CHARTS` and
 *  `HINT_CARRIERS`. Without them a mistyped selector sweeps an empty set and
 *  reports green, which is the failure this lane is least able to notice on its
 *  own.
 *
 *  WHY EVERY WAIT IS BOUNDED. `node --test` has no default per-test timeout,
 *  and #71's lane hung for fifteen minutes on an unbounded wait (#123 owns the
 *  general fix). Every `test()` here carries an explicit timeout and the one
 *  wait in the file is a bounded `waitForFunction`.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROUTES,
  legendMarkers,
  mountIslands,
  openRoute,
  withSite,
  type LegendMarker,
  type Route,
  type Site,
  type ViewportSize,
} from './harness.ts'

/** #74's own three widths. `VIEWPORTS` is deliberately untouched — see the file
 *  header. 320px is the narrowest viewport the site is expected to meet; 390
 *  and 414 are the two the defect was reported and re-measured at. */
const LEGEND_WIDTHS = [320, 390, 414] as const

/** The routes that carry charts, in the order they are swept. */
const CHART_PATHS = ['/economy', '/households', '/government'] as const

/** How many legend markers each route carries. Measured at `2b4efe1`, hydrated,
 *  and identical at 320, 360, 390, 414, 768 and 1440 — the marker set does not
 *  depend on width, only its layout does.
 *
 *  `/economy`'s zero is an ASSERTION, not a skip, in the same spirit as
 *  `ROUTES`' zero figure counts: an `/economy` that grows a legend should turn
 *  this red and be re-baselined deliberately. */
const MARKERS: Record<string, number> = {
  '/economy': 0,
  '/households': 10,
  '/government': 26,
}

/** Of those, how many abut text and are therefore legend keys with geometry to
 *  check, and how many abut no text on either side and are correctly skipped.
 *
 *  The four skipped are the year-range slider's thumbs: painted boxes under
 *  26px with no words beside them. They are counted rather than dropped, so
 *  "the sweep found nothing to measure" can never masquerade as "everything
 *  measured passed". */
const MEASURED: Record<string, number> = { '/economy': 0, '/households': 6, '/government': 26 }
const SKIPPED: Record<string, number> = { '/economy': 0, '/households': 4, '/government': 0 }

/** The same totals broken out by what the marker actually is, so a change that
 *  swaps one legend for another cannot hold the route total steady.
 *
 *  `span.character-swatch` is one per curated law row: a deliberate edit to
 *  `pipeline/curated/laws.yaml` re-baselines this number, and that is the
 *  intended workflow, not a reason to loosen it. `svg` is
 *  `StatutoryVsEffective`'s six CBO income-group keys, which carry no class. */
const BY_LABEL: Record<string, Record<string, number>> = {
  '/economy': {},
  '/households': { svg: 6, 'span.year-range-thumb': 4 },
  '/government': { 'span.state-legend-swatch': 3, 'span.character-swatch': 23 },
}

/** The currency string the cartogram legend ships, and the two values L3 drives
 *  it with. The number is data-driven — it is the largest per-person balance in
 *  the pipeline's output — so "it fits today" is not the same claim as "it
 *  fits", and L3 makes the difference a test rather than a hope.
 *
 *  TWO values, because they fail differently. `$1,113,122,999` is the realistic
 *  case: an order of magnitude longer, still full of spaces, so it wraps at
 *  word boundaries and the item's `min-width: 0` / `max-width: 100%` /
 *  `overflow-wrap: anywhere` never come into play. `UNBREAKABLE` is the case
 *  those three exist for — one token wider than the whole container at 320px.
 *  Measured with them removed: `.state-legend` reports 290 against 280. With
 *  them: 280 against 280. Without this second value that CSS would be three
 *  lines of unproven defence. */
const REAL_NUMBER = /\$[\d,]+/
const LONG_NUMBER = '$1,113,122,999'
const UNBREAKABLE = '$1,111,111,111,111,111,111,111,111,111,111,111,111'

/** 12 page loads, each mounting every island on a route up to ~26,000px tall.
 *  Generous on purpose: this bound exists so a hang fails, not so a slow
 *  machine does. */
const TEST_TIMEOUT = 300_000

function routeFor(path: string): Route {
  const r = ROUTES.find((x) => x.path === path)
  if (r === undefined) throw new Error(`no route ${path}`)
  return r
}

function viewport(width: number): ViewportSize {
  return { name: `w${width}`, width, height: 844 }
}

interface Row {
  path: string
  width: number
  markers: LegendMarker[]
  doc: { scrollWidth: number; clientWidth: number }
}

async function measure(path: string, width: number): Promise<Row> {
  const route = routeFor(path)
  const { context, page } = await openRoute(site, route, viewport(width))
  try {
    await mountIslands(page, route.hydratedSvg)
    const markers = await legendMarkers(page)
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    return { path, width, markers, doc }
  } finally {
    await context.close()
  }
}

/** The 3x3 sweep, run ONCE and shared by L1 and L2.
 *
 *  Both tests ask different questions of the same measurement, and mounting
 *  `/government` nine times rather than three buys nothing but minutes. Cached
 *  as a promise so the order the tests happen to run in cannot matter. */
let sweep: Promise<Row[]> | null = null
function sweepAll(): Promise<Row[]> {
  sweep ??= (async () => {
    const rows: Row[] = []
    for (const path of CHART_PATHS) {
      for (const width of LEGEND_WIDTHS) rows.push(await measure(path, width))
    }
    return rows
  })()
  return sweep
}

/** The invariant, stated once. A marker and the text it abuts share a line box
 *  when their vertical extents overlap at all. */
function sharesLine(m: LegendMarker): boolean {
  return m.line !== null && m.marker.top < m.line.bottom && m.marker.bottom > m.line.top
}

function describe(row: Row, m: LegendMarker): string {
  const line = m.line === null ? 'no line box' : `${m.line.top.toFixed(1)}-${m.line.bottom.toFixed(1)}`
  return (
    `${row.path} @${row.width}: ${m.label} at ${m.marker.top.toFixed(1)}-${m.marker.bottom.toFixed(1)} ` +
    `does not share a line with the text it abuts (${m.side}, ${line}): ${JSON.stringify(m.text)}`
  )
}

/** Assert the counts BEFORE any geometry is read. Shared by L1 and L3 so the
 *  driven case cannot pass over an empty set either. */
function assertCounts(row: Row): void {
  assert.equal(
    row.markers.length,
    MARKERS[row.path],
    `${row.path} @${row.width}: swept ${row.markers.length} legend markers, expected ` +
      `${MARKERS[row.path]}. A count that has moved means the marker rule stopped ` +
      `matching (a green run over an empty set) or a legend was added — either way, ` +
      `re-baseline deliberately rather than measuring over whatever is left.`,
  )
  const measured = row.markers.filter((m) => m.side !== 'none')
  const skipped = row.markers.filter((m) => m.side === 'none')
  assert.equal(measured.length, MEASURED[row.path], `${row.path} @${row.width}: measurable markers`)
  assert.equal(skipped.length, SKIPPED[row.path], `${row.path} @${row.width}: markers abutting no text`)

  const byLabel: Record<string, number> = {}
  for (const m of row.markers) byLabel[m.label] = (byLabel[m.label] ?? 0) + 1
  assert.deepEqual(byLabel, BY_LABEL[row.path], `${row.path} @${row.width}: markers by kind`)
}

let site: Site

before(async () => {
  site = await withSite(5)
})

after(async () => {
  await site?.close()
})

test(
  'L1 — every legend marker shares a line with the label it belongs to',
  { timeout: TEST_TIMEOUT },
  async () => {
    for (const row of await sweepAll()) {
      assertCounts(row)
      for (const m of row.markers) {
        if (m.side === 'none') continue
        assert.ok(sharesLine(m), describe(row, m))
      }
    }
  },
)

test(
  'L2 — preventing the wrap does not buy it back as horizontal overflow',
  { timeout: TEST_TIMEOUT },
  async () => {
    for (const row of await sweepAll()) {
      assertCounts(row)
      for (const m of row.markers) {
        // Scoped to markers that are actually legend keys. A slider thumb
        // overhangs its track by 5px by construction; that is a real
        // measurement about a slider, not about a legend.
        if (m.side === 'none') continue
        for (const c of m.containers) {
          assert.ok(
            c.scrollWidth <= c.clientWidth,
            `${row.path} @${row.width}: ${c.label} holding ${m.label} scrolls sideways ` +
              `(${c.scrollWidth} > ${c.clientWidth}). Stopping a wrap by overflowing is a ` +
              `different defect, not a fix.`,
          )
        }
      }
      if (MEASURED[row.path] === 0) continue
      assert.equal(
        row.doc.scrollWidth,
        row.doc.clientWidth,
        `${row.path} @${row.width}: the page itself scrolls sideways ` +
          `(${row.doc.scrollWidth} vs ${row.doc.clientWidth}).`,
      )
    }
  },
)

test(
  'L3 — the cartogram legend survives a number an order of magnitude longer',
  { timeout: TEST_TIMEOUT },
  async () => {
    const route = routeFor('/government')
    for (const [width, driven] of LEGEND_WIDTHS.flatMap(
      (w) => [[w, LONG_NUMBER], [w, UNBREAKABLE]] as const,
    )) {
      const { context, page } = await openRoute(site, route, viewport(width))
      try {
        await mountIslands(page, route.hydratedSvg)
        // Nothing on this route re-renders without an interaction, so mutating
        // the DOM and measuring is sound. The wait is still bounded and still
        // observes the mutation rather than assuming it: a selector that
        // stopped matching would otherwise leave the real label in place and
        // report the driven case green.
        const replaced = await page.evaluate(
          ([pattern, long]) => {
            let n = 0
            document.querySelectorAll('.state-legend-item > span:last-child').forEach((s) => {
              const before = s.textContent ?? ''
              const after = before.replace(new RegExp(pattern as string), long as string)
              if (after === before) return
              s.textContent = after
              n += 1
            })
            return n
          },
          [REAL_NUMBER.source, driven] as const,
        )
        assert.equal(
          replaced,
          2,
          `@${width} with ${driven}: expected to lengthen 2 legend labels, lengthened ${replaced}`,
        )
        await page.waitForFunction(
          (long) => (document.querySelector('.state-legend')?.textContent ?? '').includes(long),
          driven,
          { timeout: 5_000 },
        )

        const markers = await legendMarkers(page)
        const doc = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        const row: Row = { path: '/government', width, markers, doc }
        assertCounts(row)

        const swatches = markers.filter((m) => m.label === 'span.state-legend-swatch')
        assert.equal(swatches.length, 3, `@${width}: cartogram legend swatches`)
        for (const m of swatches) {
          // A prefix, because `LegendMarker.text` is clipped to 60 characters
          // for the failure messages and `UNBREAKABLE` is longer than that.
          // Still an observation of the mutation, not an assumption of it.
          assert.ok(
            m.text.includes(driven.slice(0, 24)) || m.text.includes('Even'),
            `@${width}: ${m.text} was not driven with ${driven}`,
          )
          assert.ok(sharesLine(m), describe(row, m))
          for (const c of m.containers) {
            assert.ok(
              c.scrollWidth <= c.clientWidth,
              `@${width}: ${c.label} scrolls sideways under ${driven} ` +
                `(${c.scrollWidth} > ${c.clientWidth})`,
            )
          }
        }
        assert.equal(
          doc.scrollWidth,
          doc.clientWidth,
          `@${width}: the page scrolls sideways under ${driven}`,
        )
      } finally {
        await context.close()
      }
    }
  },
)
