# Design note: nivo 0.99 measured against the site's chart layer

This note records one experiment. Government §1's debt figure
(`src/components/islands/DebtChart.tsx`) was rebuilt on nivo 0.99 as
`src/components/islands/demo/DebtChartNivo.tsx`. Every number below comes from a
build or from a browser run. The method is stated beside each one.

## Verdict

Do not adopt nivo, for any chart type on this site.

Three measurements decide it. The library adds 90,253 gzipped bytes to the one
page that carries the chart. Its `<svg>` carries no `viewBox`, so the chart
overflows a 390-px viewport by 396.8 px. Its keyboard model puts 33 Tab stops in
this single figure, and issue #69 exists to remove exactly that.

Reaching parity also cost four custom layers plus a gradient definition. At that point
nivo draws four things, being the line, the area, the grid and the axis ticks.
This repository's own code draws everything else. The four displaced primitives are
`Chart.tsx`, `Axis.tsx`, `Annotation.tsx` and `roving.ts`. All four are written
and tested, and together they weigh under 4 KB gzipped.

## Method

Two full site builds ran from identical sources. The first carried a temporary
page rendering `DebtChart` alone. The second carried that page plus a second
page rendering `DebtChartNivo`. Both pages mounted their island `client:visible`.
Both builds wrote to their own output directory, and the temporary pages were
deleted afterwards.

Raw sizes come from the built files. Gzipped sizes come from Python's `gzip` at
level 9, which matches `gzip -9 -c file | wc -c`. Browser numbers come from
Playwright driving Chromium against a static server holding the second build.

## Bundle cost

Table 1 gives the JavaScript each page must fetch. The closure starts at the
chunks the built HTML references and follows every static import between chunks.

Table 1. JavaScript per page, in bytes, from the second build.

| Page | Chunks | Raw | Gzipped |
|---|---|---|---|
| `DebtChart`, the current d3 island | 22 | 257,160 | 88,001 |
| `DebtChartNivo` | 20 | 539,117 | 178,254 |
| Difference | -2 | +281,957 | +90,253 |

Both closures include the 180,631-byte React runtime, which is shared and is not
attributable to either chart. Set against the chart work alone, nivo more than
triples the download.

The whole-site totals agree. Summing `dist/_astro/*.js` gives 879,336 raw and
257,914 gzipped without the nivo page, and 1,165,801 raw and 350,644 gzipped
with it. The site-wide delta is 286,465 raw and 92,730 gzipped.

Table 2 compares the two island chunks directly. Vite inlines nivo's packages into the island's own chunk. The number therefore
measures the library and not the island's source.

Table 2. Island chunk size, in bytes.

| Chunk | Raw | Gzipped |
|---|---|---|
| `DebtChart.lqGP5jjt.js` | 3,667 | 1,719 |
| `DebtChartNivo.CvgS6FDO.js` | 284,438 | 91,783 |

### react-spring

`@react-spring/web` reaches the shipped bundle, and disabling animation does not
remove it. The built chunk contains its `SpringValue` and
`createStringInterpolator` symbols. `@nivo/line` imports `useSpring` and
`animated` at module scope, so no prop can shake them out.

Its weight was measured by bundling `@nivo/line` twice with esbuild, minified,
with React external. The first bundle included `@react-spring/web` and the
second marked it external. The difference is 45,958 raw and 18,145 gzipped.
Bundled on its own, `@react-spring/web` is 42,798 raw and 17,229 gzipped.

One more dependency arrives unused. `@nivo/voronoi` and its d3-delaunay
triangulation ship even though the rebuild requests no mesh layer and passes
`isInteractive={false}`. The cause is again a module-scope import in
`@nivo/line`.
The same external-versus-bundled method puts them at 28,192 raw and 9,679
gzipped.

## Server rendering

The chart server-renders in full, and this was verified against the built HTML
rather than inferred. The temporary page's built HTML holds one `<svg>`. Inside it sit the area path and the line path. Five grid lines, seven x tick
labels and five y tick labels sit there too. Both
axis legends, both end-point annotations, the gradient definition and 32
focusable data marks sit there too. The file is 29,706 bytes, and it needs no
scripting to show any of that.

Two conditions make this work. The rebuild uses the non-responsive `Line`
component with `width={720}` and `height={396}`, and the island mounts
`client:visible`. `ResponsiveLine` cannot serve here. It measures the client through
`react-virtualized-auto-sizer`, so it has no size to draw at on the server.

The rendered `<svg>` opens as follows.

```html
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="396" role="group"
     aria-label="Total US public debt outstanding at each fiscal year end …"
     focusable="false">
```

### The missing viewBox

nivo writes `width` and `height` attributes and no `viewBox`, so the chart does
not scale to its container. The site's `.chart` rule sets `width: 100%` and `height: auto`. On a
`viewBox`-less `<svg>` those resize the viewport and leave the content at its
original user units.

The consequence was measured in Chromium at a 390-px viewport, with the `.chart`
declarations applied to each `<svg>`. Table 3 gives the result. The nivo chart's
last mark sits 396.8 px outside the box that holds it.

Table 3. Layout at a 390-px viewport, in CSS pixels, after applying `.chart`.

| Chart | `<svg>` box width | Right edge of last mark | Last mark inside the box |
|---|---|---|---|
| `DebtChart` | 294.0 | 339.5 | yes |
| `DebtChartNivo` | 294.0 | 690.8 | no |

Nothing in nivo's props adds a `viewBox`. Adding one after hydration would leave
the served HTML wrong, which is the failure `useChartSize` was written to avoid.

## Line count

`DebtChart.tsx` is 183 lines. `DebtChartNivo.tsx` is 281 lines. The rebuild is
98 lines longer, a rise of 53.6%.

The extra lines are the four workarounds. A custom layer paints the plot panel,
because `theme.background` covers the whole `<svg>` including the margins. A
second layer draws the two end-point annotations, because nivo's `markers` prop
draws a full-height rule with a corner label. A third layer draws the focusable
marks. The fourth workaround is a two-stop gradient, described below.

## Keyboard and screen-reader behaviour

Behaviour survived in full, and it survived because the site's own hook was wired
in by hand. Playwright measured both pages and they agree. Table 4 records the
run.

Table 4. Chromium measurements, both pages, after hydration.

| Measurement | `DebtChart` | `DebtChartNivo` |
|---|---|---|
| Data marks | 32 | 32 |
| Marks at `tabindex="0"` | 1 | 1 |
| Tab stops on the page | 3 | 3 |
| Readout after two right arrows | `FY1997: $5.41 trillion` | `FY1997: $5.41 trillion` |
| `data-roving` set after an arrow key | yes | yes |
| Readout on hovering mark 6 | `FY2000: 56.1% of GDP` | `FY2000: 56.1% of GDP` |

### Where nivo's own model conflicts

nivo's `isFocusable` prop contradicts the roving-tabindex rule in
`docs/contracts/interfaces/charts.md`. The rebuild was compiled once with `isFocusable`, `enablePoints` and nivo's own
`points` layer, then counted in the built HTML. The served `<svg>` carried 33
elements at `tabindex="0"`. Those are the 32 points plus the `<svg>` itself,
against one in the site's model.

Three mechanics cause it, and none is configurable.

- `DotsItem` in `@nivo/core` writes `tabIndex={isFocusable ? tabIndex : undefined}`
  with `tabIndex` defaulting to 0. `Points` in `@nivo/line` passes no `tabIndex`,
  so every point takes 0.
- `SvgWrapper` writes `tabIndex={isFocusable ? 0 : undefined}` on the `<svg>`
  itself, which adds the thirty-third stop.
- nivo binds no arrow, `Home` or `End` handler. The points form a flat Tab
  sequence with no traversal inside the group.

The rebuild therefore sets `isFocusable={false}` and `enablePoints={false}` and
draws its marks in a custom layer, spreading `{...mark()}` from `useRovingMarks`.

### Wiring the roving group into nivo

The hook returns `groupProps`, which belong on the chart `<svg>`. nivo accepts a
forwarded `ref` and nothing else. The `ref` reaches the `<svg>` through
`Line`, so `marks()` finds the `[data-mark]` nodes. The eight event handlers have no route in. `Line` exposes no `onKeyDown`,
`onFocusCapture`, `onPointerDown` or `onMouseDown` prop for the wrapper.

The rebuild puts those handlers on a host `<div>` around the chart. Keyboard,
focus and pointer events all bubble from the `<svg>` to it, so the mechanism
works. Two costs follow. The handler types are declared for `SVGSVGElement` and
need a cast at the boundary. `e.currentTarget` inside the pointer handlers is now
the `<div>`, which still answers `setPointerCapture` and `hasPointerCapture`.

`SvgWrapper` also accepts no `className` and no `style`, so no stylesheet rule
can select nivo's `<svg>` element. The rebuild puts `.chart` on the wrapping
`<div>` instead. The descendant rules still match from there. Those include
`.chart [data-mark] { pointer-events: none }` under `@media (hover: none)` and
`[data-roving] [data-mark]:focus`. The touch path from issue #73 therefore keeps
working.

The rules written for the element itself now land on a `<div>` instead.
`touch-action: pan-y` is one of them.

### Roles

`role` is a plain prop, so the rebuild passes `role="group"` as the contract
requires for a chart with focusable marks. nivo defaults it to `img`, which is
wrong for any chart using its own `isFocusable`. Each mark keeps `role="img"` and
its own `aria-label`, written by the island rather than by nivo.

## Theming

A `var(--token)` survives nivo's theme object on every path this chart uses. The
theme is copied into SVG presentation attributes and into inline styles, and a
CSS variable resolves in both. The following came out of the built HTML.

```html
<rect width="622" height="324" fill="var(--panel)">
<line x1="0" x2="622" y1="324" y2="324" stroke="var(--rule)" stroke-width="0.5">
<text … style="font-family:var(--font-data);font-size:11px;fill:var(--ink-soft)">
<path d="…" fill="none" stroke-width="2" stroke="var(--ink)">
<stop offset="0%" stop-color="var(--mand)" stop-opacity="1">
```

No literal hex value appears in `DebtChartNivo.tsx`. The single-source rule in
`src/styles/tokens.css` holds for colour.

Three places refuse a CSS variable, and one of them was hit.

- Any `InheritedColorConfig` carrying modifiers goes through d3-color.
  `color('var(--ink)')` returns `null`, and calling `.darker(0.3)` on the result
  throws. This rules out `pointColor`, `pointBorderColor` and every
  `{ from: …, modifiers: […] }` form.
- `LineCanvas` assigns `theme.background` to `ctx.fillStyle`, which cannot
  resolve a variable. The canvas renderer is unusable with these tokens.
- nivo writes no `className` on axis text, so `.axis-label` and `.axis-title` do
  not apply. Their `font-family`, `font-size`, `fill`, `font-variant-caps` and
  `letter-spacing` had to be restated inside the theme object. The values still
  read from tokens, so this duplicates `global.css` rather than `tokens.css`.

`sanitizeSvgTextStyle` in `@nivo/theming` drops keys it does not recognise. It
keeps `fontFamily`, `fontSize`, `fill`, `fontVariantCaps` and `letterSpacing`,
and it strips `outlineWidth`.

### The area fill

nivo paints the area in the series colour. A `--mand` area under an `--ink` line
is therefore unreachable through `colors`, `areaOpacity` or any related prop. The `Areas` layer reads `series.fill` first and falls back to `series.color`.
Only the `defs` and `fill` matching API sets `series.fill`.

The rebuild declares a linear gradient whose two stops carry the same token, then
matches it to every series. The area renders as
`fill="url(#nivo-debt-area)" fill-opacity="0.16"` and the line keeps
`stroke="var(--ink)"`, which is parity. A gradient standing in for a flat colour
is a workaround, and it is the only route nivo offers.

## Motion

nivo animates by default through react-spring, and `animate={false}` stops it.
This was checked in Chromium by switching the unit and sampling the area path's
`d` attribute across five frames. The five samples were identical, and they
differed from the pre-switch value, so the path jumped rather than tweened.

The default is a problem for this site, for a reason beyond taste. The
`prefers-reduced-motion` block in `global.css` overrides `animation-duration` and
`transition-duration`, which are CSS properties. react-spring animates by writing
inline styles from a `requestAnimationFrame` loop, and that block cannot reach
it. Any nivo chart left at the default would animate for a reader who asked for
no motion.

Two further points follow. `animate={false}` must be written on every nivo chart,
and nothing in the repository would fail if one omitted it. Reading `matchMedia('(prefers-reduced-motion: reduce)')` instead is a
client-only call. Using its result during render would make the server and the
client disagree.

## What nivo still does

The rebuild leaves nivo four jobs. It computes the scales, draws the line, draws
the area and draws the grid and the axes. The axis legends work well, take the
unit string directly and satisfy the no-bare-axis rule without argument.

Everything else in the figure is this repository's code, unchanged. That covers the unit toggle, the table view, the hint sentence and the live
readout. It also covers the annotations, the plot panel, the focusable marks and
the roving group.
