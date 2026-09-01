/** Unit tests for axis text fit, run by `npm run test:unit` (`node --test`,
 *  which strips the types natively, Node >= 22.18 / >= 23.6). Issue #66.
 *
 *  This file is to `axisFit.ts` what `annotate.test.ts` is to `annotate.ts`,
 *  and it is a SEPARATE file on purpose: #64's NARROW annotation coverage is
 *  not duplicated or edited here.
 *
 *  It exists because this is the only lane that reaches the 360-unit NARROW
 *  geometry. `useChartSize` returns WIDE before measurement, so the server
 *  render, and every assertion `pipeline/tests/test_accessibility.py` can make
 *  against `dist/`, only ever observes 720. Three axis properties are worse at
 *  360 and invisible to pytest:
 *
 *    1. the left gutter is 42 units, not 64, six characters, not nine;
 *    2. `margin.right` is 12, not 24, so a bottom tick at the right end of the
 *       domain overruns where at 720 it did not;
 *    3. a rotated axis title runs down a 316-unit SVG, not a 396-unit one, and
 *       two of the site's panels are shorter still.
 *
 *  The 1120-unit WIDER preset is invisible to pytest for the same reason, and
 *  it moves two decisions rather than tightening them. Its gutter holds 11
 *  characters, so `Bottom 50%` and even `$30,000,000` fit where they did not.
 *  Every case below therefore states which preset binds it.
 *
 *  The browser probe with real `getBoundingClientRect()` belongs to #67;
 *  `docs/contracts/accessibility.md` records it as measured, not asserted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AXIS_LABEL_FONT_PX,
  AXIS_TITLE_FONT_PX,
  everyLeftGutterLabelFits,
  firstThatFits,
  leftGutterFits,
  leftGutterRoom,
  placeAxisTitleY,
  placeTickLabel,
  rotatedTitleFits,
  spanRoomAt,
  tickLabelOverlaps,
} from './axisFit.ts'
import { estimateTextWidth, visibleSpan } from './annotate.ts'
import { frame, linear, type Frame } from './scales.ts'
import {
  calendarYear,
  dollars,
  dollarsCompact,
  fiscalYear,
  indexValue,
  percent,
  percentRate,
  tick,
  type Unit,
} from './format.ts'

/** The three presets in useChartSize.ts, verbatim. */
const WIDE: Frame = frame(720, 396, { top: 20, right: 24, bottom: 52, left: 74 })
const NARROW: Frame = frame(360, 316, { top: 22, right: 12, bottom: 50, left: 52 })
const WIDER: Frame = frame(1120, 520, { top: 24, right: 32, bottom: 56, left: 88 })

/** Every preset, for the properties that must hold at all three.
 *  One list, so a fourth preset is added in one place. */
const PRESETS: Frame[] = [WIDE, NARROW, WIDER]

/** BracketHistory builds its own frame with a fixed 60-unit left margin. */
const BRACKETS_NARROW: Frame = frame(360, 470, { top: 8, right: 16, bottom: 34, left: 60 })

function paintedBox(x: number, w: number, anchor: string): [number, number] {
  if (anchor === 'start') return [x, x + w]
  if (anchor === 'end') return [x - w, x]
  return [x - w / 2, x + w / 2]
}

// ---------------------------------------------------------------------------
// The left gutter, the geometry that shipped `$30,000,000` as `0,000,000`.
// ---------------------------------------------------------------------------

test('the left gutter is 64 units wide at 720, 42 at 360 and 78 at 1120', () => {
  assert.equal(leftGutterRoom(WIDE), 64)
  assert.equal(leftGutterRoom(NARROW), 42)
  assert.equal(leftGutterRoom(WIDER), 78)
  assert.equal(leftGutterRoom(BRACKETS_NARROW), 50)
  // Six characters at 11px, which is the whole constraint on axis formatters.
  assert.equal(Math.floor(leftGutterRoom(NARROW) / (AXIS_LABEL_FONT_PX * 0.62)), 6)
  // The 1120 preset grows its gutter with the plot, to 11 characters. NARROW
  // stays the binding case, so no formatter is retuned against this number.
  assert.equal(Math.floor(leftGutterRoom(WIDER) / (AXIS_LABEL_FONT_PX * 0.62)), 11)
  assert.ok(leftGutterRoom(NARROW) < leftGutterRoom(WIDE))
  assert.ok(leftGutterRoom(WIDE) < leftGutterRoom(WIDER))
})

test('every formatter in format.ts fits the narrow left gutter at its real magnitudes', () => {
  const tooWide = (label: string) =>
    `"${label}" needs ${estimateTextWidth(label, AXIS_LABEL_FONT_PX).toFixed(1)} units, ` +
    `the 360-preset gutter has ${leftGutterRoom(NARROW)}`

  // BracketHistory's log ticks and MedianIncome's linear ones. This is the case
  // that would have caught `dollars()` before it shipped.
  for (const v of [0, 30_000, 60_000, 90_000, 999_999, 1e6, 3e6, 1e7, 3e7]) {
    const label = dollarsCompact(v)
    assert.ok(leftGutterFits(label, NARROW), tooWide(label))
  }
  // `$60k` and `$0k` must be byte-identical to what shipped before, so
  // MedianIncome's axis does not move (criterion 5).
  assert.equal(dollarsCompact(0), '$0k')
  assert.equal(dollarsCompact(60_000), '$60k')
  assert.equal(dollarsCompact(30_000_000), '$30M')
  assert.equal(dollarsCompact(1_000_000), '$1M')

  // `tick`, over each unit family at the magnitudes the site's axes carry:
  // trillions from a small deficit to gross debt, and percent of GDP.
  for (const unit of ['nominal', 'real'] as Unit[]) {
    for (const v of [-3, -1.5, 0, 0.5, 1, 6.9, 19.6, 38, 100]) {
      const label = tick(v, unit)
      assert.ok(leftGutterFits(label, NARROW), tooWide(label))
    }
  }
  for (const v of [-10, 0, 5, 25, 100]) {
    assert.ok(leftGutterFits(tick(v, 'gdp'), NARROW), tooWide(tick(v, 'gdp')))
  }

  for (const v of [0, 5.5, 20, 37, 94, 100]) {
    for (const label of [percent(v, 1), percent(v, 0), percentRate(v)]) {
      assert.ok(leftGutterFits(label, NARROW), tooWide(label))
    }
  }
  for (const v of [0.421, 0.456, 1]) {
    assert.ok(leftGutterFits(indexValue(v), NARROW), tooWide(indexValue(v)))
  }
  for (const y of [1913, 1979, 2025]) {
    assert.ok(leftGutterFits(calendarYear(y), NARROW), tooWide(calendarYear(y)))
    assert.ok(leftGutterFits(fiscalYear(y), NARROW), tooWide(fiscalYear(y)))
  }

  // NARROW binds every formatter choice, because the gutter grows with the
  // preset. A label that clears 42 units clears 64 and 78 as well, so the
  // sweep above covers all three presets once this holds.
  for (const label of [dollarsCompact(30_000_000), tick(-1.5, 'nominal'), percent(37, 1), fiscalYear(2025)]) {
    assert.ok(leftGutterFits(label, WIDE), tooWide(label))
    assert.ok(leftGutterFits(label, WIDER), tooWide(label))
  }

  // And the negative: `dollars()` is exactly what an axis may NOT use, at the
  // two presets that bind. If this ever passes, the guard has stopped meaning
  // anything. WIDER is excluded on a measurement, not an oversight:
  // `$30,000,000` needs 75.0 units and its gutter holds 78, so the 1120 preset
  // would draw the label whole. The formatter still may not use it, because
  // the same axis renders at 360 as well.
  assert.equal(leftGutterFits(dollars(30_000_000), NARROW), false)
  assert.equal(leftGutterFits(dollars(30_000_000), WIDE), false)
  assert.equal(leftGutterFits(dollars(30_000_000), WIDER), true)
})

test('everyLeftGutterLabelFits is all-or-none over a category axis', () => {
  // WhoPays' six groups. `Bottom 50%` needs 68.2 units, more than the 360 and
  // 720 gutters hold, so the whole axis takes the in-plot treatment there.
  const groups = ['Top 1%', 'Top 5%', 'Top 10%', 'Top 25%', 'Top 50%', 'Bottom 50%']
  assert.equal(everyLeftGutterLabelFits(groups, WIDE), false)
  assert.equal(everyLeftGutterLabelFits(groups, NARROW), false)
  // The 1120 preset is the first one whose gutter holds `Bottom 50%`, at 68.2
  // units against 78, so the same axis takes the gutter treatment there and
  // the in-plot treatment at the other two.
  assert.equal(everyLeftGutterLabelFits(groups, WIDER), true)
  // One long member is enough to move them all; drop it and the gutter is back
  // at the wide preset, where the rest need at most 7 characters.
  assert.equal(everyLeftGutterLabelFits(groups.slice(0, 5), WIDE), true)
  assert.equal(everyLeftGutterLabelFits(groups.slice(0, 5), NARROW), false)
  assert.equal(everyLeftGutterLabelFits([], NARROW), true)
})

// ---------------------------------------------------------------------------
// Bottom ticks, shift-only, and by the minimum the edge forces.
// ---------------------------------------------------------------------------

test('an interior bottom tick is returned unchanged', () => {
  for (const f of PRESETS) {
    for (const x of [0, 40, f.innerWidth / 2, f.innerWidth - 60]) {
      assert.deepEqual(
        placeTickLabel(x, '2000', f),
        { x, textAnchor: 'middle' },
        'a tick that already fits must not move (criterion 5)',
      )
    }
  }
})

test('a bottom tick at the right end of the domain shifts left by exactly its overrun', () => {
  const hi = visibleSpan(NARROW)[1]
  for (const label of ['2025', 'FY2025']) {
    const w = estimateTextWidth(label, AXIS_LABEL_FONT_PX)
    const overrun = NARROW.innerWidth + w / 2 - hi
    assert.ok(overrun > 0, `${label} was expected to overrun the 360 preset`)
    const placed = placeTickLabel(NARROW.innerWidth, label, NARROW)
    assert.ok(placed)
    assert.equal(placed.textAnchor, 'middle', 'an axis tick must never flip its anchor')
    assert.ok(
      Math.abs(placed.x - (NARROW.innerWidth - overrun)) < 1e-9,
      `${label} shifted to ${placed.x}, expected ${NARROW.innerWidth - overrun}`,
    )
    const [l, r] = paintedBox(placed.x, w, placed.textAnchor)
    assert.ok(l >= visibleSpan(NARROW)[0] - 1e-9 && r <= hi + 1e-9)
  }

  // The same ticks clear the 720 and 1120 presets untouched, which is why
  // `dist/` shows nothing and why this property has no static lane. WIDER has
  // a 32-unit right margin, so a 27.3-unit year label sits well inside it.
  for (const f of [WIDE, WIDER]) {
    for (const label of ['2025', 'FY2025']) {
      assert.deepEqual(placeTickLabel(f.innerWidth, label, f), {
        x: f.innerWidth,
        textAnchor: 'middle',
      })
    }
  }
})

test('a bottom tick never flips, and placing twice changes nothing', () => {
  for (const f of PRESETS) {
    for (const x of [-200, -40, 0, 100, f.innerWidth, f.innerWidth + 90, 900]) {
      const placed = placeTickLabel(x, 'FY2025', f)
      assert.ok(placed)
      assert.equal(placed.textAnchor, 'middle')
      const again = placeTickLabel(placed.x, 'FY2025', f)
      assert.deepEqual(again, placed, 'placeTickLabel must be idempotent')
      const [l, r] = paintedBox(placed.x, estimateTextWidth('FY2025', AXIS_LABEL_FONT_PX), 'middle')
      const [lo, hi] = visibleSpan(f)
      assert.ok(l >= lo - 1e-9 && r <= hi + 1e-9, `FY2025 painted [${l}, ${r}] outside [${lo}, ${hi}]`)
    }
  }
  // Wider than everything there is: absent beats a partial number.
  assert.equal(placeTickLabel(0, 'x'.repeat(200), NARROW), null)
})

test('tickLabelOverlaps is silent on the shipped year axis and loud on a dense one', () => {
  // /households ships 1920 … 2020 across the narrow plot.
  const years = [1920, 1940, 1960, 1980, 2000, 2020]
  const x = linear([1913, 2025], [0, NARROW.innerWidth])
  assert.deepEqual(tickLabelOverlaps(years, calendarYear, x, NARROW), [])

  // Every decade in the same room cannot fit: 12 labels of 27.3 units each
  // against 296.
  const decades = Array.from({ length: 12 }, (_, i) => 1910 + i * 10)
  const clashes = tickLabelOverlaps(decades, calendarYear, x, NARROW)
  assert.ok(clashes.length > 0, 'a decade-per-tick axis at 360 units was reported as clear')
  assert.deepEqual(clashes[0], ['1910', '1920'])

  // The same set has room at 720, and more of it at 1120.
  const wideX = linear([1913, 2025], [0, WIDE.innerWidth])
  assert.deepEqual(tickLabelOverlaps(decades, calendarYear, wideX, WIDE), [])
  const widerX = linear([1913, 2025], [0, WIDER.innerWidth])
  assert.deepEqual(tickLabelOverlaps(decades, calendarYear, widerX, WIDER), [])
  // Every year from 1913 is 113 labels over 1000 units, which no preset holds.
  const everyYear = Array.from({ length: 113 }, (_, i) => 1913 + i)
  assert.ok(
    tickLabelOverlaps(everyYear, calendarYear, widerX, WIDER).length > 0,
    'a label-per-year axis at 1120 units was reported as clear',
  )
})

// ---------------------------------------------------------------------------
// Start-anchored panel titles, and the variant ladder.
// ---------------------------------------------------------------------------

test('spanRoomAt measures from the reference point to the SVG edge, per anchor', () => {
  const [lo, hi] = visibleSpan(NARROW)
  assert.equal(spanRoomAt(0, NARROW, 'start'), hi)
  assert.equal(spanRoomAt(0, NARROW, 'end'), -lo)
  assert.equal(spanRoomAt(0, NARROW, 'middle'), 2 * Math.min(-lo, hi))
  assert.equal(spanRoomAt(1000, NARROW, 'start'), 0, 'room is never negative')

  // The same three identities at the 1120 preset, whose span is [-86, 1030].
  const [wLo, wHi] = visibleSpan(WIDER)
  assert.equal(spanRoomAt(0, WIDER, 'start'), wHi)
  assert.equal(spanRoomAt(0, WIDER, 'end'), -wLo)
  assert.equal(spanRoomAt(0, WIDER, 'middle'), 2 * Math.min(-wLo, wHi))
  assert.equal(spanRoomAt(2000, WIDER, 'start'), 0, 'room is never negative')
})

test("BracketHistory's panel titles pick a variant that fits the narrow panel", () => {
  const room = spanRoomAt(0, BRACKETS_NARROW, 'start')
  assert.equal(room, 298, 'a 360-wide chart with a 60-unit left margin leaves 298 units')

  const ladders = [
    [
      'Top statutory rate vs. schedule ladder top, percent',
      'Top rate vs. schedule ladder, percent',
      'Top rate, percent',
    ],
    ['Bracket count, single filer'],
    [
      'Top-bracket threshold, constant 2024 dollars (log scale)',
      'Top-bracket threshold, 2024 dollars (log)',
      'Top bracket, 2024 $ (log)',
    ],
  ]
  for (const ladder of ladders) {
    const narrowPick = firstThatFits(ladder, room, AXIS_TITLE_FONT_PX)
    assert.ok(narrowPick, `no variant of "${ladder[0]}" fits ${room} units`)
    assert.ok(estimateTextWidth(narrowPick, AXIS_TITLE_FONT_PX) <= room)
    // At 720 the longest one is chosen, so nothing is abbreviated that need not be.
    const wide = frame(720, 470, BRACKETS_NARROW.margin)
    assert.equal(firstThatFits(ladder, spanRoomAt(0, wide, 'start'), AXIS_TITLE_FONT_PX), ladder[0])
  }
})

test("HouseholdSpread's panel titles pick a variant that fits the narrow panel", () => {
  const room = 360 - NARROW.margin.left - 2
  assert.equal(room, 306)
  const ladder = [
    'Top 1% share of income before transfers and taxes',
    'Top 1% share of pre-tax, pre-transfer income',
    'Top 1% income share',
  ]
  assert.equal(firstThatFits(ladder, room, AXIS_TITLE_FONT_PX), ladder[1])
  assert.equal(firstThatFits(ladder, 720 - WIDE.margin.left - 2, AXIS_TITLE_FONT_PX), ladder[0])
  assert.equal(firstThatFits(['Families Gini index'], room, AXIS_TITLE_FONT_PX), 'Families Gini index')
})

test("DebtHolders' variant ladders survive three different segment splits (E6)", () => {
  // The foreign share moves with every Treasury release, so a fix keyed on
  // today's segment widths would regress on the next refresh. Place the same
  // ladder at three split ratios and require a whole label or none, never a
  // truncated one, and never two boxes that overlap on one bar row.
  const ladder = (amount: string) => [
    `Foreign ${amount} (30% of publicly held debt, 24% of gross debt)`,
    `Foreign ${amount}`,
    amount,
  ]
  for (const split of [0.3, 0.7, 0.94]) {
    const innerWidth = NARROW.innerWidth
    const leftCentre = (innerWidth * split) / 2
    const rightCentre = innerWidth * split + (innerWidth * (1 - split)) / 2
    const centreGap = rightCentre - leftCentre
    const budget = Math.min(centreGap, spanRoomAt(rightCentre, NARROW, 'middle'))
    const picked = firstThatFits(ladder('$9.64T'), budget, AXIS_LABEL_FONT_PX)
    if (picked !== null) {
      assert.ok(
        estimateTextWidth(picked, AXIS_LABEL_FONT_PX) <= budget,
        `split ${split}: "${picked}" exceeds its ${budget.toFixed(1)}-unit budget`,
      )
      // Fitting the centre gap is what makes a row-mate collision impossible.
      assert.ok(estimateTextWidth(picked, AXIS_LABEL_FONT_PX) <= centreGap)
    }
  }
  // A budget below even the shortest rung yields null, and the caller renders
  // nothing. Absent beats truncated (#64), and beats overlapping (#66).
  assert.equal(firstThatFits(ladder('$9.64T'), 10, AXIS_LABEL_FONT_PX), null)
})

// ---------------------------------------------------------------------------
// The rotated axis title, length on the vertical axis (E7).
// ---------------------------------------------------------------------------

test('the rotated axis title is measured against the SVG height, not its width', () => {
  assert.equal(rotatedTitleFits('Percent of GDP', NARROW), true)
  // 48 characters at 10.5px is 312 units: fine across a 720-wide chart, and
  // impossible down a 316-unit one. A horizontal-only walk cannot see this.
  const long = 'Top 1% share of income before transfers and taxes'
  assert.equal(estimateTextWidth(long, AXIS_TITLE_FONT_PX) > NARROW.height, true)
  assert.equal(rotatedTitleFits(long, NARROW), false)
  assert.equal(rotatedTitleFits(long, WIDE), true)
  // 520 units of height give the 1120 preset the most room of the three, so a
  // title that fits WIDE fits WIDER as well.
  assert.equal(rotatedTitleFits(long, WIDER), true)
  assert.ok(WIDER.height > WIDE.height && WIDE.height > NARROW.height)
})

test('every rotated axis title the site ships fits all three presets', () => {
  // Frame heights are the islands' own: most take useChartSize's height, while
  // WhoWorks' and PricesAndRates' lower panels are 0.66 of it and
  // HouseholdSpread pins two fixed heights per breakpoint.
  //
  // The third column is the 1120 preset. 520 is useChartSize's own height,
  // 343 is `Math.round(520 * 0.66)`, and HouseholdSpread's two panels repeat
  // their wide numbers because it keys those on `narrow`, not on the preset.
  const panels: Array<[string, number, number, number]> = [
    ['Real GDP, $ trillions, log scale', 396, 316, 520],
    ['Index, 1984 = 100', 396, 316, 520],
    ['Percent of the labour force', 396, 316, 520],
    ['Percent of the population 16+', 261, 209, 343],
    ['Percent change from the previous fiscal year', 396, 316, 520],
    ['Percent per year', 261, 209, 343],
    ['Percent of GDP', 396, 316, 520],
    ['$ trillions', 396, 316, 520],
    ['Nominal dollars', 396, 316, 520],
    ['Real dollars, FY2025', 396, 316, 520],
    ['Nominal $ trillions', 396, 316, 520],
    ['Real $ trillions, FY2025', 396, 316, 520],
    ['Coalition', 396, 316, 520],
    ['Signing president', 396, 316, 520],
    ['Constant 2024 dollars', 396, 316, 520],
    ['Families Gini index, ratio 0 to 1', 260, 240, 260],
    ['Percent of income', 200, 190, 200],
    ['Percent', 396, 316, 520],
    ['Percent of income tax paid', 396, 316, 520],
  ]
  for (const [label, wideH, narrowH, widerH] of panels) {
    for (const [h, margin] of [
      [wideH, WIDE.margin],
      [narrowH, NARROW.margin],
      [widerH, WIDER.margin],
    ] as const) {
      const f = frame(360, h, margin)
      assert.ok(
        rotatedTitleFits(label, f),
        `"${label}" needs ${estimateTextWidth(label, AXIS_TITLE_FONT_PX).toFixed(1)} units ` +
          `down a ${h}-unit SVG, which has ${f.height - 4}`,
      )
      // And the placement really keeps the whole box inside the SVG.
      const y = placeAxisTitleY(label, f) + margin.top
      const half = estimateTextWidth(label, AXIS_TITLE_FONT_PX) / 2
      assert.ok(
        y - half >= -1e-9 && y + half <= h + 1e-9,
        `"${label}" paints [${(y - half).toFixed(1)}, ${(y + half).toFixed(1)}] in a ${h}-unit SVG`,
      )
    }
  }
})

test('placeAxisTitleY leaves a title that already fits on the plot centre', () => {
  assert.equal(placeAxisTitleY('Percent of GDP', WIDE), WIDE.innerHeight / 2)
  assert.equal(placeAxisTitleY('Percent of GDP', NARROW), NARROW.innerHeight / 2)

  // A short panel has asymmetric margins, 50 below against 22 above at the 360
  // preset, so its plot centre sits well above the SVG centre and a long title
  // runs off the TOP. It shifts down by the minimum, and no further.
  const short = frame(360, 240, NARROW.margin)
  const label = 'Families Gini index, ratio 0 to 1'
  const half = estimateTextWidth(label, AXIS_TITLE_FONT_PX) / 2
  const y = placeAxisTitleY(label, short)
  assert.ok(y > short.innerHeight / 2, 'the title should have moved down')
  assert.ok(Math.abs(y + short.margin.top - (2 + half)) < 1e-9, 'it moved further than it had to')
})
