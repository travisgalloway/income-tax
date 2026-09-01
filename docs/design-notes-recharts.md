# Recharts 3.10.1, measured against the site's own chart layer

This note records a rebuild of Government Figure 1 on Recharts 3.10.1. The rebuild lives at
`src/components/islands/demo/DebtChartRecharts.tsx`. The original lives at
`src/components/islands/DebtChart.tsx` and draws the same rows with d3-shape inside
`src/components/charts/Chart.tsx`. Every number below was measured in this repository on
2026-08-29, not estimated.

## What was rebuilt

The rebuild reproduces the whole figure. It carries the nominal and percent-of-GDP toggle, the
d3 `monotone` curve, the filled area, the two annotated markers with leader lines, the per-year
focusable marks, the live readout, and the `TableView`. It reuses the site's `UnitToggle`,
`TableView`, `Annotation`, `ChartHint`, `useChartSize`, `useRovingMarks`, `format.ts` and
`scales.ts` unchanged. It introduces no new colour value, and paints from `var(--ink)`,
`var(--mand)`, `var(--rule)`, `var(--panel)` and `var(--ink-soft)`.

Rendered output matches the original closely. At 1200 px and at 390 px both charts occupy the
same box, place the same 12 and 8 axis labels, clip no tick text, and print the same two
annotations. The one visible difference is the bottom axis title, which Recharts places 15 px
lower than `AxisBottom` does.

## Measurement method

Two Astro projects were built from identical copies of `src/`, differing only in whether the
Recharts island and a page rendering it were present. Building in copies removed the other
design-proposal branches in progress, whose own probe pages move Vite's shared-chunk boundaries.
Sizes are the sum over every `.js` file in `dist/_astro`, raw and after `gzip -9`.

## Bundle cost

Adding one Recharts figure adds 285,267 bytes of JavaScript, or 81,546 bytes gzipped. Table 1
gives the whole-site totals behind that delta.

Table 1. Total JavaScript in `dist/_astro`, in bytes, for the same site with and without one
Recharts figure. Source: two Astro builds from identical `src/` copies, 2026-08-29.

| Build | Chunks | Raw | Gzipped |
|---|---|---|---|
| Site as it stands | 53 | 879,422 | 257,927 |
| Site plus one Recharts figure | 55 | 1,164,689 | 339,473 |
| Delta | +2 | +285,267 | +81,546 |

The island chunks give the same result at closer range. Table 2 sets the two figures side by side.

Table 2. Island chunk size, in bytes. The Recharts chunk carries Recharts, Redux Toolkit and the
island; the d3 pieces both islands use sit in separate shared chunks. Source: the same two builds.

| Chunk | Raw | Gzipped |
|---|---|---|
| `DebtChart` (d3-shape) | 3,631 | 1,703 |
| `DebtChartRecharts` | 284,175 | 81,015 |

The Recharts chunk is 78 times the raw size of the island it replaces, and 48 times the gzipped
size. For context, the shared chunk holding d3-array, d3-scale and the whole
`src/components/charts/` layer is 20,321 bytes raw, and all 25 figures on the site draw from it.

## Server rendering

**Recharts 3.10.1 renders no `<svg>` on the server, and explicit `width` and `height` do not
change that.** The rebuilt figure's built page contains a `<div class="recharts-wrapper">` and
nothing inside it. Table 3 counts what each page ships before any JavaScript runs.

Table 3. Markup present in the built HTML, counted with a substring count over the file.
Source: `dist/recharts-probe/index.html` and `dist/government/index.html`, same build.

| Built page | `<svg` | `data-mark` | `axis-label` |
|---|---|---|---|
| The Recharts figure | 0 | 0 | 0 |
| `/government`, 14 figures | 14 | 369 | 121 |

The same result holds on `/design`, built from `src/pages/design.astro`. `grep -o '<svg'
dist/design/index.html | wc -l` returns 6 for a page carrying seven figures, and the missing one
is the Recharts figure. Reading the file around its `recharts-wrapper` shows
`<div width="720" height="396" class="recharts-wrapper" style="position:relative;cursor:default;
width:100%;height:auto;aspect-ratio:720 / 396"></div>`, with no child node.

After hydration the surface is correct and carries `viewBox="0 0 720 396"`, so it scales to a
390px column rather than overflowing it. That was read from the live DOM on the built `/design`
page in Chromium.

The cause is in `recharts/es6/context/chartLayoutContext.js`. `ReportChartSize` dispatches the
chart's width and height from a `useEffect`, and effects do not run during `renderToString`. The
store therefore still holds `width: 0` when `MainChartSurface` reads it, and that component
returns `null` for a non-positive width. No prop reaches past this, because `CartesianChart`
hardcodes the store's `preloadedState` to the chart's options and does not accept a size.

This alone fails
`pipeline/tests/test_accessibility.py::test_every_figure_server_renders_its_chart_svg`, which
reads `dist/` and asserts a real `<svg>` inside every `<figure class="figure">`. It also fails
`test_each_chart_svg_offers_exactly_one_tab_stop` and
`test_government_section_1_renders_its_whole_apparatus_without_scripting`, for the same reason.
A reader with scripting off, or on a slow connection before hydration, gets no chart, no axis
units, no tick text and no focusable marks.

## Line count

The Recharts island is longer than the one it replaces. Table 4 counts both files.

Table 4. Lines in each island. Code lines exclude blank lines and comment lines.
Source: `src/components/islands/DebtChart.tsx` and
`src/components/islands/demo/DebtChartRecharts.tsx`.

| File | Total lines | Code lines |
|---|---|---|
| `DebtChart.tsx` | 183 | 143 |
| `DebtChartRecharts.tsx` | 355 | 247 |

The extra 104 code lines are not chart description. They are the memoisation the next section
explains, the wrapper that carries the event handlers Recharts strips, the hand-drawn marker
overlay, and the props that switch off axis lines, tick lines, animation and the active dot.

## Keyboard and screen-reader behaviour

The site's roving-tabindex model survives, and reaching it took two undocumented rules that
point in opposite directions.

Tab stops divide cleanly. Table 5 counts the focusable elements inside each figure on the built
`/design` page, once with scripting disabled and once after hydration.

Table 5. Tab stops per figure, counted over `a[href], button, summary, [tabindex]` with
`tabindex="-1"` excluded. Both figures draw the same debt series at the same preset.
Source: `dist/design/index.html` in Chromium, 2026-08-29.

| Figure | Scripting off | Hydrated | Chart marks | Marks at `tabindex="0"` |
|---|---|---|---|---|
| `DebtChart`, the current island | 4 | 5 | 32 | 1 |
| `DebtChartRecharts` | 3 | 5 | 32 | 1 |

Hydrated, the two are identical. Each figure spends one stop on the unit toggle, one on the whole
chart, one on the table disclosure and two on the caption's source links. With scripting off the
Recharts figure has one stop fewer, and the missing stop is the chart itself, because there are no
marks to enter.

What survives, verified in Chromium against the built page:

- One Tab stop per chart. Exactly one mark carries `tabindex="0"` and 31 carry `tabindex="-1"`.
- Arrow keys, Home and End move focus between marks in data order, and clamp at both ends.
- The roving `tabindex="0"` follows focus, so Tab re-entry lands on the last mark visited.
- Each mark keeps `role="img"` and an `aria-label` naming its fiscal year and its value.
- The `aria-live` readout, the focused mark's `aria-label`, and the hover state all report the
  same text through the same `onFocus` handler.
- The touch path in `roving.ts` still applies, because `groupProps`' pointer handlers reach the
  marks by bubbling.

What had to be worked around:

1. **The chart's `<svg>` accepts no event handlers.** `recharts/es6/util/svgPropertiesNoEvents.js`
   filters the chart's prop bag down to SVG attributes and drops every handler. `role`,
   `aria-label` and `data-*` pass through, and `ref` reaches the surface. So `groupProps`' seven
   handlers sit on a wrapper `<div class="chart">` and catch the same events by bubbling, and
   `data-roving` sits there too, where the `[data-roving] [data-mark]:focus` rule still matches.
2. **Every prop passed to an axis must keep its reference between renders.** A fresh `ticks`
   array, or a `tickFormatter` written inline, makes Recharts unmount and remount the `<Area>`
   graphical item. The remount destroys the focused `<circle>`, focus falls back to `<body>`, and
   the roving group answers one arrow press and then nothing. The failure was bisected in a
   browser over a 10-point chart. Passing `domain` alone is safe. Passing `ticks` alone
   reproduces it, and so does `tickFormatter` alone. Hoisting the same values to a stable
   reference clears it.
3. **The `dot` renderer must NOT keep its reference.** With the axis props stabilised and the dot
   renderer wrapped in `useCallback([])`, `<Area>` receives identical props, React bails out of
   its subtree, and the marks never re-render. Measured over four arrow presses, the focused
   point never grew, and the roving `tabindex="0"` stayed on mark 0 throughout, while the readout
   and the `aria-label`s kept working. The visible and the announced state disagreed silently.

Rules 2 and 3 are the same mechanism read from both sides, and neither appears in the Recharts
documentation. Both are invisible to type checking and to a static test. A future edit that
inlines one formatter reintroduces rule 2, and the page still looks correct to a mouse user.

Three smaller costs are worth recording. Recharts' own `accessibilityLayer` is switched off here,
because it puts `tabindex="0"` and `role="application"` on the surface and drives an arrow-key
cursor through a `Tooltip` this figure does not render. `role="application"` also takes a screen
reader out of browse mode, which is a heavier claim than a chart with labelled marks needs. The
surface always emits an empty `<title>` and an empty `<desc>`, because
`recharts/es6/container/Surface.js` renders both unconditionally; `aria-label` wins the accessible
name computation, so the effect is markup noise rather than a naming bug. Finally, the wrapper
`<div>` receives `width="720"` and `height="396"` as HTML attributes, which are not valid on a
`<div>`.

## Annotation control

`BRIEF.md` rejects charting libraries partly because they "fight you on axis labels, annotation
placement and dual-panel layouts". The claim holds for annotation placement and does not hold for
axis labels.

Axis labels were straightforward. `label={{ value, position, className, fill }}` on each axis
renders the unit text, takes the site's `.axis-title` class, and lands inside the SVG at both
presets. The bottom title sits 15 px lower than `AxisBottom` places it, which an `offset` would
correct.

Annotation placement is not expressible. `src/components/charts/annotate.ts` requires that a
label too wide for the SVG be **absent**, because a truncated number reads as a whole number, and
`placeAnnotation` returns `null` for that case. Recharts has no equivalent. Its `Text` component,
which every `Label` renders through, offers two behaviours. Given `width` and `maxLines` it
truncates and appends an ellipsis. Given neither it draws the full string and lets the viewBox
clip it. Neither is "render nothing".

The measurement path differs as well. `annotate.ts` is pure, so the server render and the hydrated
render place a label identically and nothing shifts under the reader. Recharts measures text by
appending a hidden `<span>` to `document.body` and reading `getBoundingClientRect`
(`recharts/es6/util/DOMUtils.js`), which has no server-side answer.

So the two markers in the rebuild are hand-drawn SVG children wrapped in `<ZIndexLayer>`, using
the site's own `Annotation` and its clamp. The wrapper is required rather than tidy. A plain child
renders at z-index 0 and the `<Area>` fill paints over it at 100.

The clamp still places labels through that route, at both presets. At 1200px both figures print
`FY2016 $19.57 trillion` and `FY2026 $40.05 trillion`, and at 390px both print the narrow forms
`FY2016 $19.6T` and `FY2026 $40.0T`. No label was suppressed, and no tick text was clipped in
either chart at either width.

Two further primitives had to be reached for by hand. The plot rectangle that `Chart.tsx` paints
in `var(--panel)` is expressed as `fill` on `<CartesianGrid>`, because a hand-drawn first-child
`<rect>` covers the gridlines, which render into a z-index portal at -100 that is appended before
every plain child. The chart's own box is fixed at the pixel width and height passed in, so
`style={{ width: '100%', height: 'auto', aspectRatio }}` is needed on the wrapper or the figure
overflows a narrow column.

Dual-panel layouts were not tested, because Figure 1 has one panel.

## Verdict

**Do not adopt.** The blocking reason is server rendering. Recharts 3.10.1 renders no `<svg>`
during `renderToString`, and the site's accessibility contract makes a server-rendered chart
structural rather than preferred. Three pytest guards read `dist/` and fail on this, and no prop
or configuration reaches the store value that causes it. Adopting Recharts would mean either
deleting those guards or shipping a second, hand-built SVG for the server, which is the code the
library was meant to replace.

The bundle cost would be disqualifying on its own. One figure costs 81,546 gzipped bytes against
1,703 for the island it replaces. The site draws 25 figures from a 20,321-byte shared chart layer.

The keyboard result is the most interesting one, and it does not change the verdict. Full parity
with `roving.ts` is reachable, and it depends on two undocumented reference-identity rules that
push in opposite directions. Both fail silently, both survive type checking, and one of them
leaves the readout correct while the visible chart and the tab order are wrong. That is a
maintenance cost on every future edit to the file.

`BRIEF.md`'s specific charge is half right. Recharts 3 does not fight axis labels. It has no
answer at all for the annotation contract this site holds itself to, and its escape hatch is to
draw the annotation by hand, which is where the site already is.
