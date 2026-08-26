# Contract: accessibility (`docs/contracts/accessibility.md`)

Issue #15's audit found `main` shipping only the shared layer plus Government §1, with the other
eleven sections still open as PRs #16–#28. All of them have since merged, and #30 has since walked
the site in a browser. This contract now has three parts: the conventions every section must satisfy
(enforced, where provable, by `pipeline/tests/test_accessibility.py`); the **manual pass results**,
one row per check per route with the browser or assistive technology used; and the manual checklist
itself, each item carrying its own executed / not-executed state.

## Conventions

**Every chart `aria-label` states the finding, not the shape.** "Line chart showing debt over
time" fails: no digit, and it opens with a shape word. "Debt doubled in ten fiscal years, from
$19.57 trillion at the close of FY2016 to $40 trillion in August 2026" passes. Enforced by
`test_every_chart_svg_states_a_finding`, which encodes this exact worked example.

**A chart's `<svg>` is `role="img"` when static, `role="group"` when it has Tab-focusable data
points.** Assistive tech treats a `role="img"` subtree as presentational, so a chart with
keyboard-reachable points that keeps `role="img"` has focusable children that go unannounced.
`Chart.tsx`'s `interactive` prop is the switch. Enforced by
`test_focusable_data_points_are_labelled_and_grouped`.

**Every figure has an accessible name, and it is the finding.** `Figure.astro`'s `ariaLabel` prop
renders as the `<figure>`'s own `aria-label`, in addition to the `<svg>`'s. The two are
deliberately the same sentence — a figure with no name announces as bare "figure", the worse
failure. Enforced by `test_every_figure_has_an_accessible_name`.

**Every `<TableView>` is a native `<details>`/`<summary>` disclosure, present in the
server-rendered HTML with scripting off.** Not a component that unmounts its content while closed.
The open/close label swaps via `.tableview[open] .tv-open`/`.tv-close` CSS, never a `useState`
read. Enforced by `test_every_chart_has_a_real_table_in_the_static_html`.

**Every `Column` names a unit.** A bare-number table column is a bug (`TableView.tsx`'s `Column`
type has no optional escape hatch).

**One live region per chart, built from the same formatter the datum `aria-label` uses.** Hover and
keyboard focus must announce identical text, and a chart must not carry more live regions than it
has data series. Enforced (the count half only —
`test_live_regions_do_not_outnumber_charts`; *whether it announces once per focus move, not once
per data point, is a runtime property no static check can observe — see the manual checklist*).

**Two named `<nav>` landmarks, not one.** The route list (`aria-label="Site"`) and the section
contents list (`aria-labelledby="toc-heading"`) are separate landmarks. "Contents" is a `<p
id="toc-heading">`, not a heading — the rail precedes `<main>` in document order, and a heading
there would outrank the page's `<h1>`. Enforced by
`test_route_nav_and_contents_nav_are_separate_landmarks` and
`test_every_nav_landmark_has_an_accessible_name`.

**`<main id="main" tabindex="-1">`.** The skip link's target must be programmatically focusable, or
activating it scrolls the viewport while leaving keyboard focus on the link itself (this was D3 on
`main`; Firefox and Safari both exhibit it). Enforced by `test_skip_link_targets_a_focusable_main`.

**No colour-coded category without a text-carried equivalent.** An island that paints a series
token (`--dem`, `--gop`, `--mix`, `--mand`, `--domestic`, `--disc`, `--public`, `--int`,
`--intragov`, `--positive`) in `fill=`/`stroke=` must also render a `<TableView>` carrying that
category as a table column. Enforced by `test_no_island_encodes_a_category_only_in_colour`. (No
island encodes a category in colour on `main` today — `DebtChart`'s `--mand` area fill is a single
accent under one series, not a category — so this is a structural lock for the eleven sections
still to land, not a fix.)

**`tokens.css` is non-negotiable.** No hex value moves. Where a token's contrast is insufficient,
the fix is *where it may be used* (never as text; a sub-3:1 series colour never carries meaning
alone), not a retune.

## Token contrast

Computed with the standard WCAG 2.1 relative-luminance formula, from the hex values in
`src/styles/tokens.css`. `test_token_contrast_table_matches_tokens_css` fails if a token here goes
stale — either a new token with no row, or a hex edit that this table's ratios no longer match
(within 0.01). `test_text_role_tokens_meet_4_5_to_1` enforces the `role: text` rows;
`test_series_tokens_below_3_to_1_are_documented_as_needing_redundant_encoding` enforces that every
`role: series` row scoring below 3:1 against `--panel` carries a `redundant-encoding:` note.

| Token | Hex | vs `--ground` | vs `--panel` | Role | Redundant encoding |
|---|---|---|---|---|---|
| `--ground` | `#DDE0DB` | 1.00 | 1.21 | surface | |
| `--panel` | `#F3F4F0` | 1.21 | 1.00 | surface | |
| `--ink` | `#11161B` | 13.65 | 16.47 | text | |
| `--ink-soft` | `#5A6268` | 4.66 | 5.62 | text | |
| `--rule` | `#B4BAB3` | 1.48 | 1.79 | rule | |
| `--dem` | `#1D4E89` | 6.30 | 7.59 | series | |
| `--gop` | `#A8322D` | 4.99 | 6.02 | series | |
| `--mix` | `#6E3FA3` | 5.43 | 6.55 | series | |
| `--mand` | `#55606B` | 4.82 | 5.81 | series | |
| `--domestic` | `#55606B` | 4.82 | 5.81 | series | |
| `--disc` | `#3E7C86` | 3.56 | 4.29 | series | |
| `--public` | `#3E7C86` | 3.56 | 4.29 | series | |
| `--int` | `#C77D28` | 2.47 | 2.97 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--intragov` | `#C77D28` | 2.47 | 2.97 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--foreign` | `#93A8B3` | 1.86 | 2.24 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--positive` | `#2E7D5B` | 3.75 | 4.53 | series | |
| `--band` | `#C9CCC3` | 1.22 | 1.47 | rule | |
| `--rev-ii` | `#3E7C86` | 3.56 | 4.29 | series | |
| `--rev-pr` | `#C77D28` | 2.47 | 2.97 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--rev-ci` | `#55606B` | 4.82 | 5.81 | series | |
| `--rev-ex` | `#93A8B3` | 1.86 | 2.24 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--rev-cu` | `#263038` | 10.09 | 12.17 | series | |
| `--rev-eg` | `#A8895A` | 2.47 | 2.97 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |
| `--rev-mi` | `#B7BDB0` | 1.44 | 1.74 | series | redundant-encoding: table column (`th scope` cell carries the category as text) |

`--rule` clears neither the 4.5:1 text threshold nor the 3:1 non-text threshold on either ground.
It is used only for hairline rules, never for text or a category-carrying series, so it is marked
`role: rule` rather than `text` or `series` and carries no enforcement test of its own — recorded
here so a future use of `--rule` for anything else is a deliberate decision, not an oversight.
`--band` (era-shading crisis/pandemic bands, GOV-4) is the same kind of decorative, non-text,
non-category wash and is marked `role: rule` for the same reason — it is explicitly "neutral" in
`tokens.css`'s own comment, never carrying party or budget-category meaning.

`--rev-ii` through `--rev-mi` (GOV-10's revenue-by-source stack) are `role: series` like the other
category colours above: `RevenueChart.tsx`'s `<TableView>` carries every one of the seven sources
as its own labelled column, so the four scoring below 3:1 against `--panel` (`--rev-pr`, `--rev-ex`,
`--rev-eg`, `--rev-mi`) carry the same `redundant-encoding:` note as `--int`/`--intragov`/
`--foreign` above.

`--ink-soft` at 4.66:1 against `--ground` has 0.16 of headroom above the 4.5:1 floor —
`test_text_role_tokens_meet_4_5_to_1` locks this so a future ground-token edit that erodes it fails
loudly rather than shipping a body-text regression.

## Known limitation: JS-disabled narrow-viewport chart legibility

`useChartSize` returns the `WIDE` preset (720×396) before the first client measurement, so with
scripting disabled the wide viewBox is never swapped for the 360-unit `NARROW` one. At a 390px
viewport the plot is scaled by roughly 0.49, taking an 11px axis label down to about 5.4px
rendered.

A `<noscript>`-scoped stylesheet in `BaseLayout.astro`'s `<head>` mitigates this by enlarging
`.axis-label`, `.axis-title` and `.annotation` (in viewBox units, landing back near 10–11px
rendered at 390px) below a 34.9rem breakpoint. It applies only when scripting is off, so the
JavaScript path — already on the `NARROW` preset — is untouched.

**Measured 2026-08-26: the mitigation does not apply at all.** The `<noscript><style>` block is
emitted in `<head>` *before* the bundled stylesheet, which carries `.axis-label { font-size: 11px }`
and its siblings at the same specificity and later in source order — so the bundle wins the cascade
every time. With scripting off at 390×844 (Chrome 151) the wide viewBox renders into 350 CSS px,
scale 0.486, and the three classes measure **5.10px, 5.35px and 5.59px** rendered, not the 10–11px
this section previously claimed. Filed as **#78**. The paragraph above describes the intent; it did
not describe the shipped behaviour, and the anticipated crowding never occurred because the text was
never enlarged.

**Separately, the mitigation would not fix the underlying geometry even when it works.** The plot
area still uses the wide viewBox with scripting off, so it is proportionally smaller than the
JS-enabled narrow layout. Degraded but readable, not equivalent.

## Manual pass results

Issue #30's sweep, in two sittings. **2026-08-24**: keyboard traversal, roving tabindex and focus
restoration, 390px legibility, rendered-pixel contrast — recorded in #30's comments and transcribed
here unaltered. **2026-08-26**: the greyscale pass with computed per-chart luminance ratios, the
390px JavaScript-off measurement, and the WebKit focus-ring paint check.

**Tooling.** Chrome **151.0.0.0** (headless Chromium, Playwright MCP) at 1440×900 and 390×844, and
WebKit **26.5** (Playwright WebKit, `AppleWebKit/605.1.15 Version/26.5` — the Safari 26.5 engine,
*not* Safari.app), both against the deployed site `https://travisgalloway.com/income-tax/`. No
assistive technology and no Safari.app exist in this environment; every row that needs one reads
**NOT EXECUTED** and is carried by #80, which blocks `A11Y-2` from `Shipped`.

The greyscale pass is **JavaScript on**, because that is the state a sighted reader is in. It is not
because the charts are missing without it: every section island server-renders its full `<svg>`,
`DebtChart` included — measured in #36 across all three routes, 25 of 25 figures, and held there
since by `test_every_figure_server_renders_its_chart_svg`. `client:visible` defers *hydration*, not
rendering. The JavaScript-off state is checked by `M5` instead, on its own terms.

| Check | Route | Result | Tool | Evidence / issue |
|---|---|---|---|---|
| M1 keyboard traversal | `/` | FAIL | Chrome 151 | Skip link is the first tabbable element at (8,8), 135×44, `href="#main"`, `main[tabindex="-1"]`; zero positive `tabindex` site-wide. 389 of 408 tab stops are `rect[tabindex="0"]` data points — #69. Wide-table scroll container not keyboard reachable — #71. |
| M1 keyboard traversal | `/government/` | FAIL | Chrome 151 | Skip link and landmark order as above. 380 of 471 tab stops are data points — #69. #71. Four `radiogroup`s all resolve to the name "Measured in" — #72. |
| M1 keyboard traversal | `/households/` | FAIL | Chrome 151 | Skip link and landmark order as above. 356 tab stops, every datum reachable — #69. #71. |
| M1 keyboard traversal | `/sources/` | PASS | Chrome 151 | Skip link first at (8,8) 135×44; `main[tabindex="-1"]`; zero positive `tabindex`; no focusable datum and no scroll container renders on this route. |
| M2 screen-reader pass | `/` | NOT EXECUTED | — | No assistive technology exists in this environment. Human required — #80. |
| M2 screen-reader pass | `/government/` | NOT EXECUTED | — | As above — #80. |
| M2 screen-reader pass | `/households/` | NOT EXECUTED | — | As above — #80. |
| M2 screen-reader pass | `/sources/` | NOT EXECUTED | — | As above — #80. |
| M3 roving tabindex / focus trap | `/` | PASS | Chrome 151 | Radio groups carry `role` plus `aria-checked` plus a roving tabindex; no control traps focus. |
| M3 roving tabindex / focus trap | `/government/` | PASS | Chrome 151 | All 20 radios site-wide carry `role` + `aria-checked` + roving tabindex; the three filter dropdowns close on Escape and restore focus to their trigger. Naming defect only, not focus behaviour — #72. |
| M3 roving tabindex / focus trap | `/households/` | PASS | Chrome 151 | As above; no focus trap. |
| M3 roving tabindex / focus trap | `/sources/` | PASS | Chrome 151 | Vacuous — no roving-tabindex control renders on this route. |
| M4 390px legibility, JS on | `/` | FAIL | Chrome 151, 390×844 | Body does not scroll horizontally (`scrollWidth` 390 = `clientWidth`). Right-edge annotations clipped — #64. Chart legibility sweep — #66. "Focus or hover" instruction with 3.3px hit targets — #73. Open tables uncapped, page 11,316px → 24,195px — #77. |
| M4 390px legibility, JS on | `/government/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. Filter menu wider than the phone — #62. §11 by-state table hides four of five columns — #63. #64, #66, #73. §11 legend wraps a swatch away from its label — #74. |
| M4 390px legibility, JS on | `/households/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. §4 Figure 4 clipped at the right edge — #64. #66, #73. |
| M4 390px legibility, JS on | `/sources/` | FAIL | Chrome 151, 390×844 | `documentElement.scrollWidth` 520px against `clientWidth` 390px — **130px of horizontal body scroll**, from three unbroken `<code>` spans measuring 459px, 500px and 500px. New finding, filed as #79. |
| M5 390px legibility, JS off | `/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | `useChartSize` never runs, so the 720×396 `WIDE` viewBox renders into 350 CSS px (scale 0.486): `.axis-title` **5.10px**, `.axis-label` **5.35px**, `.annotation` **5.59px**. The `<noscript>` mitigation is emitted before the bundled stylesheet and loses the cascade, so it never applies. New finding, filed as #78. Same page with JS on: 10.21 / 10.69 / 11.18px. |
| M5 390px legibility, JS off | `/government/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | Same wide-preset scaling and the same overridden mitigation — #78. All 13 `<details>` tables are present in the static HTML with scripting off. |
| M5 390px legibility, JS off | `/households/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | 5.10px minimum, same cause — #78. All 7 `<details>` tables present with scripting off. |
| M5 390px legibility, JS off | `/sources/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | No chart renders, so #78 does not apply; the 130px `<code>` overflow is identical with scripting off — #79. |
| M6 greyscale render | `/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.03:1** (ECO-4 rates panel, `--ink-soft` #5A6268 against `--rev-ci` #55606B). Every series carries an in-plot end label and a `<TableView>` column, at both viewports. See the per-chart table below. |
| M6 greyscale render | `/government/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.00:1** (GOV-10, `--rev-pr` #C77D28 against `--rev-eg` #A8895A), non-adjacent bands in the stack; the tightest *adjacent* band pair is 1.44:1 and every boundary is drawn. GOV-11's cartogram carries direction as a `+`/`−` glyph on every tile. See the per-chart table below. |
| M6 greyscale render | `/households/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.06:1** (HH-4, `--positive` against `--rev-ii`) and it does not matter: HH-4 encodes its five income groups as **marker shapes** (circle, square, triangle, diamond, ×, +) with a shape legend, so colour carries nothing on its own. |
| M6 greyscale render | `/sources/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Vacuous — zero `<figure>`, zero `<svg>`, and every `main` text colour is `--ink` or `--ink-soft`. No colour-coded category renders on this route. |
| M7 focus ring paints on SVG | `/` | PASS | WebKit 26.5 | Focused `rect.datum` (389 of them): `outline: 1px solid rgb(17,22,27)`, `outline-offset: 1px`, `stroke: rgb(17,22,27)`, `stroke-width: 2px`. A ring paints, confirmed by screenshot. WebKit computes the 1.5px rule as **1px** — evidence for #75. Safari.app itself NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/government/` | PASS | WebKit 26.5 | Focused `circle.datum` (249): same computed ring. Safari.app NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/households/` | PASS | WebKit 26.5 | Focused `circle.datum` (356): same computed ring. Safari.app NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/sources/` | PASS | WebKit 26.5 | Vacuous — no `.datum` renders on this route. Focus-ring visibility on the route's links in Safari.app NOT EXECUTED — #80. |
| M8 measured rendered-pixel contrast | `/` | FAIL | Chrome 151 | Focus ring measured as `outline: 1.5px solid rgb(17,22,27)` at 13.65:1 against `rgb(221,224,219)`. The colour passes comfortably; the **thickness is under the WCAG 2.2 Focus Appearance 2px minimum** — #75. Text tokens measured against the shipped grounds pass (see the token table above). |
| M8 measured rendered-pixel contrast | `/government/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |
| M8 measured rendered-pixel contrast | `/households/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |
| M8 measured rendered-pixel contrast | `/sources/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |

Two review results are recorded here because they were checked and found **correct**, so that a later
reader does not "fix" them: both `<nav>` landmarks *are* named (`aria-label="Site"` and
`aria-labelledby="toc-heading"` resolving to "Contents" — an early review said otherwise and was
wrong), and the site renders **zero `<input>` and zero `<select>` elements**. Console output is clean
on all four routes at both viewports: 0 errors, 0 warnings. #70 (three in-prose links skip the base
path and 404 in production) came out of the same review; it is a link-target defect rather than one
of the eight checks, and it is filed and open.

### Greyscale, per chart

Computed from the rendered DOM: the `fill` and `stroke` of every category mark, per plot panel,
converted to WCAG relative luminance, with the ratio taken between every pair of categories that
**co-occur in one panel**. Axis, grid, annotation, band and `.datum` elements are excluded, as are the
surface tokens. Chrome 151.0.0.0, JavaScript on; the values are viewport-independent and were
confirmed identical at 1440×900 and 390×844. A ratio below 3:1 is a defect only where colour is the
sole carrier — per `test_no_island_encodes_a_category_only_in_colour`, a category also carried as a
table column, an in-plot label or a marker shape is a PASS with a note.

| Route | Chart | Worst co-occurring pair | Ratio | What else carries the category | Verdict |
|---|---|---|---|---|---|
| `/` | ECO-1 real GDP | single series (`--ink`) | n/a | in-plot title, table | PASS |
| `/` | ECO-2 growth and its shadow | `--rev-ci` / `--rev-pr` | 1.95:1 | in-plot end labels ("Output per hour", "Real median household income"), 2 table columns | PASS |
| `/` | ECO-3 who works, panel 1 | `--ink` / `--rev-ii` | 3.84:1 | in-plot end labels, table columns | PASS |
| `/` | ECO-3 who works, panel 2 | single series | n/a | in-plot title, table column | PASS |
| `/` | ECO-4 inflation panel | `--ink` / `--rev-ii` | 3.84:1 | in-plot end labels ("CPI-U", "Core PCE"), table columns | PASS |
| `/` | ECO-4 rates panel | `--ink-soft` / `--rev-ci` | **1.03:1** | in-plot end labels on all three ("Fed funds", "3-month bill", "10-year note"), 3 table columns | PASS (note) |
| `/` | ECO-5 labor and capital | `--ink` / `--rev-pr` | 5.54:1 | in-plot end labels, table columns | PASS |
| `/government/` | GOV-2 debt | `--rev-ci` / `--ink` | 2.83:1 | in-plot callouts, table columns | PASS |
| `/government/` | GOV-2 debt holders | `--ink-soft` / `--ink` | 2.93:1 | every band labelled in-plot with its name and amount | PASS |
| `/government/` | GOV-3 debt maturity | single colour | n/a | instrument names in-plot ("Bills", "Notes", "Bonds") | PASS |
| `/government/` | GOV-4 budget | `--rev-ci` / `--ink-soft` | **1.03:1** | party strip carries "D"/"R" as text; series carry table columns; `--dem`/`--gop` themselves separate by only 1.26:1 and are never the sole carrier | PASS (note) |
| `/government/` | GOV-5 structural gap | `--positive` / `--rev-ci` | 1.28:1 | in-plot labels ("Outlays", "Revenue", "Surplus, FY1998–2001"), table columns | PASS (note) |
| `/government/` | GOV-6 voted and not | `--rev-ci` / `--rev-ii` | 1.35:1 | three in-plot band labels ("Mandatory (net)", "Discretionary", "Net interest"), table columns | PASS (note) |
| `/government/` | GOV-7 net interest | `--rev-ci` / `--rev-pr` | 1.95:1 | in-plot callouts, table columns | PASS |
| `/government/` | GOV-8 deficit history | single colour | n/a | table columns | PASS |
| `/government/` | GOV-9 law explorer, coalition | `--mix` / `--gop` | **1.09:1** | each bar labelled in-plot with its coalition name and total | PASS (note) |
| `/government/` | GOV-9 law explorer, president | `--rev-ci` / `--positive` | 1.28:1 | each bar labelled in-plot | PASS (note) |
| `/government/` | GOV-10 revenue by source | `--rev-pr` / `--rev-eg` | **1.00:1** | non-adjacent in the stack; tightest adjacent pair 1.44:1 with a drawn boundary; four of seven sources labelled in-plot; all seven are table columns | PASS (note) |
| `/government/` | GOV-10 OECD comparison | single colour | n/a | country names in-plot | PASS |
| `/government/` | GOV-11 give and get cartogram | adjacent scale steps | **1.00:1** | every tile carries its state abbreviation and a `+`/`−` glyph for direction; magnitude is in the table | PASS (note) |
| `/government/` | GOV-11 state tax mix | `--rev-ii` / `--rev-pr` | 1.44:1 | **nothing in the figure** — no legend and no in-plot label at either viewport; the three segments are named only inside the disclosure table | PASS (note) |
| `/households/` | HH-1 household spread | single colour | n/a | in-plot title, table | PASS |
| `/households/` | HH-2 inequality, both panels | single colour each | n/a | in-plot panel titles, table columns | PASS |
| `/households/` | HH-3 bracket history | `--ink-soft` / `--rev-ii` | 1.31:1 | three separate panels, each with its own in-plot title; table columns | PASS (note) |
| `/households/` | HH-4 statutory vs effective | `--positive` / `--rev-ii` | 1.06:1 | **marker shape**: circle, square, triangle, diamond, ×, + — with a shape legend. Colour carries nothing alone. | PASS |
| `/households/` | HH-5 who pays | no series colour renders | n/a | in-plot "AGI" / "tax" labels per percentile group | PASS |
| `/households/` | HH-6 top-1% share | single colour | n/a | in-plot year callouts, table | PASS |
| `/households/` | HH-7 payroll bill | `--rev-ci` / `--rev-ii` | 1.35:1 | in-plot end labels ("Payroll", "Individual income"), table columns | PASS (note) |
| `/sources/` | — | no chart renders | n/a | — | PASS |

Every `PASS (note)` above is a chart whose category colours separate by less than 3:1 in greyscale and
whose category is therefore being carried by something other than colour. That redundancy is what
`test_no_island_encodes_a_category_only_in_colour` locks. The three thinnest cases — GOV-10's identical
`--rev-pr`/`--rev-eg` luminance, GOV-11's flat cartogram scale, and GOV-11's unlabelled tax-mix bar —
are recorded in `docs/parked-findings.md` as design observations, not as defects under this contract.
## Manual checklist — status per item

Written by PR #15, when no browser, assistive technology or rendered-pixel measurement existed in
this loop. Most of it has since been executed; the results are in **Manual pass results** above and
each item below now carries its own state. Two items are genuinely not executable by any agent and
say so.

### Shared

1. **Tab and Shift-Tab traversal**, start to finish: focus order follows reading order and every
   control (route nav, TOC, unit toggle, chart data points, table disclosure) is reachable and
   operable. — **EXECUTED 2026-08-24**, Chrome 151, all four routes. Skip link first, `main`
   focusable, zero positive `tabindex`. FAILs: #69 (no bypass past the data points), #71 (table
   scroll container not keyboard reachable), #72 (four identically named `radiogroup`s). Row `M1`.
2. **Screen-reader pass** (VoiceOver + Safari, NVDA + Firefox): the chart's `aria-label` announces
   usefully, the `<details>` table reads coherently when opened, and the `aria-live` readout
   announces once per focus move rather than flooding. — **NOT EXECUTED.** No assistive technology
   exists in this environment and none can be driven from an exec agent. Human required: **#80**.
   Row `M2`.
3. **Roving-tabindex and focus-trap check on the radio groups**: Home/End/arrow-key behaviour matches
   the ARIA radio-group pattern and nothing traps focus. — **EXECUTED 2026-08-24**, Chrome 151. All
   20 radios carry `role` + `aria-checked` + a roving tabindex; the three filter dropdowns close on
   Escape and restore focus to their trigger. PASS. Row `M3`.
4. **390px legibility, JavaScript on and off**, including whether the `<noscript>` mitigation's
   enlarged annotation text collides with the plotted curve. — **EXECUTED**: JavaScript on
   2026-08-24, JavaScript off 2026-08-26, Chrome 151 at 390×844. The collision question is moot:
   the `<noscript>` mitigation never applies (#78), so with scripting off the text is *too small*
   rather than too large — 5.10–5.59px rendered. FAILs: #62, #63, #64, #66, #73, #74, #77, #78, #79.
   Rows `M4` and `M5`.
5. **Greyscale render**, confirming no distinction a reader needs is carried by colour alone. —
   **EXECUTED 2026-08-26**, Chrome 151, both viewports, JavaScript on, with a computed per-panel
   luminance ratio for every co-occurring category pair. PASS with notes; see **Greyscale, per
   chart**. Row `M6`.
6. **Focus-ring visibility against every background it can appear on, in Safari specifically**,
   where the SVG `stroke` fallback (D6) is the ring that actually paints. — **PARTLY EXECUTED
   2026-08-26.** WebKit 26.5 (the Safari 26.5 engine, driven headless — *not* Safari.app) confirms a
   ring paints on a focused `.datum` on all three chart routes, and computes the 1.5px `outline` rule
   as `1px`, which is evidence for #75. **NOT EXECUTED**: visibility against every background in
   Safari.app itself, and which of `outline` and `stroke` is the mechanism a sighted Safari user
   sees. Human required: **#80**. Row `M7`.
7. **Measured contrast over rendered pixels**, including anti-aliased SVG text and any overlap
   between a series fill and text drawn on top of it. — **EXECUTED 2026-08-24**, Chrome 151. The
   focus ring measures 13.65:1 against `rgb(221,224,219)` — colour passes, thickness fails the WCAG
   2.2 Focus Appearance 2px minimum. FAIL: #75. Row `M8`.

### Per-consumer

8. **Keyboard models for the interactive primitives that actually render.** The anticipated Radix
   `Select`, `Slider`, `Dialog`, `Tabs` and `Tooltip` consumers **never landed**: the site renders
   **zero `<input>` and zero `<select>` elements**, and there is no slider, no native select, no
   modal and no tab strip in the DOM. Rewritten 2026-08-26 against the three control shapes that do
   render:
   - **`role="radio"` button groups** (`UnitToggle`, and the Government route's four measure
     toggles) — 20 radios site-wide, roving tabindex, `aria-checked` on each. **EXECUTED**, PASS,
     Chrome 151, 2026-08-24. Their *naming* is a separate open defect (#72).
   - **Filter dropdown buttons** — three of them, all on `/government/`. Escape closes and restores
     focus to the trigger. **EXECUTED**, PASS, Chrome 151, 2026-08-24. The menu's width at 390px is
     an open defect (#62).
   - **`<details>`/`<summary>` disclosures** — every `<TableView>`, present in the server-rendered
     HTML with scripting off (13 on `/government/`, 7 on `/households/`, 5 on `/`). Keyboard
     operation **EXECUTED**, PASS. Whether the native disclosure *announces* its state correctly is
     a screen-reader question and is **NOT EXECUTED** — #80.

   Any PR that introduces the first consumer of a further primitive adds its keyboard-model check
   here, with expected and actual key behaviour, before this item can be marked anything but blocked
   for that primitive.
9. **Screen-reader pass, Households and Economy routes.** — **NOT EXECUTED**; human required, #80.
10. **Screen-reader pass, Government §§2–12 and `/sources`.** — **NOT EXECUTED**; human required, #80.
11. **Greyscale render, all three routes.** — **EXECUTED 2026-08-26**; see item 5 and the per-chart
    table. Every section that colour-codes a category now exists and was rendered.
12. **Cross-route keyboard sweep** (feature-matrix `A11Y-2`): the full Tab/Shift-Tab traversal across
    all three routes and `/sources`, end to end. — **EXECUTED 2026-08-24**, Chrome 151. Tab stops
    counted per route: `/` 408 (389 data points), `/government/` 471 (380), `/households/` 356. Row
    `M1`. `A11Y-2` nevertheless stays at `In progress` until #80 closes, because the row's own
    definition of done includes the screen-reader half.
