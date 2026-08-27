/** Unit tests for annotation placement, run by `npm run test:unit`
 *  (`node --test`, which strips the types natively — Node >= 22.18 / >= 23.6).
 *
 *  This lane exists because it is the ONLY one that reaches the 360-unit NARROW
 *  geometry. `useChartSize` returns the WIDE preset before measurement, so the
 *  server render — and therefore every assertion the pytest suite can make
 *  against `dist/` — only ever sees 720. NARROW is client-only, it is where #64
 *  is worst (`innerWidth` 296 against 622, while label text does not shrink),
 *  and it is the only geometry where a label clips off the LEFT edge.
 *
 *  The pytest guard `test_no_chart_annotation_is_clipped_by_its_svg` owns the
 *  WIDE half against the served bytes. These two together are the whole
 *  automated floor; the browser probe at 390x844 belongs to #67.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADVANCE_EM,
  ANNOTATION_FONT_PX,
  SMALL_LABEL_FONT_PX,
  estimateTextWidth,
  placeAnnotation,
  visibleSpan,
  type Anchor,
} from './annotate.ts'
import { frame, type Frame } from './scales.ts'

/** The two presets in useChartSize.ts, verbatim. */
const WIDE: Frame = frame(720, 396, { top: 20, right: 24, bottom: 52, left: 74 })
const NARROW: Frame = frame(360, 316, { top: 22, right: 12, bottom: 50, left: 52 })

/** The box a placement actually paints, in local (post-translate) coords. */
function box(x: number, w: number, anchor: Anchor): [number, number] {
  if (anchor === 'start') return [x, x + w]
  if (anchor === 'end') return [x - w, x]
  return [x - w / 2, x + w / 2]
}

function assertInside(p: { x: number; textAnchor: Anchor } | null, label: string, f: Frame, fontPx = ANNOTATION_FONT_PX) {
  assert.ok(p, `${label}: expected a placement, got null`)
  const [lo, hi] = visibleSpan(f)
  const [l, r] = box(p.x, estimateTextWidth(label, fontPx), p.textAnchor)
  assert.ok(
    l >= lo - 1e-9 && r <= hi + 1e-9,
    `"${label}" paints [${l.toFixed(1)}, ${r.toFixed(1)}], outside [${lo}, ${hi}]`,
  )
}

test('the frame presets are the ones useChartSize ships', () => {
  assert.equal(WIDE.innerWidth, 622)
  assert.equal(NARROW.innerWidth, 296)
  // The SVG span is wider than the plot by both margins: annotations may sit
  // over the margin, they may only not leave the viewBox.
  assert.deepEqual(visibleSpan(WIDE), [-72, 644])
  assert.deepEqual(visibleSpan(NARROW), [-50, 306])
})

test('estimateTextWidth is monotone in length and linear in font size', () => {
  assert.ok(estimateTextWidth('ab') > estimateTextWidth('a'))
  assert.ok(estimateTextWidth('abcd') > estimateTextWidth('abc'))
  assert.equal(estimateTextWidth(''), 0)
  const big = estimateTextWidth('Discretionary', ANNOTATION_FONT_PX)
  const small = estimateTextWidth('Discretionary', SMALL_LABEL_FONT_PX)
  assert.ok(small < big)
  assert.ok(Math.abs(small / big - SMALL_LABEL_FONT_PX / ANNOTATION_FONT_PX) < 1e-9)
  assert.equal(estimateTextWidth('abc', 10), 3 * 10 * ADVANCE_EM)
})

test('ADVANCE_EM is the over-estimate the pytest guard also uses', () => {
  // Raise-never-lower. If this trips, the Python constant in
  // pipeline/tests/test_accessibility.py must move with it, not against it.
  assert.equal(ADVANCE_EM, 0.62)
  assert.ok(ADVANCE_EM >= 0.6, 'ADVANCE_EM must over-estimate a proportional font')
})

test('a label that already fits is returned unchanged', () => {
  const p = placeAnnotation({ x: 100, label: '2019: 22%', frame: WIDE, anchor: 'start' })
  assert.deepEqual(p, { x: 100, textAnchor: 'start' })

  const m = placeAnnotation({ x: 300, label: '2023: 38.4%', frame: WIDE, anchor: 'middle' })
  assert.deepEqual(m, { x: 300, textAnchor: 'middle' })

  const e = placeAnnotation({ x: 400, label: 'Last actual, FY2025', frame: WIDE, anchor: 'end' })
  assert.deepEqual(e, { x: 400, textAnchor: 'end' })
})

test('a right overrun flips start to end at the same reference point', () => {
  // The BoundaryRule shape: x + 4 near the right edge of a WIDE plot.
  const p = placeAnnotation({ x: 620, label: 'Last actual, FY2025', frame: WIDE, anchor: 'start' })
  assert.equal(p?.textAnchor, 'end', 'flip precedes shift')
  assert.equal(p?.x, 620, 'a flip keeps the label attached to its reference point')
  assertInside(p, 'Last actual, FY2025', WIDE)
})

test('a left overrun flips end to start at the same reference point', () => {
  // E1: WhoWorks / PricesAndRates / LaborAndCapital / GrowthAndShadow /
  // PayrollBill anchor `end`, and clip LEFT when the last actual year sits near
  // the left of a filtered range. Invisible to pytest — NARROW-only in
  // practice, and never emitted by SSR.
  const p = placeAnnotation({ x: -40, label: 'Unemployment', frame: NARROW, anchor: 'end' })
  assert.equal(p?.textAnchor, 'start')
  assert.equal(p?.x, -40)
  assertInside(p, 'Unemployment', NARROW)
})

test('middle shifts, never flips, and only as far as the edge forces', () => {
  const label = '2022: top 1% 31.5%'
  const w = estimateTextWidth(label)
  const [, hi] = visibleSpan(WIDE)
  const p = placeAnnotation({ x: 696, label, frame: WIDE, anchor: 'middle' })
  assert.equal(p?.textAnchor, 'middle', 'middle has no opposite anchor')
  // Minimum shift: the right edge of the box lands exactly on the span edge.
  assert.ok(Math.abs((p!.x + w / 2) - hi) < 1e-9, 'shifted further than the edge forced')
  assertInside(p, label, WIDE)
})

test('a label wider than the whole span is absent, not truncated', () => {
  // The criterion that closes `2022: top 19`. There is no placement that draws
  // a partial number, because there is no placement at all.
  const monster = 'x'.repeat(200)
  assert.equal(placeAnnotation({ x: 0, label: monster, frame: NARROW }), null)
  assert.equal(placeAnnotation({ x: 0, label: monster, frame: WIDE, anchor: 'middle' }), null)

  // And the boundary is the span, not the plot: a label wider than the 296-unit
  // NARROW plot but inside its 356-unit span still places.
  const tween = 'y'.repeat(45) // 45 * 11.5 * 0.62 = 320.85
  const w = estimateTextWidth(tween)
  assert.ok(w > NARROW.innerWidth && w < visibleSpan(NARROW)[1] - visibleSpan(NARROW)[0])
  assert.notEqual(placeAnnotation({ x: 0, label: tween, frame: NARROW }), null)
})

test('the real labels #64 clipped all fit inside the NARROW span', () => {
  // SSR cannot reach this geometry; this is the whole reason test:unit exists
  // for #64. Criterion 4: BudgetChart's four series labels at both presets.
  const cases: Array<[number, string, Anchor]> = [
    [296 + 4, 'Last actual, FY2025', 'start'],
    [296, 'Top statutory rate', 'start'],
    [296, '2022: top 1% 31.5%', 'middle'],
    [296 + 6, 'Mandatory (net)', 'start'],
    [296 + 6, 'Discretionary', 'start'],
    [296 + 6, 'Net interest', 'start'],
    [296 + 6, 'Revenue', 'start'],
    [296, '2022, 18%', 'start'],
    [296, '2023: 38.4%', 'middle'],
  ]
  for (const [x, label, anchor] of cases) {
    assertInside(placeAnnotation({ x, label, frame: NARROW, anchor }), label, NARROW)
    assertInside(placeAnnotation({ x: x * 2, label, frame: WIDE, anchor }), label, WIDE)
  }
})

test('placement is vintage-independent: the same label places at any x', () => {
  // E2. The boundary moves with the data vintage, so the clamp must be computed
  // from the label and the frame, never from FY2025's current position.
  for (const x of [40, 300, 620, 700]) {
    assertInside(
      placeAnnotation({ x, label: 'Last actual, FY2031', frame: WIDE, anchor: 'start' }),
      'Last actual, FY2031',
      WIDE,
    )
  }
})

test('placement is idempotent', () => {
  const anchors: Anchor[] = ['start', 'middle', 'end']
  for (const frameUnder of [WIDE, NARROW]) {
    for (const anchor of anchors) {
      for (const x of [-300, -60, 0, 150, 296, 620, 700, 900]) {
        const label = 'Mandatory (net)'
        const first = placeAnnotation({ x, label, frame: frameUnder, anchor })
        assert.ok(first)
        const second = placeAnnotation({ x: first.x, label, frame: frameUnder, anchor: first.textAnchor })
        assert.deepEqual(second, first, `place(place(x)) != place(x) at x=${x} anchor=${anchor}`)
      }
    }
  }
})

test('every anchor at every extreme x lands inside the span', () => {
  const anchors: Anchor[] = ['start', 'middle', 'end']
  for (const frameUnder of [WIDE, NARROW]) {
    for (const anchor of anchors) {
      for (const x of [-1000, -80, -50, 0, 100, 296, 306, 622, 644, 1000]) {
        const label = 'Net interest'
        assertInside(placeAnnotation({ x, label, frame: frameUnder, anchor }), label, frameUnder)
      }
    }
  }
})

test('flip: false shifts instead of re-anchoring', () => {
  const p = placeAnnotation({ x: 620, label: 'Last actual, FY2025', frame: WIDE, anchor: 'start', flip: false })
  assert.equal(p?.textAnchor, 'start')
  assert.ok(p!.x < 620)
  assertInside(p, 'Last actual, FY2025', WIDE)
})

test('an explicit width overrides the estimate, for multi-line tspan labels', () => {
  // E9 / OecdChart: two <tspan>s share one placement, and the width is the
  // widest LINE, not the concatenation.
  const line1 = 'OECD average, 34.0% of GDP'
  const line2 = '(mean of 38 members, not a country)'
  const w = Math.max(
    estimateTextWidth(line1, SMALL_LABEL_FONT_PX),
    estimateTextWidth(line2, SMALL_LABEL_FONT_PX),
  )
  const p = placeAnnotation({
    x: 600,
    label: line1,
    width: w,
    frame: WIDE,
    anchor: 'start',
    fontPx: SMALL_LABEL_FONT_PX,
  })
  assert.ok(p)
  const [lo, hi] = visibleSpan(WIDE)
  const [l, r] = box(p.x, w, p.textAnchor)
  assert.ok(l >= lo && r <= hi, `the wider of the two lines paints [${l}, ${r}] outside [${lo}, ${hi}]`)
})

test('the helper touches no DOM API', () => {
  // Criterion 5, at the unit level: same output on the server and in the
  // browser, so nothing shifts on hydration. `node --test` has no `document`,
  // so a measurement call would throw here rather than pass silently.
  assert.equal(typeof globalThis.document, 'undefined')
  assert.deepEqual(
    placeAnnotation({ x: 696, label: '2022: top 1% 31.5%', frame: WIDE, anchor: 'middle' }),
    placeAnnotation({ x: 696, label: '2022: top 1% 31.5%', frame: WIDE, anchor: 'middle' }),
  )
})
