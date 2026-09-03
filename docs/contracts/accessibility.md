# Contract: accessibility (`docs/contracts/accessibility.md`)

Issue #15's audit found `main` shipping only the shared layer plus Government §1, with the other 11
sections still open as PRs #16-#28. All of them have since merged, and #30 has since walked the site
in a browser. This contract now has three parts: the conventions every section must satisfy
(enforced, where provable, by `pipeline/tests/test_accessibility.py`); the **manual pass results**,
one row per check per route with the browser or assistive technology used; and the manual checklist
itself, each item carrying its own executed or not-executed state.

## Conventions

**Every chart `aria-label` states the finding and never the shape.** "Line chart showing debt over
time" fails, because it carries no digit and opens with a shape word. "Debt doubled in ten fiscal
years, from $19.57 trillion at the close of FY2016 to $40 trillion in August 2026" passes. Enforced
by `test_every_chart_svg_states_a_finding`, which encodes this exact worked example.

**A chart's `<svg>` is `role="img"` when static, `role="group"` when it has Tab-focusable data
points.** Assistive technology treats a `role="img"` subtree as presentational, so a chart with
keyboard-reachable points that keeps `role="img"` has focusable children that go unannounced.
`Chart.tsx`'s `interactive` prop is the switch. Enforced by
`test_focusable_data_points_are_labelled_and_grouped`.

**A figure contributes at most one tab stop per chart `<svg>`, however many marks it draws.** Marks
are not removed from the keyboard. Each chart SVG is one **roving-tabindex group**: exactly one mark
carries `tabindex="0"`, every other carries `tabindex="-1"`, and Left/Up, Right/Down, Home and End
move focus between them in **DOM order, which is data order rather than screen geometry**. Tab enters
the figure at the active mark and leaves the chart entirely.

The rule is the roving-tabindex convention of the ARIA composite-widget pattern **without wrapping**.
A chart's marks are a series, and jumping from the last year to the first reads as a discontinuity in
the data, so the ends clamp. `Down` is included because `OecdChart`'s dot plot runs vertically and
"next" reads downward there.

**The rule holds in the served HTML, not only after hydration.** Islands mount `client:visible`,
which server-renders the markup and defers only hydration, so before #69
`dist/government/index.html` shipped all 369 marks focusable before a line of JavaScript ran. The
active index is therefore React state, and `tabIndex` is derived from it **during render**. An
effect never writes it, because an effect-written value would be absent from the served bytes and
clobbered by the next re-render.

`useRovingMarks()` (`src/components/charts/roving.ts`) is the only way to make a chart mark
focusable. `Chart` passes its `mark` to the render prop as a second argument, and the three islands
that hand-roll their own `<svg>` (`BracketHistory`, `StateGiveGet`, `StateTaxMix`) call the hook
directly.

A figure that draws marks still carries its `<details>` "View as table". That table stays the
complete non-visual equivalent and is **the one route this rule may never shorten**.

No bypass *control* is added. There is no "skip this chart" link, and so no new off-screen focusable
content of the `left: -9999px` kind. Roving needs none, because it bounds the tab order for every
reader rather than only for one who finds and activates a control.

Enforced by `test_each_chart_svg_offers_exactly_one_tab_stop` and
`test_no_island_hardcodes_a_focusable_chart_mark` over `dist/`, and by `tests/browser/keyboard.test.ts`
in a real browser. The counts, at 1440x900 on `/government`:

| | Before #69 | After #69 |
|---|---|---|
| Tab presses from the top of `/government` to §11 `#by-state` | **438** | **141** hydrated, **118** with scripting off |
| Tab stops on the whole of `/government` | **512** | **161** hydrated, **136** with scripting off |
| `tabindex="0"` marks per chart `<svg>` in `dist/government/index.html` | `32,7,3,64,31,31,31,31,3,5,64,11,51,5` | `1` x 14 |

The 369 marks on `/government` (389 on `/economy`, 356 on `/households`) were all still there and all
still reachable, and `test_the_label_coverage_did_not_narrow` pinned the total at 1114 so the roving
change could not quietly shrink the corpus every other guard reads.

**Every number in the table above is a measurement of the pre-Recharts build, and the served bytes
no longer carry those marks.** Recharts renders no chart during a static render, so 27 of the 29
chart `<svg>` elements and 1058 of the 1114 marks now reach the DOM only at hydration. The static
corpus is 2 SVGs and 56 marks, all in Government §11, whose cartogram and tax-mix bar hand-roll
their own markup: 51 tiles and 5 segments, the last two entries of the per-SVG row above.
`test_the_label_coverage_did_not_narrow` is re-baselined to `{'government': 56}` and its docstring
records what the number used to be. The hydrated tab-stop counts in the first two rows are browser
measurements and are unaffected by where the markup is generated.

Two things stay human-judged and are not fixed here. Nothing announces to a keyboard reader that the
arrow keys work inside a group, and announcement is #30's territory. Whether an index-based active
mark reads sensibly across a filter change is a judgement rather than a measurement.

**The focus ring is one token wide.** `--focus-ring: 2px` in `src/styles/tokens.css`, and every
ring rule in `global.css` reads it: the base `:focus-visible`, `.datum:focus-visible`, #69's
`[data-roving] [data-mark]:focus` fallback, `.state-tile:focus-visible` and
`.year-range-thumb:focus-visible`. **WCAG 2.2 SC 2.4.13 Focus Appearance** (Level AAA) sets the 2px
minimum, and SC 2.4.11 (Focus Not Obscured) assumes a perimeter of that order.

The width is 2px rather than 1.5px because **both engines round 1.5 down**. Chromium 151 and WebKit
26.5 each computed the old rule as **1 device pixel**, so what shipped was half what the stylesheet
claimed. Before #75 four rules said `1.5px` and a fifth said `2px`. A token is what stops a sixth
rule picking a seventh number, and `[data-roving] [data-mark]:focus` is `:focus` rather than
`:focus-visible`, so it cannot inherit a width from the base rule and collapsing them was never
available.

`vector-effect: non-scaling-stroke` on the two SVG rules changes what renders. WebKit paints no
`outline` on an SVG shape, so the `stroke` fallback *is* the ring there, and `stroke-width` resolves
in **user units** while every chart `<svg>` is scaled to its container. A bare `stroke-width: 2`
rendered **1.944 CSS px at 390px** (screen-CTM scale 0.9722) and 2.044 at 1440px. That is under the
minimum in the one engine that depends on it, and it would have stayed under it if only the
`outline` had changed. With `non-scaling-stroke` every `.datum`-bearing chart on all three routes
renders exactly **2.000** at both viewports.

`outline-offset` stays **per-control**, at 2px on the base rule, 1px on `.datum`, the roving fallback
and `.state-tile`, and 3px on `.year-range-thumb`. The colour stays `var(--ink)`, measured at
**13.65:1** against `--ground`. `.skip-link:focus-visible` overrides `outline-color` only, because it
paints on `--ink` where an ink ring is invisible, and it inherits the token width like everything
else.

Enforced by `tests/browser/focus.test.ts`, which reads `--focus-ring` from `:root` at runtime and
never hardcodes 2, in the `--target-min` idiom. The test asserts over **computed style in a
browser** and never over CSS source text, because the minifier merges `.datum:focus-visible` with
`[data-roving] [data-mark]:focus` when their declarations are identical, and no source-level check
can then tell those two apart.

**Every figure has an accessible name, and it is the finding.** `Figure.astro`'s `ariaLabel` prop
renders as the `<figure>`'s own `aria-label`, in addition to the `<svg>`'s. The two are
deliberately the same sentence, because a figure with no name announces as bare "figure", which is
the worse failure. Enforced by `test_every_figure_has_an_accessible_name`.

**Every `<TableView>` is a native `<details>`/`<summary>` disclosure, present in the
server-rendered HTML with scripting off.** No component unmounts its content while closed. The
open/close label swaps via `.tableview[open] .tv-open`/`.tv-close` CSS, never a `useState` read.
Enforced by `test_every_chart_has_a_real_table_in_the_static_html`.

`open` is **not** restored across a history navigation. That is the platform's behaviour rather than
this repository's, and it is right, because the disclosure is a request to see a table now rather
than a stored preference. The reader's *position* is preserved regardless. See "Scroll restoration
is the platform's" below for what absorbs the resulting 11,854px document shrink, and where it does
not.

**Every `Column` names a unit.** A bare-number table column is a bug (`TableView.tsx`'s `Column`
type has no optional escape hatch).

**One live region per chart, built from the same formatter the datum `aria-label` uses.** Hover and
keyboard focus must announce identical text, and a chart must not carry more live regions than it
has data series. Enforced for the count half only, by
`test_live_regions_do_not_outnumber_charts`. *Whether it announces once per focus move rather than
once per data point is a runtime property no static check can observe. See the manual checklist.*

**Two named `<nav>` landmarks, not one.** The route list (`aria-label="Site"`) and the section
contents list (`aria-labelledby="toc-heading"`) are separate landmarks. "Contents" is a `<p
id="toc-heading">` rather than a heading, because the rail precedes `<main>` in document order and a
heading there would outrank the page's `<h1>`.

Since #42 the DOM carries **four** `<nav>` elements rather than two, because the desktop rail carries
one pair and the narrow-viewport bar the other. Exactly two are in the accessibility tree at any
viewport, because `.rail` and `.navbar` are mutually `display: none` across the `62rem` breakpoint.
All four are named, and the two headings are `toc-heading` (rail) and `navbar-toc-heading` (panel).
**They must never collide**, because `aria-labelledby` resolution against a duplicated id is
undefined. Enforced by `test_route_nav_and_contents_nav_are_separate_landmarks`,
`test_every_nav_landmark_has_an_accessible_name` and `test_no_page_repeats_an_id`.

**Two `aria-current` values, two lists.** The route lists carry `aria-current="page"`,
server-rendered by `BaseLayout.astro` on whichever of the six routes is open. The contents lists
carry `aria-current="true"`, written at runtime by the `sectionSpy()` IIFE in the layout's one
`<script is:inline>` block, on whichever section contains the **viewport midpoint**. That is the
lowest section in document order whose top edge is at or above the midpoint, decided by one
`IntersectionObserver` whose `rootMargin` collapses the root to a thin band across it.

Four things follow, and each one matters.

- **The counts are 2 in the DOM and 1 in the accessibility tree, for each value**, for the same
  `.rail`/`.navbar` mutual-`display: none` reason the four-`<nav>` paragraph above gives. Both lists
  exist on every page, and the marked anchors are addressed by one `querySelectorAll` over
  `a[data-section="<id>"]`, so the rail and the panel cannot disagree. Enforced by
  `test_no_built_page_ships_a_section_level_aria_current` (which also pins `page` at exactly 2, so
  it cannot go green by the route markers vanishing) and
  `test_every_contents_anchor_is_addressable_by_the_spy`.
- **With scripting off, nothing is marked, and that is the correct behaviour.** The absence is not a
  degradation to paper over. Reading position is derived from scroll position, and server-rendering
  a mark on section 1 would be wrong for every reader who is not at the top. The built HTML
  therefore carries zero `aria-current="true"`, and `/sources`, which passes no `sections` prop,
  makes the IIFE return before it observes anything. `/` passed no `sections` prop until #48. It now
  passes a page-local array of four and carries a contents list like any route.
- **Nothing is announced while scrolling.** An `aria-current` change on an element that is neither
  focused nor inside a live region is not announced, so a fast scroll down `/government`'s 12
  sections produces no stream of speech. The state is there, silently, for a reader who navigates
  into the list and asks for it. That holds only while neither contents list, and no ancestor of
  one, is a live region, which is what `test_contents_lists_are_not_live_regions` checks. Never add
  `aria-live`, `aria-atomic`, `role="status"` or `role="alert"` to `.toc` or `.navbar-toc`.
- **The two values are styled apart, and the selector is never bare.** A route link marks as ink
  **plus an underline**, and a section marks as ink **alone**, the whole row including its numeral.
  Both section rules match `[aria-current='true']` scoped to the contents list, because a bare
  `[aria-current]` would collapse the distinction, and
  `test_section_state_selector_is_scoped_and_not_bare` fails if one appears anywhere in
  `global.css`. The mark is colour-only on purpose, so that changing it reflows nothing in a 13rem
  rail, and the non-visual channel is the `aria-current` attribute itself.
- **After a history restore the spy marks the *restored* section rather than the pre-restore one.**
  The restore emits scroll events like any other scroll. `schedule()` coalesces them into a single
  `requestAnimationFrame`, and `apply()` therefore reads the settled position. Observed on
  `/government/` across an 11,854px document shrink, with all 13 tables open on leaving and none on
  returning: Chromium marks `the-laws`, matching `#the-laws` at `top 64`, and WebKit marks
  `where-money-comes-from`, matching *its* restored position. The two engines restore to different
  places (below) and the spy agrees with each. Exactly 2 anchors carry `aria-current="true"` in both
  cases, one per list.

**No scripted scrolling exists anywhere in the navigation chrome.** The spy reads scroll position
and writes an attribute, and it moves nothing. The rail is not a scroll container and the panel is
never auto-scrolled, so `prefers-reduced-motion` is satisfied here the same way the bar satisfies it,
vacuously and greppably, rather than by relying on the global reduce block to zero out a motion that
was written anyway. Enforced by `test_the_section_spy_introduces_no_scripted_scrolling`, which also
asserts the `IntersectionObserver` is still there so it cannot pass by finding no script at all.

**Narrow-viewport navigation is a native disclosure, not a modal.** Below `62rem` the rail is
replaced by a bar fixed to the top of the viewport carrying the site title, the current route name
and a `<details>`/`<summary>` trigger. Behind the trigger, `#navbar-panel` holds all six route
links and the page's full contents list, internally scrolled (`overflow-y: auto` against a
`100dvh`-derived `max-height`), so opening it never grows the page.

- **The primitive is native `<details>`/`<summary>`, and Radix `Dialog` was evaluated and
  rejected.** `<details>` needs no scripting, which is what makes the JS-off guarantee below
  achievable at all. `Dialog` would have required the whole route list duplicated into
  `<noscript>`, a second source of truth and the duplicate-id hazard above. `<details>` is also the
  repository's established disclosure primitive (every `TableView`; see checklist item 8), and it
  keeps the site's navigation chrome off the React hydration path. A hydration-gated nav bar is a
  worse failure than the scrolling block of links it replaced. `@radix-ui/react-dialog` therefore
  still has no consumer. Recorded here so the decision is not reopened.
- **There is no focus trap, deliberately.** The panel is non-modal, with no `aria-modal`, no
  `inert`, and nothing behind it `aria-hidden`. Three reasons. (1) The panel is a dropdown rather
  than a dialog, and it sits in DOM order immediately after its own trigger, so Tab past the last
  panel link continues into `main`, which is the correct disclosure behaviour. (2) It matches the
  site's existing precedent, because checklist item 3 records the three `/government/` filter
  dropdowns as PASS, "Escape closes and restores focus to their trigger… nothing traps focus."
  (3) A trap is reachable only through scripting, which would put focus management in direct
  conflict with the JS-off guarantee. Escape-to-close and focus-return are progressive enhancements
  and may degrade. Trapping cannot be enhanced, so it is either required or absent.
- **It works with scripting off.** The disclosure opens and closes by click and by Enter, and
  every route link and section link is reachable, with zero JavaScript. Only Escape-to-close,
  focus-move-on-open, focus-return and the two dismissals (in-panel link, outside click) need the
  inline `<script>`. With scripting off Escape does nothing and the panel stays open until the
  trigger is activated again. Verified in Chromium at 390×844 with `javaScriptEnabled: false`.
- **The panel's scroll container is keyboard-reachable, so it is not a new instance of #71.** #71
  is about wide table containers that scroll but hold nothing focusable, leaving a keyboard user
  no way to scroll them. `#navbar-panel` contains 17 focusable links. Tabbing through them scrolls
  it, and opening the panel moves focus to the container itself, which arrow keys then scroll. It
  is deliberately not filed again.
- **No transition and no animation exists on any `.navbar*` rule.** That is how
  `prefers-reduced-motion` is satisfied here, vacuously and greppably, rather than by relying on
  the global reduce block to zero out a motion that was written anyway. Enforced by
  `test_nav_bar_open_close_is_not_animated`.
- **The bar costs exactly one tab stop, before `main`.** Tab stop 1 remains `.skip-link`, stop 2
  is the trigger, and stop 3 is inside `main`. It skips nothing inside `main` and is therefore not
  a bypass mechanism for #69. Its own height is `--navbar-h`, 52px, which is also the offset
  `section[id]` and `#main` subtract via `scroll-margin-top` below `62rem`.
**An in-prose glossary marker is a link that also discloses, and it is native (#47).** Each marked
term is `src/components/Term.astro`: a `<span class="term" data-term="<slug>">` wrapper holding a
real `<a class="term-trigger" href="/income-tax/glossary#<slug>">` around the prose word, and,
**as a DOM descendant of that same wrapper**, a `<span class="term-pop" id="def-<slug>" hidden>`
carrying the term's `short` and a link to the full entry. `termPopovers()` in `BaseLayout.astro`
is the only script, and there is no island and no `client:` directive. Five things about that shape
are required, and each is easy to undo while improving something else:

- **No Radix primitive, for the third time.** `TableView`'s original `Collapsible` left every
  disclosure unreachable with scripting off because `Collapsible.Content` is not in the DOM while
  closed (#15), and #42 evaluated `Dialog` for the nav panel and chose native again. A Radix
  `Popover` here would portal the definition, unmount it while closed, make every marked term a
  React island (about 25 on `/government/`), and inherit the positioning machinery that clips the
  filter menus at 390px (#62). `@radix-ui/react-popover` is not a dependency and must not become
  one. Radix `Tooltip` is rejected separately, because it is not focusable, it dismisses on
  pointer-out, and a link inside it is unreachable.
- **The popover is a DOM descendant of the wrapper.** `pointerleave` on the wrapper does not fire
  when the pointer travels from the trigger onto the popover, so WCAG 1.4.13 *hoverable* is met by
  the DOM shape. The 150ms close delay is redundancy rather than the mechanism. Portalling the
  popover, or absolutely positioning it against anything but its own paragraph, breaks the criterion
  structurally, and no delay recovers it.
- **Nothing closes on a timer**, which is 1.4.13 *persistent*. Only Escape, a Tab out of the
  wrapper, a click outside, or another term opening closes it. Do not add an auto-close for
  tidiness.
- **`left: 0; right: 0` against the paragraph**, whose `max-width` is `--measure`. The popover is
  exactly as wide as the prose it interrupts, so it cannot overflow any viewport the prose fits.
  There is no collision detection and no width clamp, and #62's defect is out of reach by
  construction.
- **`preventDefault()` on click is uniform across pointer types**, and never branched on
  `pointerType`. Hover emulation is where phone support goes wrong, and a branch is a second path
  that goes untested on a phone. One tap opens and never navigates first, and navigation is the
  popover's own link. Modifier-, middle- and shift-clicks are left to the platform, so
  open-in-new-tab still reaches `/glossary`.

**With scripting off** each marker is a plain, followable link, never a `<button>` and never an
inert element, and the definition is still in the served bytes as the trigger's `aria-describedby`
target, which every major assistive technology includes in the accessible description even while
`hidden`. **There is no live region**, so no `aria-live`, no `aria-atomic` and no `role="status"` in
the added markup or script. #44 established that this layout deliberately has none, and a popover
announcing on every hover would be the same defect class, louder. **No transition and no animation
exists on any `.term*` rule**, so `prefers-reduced-motion` is satisfied vacuously and greppably here
too. Enforced by the five `test_*term*` checks in `pipeline/tests/test_accessibility.py`.

The triggers are inline text inside sentences, so their hit area is the line box (about 29px at
17px/1.7) and they fall under WCAG 2.2 SC 2.5.8's explicit **Inline exception**. That is a different
case from #73's 3.3px chart data points, which have no such exception. #73 is neither fixed nor
worsened here. It has **since shipped**, and not by enlarging anything. See *Reading a datum with no
hover* below.

**Scroll restoration is the platform's, and four declarations would take it away.** Back and
Forward return the reader to the place they were reading because `history.scrollRestoration` is at
its `'auto'` default and **nothing in `src/` assigns it**. There is no implementation of this
repository's to go wrong, and that is deliberate:

- **No storage.** Not `sessionStorage`, not `localStorage`, not `history.state`. The history entry
  the browser already keeps *is* the storage. There is therefore no storage read, no private-mode
  failure mode, no quota failure, and no second source of truth that can disagree with the browser's
  own. Reconciling two correct answers is how one wrong answer appears.
- **`'auto'`, never `'manual'`.** Setting `'manual'` opts out of the restore *and* of scroll
  anchoring's correction of it, replacing a pixel-exact result with a hand-rolled offset.
- **Position wins over the anchor.** Returning to a URL carrying a hash restores the *position*
  rather than the fragment, so a reader who arrived at `/government/#by-state` and read on to
  `#the-laws` comes back to `#the-laws`. That is the right resolution, because it preserves where
  they were *within* a section rather than snapping to its top.
- **Scroll anchoring is what makes the two hard cases work**, and it is invisible, because it is a
  default (`overflow-anchor: auto`) that nothing declares. It absorbs the roughly 115px of layout
  change that lands *after* the restore when `useChartSize` swaps its WIDE preset for NARROW on
  every chart, and the 11,854px document shrink when the `<details>` tables come back closed.

Four one-line changes elsewhere in this repository would each remove all of that silently, with
every other test still green. Five static guards in `pipeline/tests/test_accessibility.py` exist to
turn red instead:

| Change that would break restoration | Guard |
|---|---|
| `history.scrollRestoration = 'manual'` | `test_scroll_restoration_is_left_to_the_browser` |
| `html { scroll-behavior: smooth }` | `test_no_stylesheet_requests_smooth_scrolling` |
| `overflow-anchor: none` on `html`/`body`/`main` | `test_scroll_anchoring_is_not_disabled` |
| an `unload` or `beforeunload` listener (disqualifies the page from bfcache) | `test_the_layout_registers_no_bfcache_disqualifying_listener` |
| a `scrollIntoView`/`scrollTo`/`behavior:` reaching a built page | `test_no_built_page_scripts_a_scroll` |

Each asserts an absence and is paired with a positive assertion that fails if the file it reads is
empty, moved or gutted. **WebKit has no scroll anchoring**, and what that costs is measured under
"Scroll restoration and the back button (#46)" below.

**`<main id="main" tabindex="-1">`.** The skip link's target must be programmatically focusable, or
activating it scrolls the viewport while leaving keyboard focus on the link itself (this was D3 on
`main`; Firefox and Safari both exhibit it). Enforced by `test_skip_link_targets_a_focusable_main`.

**No colour-coded category without a text-carried equivalent.** An island that paints a series
token (`--dem`, `--gop`, `--mix`, `--mand`, `--domestic`, `--disc`, `--public`, `--int`,
`--intragov`, `--positive`) in `fill=`/`stroke=` must also render a `<TableView>` carrying that
category as a table column. Enforced by `test_no_island_encodes_a_category_only_in_colour`. No
island encodes a category in colour on `main` today, because `DebtChart`'s `--mand` area fill is a
single accent under one series rather than a category. The rule is therefore a structural lock for
the 11 sections still to land rather than a fix.

**A single token is never retuned to rescue a single ratio.** Where one token's contrast is
insufficient, the fix changes *where it may be used*, never as text and never where a sub-3:1
series colour carries meaning alone. A hex value moves only as part of a whole-palette pass that
re-measures all 24 tokens against both surfaces in both themes, which is what the tables below
record. Two such passes have run. The first replaced the cool stone ground with the warm paper and
re-stepped every hue. The second moved `--panel` alone, and the "The plot surface" paragraph after
the light table states why.

## Token contrast

Computed with the standard WCAG 2.1 relative-luminance formula, from the hex values in
`src/styles/tokens.css`. `test_token_contrast_table_matches_tokens_css` fails if a token here goes
stale, whether through a new token with no row or a hex edit that this table's ratios no longer
match (within 0.01). `test_text_role_tokens_meet_4_5_to_1` enforces the `role: text` rows, and
`test_series_tokens_below_3_to_1_are_documented_as_needing_redundant_encoding` enforces that every
`role: series` row scoring below 3:1 against `--panel` carries a `redundant-encoding:` note.

**Two palettes now ship, so every one of those tests is parameterised over the theme.** The table
directly below holds the light theme, and the one under "The dark theme's tokens" holds the dark
theme. Each table states its own surfaces, and each token is scored against the surfaces of its own
palette. Scoring a dark hex against the light ground is meaningless arithmetic, and it reports
`--ink` at 1.00:1 against itself, because the dark `--ink` is the light `--ground`.

| Token | Hex | vs `--ground` | vs `--panel` | Role | Redundant encoding |
|---|---|---|---|---|---|
| `--ground` | `#EDE5D9` | 1.00 | 1.06 | surface |  |
| `--panel` | `#F2EBE1` | 1.06 | 1.00 | surface |  |
| `--ink` | `#14181D` | 14.27 | 15.06 | text |  |
| `--ink-soft` | `#57534B` | 6.13 | 6.47 | text |  |
| `--rule` | `#857E72` | 3.22 | 3.40 | rule |  |
| `--dem` | `#0F5499` | 6.12 | 6.46 | series |  |
| `--gop` | `#990F3D` | 6.75 | 7.13 | series |  |
| `--mix` | `#421A5C` | 10.96 | 11.57 | series |  |
| `--mand` | `#37434F` | 8.09 | 8.54 | series |  |
| `--domestic` | `#37434F` | 8.09 | 8.54 | series |  |
| `--disc` | `#0D7680` | 4.29 | 4.53 | series |  |
| `--public` | `#0D7680` | 4.29 | 4.53 | series |  |
| `--int` | `#A85C11` | 4.00 | 4.22 | series |  |
| `--intragov` | `#A85C11` | 4.00 | 4.22 | series |  |
| `--foreign` | `#647E9C` | 3.36 | 3.54 | series |  |
| `--positive` | `#1E7A4B` | 4.27 | 4.50 | series |  |
| `--band` | `#DCD3C6` | 1.19 | 1.25 | rule |  |
| `--rev-ii` | `#0D7680` | 4.29 | 4.53 | series |  |
| `--rev-pr` | `#A85C11` | 4.00 | 4.22 | series |  |
| `--rev-ci` | `#37434F` | 8.09 | 8.54 | series |  |
| `--rev-ex` | `#647E9C` | 3.36 | 3.54 | series |  |
| `--rev-cu` | `#1B2026` | 13.12 | 13.85 | series |  |
| `--rev-eg` | `#6E4D22` | 6.12 | 6.46 | series |  |
| `--rev-mi` | `#807F78` | 3.22 | 3.40 | series |  |
`--rule` clears the 3:1 non-text threshold on both surfaces, at 3.22 and 3.40, and clears the 4.5:1
text threshold on neither. It failed both thresholds under the old cool-stone palette, at 1.48:1.
The token is used only for hairline rules, never for text and never for a category-carrying series,
so it is marked `role: rule` rather than `text` or `series` and carries no enforcement test of its
own. The reason is recorded here so that a future use of `--rule` for anything else is a deliberate
decision rather than an oversight. `--band` (era-shading crisis and pandemic bands, GOV-4) is the
same kind of decorative, non-text, non-category wash and is marked `role: rule` for the same
reason. `tokens.css`'s own comment calls it "neutral", and it never carries party or budget-category
meaning.

`--rev-ii` through `--rev-mi` (GOV-10's revenue-by-source stack) are `role: series` like the other
category colours above. Every one of them now clears 3:1 against both surfaces, where four scored
below it against the old panel. `RevenueChart.tsx`'s `<TableView>` still carries all seven sources
as labelled columns, so the redundant channel remains in place; it is no longer the only thing
holding the figure up.

**No series token scores below 3:1 in this palette.** Six did against the old cool stone. The gain
came from the ground rather than from any single hue: the warm paper is lighter, so every category
colour could move darker without losing its identity. The `redundant-encoding:` column above is
therefore empty, and the seven notes it used to carry are retired.

Colour-vision separation was measured as well as contrast, and it found a defect the ratios could
not. The old `--mix` sat OKLab dE 4.9 from `--dem` under simulated protanopia, against a floor of 6,
so mixed control and Democratic control were indistinguishable to those readers wherever the two
appeared together. The deep aubergine lifts the worst party pair to 11.3. Full separations, under
protanopia and deuteranopia at severity 1.0, are tabulated in `docs/design-notes-color.md`.

`--ink-soft` at 6.13:1 against `--ground` has 1.63 of headroom above the 4.5:1 floor, and 1.97
against `--panel` at 6.47:1. `test_text_role_tokens_meet_4_5_to_1` locks both margins, so a future
surface-token edit that erodes either one fails loudly rather than shipping a body-text regression.

### The plot surface

`--panel` sits 1.06:1 from `--ground` in the light palette and 1.06:1 in the dark one. The light
figure was 1.20:1 and the dark figure was 1.08:1. The light panel was `#FDFAF5`, within 1.05:1 of
white, so a plot area read as a bright card laid on warm paper. A statistical publication prints
the plot area at the paper colour or a shade off it, and lets the axis rules and the frame say
where the plot is. The panel now sits a shade off the paper.

The two surfaces are deliberately not identical. Three islands draw no gridline and no axis line at
all, so on those the `--panel` fill is the only element that states the plot rectangle.
`DebtMaturity` renders `<CartesianGrid horizontal={false} vertical={false}>` with no axis at all,
`DebtHolders` renders the same grid with both axes `hide`, and `WhoPays` renders the same grid with
`axisLine={false}` on both axes. At an identical panel those three figures would be marks on an
open page. At 1.06:1 the rectangle still reads.

Moving the panel toward the ground moves every light ratio in the `vs --panel` column down, and
every dark ratio up. The light column falls because the panel darkens toward a ground that every
light mark already clears; the lowest light series ratio is now `--rev-mi` at 3.40 against the
panel, against 3.86 before, and 3.22 against the ground. Every floor in this contract still holds
in both palettes.

`--band`'s light wash loses the most. It measures 1.25:1 against the new panel, against 1.42:1
before, which is a lightness difference of 8.40 in CIE L\*. The dark wash gains, from 1.13:1 to
1.16:1, or 6.16 in L\*. The dark value has shipped as visible at 5.04 in L\*, so the light wash
stays the more legible of the two and neither vanishes. `--band` itself was not retuned.

### The dark theme's tokens

`tokens.css` declares the dark palette twice, and the two copies must agree. One copy sits inside
`@media (prefers-color-scheme: dark)` and supplies the operating-system default. The other sits on
`:root[data-theme='dark']` and carries an explicit choice from the theme control in the site bar.
`test_the_two_dark_theme_blocks_declare_the_same_hexes` asserts that the two blocks declare the same
24 tokens at the same values, because a value edited in one copy alone would ship a palette that
depends on how the reader arrived at dark.

The ratios below are computed against this palette's own surfaces, the ground `#16130F` and the
panel `#1C1914`. The steps are a selection rather than an inversion, so `--mand` and `--rev-cu`
become the lightest marks in their groups.

| Token | Hex | vs `--ground` | vs `--panel` | Role | Redundant encoding |
|---|---|---|---|---|---|
| `--ground` | `#16130F` | 1.00 | 1.06 | surface |  |
| `--panel` | `#1C1914` | 1.06 | 1.00 | surface |  |
| `--ink` | `#EDE5D9` | 14.82 | 14.03 | text |  |
| `--ink-soft` | `#A79E90` | 7.00 | 6.62 | text |  |
| `--rule` | `#786D5C` | 3.65 | 3.45 | rule |  |
| `--dem` | `#6FA8E8` | 7.44 | 7.04 | series |  |
| `--gop` | `#E8798D` | 6.66 | 6.30 | series |  |
| `--mix` | `#8E6BC8` | 4.49 | 4.24 | series |  |
| `--mand` | `#C4CBD2` | 11.30 | 10.70 | series |  |
| `--domestic` | `#C4CBD2` | 11.30 | 10.70 | series |  |
| `--disc` | `#3FA9B4` | 6.65 | 6.30 | series |  |
| `--public` | `#3FA9B4` | 6.65 | 6.30 | series |  |
| `--int` | `#DB9440` | 7.34 | 6.94 | series |  |
| `--intragov` | `#DB9440` | 7.34 | 6.94 | series |  |
| `--foreign` | `#5F7A8A` | 4.09 | 3.87 | series |  |
| `--positive` | `#4FB27F` | 7.06 | 6.68 | series |  |
| `--band` | `#2B251D` | 1.22 | 1.16 | rule |  |
| `--rev-ii` | `#3FA9B4` | 6.65 | 6.30 | series |  |
| `--rev-pr` | `#DB9440` | 7.34 | 6.94 | series |  |
| `--rev-ci` | `#C4CBD2` | 11.30 | 10.70 | series |  |
| `--rev-ex` | `#5F7A8A` | 4.09 | 3.87 | series |  |
| `--rev-cu` | `#E8D2A8` | 12.53 | 11.86 | series |  |
| `--rev-eg` | `#BE9660` | 6.81 | 6.44 | series |  |
| `--rev-mi` | `#726F66` | 3.69 | 3.49 | series |  |
Every `role: text` token clears 4.5:1 on both dark surfaces, and every `role: series` token clears
3:1 on both. The lowest series ratio is `--rev-mi` at 3.49 against the dark panel. The
`redundant-encoding:` column is therefore empty here as well.

`--rule` and `--band` behave here as they do in the light palette. `--rule` measures 3.45 against
the panel, so it clears 3:1 and not 4.5:1. `--band` measures 1.16 and clears neither. Both carry
the same restriction. Neither paints text and neither carries a category, so both stay `role: rule`.

## Known limitation: no chart renders without scripting

The site draws its charts with Recharts, which renders nothing during a static build. A reader with
scripting disabled gets no chart on any figure. This replaces an earlier, narrower limitation about
axis-label legibility at a 390px viewport, which described a chart that at least appeared.

The cause is in Recharts itself. `ReportChartSize` dispatches the chart's width and height from a
`useEffect`, effects do not run in a static render, so the store still holds `width: 0` when
`MainChartSurface` reads it and that component returns `null`. No prop reaches past it.
`docs/contracts/interfaces/charts.md` records the decision and `docs/design-notes-recharts.md`
records the measurements.

What such a reader does get is the whole apparatus and all of the data. Every figure serves its
number, title, deck and caption, including both axis units and the verbatim source line, and a
complete `<TableView>` table carrying every value the chart draws with its units in the column
heads. That table is a native `<details>`, so it opens with no scripting at all.
`test_every_chart_has_a_real_table_in_the_static_html` and
`test_every_figure_server_renders_its_apparatus` hold both halves.

The `<noscript>` block in `BaseLayout.astro`'s `<head>` no longer enlarges axis text, because there
is no axis text to enlarge. It now shows `.hint-nojs`, so the hint under each figure names the
table rather than a hover or a tap that does nothing.

**Measured 2026-08-26: the mitigation does not apply at all.** The `<noscript><style>` block is
emitted in `<head>` *before* the bundled stylesheet, which carries `.axis-label { font-size: 11px }`
and its siblings at the same specificity and later in source order, so the bundle wins the cascade
every time. With scripting off at 390×844 (Chrome 151) the wide viewBox renders into 350 CSS px,
scale 0.486, and the three classes measure **5.10px, 5.35px and 5.59px** rendered, against the 10 to
11px this section previously claimed. Filed as **#78**. The paragraph above describes the intent.
It did not describe the shipped behaviour, and the anticipated crowding never occurred because the
text was never enlarged.

**Separately, the mitigation would not fix the underlying geometry even when it works.** The plot
area still uses the wide viewBox with scripting off, so it is proportionally smaller than the
JS-enabled narrow layout. The result is degraded but readable, and it is not equivalent.

**This section owns the scripting-OFF case only (#78).** The section used to be read as covering
annotation legibility generally, and that reading is now wrong. With scripting **on**, chart
annotations are clamped to their SVG's edges by `src/components/charts/annotate.ts` and asserted by
five guards in `pipeline/tests/test_accessibility.py` (#64, § Right-edge annotation clipping below).
Enlarging `.annotation` under `<noscript>` was never the fix for #64 and could not have been. The
defect was placement past the viewBox edge rather than type size, and larger type at the same `x`
clips *sooner*.

## The browser lane, and what it now asserts

Every geometric claim in the sections below was, until #67, a number a person measured once in a
browser and nothing re-ran. `npm run test:browser` (`tests/browser/`, `node --test` driving
Playwright's Chromium) re-runs the machine-checkable half on every pull request, via
`.github/workflows/checks.yml`. `deploy.yml` calls the same workflow, so **a failure blocks the
deploy**. Seven routes, 390x844 and 1440x900, plus a scripting-off pass.

**Legend.** **ASSERTED** means the spec fails if the claim regresses. **ASSERTED (driven)** means
the same, but only after the spec operates a control. **HUMAN** means the claim stays with #30 and
#80, and the spec does not claim it. **COVERED ELSEWHERE** means a static or unit guard already
holds it, and the browser lane deliberately does not duplicate it.

| # | Deferred measurement | Disposition |
|---|---|---|
| 1 | Radix `Select` popper width at 390px: listbox and every option inside `innerWidth` | **ASSERTED (driven)**, `driven.test.ts`, all 3 `.select-trigger`s at both viewports |
| 2 | Option text wraps, never truncates (`text-overflow` computes `clip`) | **ASSERTED (driven)**, `getComputedStyle` per option |
| 3 | Whether the seven wrapped labels still *read* as distinguishable | **HUMAN**. A copy judgement, #80 |
| 4 | #62 E1: forcing `--radix-select-content-available-width` invalid still clamps | **HUMAN**. Asserting it would pin the suite to a Radix internal, which is the thing the fallback exists to survive |
| 5 | #62 E4: the clamp is inert at desktop width | **ASSERTED (driven)**. The 1440x900 pass measures the same inertness |
| 6 | By-state `.tableview-scroll` overflows its client while the page does not | **ASSERTED**, `driven.test.ts`, and again in the scripting-off pass |
| 7 | Pinned row header holds at full-right scroll | **ASSERTED (driven)**, `scrollLeft` set to max, then measured against the container's left edge |
| 8 | #63 E4: the five sort buttons clicked at full-right scroll, geometry re-measured after each | **ASSERTED (driven)** |
| 9 | #63 E2: `border-collapse` hairlines still paint across and along the pinned column | **HUMAN**. Established by screenshot; no non-pixel assertion expresses it |
| 10 | #63 E6: identical geometry with `javaScriptEnabled: false` | **ASSERTED**. The scripting-off pass |
| 11 | #63 E9: 320x568 still fits name + `Net balance` | **HUMAN**. This row's own subject stays human-judged. 320px is outside this contract's general commitment, with ONE named exception since #74: the legend-integrity invariant is asserted at 320px by `tests/browser/legend.test.ts`, which declares that width locally rather than widening `VIEWPORTS`. Nothing else at 320px is committed, and widening it further stays a deliberate act |
| 12 | #64 rendered pixels: no annotation overruns its SVG, both viewports, all routes | **ASSERTED**. Generalised past `.annotation` to **every** `<text>` in every `<svg>` |
| 13 | #64 criterion 4: a clamped label must not land on the series it names | **HUMAN**. Needs the set of labels the clamp *moved*, knowable only by re-running the placement. The clip guard was green throughout while this was broken, so a green spec must not imply it |
| 14 | #64 `ADVANCE_EM`: worst `getComputedTextLength()/(chars x fontPx)` <= 0.62 | **ASSERTED**. One-sided, over exactly the classes `estimateTextWidth` estimates |
| 15 | #64: no annotation moves between SSR paint and hydration | **COVERED ELSEWHERE**, `test_annotation_placement_is_not_measured_at_runtime` |
| 16 | #65: adjacent controls' hit areas on a **wrapped** 390px row | **ASSERTED**. Pairwise intersection over every control's hit area, both viewports, zero intersecting pairs |
| 17 | #65: every control's hit area is >= `--target-min`, read from `:root` at runtime | **ASSERTED**. The floor is **read**, never hardcoded. One named exception, below |
| 18 | #65 E7: `elementFromPoint` at the track centre returns the range, not the thumb | **ASSERTED (driven)** |
| 19 | #65 E8: two thumbs at `minStepsBetweenThumbs` clear the hit-area floor | **ASSERTED (driven)**. Both thumbs driven to minimum separation with the keyboard |
| 20 | #65 E2: an open `.select-content` does not intersect its trigger's hit band | **ASSERTED (driven)** |
| 21 | #65 E9: overlays inside `.law-table-scroll` still measure the floor | **ASSERTED**. Falls out of 17 |
| 22 | #66 rendered pixels, **NOT EXECUTED in that pass**: relocated category labels, staggered leader labels, four shortened titles | **ASSERTED**. Same walk as 12; widening it past `.annotation` is what closes this |
| 23 | #66 E8: that `WhoPays`' label reads as belonging to its own bar pair | **HUMAN**. Recorded there as human-judged and **not** claimed as verified; that sentence stands |
| 24 | #66 per-figure grid, the rows reading NOT EXECUTED for figures in their **default** state | **ASSERTED**. The default-state geometry of all 25 figures is covered by 12 and 22 |
| 25 | ...of those, the 5 rows whose deferral names an **interactive** state | **ASSERTED (driven)**, `#whole-budget`, `#the-laws`, `#by-state`, `#what-a-household-earns`, `#the-spread`: each named control operated once, the figure re-measured |
| 26 | #66: "Browser lane not run in this pass" as a standing FAIL disposition | **RESOLVED**. Asserted since #67 |
| 27 | #46/#42 contents affordance: 44px tap targets, tab order `.skip-link` -> `<summary>` -> `main` | **ASSERTED**. The 44px falls out of 17; the tab order is the first three stops below 62rem. The rail's sticky geometry stays **HUMAN** |
| 28 | "nothing re-runs any of the above" | **RESOLVED**. Rewritten in place to name the spec |
| 29 | M8: the focus ring computes under WCAG 2.2's 2px minimum (was a standing **FAIL**, #75) | **RESOLVED**, #75 made the width a `--focus-ring: 2px` token that every ring rule reads, and `tests/browser/focus.test.ts` F1 asserts it over seven ring-painting classes at both viewports. The token is **read from `:root` at runtime**, not hardcoded, so F1's two halves fail apart: one asks whether every rule agrees with the token, the other whether the token clears the standard. `smoke.test.ts`'s expected-failure entry is retired, not inverted |
| 30 | M1/M3/M5/M6/M7/M8 on `/glossary` and `/contents`: **NOT EXECUTED** | **PARTLY ASSERTED**. The spec covers all seven routes, so the width, overflow, target-size, console and skip-link halves close. The screen-reader and greyscale-reading halves stay **HUMAN** |
| 31 | M2 screen-reader pass, every route | **HUMAN**. No assistive technology runs in CI. Explicitly out of #67's scope |
| 32 | M6 greyscale render | **HUMAN** for the reading judgement. The luminance-ratio table below is mechanisable, and it is #30's artefact, so it is not acted on here |
| 33 | Safari.app focus-ring check | **HUMAN**. Playwright's WebKit is **not** Safari.app, and a lookalike engine must not be allowed to satisfy it. #80 |
| 34 | M12 JavaScript disabled: page `scrollWidth` == viewport, and the trigger shapes | **ASSERTED** for the width and overflow half, by the scripting-off pass; the trigger-shape half is **COVERED ELSEWHERE** by the static `test_*term*` guards |
| 35 | #69: the tab order through a chart route, and that every datum stays reachable once it is bounded | **ASSERTED**, `keyboard.test.ts`. A real Tab walk (press, read `document.activeElement`) on `/government` hydrated and with scripting off; per-svg stop enumeration on all three chart routes at both viewports, scripting on and off; arrow traversal over the largest group on each route; and the same enumeration after every option of `#the-laws`' three filters and both `YearRange` extremes |

| 36 | #71: that a wide table's scroll container is reachable and scrollable by keyboard, and that making it so does not add empty Tab stops | **ASSERTED**, `tests/browser/scroll.test.ts`. The focusable-exactly-when-it-overflows invariant over all 27 containers on three routes at both viewports with every `<details>` open; arrow/`Home`/`End` movement with clamping; all seven `#prices-rates` columns brought fully into view by keys alone; role, caption-containing name and a solid author focus ring; Tab-order growth equal to exactly the overflowing count, self-baselined; and both `keyboard.test.ts` bounds re-walked in the all-tables-open state. The served-bytes half is `test_the_served_bytes_carry_no_focusable_scroll_container` |

| 37 | #74: that every legend marker on the site shares a line with the label it belongs to, at 320, 390 and 414 | **ASSERTED**, `tests/browser/legend.test.ts` L1/L2. A generic marker rule (a painted box <= 26x26px outside a chart `<svg>`, or a top-level inline `<svg>`) over all three chart routes: 36 markers site-wide, pinned per route as **26 / 10 / 0** and per kind as `state-legend-swatch` 3, `character-swatch` 23, CBO `<svg>` 6, `year-range-thumb` 4 skipped, asserted as equalities **before** any geometry is read |
| 38 | #74: that the label survives a longer, data-driven number | **ASSERTED (driven)**. L3 replaces the legend's two currency strings in the DOM at each of the three widths, with `$1,113,122,999` and again with a 45-character unbreakable token, and re-runs both the line-sharing and the overflow halves |
| 39 | #75: that every author focus ring on the site is the same width, that the width clears WCAG 2.2 SC 2.4.13, and that widening it clips nothing | **ASSERTED**, `tests/browser/focus.test.ts`, four guards. F1: seven ring-painting classes on `/government` and `/households` at both viewports, the count of classes measured asserted as **7 before any width is compared**, each held to `isAuthorRing` (so Chromium's UA `outline-style: auto` ring cannot satisfy it) and to the runtime-read token, plus the skip link's `--panel` colour override. F2: every laid-out mark-bearing `<svg>` on the three chart routes (**5 / 8 / 13 of 5 / 8 / 14**, the one omission being `AttribChart`'s `display: none` second panel), driven by **ArrowRight** so #69's fallback is the rule under measurement, asserting `vector-effect: non-scaling-stroke` and `stroke-width === token`, and **refusing to run unless at least one chart's screen-CTM scale is not 1**. F3: no ring clipped on a container's **non-scrollable** axis, the scrollable axes computed per container rather than named; and `documentElement.scrollWidth - clientWidth === 0` while focusing every control on all seven routes, against per-route floors that **exclude #71's scroll containers** (focusable exactly when they overflow, hence font-metric dependent, two on `/government` at 1440px on macOS, one on Linux) and assert their presence separately as `>= 1`. F4: zero neighbouring marks fully enclosed by a focused ring at 390px, with a two-group carried exception pinned by **group identity** |

**Of the 39, 26 are asserted, 3 are covered elsewhere, and 10 remain human-judged.** Each of the 10
carries a stated reason, and none of them is a shortage of time. The reasons are assistive technology
that does not exist in CI, a pixel judgement, a copy judgement, a viewport outside this contract, and
a probe whose assertion would pin the suite to a third-party internal.

### What the lane found on its first run

Two defects, both **recorded and not fixed in #67**, because the lane reports rather than
repairs:

- **Vertical clipping.** `Chart.tsx` renders with a `viewBox` and no `overflow: visible`, so a
  `<text>` drawn below the box is cut mid-glyph exactly as #64's horizontal case was. 19 of them,
  `YEARS TO MATURITY` on `/government#how-old` worst. The counts are pinned per route and viewport in
  `smoke.test.ts`'s `VERTICAL_CLIP_BASELINE`, asserted with `<=`, so the set cannot grow silently.
- **`.basis-toggle-item`**, the `#by-state` per-person/total toggle, is `.unit-toggle-item`'s twin
  but was never added to the shared `::before` overlay, so its hit area measures 16px against the
  24px floor. Carried as a named, issue-referenced entry in `smoke.test.ts`'s `KNOWN_UNDERSIZED`,
  which is a named exception rather than a lowered floor.

### What this lane deliberately does not do

- It does not re-derive `annotate.test.ts` and `axisFit.test.ts`'s NARROW-lane geometry, nor the
  static guards in `pipeline/tests/test_accessibility.py`. The three-lane boundary below stands.
- It runs **Chromium only**. WebKit is not installed, because Playwright's WebKit is not Safari.app
  and installing it would let a lookalike engine appear to close #80.
- It is **not a required status check**. A required check that never reports blocks every merge
  permanently with no error message, and this repository had zero CI contexts before #67. The
  precondition, green on a real pull request, is not acted on here.

**Font metrics.** `src/styles/tokens.css:4-5` ships a deliberate system-font stack with no webfont,
so macOS and Linux metrics differ by design. The lane takes a **tolerance rather than a pinned
container**. A container would make CI reproducible at the cost of making the developer's local run
the divergent one, and that is the run that has to be trusted while someone is fixing a failure.
`TOLERANCE_PX = 1` applies on containment. Every other assertion is an integer or a one-sided
inequality, so drift can only make the lane stricter.

## Manual pass results

Issue #30's sweep ran in two sittings. **2026-08-24** covered keyboard traversal, roving tabindex
and focus restoration, 390px legibility, and rendered-pixel contrast. Those readings are recorded in
#30's comments and transcribed here unaltered. **2026-08-26** covered the greyscale pass with
computed per-chart luminance ratios, the 390px JavaScript-off measurement, and the WebKit focus-ring
paint check.

**2026-08-26, second sitting (#57).** The 390px width measurement re-run on all six routes after
the `/sources` overflow fix, in headless Chromium at 390×844 against a local build of `dist/`
rather than the deployed site. The fix is not deployed yet, and measuring the deployed page would
have recorded the old number. Every route reads `documentElement.scrollWidth` **390** against
`clientWidth` **390**: `/`, `/economy/`, `/government/`, `/households/`, `/sources/`, `/glossary`,
`/contents`. Only the width check was re-run. No other M-row moved, and the rows that need
assistive technology or Safari.app are still NOT EXECUTED and still carried by #80.

**Tooling.** Chrome **151.0.0.0** (headless Chromium, Playwright MCP) at 1440×900 and 390×844, and
WebKit **26.5** (Playwright WebKit, `AppleWebKit/605.1.15 Version/26.5`, the Safari 26.5 engine and
*not* Safari.app), both against the deployed site `https://travisgalloway.com/income-tax/`. No
assistive technology and no Safari.app exist in this environment; every row that needs one reads
**NOT EXECUTED** and is carried by #80, which blocks `A11Y-2` from `Shipped`.

The greyscale pass is **JavaScript on**, because that is the state a sighted reader is in. The
charts are not missing without it. Every section island server-renders its full `<svg>`, `DebtChart`
included, measured in #36 across all three routes, 25 of 25 figures, and held there by
`test_every_figure_server_renders_its_chart_svg`. `client:visible` defers *hydration* rather than
rendering. The JavaScript-off state is checked by `M5` instead, on its own terms.

The figure number is **real text** rather than CSS generated content. Until #49 the number was a
counter on `.figure-head::before` (`content: 'Figure ' counter(figure)`), which put it outside the
accessibility tree in the engines that skip generated content, and outside the served bytes
entirely. The number is now a `<span class="figure-no">Figure 13</span>` rendered from
`src/data/figures.ts`, with the same typography, so the number a reader hears is the number the page
shows and `/contents` names the same one.

| Check | Route | Result | Tool | Evidence / issue |
|---|---|---|---|---|
| M1 keyboard traversal | `/` | PASS | Chrome 151 + browser lane | Skip link is the first tabbable element at (8,8), 135×44, `href="#main"`, `main[tabindex="-1"]`; zero positive `tabindex` site-wide. **The "389 of 408 tab stops are data points" reading recorded here was `/economy`'s, taken before the intro-route split**: `/` now renders zero figures, zero `<svg>` and 20 tab stops. That 20 was measured on 2026-08-24 against the four-section front door. The 2026-08-29 rewrite splits the page into six sections, which adds two contents links to each of the two lists. The card count and the in-prose link count are unchanged at six and two, and the reading is not re-measured here. `/economy`'s own figure was 389 of 437, and is 53 since #69. No wide table renders on this route, so #71 does not arise here either. |
| M1 keyboard traversal | `/government/` | FAIL | Chrome 151 + browser lane | Skip link and landmark order as above. The "380 of 471" reading predates the intro-route split; at `d69e4e6` it was **364 of 512**, with **438** presses to §11. Since #69 each chart `<svg>` is one roving group: **161** stops and **141** to §11 hydrated, **136** and **118** with scripting off, every one of the 369 marks still reachable by arrow key. Since #71 it is **163** and **142**, the two extra stops being the two wide tables that are not inside a `<details>`; scripting off is unchanged at 136/118. Walked on every pull request by `keyboard.test.ts`. Was FAIL for **#72 alone** (four `radiogroup`s all resolved to the name "Measured in"); **#72 has shipped** and all nine now resolve distinctly, see *Unique accessible names for choice-set controls*. **PASS** on naming as of 2026-08-27. |
| M1 keyboard traversal | `/households/` | PASS | Chrome 151 + browser lane | Skip link and landmark order as above. The 356 recorded here is the **mark** count, not the tab-stop count; the walk at `d69e4e6` was 428 stops of which 356 were marks. Since #69: **80** stops, all 356 marks still reachable by arrow key, including `BracketHistory`'s 113, the largest group on the site. #71 resolved the scroll-container half: this route's seven wrappers are focusable exactly while they overflow, and the walk is unchanged at 80/67 because all seven sit inside a `<details>`. **PASS as of #71.** |
| M1 keyboard traversal | `/sources/` | PASS | Chrome 151 | Skip link first at (8,8) 135×44; `main[tabindex="-1"]`; zero positive `tabindex`; no focusable datum and no scroll container renders on this route, so #71 does not arise here. |
| M1 keyboard traversal | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M1 keyboard traversal | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M2 screen-reader pass | `/` | NOT EXECUTED | — | No assistive technology exists in this environment. Human required, #80. |
| M2 screen-reader pass | `/government/` | NOT EXECUTED | — | As above, #80. |
| M2 screen-reader pass | `/households/` | NOT EXECUTED | — | As above, #80. |
| M2 screen-reader pass | `/sources/` | NOT EXECUTED | — | As above, #80. |
| M2 screen-reader pass | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M2 screen-reader pass | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M3 roving tabindex / focus trap | `/` | PASS | Chrome 151 | Radio groups carry `role` plus `aria-checked` plus a roving tabindex; no control traps focus. |
| M3 roving tabindex / focus trap | `/government/` | PASS | Chrome 151 | All 20 radios site-wide carry `role` + `aria-checked` + roving tabindex; the three filter dropdowns close on Escape and restore focus to their trigger. The naming defect was #72, not focus behaviour; #72 has shipped. |
| M3 roving tabindex / focus trap | `/households/` | PASS | Chrome 151 | As above; no focus trap. |
| M3 roving tabindex / focus trap | `/sources/` | PASS | Chrome 151 | Vacuous, no roving-tabindex control renders on this route. |
| M3 roving tabindex / focus trap | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M3 roving tabindex / focus trap | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M4 390px legibility, JS on | `/` | FAIL | Chrome 151, 390×844 | Body does not scroll horizontally (`scrollWidth` 390 = `clientWidth`). Right-edge annotations clipped, #64. Chart legibility sweep, #66. "Focus or hover" instruction with 3.3px hit targets, **fixed 2026-08-27 (#73)**, measurement below. Open tables uncapped, page 11,316px → 24,195px, #77. |
| M4 390px legibility, JS on | `/government/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. Filter menu wider than the phone, **fixed 2026-08-27 (#62)**, measurement below. §11's by-state table was unreadable at this width, every column was present and scrollable, but the name column scrolled away with the numbers and the caption's box was the table's 745px, **fixed 2026-08-27 (#63)**, measurement below. #64, #66. #73 **fixed 2026-08-27**, measurement below. §11 legend wrapped a swatch away from its label, **fixed 2026-08-27 (#74)**, measurement below. Wide tables still give no at-rest sign that they scroll, #76. |
| M4 390px legibility, JS on | `/households/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. §4 Figure 4 clipped at the right edge, #64. #66. #73 **fixed 2026-08-27**, measurement below. |
| M4 390px legibility, JS on | `/sources/` | **PASS** (was FAIL) | Chromium (Playwright MCP), 390×844 | **Re-measured 2026-08-26 after #57.** `documentElement.scrollWidth` **390** against `clientWidth` **390**. No horizontal body scroll, against 520 vs 390 before. Widest of the 45 `<code>` spans is now **348px**, against 500px; none is clipped (`scrollWidth == clientWidth` on all 45) and none carries `text-overflow: ellipsis`, so nothing was bought by truncation. Fixed by `overflow-wrap: anywhere` on `.reference-doc code`, contained at the element and never at the page. **#79 closes as fixed-by-#57.** The route also gained 23 `main` hyperlinks, from zero. |
| M4 390px legibility, JS on | `/glossary` | **PASS** (width only) | Chromium (Playwright MCP), 390×844 | **Executed 2026-08-26 (#57)**, for the width check only: `scrollWidth` **390** = `clientWidth` **390**, with the 25 new external source links in place. The rest of M4, chart legibility, hit targets, table caps, is vacuous here (zero `<figure>`, zero `<svg>`, zero islands). The keyboard and screen-reader rows below are still NOT EXECUTED. |
| M4 390px legibility, JS on | `/contents` | **PASS** (width only) | Chromium (Playwright MCP), 390×844 | **Executed 2026-08-26 (#57)**, for the width check only, the check this route's own edge case is about: `scrollWidth` **390** = `clientWidth` **390**, so the long derived source lines do not overflow the way `/sources`' did (#79). Zero external hyperlinks, which is #49's stated decision and not an omission. The rest of M4 is vacuous here, and the keyboard and screen-reader rows below are still NOT EXECUTED. |
| M5 390px legibility, JS off | `/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | `useChartSize` never runs, so the 720×396 `WIDE` viewBox renders into 350 CSS px (scale 0.486): `.axis-title` **5.10px**, `.axis-label` **5.35px**, `.annotation` **5.59px**. The `<noscript>` mitigation is emitted before the bundled stylesheet and loses the cascade, so it never applies. New finding, filed as #78. Same page with JS on: 10.21 / 10.69 / 11.18px. |
| M5 390px legibility, JS off | `/government/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | Same wide-preset scaling and the same overridden mitigation, #78. All 13 `<details>` tables are present in the static HTML with scripting off. |
| M5 390px legibility, JS off | `/households/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | 5.10px minimum, same cause, #78. All 7 `<details>` tables present with scripting off. |
| M5 390px legibility, JS off | `/sources/` | **PASS** (was FAIL) | Chromium (Playwright MCP), 390×844 | No chart renders, so #78 does not apply; the `<code>` overflow that made this row fail is gone at the CSS layer, which does not depend on scripting, see the M4 row and #79. |
| M5 390px legibility, JS off | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M5 390px legibility, JS off | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M6 greyscale render | `/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.03:1** (ECO-4 rates panel, `--ink-soft` #5A6268 against `--rev-ci` #55606B). Every series carries an in-plot end label and a `<TableView>` column, at both viewports. See the per-chart table below. |
| M6 greyscale render | `/government/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.00:1** (GOV-10, `--rev-pr` #C77D28 against `--rev-eg` #A8895A), non-adjacent bands in the stack; the tightest *adjacent* band pair is 1.44:1 and every boundary is drawn. GOV-11's cartogram carries direction as a `+`/`−` glyph on every tile. See the per-chart table below. |
| M6 greyscale render | `/households/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.06:1** (HH-4, `--positive` against `--rev-ii`) and it does not matter: HH-4 encodes its five income groups as **marker shapes** (circle, square, triangle, diamond, ×, +) with a shape legend, so colour carries nothing on its own. |
| M6 greyscale render | `/sources/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Vacuous, zero `<figure>`, zero `<svg>`, and every `main` text colour is `--ink` or `--ink-soft`. No colour-coded category renders on this route. |
| M6 greyscale render | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M6 greyscale render | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M7 focus ring paints on SVG | `/` | PASS | WebKit 26.5 | Focused `rect.datum` (389 of them): `outline: 1px solid rgb(17,22,27)`, `outline-offset: 1px`, `stroke: rgb(17,22,27)`, `stroke-width: 2px`. A ring paints, confirmed by screenshot. WebKit computed the 1.5px rule as **1px**. That was the evidence for #75, **now fixed**: the width is the `--focus-ring: 2px` token. And the `stroke` fallback, the ring WebKit actually paints here, was itself **under** the minimum, because `stroke-width` resolves in user units and every chart `<svg>` is scaled: **1.944 CSS px at 390px**, 2.044 at 1440px. `vector-effect: non-scaling-stroke` makes it render exactly **2.000** at both viewports on every `.datum`-bearing chart, measured. Safari.app itself NOT EXECUTED, #80: a headless engine is still not Safari.app. |
| M7 focus ring paints on SVG | `/government/` | PASS | WebKit 26.5 | Focused `circle.datum` (249): same computed ring, and the same `non-scaling-stroke` correction, 2.000 CSS px at both viewports. Safari.app NOT EXECUTED, #80. |
| M7 focus ring paints on SVG | `/households/` | PASS | WebKit 26.5 | Focused `circle.datum` (356): same computed ring, and the same `non-scaling-stroke` correction, 2.000 CSS px at both viewports. Safari.app NOT EXECUTED, #80. |
| M7 focus ring paints on SVG | `/sources/` | PASS | WebKit 26.5 | Vacuous, no `.datum` renders on this route. Focus-ring visibility on the route's links in Safari.app NOT EXECUTED, #80. |
| M7 focus ring paints on SVG | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M7 focus ring paints on SVG | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M8 measured rendered-pixel contrast | `/` | PASS | Chrome 151 / Chromium 151 | Focus ring measures `outline: 2px solid rgb(17,22,27)` at 13.65:1 against `rgb(221,224,219)`. Colour passed all along; the **thickness now meets the WCAG 2.2 Focus Appearance 2px minimum**, #75, fixed 2026-08-27 by the `--focus-ring: 2px` token. It previously read `1.5px`, which Chromium computed as `1px`. Asserted by `tests/browser/focus.test.ts` F1. Text tokens measured against the shipped grounds pass (see the token table above). |
| M8 measured rendered-pixel contrast | `/government/` | PASS | Chrome 151 / Chromium 151 | Same shared-layer ring, same measurement, 2px at 13.65:1 since #75. |
| M8 measured rendered-pixel contrast | `/households/` | PASS | Chrome 151 / Chromium 151 | Same shared-layer ring, same measurement, 2px at 13.65:1 since #75. |
| M8 measured rendered-pixel contrast | `/sources/` | PASS | Chrome 151 / Chromium 151 | Same shared-layer ring, same measurement, 2px at 13.65:1 since #75. |
| M8 measured rendered-pixel contrast | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M8 measured rendered-pixel contrast | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |

Two review results are recorded here because they were checked and found **correct**, so that a later
reader does not "fix" them. Both `<nav>` landmarks *are* named, by `aria-label="Site"` and by
`aria-labelledby="toc-heading"` resolving to "Contents", and an early review said otherwise and was
wrong. The site renders **zero `<input>` and zero `<select>` elements**. Console output is clean on
all four routes at both viewports, at 0 errors and 0 warnings. #70 (three in-prose links skip the
base path and 404 in production) came out of the same review. It is a link-target defect rather than
one of the eight checks, and it is filed and open.

### In-prose glossary term markers (#47)

**EXECUTED 2026-08-26**, Chromium **151.0.7922.174** (Playwright MCP, `Chrome/151.0.0.0` UA),
against `astro preview` at 390×844 and 1280×900. Console clean throughout: **0 errors, 0 warnings**,
scripting on and off. 26 markers: 6 on `/economy`, 8 on `/households`, 12 on `/government`. `/`,
`/sources` and `/glossary` carry **0**, and the IIFE returns on its first line there. Verified, with
no console error (E9).

| Check | Route | Result | Tool | Evidence |
|---|---|---|---|---|
| M9 390px clipping, longest `short` | all three | PASS | Chromium 151, 390×844 | Every one of the 26 popovers opened in turn. `documentElement.scrollWidth` **390** at every open; every `getBoundingClientRect()` fully inside the viewport; every popover **350px** wide, one value on all three routes, because the width is the paragraph's, not the content's. Longest `short` per route: `real` 137 chars (`/economy`), `marginal-rate` 148 (`/households`), `debt-held-by-the-public` 152 (`/government`), all inside. `offsetParent` is `P.standfirst` or `P.prose` in every case, never a higher ancestor (E4 holds). Exactly **1** popover open at a time across all 26 (E3), and 0 after the sweep. |
| M9 line-break case (E5) | `/households` | PASS | Chromium 151, 390×844 | `marginal-rate` wraps two line boxes at 390px; its popover's top sits **0px** below the trigger's `getBoundingClientRect().bottom`, i.e. below the *whole* trigger rather than through it. Every single-line marker measures 0-1px. |
| M10 keyboard, 1280 and 390 | `/households`, `/government` | PASS | Chromium 151, 1280×900 and 390×844 | Full expected/actual table in checklist item 8. Tab in opens; Tab reaches `.term-more` with the popover open; Tab again closes it and continues; Shift-Tab from `.term-more` returns to the trigger with it still open; Escape closes with `activeElement` on the trigger and `window.scrollY` **0** before and after, from both positions. No trap in either direction. Contention re-check in the same session: the first `/government/` filter dropdown still closes on Escape and restores focus to its own trigger, and `#navbar-disclosure` still closes on Escape and returns focus to its `<summary>`. |
| M11 touch and pointer, 1.4.13 | `/government` | PASS | Chromium 151, 390×844 | One `pointerType: 'touch'` tap on `outlays` opened the popover and `location.href` was **unchanged**; a second tap did not navigate either. A real mouse move from the trigger onto the popover left it open (`:hover` on the popover confirmed), **hoverable**, met by the DOM shape. Held open **3s** with no pointer or key input, **persistent**, no auto-close timer exists. **Dismissable** is Escape (M10) and an outside click, both verified. Clicking `.term-more` navigated to `/income-tax/glossary#outlays` with the `<dt>` at **64px**, clear of the 52px bar (E6). Platform affordances intact: `metaKey` and middle-click clicks were **not** `preventDefault`ed and opened real new tabs on `/glossary#real`; a plain left click **was**. |
| M12 JavaScript disabled | all three | PASS | Chromium 151, `javaScriptEnabled: false`, 390×844 and 1280×900 | All 26 triggers are `<a>`, **0** `<button>`, 0 inert elements. Every `href` starts `/income-tax/glossary#`, so no unbased link reaches a reader. **0** triggers carry `aria-expanded` (nothing advertises a state it does not have). **0** popovers have any rendered height, and every `short` is nonetheless in the DOM as the trigger's `aria-describedby` target. Following a marker landed on `/glossary#real`, `<dt>` at 64px at 390 and at the top at 1280. `scrollWidth` equals the viewport at both. Console: 0 errors, 0 warnings. |

The `<button>` count is **unchanged** from the pre-change build, at 57 on `/government/`, 2 on
`/households/` and 0 everywhere else. That is the form criterion 5 takes here, because islands
server-render real buttons and the right assertion is "unchanged" rather than "zero".

**Not executed, and not executable here.** Whether the definition announces as the trigger's
*description* under VoiceOver + Safari and NVDA + Firefox. No assistive technology exists in this
environment and none can be driven from an exec agent. **NOT EXECUTED, human required, #80**, the
same disposition as items 2, 9, 10 and 13. The machine-provable half is `aria-describedby` resolving
to an in-DOM element inside the same wrapper carrying the term's `short` verbatim, with no portal
and no live region, and it is asserted by the five `test_*term*` checks.

### Radix `Select` popper width at 390px (#62)

**A measured browser observation rather than an automated assertion.** CSS width and overflow are
*computed*, and Radix mounts `Content` only while a listbox is open. `dist/government/index.html`
contains `select-content` **zero** times against `select-trigger` **3** times, so no static test in
this repository can see this defect. The three guards added in
`pipeline/tests/test_accessibility.py` do not claim to see it. They assert the *declarations* are
present, so a later sweep that deletes one turns red. The observation below is **asserted since #67**
by `tests/browser/driven.test.ts`, which opens every `.select-trigger` at both viewports and
measures the listbox and every option against `innerWidth`. See *The browser lane, and what it now
asserts*.

**Executed 2026-08-27**, Chromium **151.0.0.0** (Playwright MCP), `dist/` served locally at
**390×844**, `/government/`. Before and after are the same build path, changing only the CSS clamp
in `.select-content` / `.tax-mix-select-content` and the `collisionPadding={8}` the two `Content`
call sites now pass.

| Measurement, at 390×844 | Before | After |
|---|---|---|
| §8 "Control at enactment" listbox | 426.6px wide, laid out **x=10 → 436.6** | 374px wide, **x=8 → 382** |
| its 7 options' right edge | **435.6**. 45.6px past the 390px viewport, on every one | **381**, inside the viewport on every one |
| `--radix-select-content-available-width` on the `Content` | 370px (Radix's own default padding of 10), unused, `max-width` computed `none` | 374px, and `max-width` computes to it |
| option height | 32.2px, single line | 32.2px for the short option, **53.3px** for the six that now wrap to two lines |
| §8 "Vote character" listbox | x=20 → 174 | unchanged, x=20 → 174 |
| §8 "President" listbox | x=168 → 295.1 | unchanged, x=168 → 295.1 |
| §11 jurisdiction listbox | x=126 → 268.3, computed **`overflow-x: auto`** | x=126 → 268.3, computed **`overflow-x: hidden`**, `scrollWidth == clientWidth` |
| `documentElement.scrollWidth` with the longest option selected | 390, but the trigger's own label unbounded | **390**; the trigger wraps inside `.filters`, x=20 → 370, and `Clear filters` arrives at right=86.8 without pushing the row |

**Distinguishability, the point of the issue.** All seven options render their full text with the
trailing chamber and party intact and no truncation. `text-overflow` computes to `clip` on every
one, and each of the six configuration labels still ends in `Senate (DRR)`, `(RRR)`, `(RDD)`,
`(DDD)`, `(DRD)`, `(RDR)`. The strategy for long labels is **wrap**, and never abbreviation or
truncation. Right-truncation is the defect the issue was filed about, and an abbreviated label would
need a copy decision the issue puts out of scope.

**Consequence, recorded rather than presented as a fix.** A wrapped option is 53.3px tall against
32.2px. That height is a by-product of wrapping and **not** a target-size fix. Thumb-sized hit
targets are **#65**, still open, and the trigger's own 22px height is untouched here.

**Fallback (E1).** Forcing `--radix-select-content-available-width` to the guaranteed-invalid value
on the open `Content` makes `max-width` compute to **366px**, which is `calc(100vw - 1.5rem)`, with
the listbox at x=16 → 382, every option's right edge at 381 and `documentElement.scrollWidth` still
390. The clamp does not depend on the var surviving a Radix upgrade.

**Desktop (E4).** At **1280×900** the clamp is inert. The §8 listbox is **426.6px** wide before and
after, x=639 → 1065.6 both times, every option 32.2px tall and unwrapped, with `max-width` computing
to 1264px.

### Government §11's by-state table at 390px (#63)

**A measured browser observation rather than an automated assertion.** Width, `overflow`, sticky
offsets and `cqi` resolution are all *computed*, and `dist/` carries markup and a stylesheet rather
than a layout, so no static test in this repository can see this defect. The four guards added to
`pipeline/tests/test_accessibility.py` do not claim to see it. Three assert the *declarations* are
present (`test_the_by_state_row_header_column_is_pinned`,
`test_the_by_state_caption_is_bound_to_its_scroll_container`,
`test_no_stylesheet_rule_hides_a_table_cell_at_a_breakpoint`) so a later sweep that deletes one
turns red, and the fourth
(`test_the_by_state_table_serves_all_five_columns_with_scripting_off`) reads the built bytes.
`test_the_by_state_guards_bite_the_ways_the_fix_can_regress` is their negative test. Automating the
observation below is **asserted since #67** by `tests/browser/driven.test.ts`. See *The browser
lane, and what it now asserts*.

**The defect class, established before the fix and worth recording.** The cause was never hidden
columns. `global.css` had no width breakpoint at all, because its only two `@media` blocks were
`62rem` for the navbar and `prefers-reduced-motion`, and none of its nine `display: none` rules
touched a table cell. The 745px came from
`.sortable-table th, .sortable-table td { white-space: nowrap }` over five columns with four long
headers.

**Executed 2026-08-27**, Chromium **151.0.0.0** (Playwright MCP), `dist/` served locally under
its `/income-tax/` base at **390×844**, `/government/` §11. Before and after are the same build
path, changing only `global.css`.

| Measurement, at 390×844 | Before | After |
|---|---|---|
| `.tableview-scroll` (§11's) `clientWidth` / `scrollWidth` | 350 / **745** | 350 / **496**. The header and row-name wrap inside `@media (max-width: 30rem)` removes 249px of scroll without removing a column |
| cells whose right edge is past x=390, at `scrollLeft: 0` | **171** | 171, unchanged **by design**: this is a scroll, and the fix is that scrolling now works, not that the table shrank to fit |
| `Wyoming (WY)` row header, scrolled fully right | x **−375 → −168**. Entirely off-screen while its numbers were readable | x **20 → 128**, pinned; its text runs 32 → 88 |
| `Net balance` cell of the same row, at that scroll position | x 149 → 260 | x 192 → 303; its text runs 222 → **291**. **Name and value are inside the viewport simultaneously**. The issue's criterion 2 |
| `Get / give ratio` cell of the same row, at that scroll position | off the right of the 745px table | x 303 → 370, text 332 → 358, the *last* column is reachable with the name still pinned |
| pinned column's share of the window | — | **108px of 350 = 31%**. It was 59% before the row header was allowed to wrap (E3, which is why that declaration is there) |
| `<caption>` box | **745px wide**, x 20 → **765**. 375px of its first line past the phone | **350px** wide, x 20 → **370**, at `scrollLeft: 0` **and** at full right |
| five `<th scope="col">` sort buttons | four off-screen at rest | all five fully inside the viewport at some scroll offset; `display`/`visibility` hidden on **0** of the table's cells, captions and buttons |
| `documentElement.scrollWidth` / `clientWidth` | 390 / 390 | **390 / 390**. The pinned column did not convert a contained scroll into a page scroll |

**Sorting while scrolled right (E4).** Each of the five sort buttons clicked at full-right scroll,
re-measured after each: the pinned column holds x 20 → 128 and `Net balance` holds x 192 → 303 in
all five sorted orders. Sorting re-renders rows, not layout.

**Keyboard, at 390×844.** Tab moves between the five `.sort-button`s in column order; **Enter** and
**Space** both sort, `aria-sort` reads `descending` on exactly one `<th>` after each, and the
browser brings the focused button inside the viewport by scrolling the wrapper (the second button
lands at x 140 → 221). The pinned column does not intercept focus, because it declares no
`tabindex` and no role, and it still declares neither. #71 made the *wrapper* focusable and never a
cell inside it.

**`border-collapse` (E2).** `.sortable-table` is `border-collapse: collapse`, and a sticky cell can
paint over a collapsed rule that belongs to the table rather than the cell. Screenshotted at both
scroll positions, the `tbody tr` hairline and the `thead th` rule both still paint across and along
the pinned column, so no `box-shadow` substitute was needed and the table's borders are untouched.

**Scripting off (E6).** Same build, `javaScriptEnabled: false`, 390×844: five `<th scope="col">`,
five `.sort-button`s, **56** `<th scope="row">`, wrapper 350 / 496, caption 350 wide at x 20 → 370,
and `Wyoming (WY)` at x 20 → 128 with `Net balance` at x 192 → 303 scrolled fully right. Those
figures are identical to the scripted numbers, because none of this fix is scripted.

**320px (E9).** Nothing hardcodes 390. At **320×568** the wrapper is 280 / 496, the caption is
280px wide at x 20 → 300, and the name (x 20 → 128) and `Net balance` (x 122 → 233) are both inside
the viewport at full-right scroll, with `documentElement.scrollWidth` **320**.

**Desktop (check 7), 1280×900.** The table is unchanged, with all five column rects identical
before and after (x 336 → 543, 543 → 706, 706 → 860, 860 → 971, 971 → 1081), no breakpoint active,
and the pinned column visually identical because the scroll range is 9px. **One box did move, and it
is recorded here.** The caption is now bound to the wrapper's 736px rather than the table's 745px,
so its right edge is 1072 instead of 1081. The caption stays a single line at both widths.

**Another route (check 9), `/economy/`.** `container-type` on the shared `.tableview-scroll` is the
only site-wide declaration #63 adds, and it costs nothing elsewhere. The route's first three
wrappers measure 350 / 534, 350 / 578 and 350 / 628 at 390×844 and 736 / 736 at 1280×900, identical
before and after. Each still scrolls (`scrollWidth > clientWidth`), their captions keep the table's
own width, their body cells compute `position: static` and their headers keep `white-space: nowrap`.
The pinned column and the header wrap are `.sortable-table` rules, and `.sortable-table` is §11's
alone.

**Themes (E8).** The sticky cell paints `var(--ground)`, the same token `body` uses, and the diff
adds no literal colour. The stylesheet declares no `prefers-color-scheme` or `data-theme` variant
today, so there is one palette to match and the cell matches it.

**Not fixed here, deliberately.** The table still gives **no at-rest sign that it scrolls**, with no
fade, no shadow, no persistent scrollbar and no text hint, on this wrapper or on §10's
`.law-table-scroll`. That is **#76**, which scopes the question site-wide, and two of #63's
Definition-of-done boxes were moved there on 2026-08-27 rather than implemented under this number.
Keyboard operability of the scroll wrappers shipped under **#71**, so this wrapper is focusable
while it overflows, named after its caption and scrolled by the arrow keys. The `.sort-button`'s
21px height is **#65**.

### Right-edge annotation clipping (#64)

**Asserted statically, unlike #62 and #63.** Those two were CSS-layout defects, and `dist/` carries
markup and a stylesheet rather than a layout, so no static test in this repository could see them
and the guards could only assert that the *declarations* were present. #64 is different in kind. An
annotation's `x`, its `text-anchor`, its ancestor
`transform`s, its text content and its SVG's `viewBox` are **all in the served bytes**, so
`pipeline/tests/test_accessibility.py` reproduces the clip arithmetic directly over `dist/` and
asserts the geometry itself. Only the text *width* is estimated, and it is estimated with the same
constant the runtime clamp uses, so the guard proves the clamp was **applied**, using the
arithmetic the clamp is built on.

**The defect is a correctness defect rather than a layout blemish.** `Chart.tsx` renders with a
`viewBox` and no `overflow: visible`, so an annotation drawn past the SVG edge is **clipped rather
than spilled**, cut mid-glyph, with no ellipsis, no scrollbar and no visual cue that anything is
missing. Households §5 rendered `2022: top 1% 31.5%` as **`2022: top 19`**, a complete-looking label
carrying a number that is not the number, on a site whose whole claim is that every figure traces to
a source. The fix is therefore stronger than making annotations visible. `placeAnnotation` returns
`null` for a label too wide to fit its span, and `<Annotation>` renders nothing on `null`. **A label
that cannot fit is absent, never truncated.** The finding stays reachable either way, because every
figure carries a `TableView` and a finding-stating `aria-label`, both already enforced
(`test_every_chart_has_a_real_table_in_the_static_html`, `test_every_chart_svg_states_a_finding`).

**Measured before the fix**, walking `dist/` with the suite's own `parse_html` at a 720-unit
viewBox. All 15 were clipped in the shipped build:

| Route | x | anchor | painted box | over | label |
|---|---|---|---|---|---|
| `/economy` | 620.4 | start | [620, 756] | **+36** | `Last actual, FY2025` (x6) |
| `/households` | 702.0 | start | [702, 830] | **+110** | `Top statutory rate` |
| `/households` | 696.0 | middle | [632, 760] | **+40** | `2022: top 1% 31.5%` -> `2022: top 19` |
| `/households` | 687.8 | start | [688, 752] | **+32** | `2022, 18%` |
| `/households` | 696.0 | middle | [657, 735] | **+15** | `2023: 38.4%` |
| `/government` | 696.0 | middle | [592, 800] | **+80** | `Longest instrument, 30-year bond` |
| `/government` | 524.2 | start | [518, 746] | **+26** | `OECD average, 34.1% of GDP` |
| `/government` | 644.0 | start | [644, 751] | **+31** | `Mandatory (net)` |
| `/government` | 644.0 | start | [644, 737] | **+17** | `Discretionary` |
| `/government` | 644.0 | start | [644, 730] | **+10** | `Net interest` |

After the fix there are **zero overruns across all 63 annotation nodes**, and the per-route counts
are unchanged (19 / 24 / 12 `class="annotation"`, six `Last actual, FY`, one dotplot average).
Nothing was therefore dropped from the server render to achieve it, which is the failure mode a
clipping fix invites.

#### What is asserted, and what is only measured

The distinction is the point of the section. The three lanes cover different geometry, and only one
of them is a browser.

| Geometry | Lane | Status |
|---|---|---|
| **WIDE, 720 units**. Every annotation in `dist/` | `pytest -k annotation`, five guards over the served bytes | **ASSERTED**, and unattended |
| **NARROW, 360 units**. Client-only, the worst case, and the only place a label clips off the LEFT edge | `npm run test:unit` over the pure helper (`src/components/charts/annotate.test.ts`) | **ASSERTED**, at the unit level |
| **Rendered pixels**, real `getBoundingClientRect()` and `getComputedTextLength()` at 390x844 and 1440x900 | browser | **ASSERTED since #67**, `npm run test:browser`, on every pull request. Recorded below |

SSR cannot reach NARROW at all, because `useChartSize.ts` returns the WIDE preset before the first
client measurement. The server render, and therefore every assertion any pytest guard can make, only
ever observes 720. That is why the unit lane exists for this issue rather than being optional.

#### Executed 2026-08-27 (the browser lane)

Chromium **151.0.0.0** (Playwright MCP) against a local `npm run preview` of this branch's `dist/`,
under its `/income-tax/` base, at **1440x900** and **390x844**. Islands are `client:visible`, so the
page was scrolled end to end before measuring. At 390 the charts then report a **360**-unit
viewBox, confirming the NARROW path was genuinely exercised rather than SSR scaled down.

| Route | Viewport | Annotations | Overrunning their SVG | `documentElement` scrollWidth / clientWidth |
|---|---|---|---|---|
| `/economy` | 1440x900 | 19 | **0** | 1440 / 1440 |
| `/households` | 1440x900 | 24 | **0** | 1440 / 1440 |
| `/government` | 1440x900 | 20 | **0** | 1440 / 1440 |
| `/economy` | 390x844 | 19 | **0** | 390 / 390 |
| `/households` | 390x844 | 24 | **0** | 390 / 390 |
| `/government` | 390x844 | 16 | **0** | 390 / 390 |

`/government` drops from 20 to 16 by design rather than by clipping. `BudgetChart` replaces its four
in-chart series labels with a text legend below the figure at narrow, which it already did.

#### Criterion 4: a clamped label must not land on what it names

Criterion 4 is not provable from the bytes, and reading the numbers was not enough. The first pass
of the fix satisfied every clipping assertion above **and broke this one**. Three `BudgetChart`
labels and Households §4's `Top statutory rate` flipped from the right margin into the plot and came
to rest on the series they name. The clip guard was green throughout. The episode is recorded here
because the lesson generalises. "The annotation is visible now" and "the annotation is correct now"
are different claims, and only one of them has a static test.

Checked by hit-testing real paint (`elementsFromPoint` across nine points along each label, at three
heights), restricted to the labels the clamp actually **moved**. A label that already fitted is
returned unchanged by `placeAnnotation` and cannot have been pushed anywhere. Results after the
fix:

| Route | Labels moved by the clamp | On their own series | Label-on-label collisions |
|---|---|---|---|
| `/economy` | 6 | **0** | 1, pre-existing, see below |
| `/households` | 4 | **0** | **0** |
| `/government` | 5 | **0** | **0** |

Three changes were needed to get there, and each is a different answer because the charts differ:

- **`BudgetChart` (stacked area).** A stacked area chart has no free space just above the line,
  because every point inside the plot is inside some band. Flipping the labels there put them on the
  bands. They now sit inside the plot right-anchored **with a panel-coloured halo**, which is the
  treatment `RevenueChart`'s `.legend-label` band labels two sections down already used for this
  problem. The plan named `VotedAndNot` as the shape to converge on, which is right for a line chart
  and wrong for this one.
- **`StatutoryVsEffective` (line).** Here `VotedAndNot`'s idiom does apply: end-anchored at the last
  point and lifted 8 units clear of the curve. Flipping it in place had laid it along the flat
  right-hand end of the very line it names.
- **`BoundaryRule`'s clearance became a `gap`.** `x + 4` reads as "4 units right of the rule" while
  the anchor is `start`, and inverts to "overlap the rule by 4" the moment the clamp flips it to
  `end`, which it always does, because the rule marks the last actual year and sits near the right
  edge by construction. A `gap` flips its sign with the anchor. On `/economy` §1 the difference is
  visible. Without the gap all six boundary labels sat on their own dashed rule and the top one
  collided with `CBO projection`. All six now clear the rule (label right edge 538.4, rule at
  542.4).

`BudgetChart`'s own label-collision guard was generalised in passing. The guard spaced the
net-interest and revenue labels alone, and on FY2025 data it is **discretionary** and revenue whose
centres fall 0.24T apart. Naming a specific pair was the bug, and the labels are now sorted and
spaced. The minimum gap is **15** units rather than the font's 11.5, because an `.annotation`'s
painted box measures 13.3 units tall.

**One collision is left, and it is not this issue's.** `/economy` §4's `Fed funds` and `10-year note`
overlap each other. Both are `end`-anchored at the same x with y offsets of -8 and -20, both fit
their SVG comfortably, and `placeAnnotation` returns them unchanged, so their positions are
identical to `main`'s. The collision is not acted on here.

**No annotation moves between the SSR paint and hydration.** At 1440x900 the hydrated preset is the
same WIDE preset SSR emitted, so every placement must be byte-identical. Comparing each
annotation's `x` and `text-anchor` before and after forcing hydration gives **0 of 20 changed**.
That is criterion 5, and it holds by construction, because placement is a pure function of
`(x, label, frame, anchor)`, with no `getBBox`, no `getComputedTextLength`, no `useEffect` and no
measurement of any kind. `test_annotation_placement_is_not_measured_at_runtime` keeps it that
way.

#### The advance-width constant

`ADVANCE_EM = 0.62` in `src/components/charts/annotate.ts`, mirrored in
`pipeline/tests/test_accessibility.py` and pinned to it by
`test_the_annotation_constants_match_the_source_and_the_stylesheet`.

Worst measured `getComputedTextLength() / (chars x fontPx)` across all six route/viewport
combinations above:

| Route | Viewport | Worst ratio | Carried by |
|---|---|---|---|
| `/households` | 1440x900 | **0.5889** | `60.0%` |
| `/economy` | 1440x900 | 0.5878 | `Unemployment` |
| `/government` | 1440x900 | 0.5578 | `Revenue` |
| `/households` | 390x844 | 0.5601 | `60.0%` |
| `/economy` | 390x844 | 0.5591 | `Unemployment` |
| `/government` | 390x844 | 0.5306 | `Revenue` |

**0.5889 against 0.62, so the constant over-estimates by 5.3%.** That is the safe direction and the
whole reason it is written as an over-estimate. Clamping a little too early costs a few units of
whitespace, while clamping a little too late reproduces the defect. **The rule is that this constant
is raised, never lowered.** If a future measurement here exceeds 0.62, raise it in both files. If a
future measurement comes in lower, leave it alone.

#### Boundaries

- **#66** owns chart legibility at 390px generally, covering axis tick and axis-title text, tick
  density, hit-target size, and the direct labels that are **not** in the annotation family.
  `holders-label` on `/government` §2 is the live example, because
  `Foreign $9.64T (30% of publicly held debt)` still paints past its SVG. The overrun is
  deliberately not fixed here.
  `test_no_annotation_class_ships_outside_the_guarded_set` is an `==` audit over every `<text>` class
  in `dist/`, so that boundary is explicit in the suite rather than implied.
- **Asserted since #67.** `tests/browser/smoke.test.ts` re-measures the worst ratio on every route
  and viewport on every pull request, against `ADVANCE_EM` imported from the source rather than
  restated. The assertion is one-sided (`worst <= ADVANCE_EM`), so it enforces the direction the
  rule above sets, which is raised and never lowered.
- **#78** owns the scripting-off `<noscript>` geometry. See § Known limitation above.
- **`overflow: visible` on the SVG is not the fix** and was not used. It would spill annotations into
  adjacent prose and could reintroduce page-level horizontal overflow. `Chart.tsx` is untouched, and
  `documentElement.scrollWidth == clientWidth` still holds at both viewports (table above).
- **`NARROW.margin.right` stays 12**, revisited under this issue. Widening it to hold `Mandatory
  (net)`, about 90 units, would spend 30% of a 296-unit plot on gutter, and it is the wrong change
  in any case. With the clamp in place, no annotation's legibility depends on the right margin's
  width. The reason is written into `useChartSize.ts`.

#### The two ways this guard could report healthy while blind

Both cost a cycle during the investigation, both are silent, and both are now covered by
`test_the_annotation_clipping_guard_sees_the_whole_corpus` plus the negative test:

1. **`html.parser` lowercases attribute names.** `svg.get("viewBox")` returns `None` for every SVG
   in `dist/`, because the attribute is `viewbox`. Reading it the obvious way finds **zero**
   annotations and passes green on a broken tree. Demonstrated: with the camelCase read restored,
   the corpus check
   reports `found only 0 nodes` and the negative test reports `a start-anchored label running off the
   right edge passed`.
2. **A `<text>` with no `x` attribute.** `BracketHistory` emitted one, positioned entirely by an
   ancestor `<g transform>`. Skipping it would drop a real node; a missing `x` is **0**, not "not my
   problem". That label is now placed explicitly, and the guard reads absent `x` as 0.

### Target size for controls (#65)

**The floor is 24 CSS px, and the success criterion is WCAG 2.2 SC 2.5.8 Target Size (Minimum),
Level AA.** One token carries it, `--target-min: 1.5rem` in `src/styles/tokens.css`. `html`
sets no `font-size`, so the root is the 16px default and the rem is exact, which is the same reading
`test_nav_bar_tap_targets_clear_44px` already makes of its `2.75rem`.

**Why 24 and not the 44 of SC 2.5.5 (Enhanced, AAA).** The floor is a decision rather than a
convenience, and at 44px the arithmetic fails outright. `.controls` declares `gap: 0.5rem 1rem`, an
8px row gap, and `.unit-toggle-item` computes to a 16px box, so a wrapped control row has a **24px
pitch**. Two 44px hit areas on that pitch would **overlap by 20px**, and every tap in the overlap
would be ambiguous. That is a worse defect than the one being fixed, and a direct failure of the
issue's own "adjacent controls' hit areas do not overlap". At 24px the pitch of 24 exactly
accommodates the floor, so the areas tile, touching but not overlapping. The nav bar keeps its own
44px floor, because it is a dedicated surface with no dense control rows, and nothing here lowers
it.

**One technique for all eight: a transparent `::before` overlay.** `position: absolute`, centred on
the control, `height: var(--target-min)`, and `left: 0; right: 0` for seven of the eight so it is
exactly the host's own width. The slider thumb's overlay is the one that also grows horizontally,
so it centres on both axes. The issue invited a per-control choice between padding, an overlay and
line-height. The overlay wins every time, for a different reason each time:

| Control | Why not padding / `min-height` | Why the overlay |
|---|---|---|
| `.unit-toggle-item` | A flex item under `align-items: baseline`; asymmetric vertical padding shifts it against its siblings and against `.controls-label`. Its `border-bottom` is the on-state affordance, and padding detaches the rule from the word | Out of flow, so the baseline and the rule stay exactly where they are |
| `.tableview-trigger` | It **is** the `<summary>`, and its full-width `border-bottom` is the affordance; `min-height` drops the rule away from the label | Same, no ink moves |
| `.select-trigger` | Only 2px short, so padding is tempting, but it would still move the hairline | Consistency, and no ink moves |
| `.tax-mix-select` | Hairline affordance, and a flex item in `.controls` under `align-items: baseline` | Same two reasons as `.unit-toggle-item` |
| `.attrib-tab` | `border-bottom` carries the active-tab state; padding moves the tab underline off the text | Same |
| `.sort-button` | **Padding widens the `<th>`** in a `border-collapse` table, which makes §11's 745px scroll worse, #71/#76's problem. `min-height` avoids the width, but the `<th>` is `vertical-align: bottom` in one table and unset in the other, so the label would lift off the head rule in one and not the other | Adds no width and no height. The table geometry is untouched and the label does not move |
| `.law-name-button` | Long statute names already wrap to ~105px cells, and padding would add ~9px to *every* row of a 100-row table | Tall cells untouched **by construction**; only the short ones gain a hit area |
| `.year-range-thumb` | Resizing the element to 24×24 changes the box Radix positions the thumb by, shifting it against the track and changing the track's usable extent. The 15px dot **is** the element | The element stays and paints 15×15; only the overlay is 24×24 |

**Two corrections to the issue's own table, found against the tree and worth recording.**
`.select-item` is listed as failing but **measures 32px and already passed**. The selector is
unchanged, and `test_the_target_size_guards_bite_each_way_the_fix_can_regress` asserts it was *not*
swept in, because sweeping it in would be scope drift. `.sort-button` is declared **twice**, once in
the rule it shares with `.law-name-button` and once in the rule #63 added for §11's
`.sortable-table`, so a fix editing one leaves the other governing two different tables. Both carry
`position: relative`, and
the overlay is selector-matched (`.law-name-button::before, .sort-button::before`) so it covers
both. The guard asserts the **cascade result** per selector rather than per rule, and separately
pins that `.sort-button` still matches more than one rule.

**Three things must never be added to these rules**, each of which would leave every size assertion
green while breaking the result:

- **`pointer-events: none` or `visibility: hidden`.** A transparent box is hit-testable; neither of
  those is. This is the failure the size guards alone would miss, so
  `test_every_thumb_sized_control_declares_a_target_overlay` asserts against both by name.
- **`z-index`.** A positioned element with `z-index: auto` creates no stacking context, which is why
  `.select-content`'s `z-index: 20` still paints over the trigger's overlay.
- **A negative inset.** The zero insets are what preserve today's clearances exactly.

#### What is asserted, and what is only measured

Seven guards plus a negative test in `pipeline/tests/test_accessibility.py`. They read
*declarations*, which for absolute units are literal bytes, and they cannot read a **computed** box.
`.unit-toggle-item` measures 16px precisely because a `<button>` does not inherit `body`'s
`line-height: 1.62` and keeps the UA's `normal`, and that number appears nowhere in `src/`.
`npm run test:unit` cannot close the gap either, because it is `node --test` over TypeScript
modules, with no DOM and no layout.

The overlay technique is chosen so that the gap does not matter. Every overlay is out of flow, so
the layout height added across the whole site is **zero**, and "did a figure move down the page" and
"did a control grow sideways into its neighbour" stop being measurements and become declarations.
The guards are `test_every_thumb_sized_control_declares_a_target_overlay`,
`test_the_target_size_floor_is_at_least_24px`,
`test_no_target_overlay_reaches_into_a_neighbours_hit_area`,
`test_no_target_overlay_creates_a_stacking_context`,
`test_target_overlays_add_no_layout_height`,
`test_every_target_host_is_a_containing_block_for_its_overlay`,
`test_the_year_range_thumb_still_paints_a_fifteen_pixel_dot` and
`test_the_target_floor_survives_the_build`.

`test_target_overlays_add_no_layout_height` pins each host's vertical padding with `==` against its
value at #65 rather than demanding zero: four of the eight already carried a bottom padding holding
the hairline off the word, and a zero-demanding guard would have been red on arrival.

**What no test here asserts** is the wrapped-row vertical clearance at 390px. An 8px row gap plus a
16px computed line box is a 24px pitch against a 24px floor, which is a touch at 0px clearance
rather than an overlap, and both halves of that sentence are computed values. The clearance is
measured below and **asserted since #67**. `tests/browser/smoke.test.ts` tests every pair of control
hit areas for intersection at both viewports and requires zero intersecting pairs, so the case bites
the day a row does wrap. On the tree as it stands no `.controls` row wraps its toggles onto two
lines at 390px, so the 0px case does not currently arise, and the tightest measured vertical
clearance is 45.7px.

#### Executed 2026-08-27 (the browser lane)

Chromium **151.0.0.0** (Playwright MCP), `dist/` served locally under its `/income-tax/` base, at
**390×844** and **1440×900**, on all three content routes. Each control's hit area is the computed
`::before` box; `getComputedStyle(el, '::before')` for the size and `getBoundingClientRect()` for
the position. Root `font-size` read back as **16px**, so `--target-min: 1.5rem` resolves to 24px.

| Control | Element box | Hit area (overlay), 390×844 | Hit area, 1440×900 |
|---|---|---|---|
| `.unit-toggle-item` (18 on `/government`) | 50.2 × **16** | 50.2 × **24** | 50.2 × **24** |
| `.tableview-trigger` (12) | 350 × 23.6 | 350 × **24** | 736 × **24** |
| `.select-trigger` (3) | 120 × 22.4 | 120 × **24** | 120 × **24** |
| `.tax-mix-select` (1) | 38.1 × 17.6 | 38.1 × **24** | 38.1 × **24** |
| `.attrib-tab` (2) | 115.5 × 21.8 | 115.5 × **24** | 115.5 × **24** |
| `.law-name-button` (23) | 57.5 × **15** | 57.5 × **24** | 57.5 × **24** |
| `.sort-button` (8) | 42.9 × 21.1 | 42.9 × **24** | 46.9 × **24** |
| `.year-range-thumb` (4 on `/households`) | **15 × 15**, unchanged | **24 × 24** | **24 × 24** |
| `.select-item` (3, popup open) | 152 × **32.2** | none, `::before` computes `content: none` | — |

**Criterion 5, measured rather than argued.** Every pair of control hit areas on a route was tested
for intersection: **0 overlapping pairs** out of 67 controls on `/government`, 13 on `/households`
and 5 on `/economy`, at both viewports. The tightest vertical clearance is **45.7px** and the
tightest horizontal is **14.4px**, which is `.unit-toggle`'s `gap: 0.9rem`, exactly as declared.

**Criteria 3 and 6, proved in the browser and not only from the stylesheet.** With the page loaded,
the whole change was disabled at runtime (`content: none` on every overlay, `position: static` on
every host) and 106 boxes were compared before and after. Those boxes are the eight controls plus
`.controls-label`, `.figure` and `.chart`. **0 boxes moved.** The `.unit-toggle-item` underline sits
where it did, the toggles keep their baseline with `.controls-label`, and no figure moved down the
page. The same result is visible from the build side, because every `dist/**/index.html` is
byte-identical to its pre-change build once the stylesheet content-hash is normalised.

**E7, the check the plan could not settle from the stylesheet.** Radix leaves `Slider.Thumb`'s
`position` to CSS, and the thumb's computed `position` reads `relative`, which is this
repository's. `elementFromPoint` at
the centre of `.year-range-track` returns `.year-range-range`, **not** `.year-range-thumb`, so the
overlay is anchored to the thumb and does not swallow taps on the track.

**E8, the two thumbs at minimum range.** `minStepsBetweenThumbs={4}` over a 1984-2024 domain on a
350px track at 390px is 8.75px per year, so the thumbs are never closer than **35px**, leaving
**11px of clearance** between two 24px hit areas. At 1440px the track is 736px and the separation is
73.6px.

**E2, the popup over the trigger.** With a `.select-content` open, `elementFromPoint` inside the
popup returns `.select-viewport`; the popup's box begins at y=437 while the trigger's hit band ends
at y=434.2, so they do not even intersect.

**E9, overlays inside a clipping ancestor.** All 26 `.law-name-button` and `.sort-button` overlays
inside `.law-table-scroll` (`overflow-x: auto`) measure 24px tall. They add no horizontal size, so
there is nothing for the scroll container to clip horizontally.

**One measurement artefact, and not a defect of this change.** `.tax-mix-select` reads 0 × 2.6 until
its island hydrates, because Radix's `Select.Value` has no text to show until then. It settles at
38.1 × 17.6 with a 38.1 × 24 hit area. The reading is a hydration question rather than a
target-size one, and this change neither causes nor fixes it.

### Chart legibility at 390px (#66)

#66 is the broad 390px sweep. Four cluster issues took pieces of it first, and all four are merged:
**#62** the `Select` popup, **#63** the by-state table columns, **#64** the four annotation classes,
and **#65** the 24px target floor. What was left is the part none of them touched, which is **axis
text, tick density, and every remaining `<text>` class that leaves its own SVG**.

Re-running #64's own walker (`_annotated_svgs` / `_local_x` / the `ADVANCE_EM = 0.62` arithmetic),
widened from the four annotation classes to **every** `<text>` class that ships, found seven
overruns in `dist/` at the 720 preset:

| Route | Class | Anchor | Label | Overrun |
|---|---|---|---|---|
| `/government` | `holders-label` | middle | `Foreign $9.64T (…share in full…)` | **+90.7 right** |
| `/government` | `holders-label` | middle | `Intragovernmental $7.74T (19.4%)` | **+24.8 right** |
| `/households` | `axis-label` | end | `$30,000,000` | **+23.0 left** |
| `/households` | `axis-label` | end | `$10,000,000` | **+23.0 left** |
| `/households` | `axis-label` | end | `$3,000,000` | **+16.2 left** |
| `/households` | `axis-label` | end | `$1,000,000` | **+16.2 left** |
| `/households` | `axis-label` | end | `Bottom 50%` | **+2.2 left** |

All seven are the #64 shape on classes #64 did not own, a complete-looking label carrying a number
that is not the number. `$30,000,000` shipped as `0,000,000`. **The earlier record named one
`holders-label` defect, and there were two.** The intragovernmental one had never been written
down.

Widening the walk found three more the original probe could not see, and one it could see only once
its own arithmetic was corrected:

- `/government` **`Presidency`**, +2.2 left. `BudgetChart`'s control-strip row labels already
  carried a long and short pair, chosen by the `narrow` boolean, so at the *wide* preset it went on
  emitting the long one into a gutter 2.2 units too small. A breakpoint cannot see a gutter it is
  not measuring, and the pair is now chosen by fit.
- `/government` §2's **three leader labels on one baseline**. The Japan / UK / China points are 46.6
  units apart and `United Kingdom $880B` alone is 136 units wide, so the three sat on top of each
  other. Every clipping assertion was green throughout, which is E8 in the served bytes rather than
  in theory, and it is why `test_no_two_holders_labels_on_one_row_intersect` exists. They are now
  staggered one per row down their own leader lines.
- Two **rotated axis titles** longer than the short lower panels they label (`Percent of the
  population 16 and over`, 241 units against 205; `Percent of income before transfers and taxes`,
  286 against 186). A rotated title's *length* runs down the y axis, so the horizontal walk is
  structurally blind to it. Both are shortened, and `placeAxisTitleY` shifts the rest.

**A correction worth recording, because it is the failure mode this document exists to catch:** the
first vertical probe read each rotated title's own `translate()` and not its ancestors', which put
every title `margin.top` units too high and reported three clips at the 720 preset that were not
there. `_local_y` is the mirror of `_local_x` for exactly this reason, and
`test_the_text_clipping_guards_bite_each_way_the_fix_can_regress` asserts the accumulation directly.
An arithmetic error in a probe reads exactly like a finding.

#### What is asserted, and what is only measured

| Geometry | Lane | Status |
|---|---|---|
| **WIDE, 720 units**. Every `<text>` of every class in `dist/`, horizontally | `pytest -k "chart_text or left_axis_tick or holders_labels"`, over the served bytes | **ASSERTED**, and unattended |
| **WIDE, 720 units**. Rotated axis titles, vertically | `pytest -k rotated_axis_title` | **ASSERTED** |
| **NARROW, 360 units**. The left gutter (42 units, six characters), the right-edge bottom tick, the rotated title down a short panel | `npm run test:unit` over the pure helpers (`src/components/charts/axisFit.test.ts`) | **ASSERTED**, at the unit level |
| **Rendered pixels**, real `getBoundingClientRect()` at 390x844 and 1440x900 | browser | **ASSERTED since #67**, `npm run test:browser` walks every `<text>` in every `<svg>`, not only `.annotation` |

SSR cannot reach NARROW at all, because `useChartSize.ts` returns the WIDE preset before the first
client measurement. The server render, and therefore every assertion any pytest guard can make, only
ever observes 720. `axisFit.test.ts` is not optional cover for this issue, because it is the only
lane that reaches half of it.

**320px viewports and landscape phones are explicitly outside this contract** (E11). 390x844 is the
stated floor. The 360 preset applies below a **560px container** width, so 320 uses the same
geometry with less room. That case is recorded as untested rather than as passing.

**Type size with scripting on cannot fail by construction**, which is why no lane asserts it as an
observation. The viewBox matches the container (`useChartSize.ts:12-21`), so 11px is 11px at every
width. The below-intended-size failure is the scripting-**off** path only, which is **#78**'s.

#### The browser lane, and why it is NOT EXECUTED here

This pass did **not** run the browser lane, and records that rather than inferring it. The nearest
prior measurement is #64's, executed 2026-08-27 on this branch's ancestor and recorded above at
`Right-edge annotation clipping (#64)`, at 0 overrunning annotations and
`documentElement.scrollWidth === clientWidth` on all three routes at 390x844, with the charts
reporting a **360**-unit viewBox, which is what proves the NARROW path was genuinely exercised
rather than SSR scaled down. That measurement covers DoD items 3 and 4 for the geometry that has not
moved.

It does **not** cover what this issue moved, and saying so is the point. `WhoPays`' six category
labels are now inside the plot, `DebtHolders`' leader labels are staggered, and four titles took a
shorter variant. Those are the rows in the table below reading **NOT EXECUTED**, each naming **#67**
as the owner. #67 closed it, because `mountIslands()` step-scrolls at 0.8x the viewport and then
*waits on* the exact hydrated `<svg>` count rather than sampling it. A sweep that measured unmounted
`client:visible` islands would report a false PASS, which is the most expensive outcome available
here (E1), so the lane is recorded as unrun rather than run cheaply.

**Human-judged rather than asserted (E8).** `WhoPays`' narrow treatment moves each category label
into empty plot space above its own bar pair. Whether the label reads as belonging to *that* pair
rather than to the pair above it is a judgement about reading, and no static lane makes it. The
judgement is recorded here as human-judged and is **not** claimed as verified.

#### Per-figure results, 390x844, scripting on

25 figures: `/economy` 5, `/households` 7, `/government` 13. (`/` is the intro route and carries no
figures, because the DoD's original route list predates that split.) Each cell is PASS, FAIL with
the specific failure, or NOT EXECUTED with a reason. None is blank.

- **PASS (S)** means asserted statically against `dist/` by a named guard in
  `pipeline/tests/test_accessibility.py`.
- **PASS (C)** means true by construction, with the mechanism asserted rather than the outcome
  sampled.
- **PASS (B)** means asserted in a real browser by `npm run test:browser` (#67), on every pull
  request. `driven` marks a figure whose named control the spec operates before re-measuring.
- **NOT EXECUTED** means the check needs rendered pixels, and an owner is named.

| Route + section | Figure (`aria-label`, abridged) | No content clipped | Type at intended size | No control over the plot | `figcaption` + Units/Note/Source | "View as table" reachable | JS off |
|---|---|---|---|---|---|---|---|
| /economy `#one-picture` | Real GDP grew 895% between fiscal 1950 and fiscal 2025, fr… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /economy `#growth-shadow` | Output per hour reached 216.5 by 2024 while real median ho… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /economy `#who-works` | Unemployment was 4.2% in fiscal 2025 against a noncyclical… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /economy `#prices-rates` | The fed funds rate peaked at 16.9% in fiscal 1981, one fis… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /economy `#labor-capital` | Wages and salaries fell from a fiscal 1970 peak of 51.5% o… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#forty-trillion` | Debt doubled in ten fiscal years, from $19.57 trillion at… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | known FAIL, **#36** |
| /government `#who-holds-it` | $32.14 trillion of the federal debt is held by the public… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#how-old` | Average maturity of marketable Treasury debt is 71 months… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#whole-budget` | Federal outlays from fiscal 1962 to 2025 stacked into mand… | PASS (S) | PASS (C) | PASS (B), driven, unit toggle | PASS (S) | PASS (S) | owned by **#78** |
| /government `#structural-gap` | Revenue averaged 17.2% of GDP against outlays at 21.1% acr… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#what-congress-votes-on` | Share of GDP from FY1995 to FY2025: mandatory rose from 9.… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#net-interest` | Net interest rose from $232 billion in FY1995 to $970 bill… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#the-laws` | Sixteen of the twenty-three major deficit-moving laws sinc… | PASS (S) | PASS (C) | PASS (B), driven, coalition/president filter | PASS (S) | PASS (S) | owned by **#78** |
| /government `#passed-signed` | Both attributions total the same $16.75 trillion in net te… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#where-money-comes-from` | Federal revenue by source held near 17 to 18 percent of GD… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#where-money-comes-from` | The United States collected 25.6% of GDP in tax in 2024, 3… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#by-state` | Federal gross tax collections against federal award spendi… | PASS (S) | PASS (C) | PASS (B), driven, basis toggle | PASS (S) | PASS (S) | owned by **#78** |
| /government `#by-state` | Each state's own tax collections by category as a share of… | PASS (S) | PASS (C) | PASS (B), driven, basis toggle | PASS (S) | PASS (S) | owned by **#78** |
| /households `#what-a-household-earns` | Real median household income rose from $65,380 in 1995 to… | PASS (S) | PASS (C) | PASS (B), driven, year range | PASS (S) | PASS (S) | owned by **#78** |
| /households `#the-spread` | The family Gini index rose from 0.421 in 1995 to 0.456 in… | PASS (S) | PASS (C) | PASS (B), driven, year range | PASS (S) | PASS (S) | owned by **#78** |
| /households `#a-century-of-brackets` | In constant 2024 dollars, the income at which the top brac… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /households `#statutory-vs-effective` | Between 1979 and 2022 the top statutory income tax rate fe… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /households `#who-pays` | The top 1% earned 20.6% of adjusted gross income and paid… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /households `#who-pays` | Share of federal individual income tax paid by the top 1%… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /households `#the-bill-you-do-not-see` | Payroll tax and individual income tax, each as a share of… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |

`/government` §1's scripting-off state is a **known FAIL** citing **#36**, recorded rather than
skipped. Every other JS-off cell is **#78**'s, whose measurement is at `Known limitation:
JS-disabled narrow-viewport chart legibility` above: the `<noscript><style>` block loses the cascade
to the bundle entirely, so the three classes render at 5.10 / 5.35 / 5.59px and the anticipated
crowding never occurred. That closes the DoD's "amend the Known limitation" item by citation.

#### Every FAIL has a disposition

| Finding | Disposition |
|---|---|
| 7 overruns in `dist/` (2 `holders-label`, 5 `axis-label`) | **Fixed here**, all seven |
| `Presidency` in `/government`'s control strip, +2.2 | **Fixed here** |
| 3 leader labels colliding on one baseline | **Fixed here** |
| 2 rotated titles longer than their panels | **Fixed here** |
| 2 narrow-only panel titles over their 298-unit room | **Fixed here** |
| `/government` §2's foreign label can no longer carry its percentage on the chart | Not acted on here. The full share is still on the figure's `aria-label`, in its live readout, and in both columns of its table |
| `PricesAndRates`' converging series labels | **Parked** by #64, and stays parked: it is annotation text, and it collides at every width, so it is not a 390px defect |
| Browser lane not run in this pass | **Asserted since #67**, `npm run test:browser`, every pull request |
| Scripting-off geometry | **#78**; `/government` §1 specifically **#36** |

#### The ways these guards could report healthy while blind

Each is checked by `test_the_text_clipping_guard_sees_every_text_class` or by the negative test, and
each was **observed failing** before this landed:

| Blindness | Caught by |
|---|---|
| `html.parser` lowercases `viewBox`; reading `viewBox` finds zero SVGs | `>= 700` nodes, `>= 29` SVGs. Mutated: reports **0 nodes** |
| A `<text>` with no `x` reads as 0, not "skip" | Negative test's ancestor-translate case |
| A whole route dropped from `dist/` | All three routes asserted individually |
| A new `<text>` class ships unguarded | `==` audit over the class sets **and** the font table. Mutated by dropping `axis-title`: fails naming it |
| A font size drifts in `global.css`, making every width here wrong | `test_the_text_font_sizes_match_the_stylesheet`, against a grouped-selector-safe reader. Mutated to 12px: fails |
| The rotated exclusion silently drops every title instead of redirecting it | `rotated >= 20` in the corpus check |
| Two labels that each fit, on top of each other | `test_no_two_holders_labels_on_one_row_intersect` |

Reverting each fixed island against the guards, all rebuilt and observed:

| Reverted | Guard | Observed |
|---|---|---|
| `DebtHolders.tsx` | `no_chart_text_is_clipped` | FAILS, naming both labels at **+24.8** and **+90.7** |
| `DebtHolders.tsx` | `two_holders_labels_on_one_row` | FAILS, naming 3 collisions |
| `BracketHistory.tsx` | `left_axis_tick_fits` | FAILS, naming all four dollar ticks and the shortfall in units |
| `HouseholdSpread.tsx` | `rotated_axis_title` | FAILS, **43.2 units above the top edge** |

#### Boundaries

Not touched, and not re-fixed: **#62** `Select`, **#63** by-state columns, **#64** the four
annotation classes and their NARROW coverage in `annotate.test.ts`, and **#65** the **24px** target
floor, which is **deliberately not 44px**, because at these controls' 24px pitch that would create
20px ambiguous overlaps (E12), and no target-size CSS is touched. Also out are **#71** and **#76**
table scroll wrappers, and **#77** the data-table height cap.

Three of the neighbouring issues have since shipped. **#74**, §11's legend swatch, is covered under
*A legend key that wraps between its swatch and its label* below. **#73**, the chart marks, is
covered under *Reading a datum with no hover* below, and it does not enlarge a mark, it stops the
mark being the hit target. **#72**, the toggles' shared accessible name, is covered under *Unique
accessible names for choice-set controls* below.

### Reading position in the contents list (#44)

**EXECUTED 2026-08-26**, Chromium **151.0.7922.174** (Playwright), against `astro preview` at
1440×900 and 390×844. Console output clean on all five routes: 0 errors, 0 warnings.

| Check | Result |
|---|---|
| Top of page, `scrollTo(0, 0)` | `#forty-trillion` / `#one-picture` / `#what-a-household-earns` on `/government`, `/economy`, `/households`. Never a JS-running state with nothing marked |
| Bottom of document, `scrollTo(0, body.scrollHeight)` | `#limits` on all three, at both viewports |
| Counts, at every sampled position | `[aria-current="true"]` **2** in the DOM, **1** in the rail list, **1** in the panel list; `[aria-current="page"]` stays **2** |
| Monotonicity, 200px steps | `/government` at 1440×900: 112 samples, **0** decreases, all **12** sections visited. At 390×844: 128 samples, 0 decreases, 12 visited. `/economy` 49 samples, 0 decreases, 6 of 6. `/households` 53 samples (the exact document bottom appended), 0 decreases, **7 of 7**. Its `limits` is 1058px against an 844px viewport and the midpoint never enters it before the bottom, which is precisely what the bottom-of-document rule is for |
| Taller than the viewport | `#the-laws` (5.38 × viewport) marked across all 24 samples inside its bounds and `#by-state` (4.99 ×) across all 22, with no other id appearing |
| Anchor jump, 390×844 | all **12** panel links clicked in turn: the marked href equals the clicked one every time, including §12 `#limits`; the panel closes on each; the target's top lands at 64px, clearing the 52px bar |
| Panel open while the page scrolls behind it | rail and panel agree at every sampled offset (0 → 19,000px) with the disclosure held open |
| Routes with no contents list | `/sources`, **0** marks with JavaScript **on** at top, middle and bottom, 0 `a[data-section]`, and no console error: the IIFE returns before observing. `/` was in this class when the pass ran and behaved identically; it left the class when #48 gave it four sections, and the spy is **NOT EXECUTED** against `/` at its new contents list |
| `javaScriptEnabled: false` | **0** `[aria-current="true"]` and **2** `[aria-current="page"]` on all five routes. Paired against the same context with scripting **on**, which shows 2 at load with no scrolling, the difference is the proof that the script, not the server, writes the mark. #36's guard is intact in the same run: 14 of 14 `figure.figure svg.chart` server-render on `/government` with scripting off |
| Layout shift on a mark change | the rail's contents `<ol>` measures 208 × 314.34 before and after the mark moves, identical |
| Desktop-unchanged proof | with the stylesheet content-hash normalised, `dist/government/index.html` and `dist/index.html` each differ from their pre-change build by **92 added lines and zero removed lines**, all of them the `sectionSpy()` block. No markup changed |

### Scroll restoration and the back button (#46)

**EXECUTED 2026-08-26**, Playwright against `astro preview`, in **both** engines, Chromium
**151.0.7922.34** and **WebKit 26.5**, at 390×844 and 1440×900. Nothing in `src/` changed for this
issue. The numbers below are what the platform does on its own, and they are the reason for the
rule.

**bfcache was not in play for a single measurement.** A `window.__marker` set before leaving did not
survive any back navigation, so every number here is the *harder* full-reload path, not the free
one. `history.scrollRestoration` read `'auto'` in every context.

Sequence 1 scrolls to a section, navigates to `/sources/`, calls `history.back()`, waits 2.5s for
hydration to settle, and compares the section's `getBoundingClientRect().top`:

| Route, anchor | 390×844 Chromium | 390×844 WebKit | 1440×900 Chromium | 1440×900 WebKit |
|---|---|---|---|---|
| `/economy/` `#prices-rates` | **+0.3px** | −114.7px | **0.0px** | **0.0px** |
| `/households/` `#who-pays` | **−0.7px** | −238.7px | **0.0px** | −124.0px |
| `/government/` `#by-state` | **+0.3px** | −237.7px | **0.0px** | −4.0px |

Chromium is exact, and stays exact through Forward-then-Back-again (`#by-state` at `top 64.58`,
+0.3px, on the second return). The `top 64` is `calc(var(--navbar-h) + 0.75rem)`, or 52 + 12, which
is #42's `scroll-margin-top`, honoured by the restore with no accounting in this repository.

**WebKit's drift is the missing scroll anchoring, and its size is the charts' hydration growth.**
WebKit restores the saved `scrollY` faithfully and then does not correct for the ~115-240px the
document gains above the reader when `useChartSize` swaps WIDE for NARROW. The worst case measured
is **238.7px against an 844px viewport, or 28% of one screen**, which leaves the reader inside the
section they left. Per #46's plan, drift within one viewport on the plain Back case ships as it
stands. A restore that is within a screen returns the reader to what they were reading. The
alternative, a hand-rolled `pageshow` re-scroll, would be a second and worse implementation of a
thing the browser already does better on the engine where it works at all.

Sequence 2 uses a hash URL. Arrive at `/government/#by-state`, read on to `#the-laws`, leave, and
return, and **both engines restore the position rather than the anchor**, at both viewports.
`#the-laws` comes back to `top 63.8` (Chromium 390), `top 63.6` (WebKit 390) and `top 0.27` (both,
1440), at 0.0px drift in every case, while `#by-state` sits 9,237px (Chromium) and 9,287px (WebKit)
below the viewport top. Nothing re-jumps to the fragment. The URL still carries `#by-state`.

Sequence 3 uses opened tables. Open all **13** `main details` on `/government/`, scroll to
`#the-laws`, leave, and return. `open` is not restored by either engine, so the document comes back
**11,854 to 11,970px shorter** (37,226 → 25,256px in Chromium at 390):

| | Chromium 390×844 | WebKit 390×844 | Chromium 1440×900 | WebKit 1440×900 |
|---|---|---|---|---|
| `#the-laws` drift | **−0.1px** | **−6,826px** | **−0.4px** | **−6,592px** |
| `aria-current="true"` section | `the-laws` | `where-money-comes-from` | `the-laws` | `where-money-comes-from` |
| `aria-current="true"` count | 2 | 2 | 2 | 2 |

Chromium's scroll anchoring absorbs the whole 11,970px shrink and lands the reader on the pixel.
**WebKit does not.** It restores `scrollY 15,287` into a 25,445px document, and the reader arrives
roughly eight screens above where they left. That is a real gap on iOS Safari, it is **open**, and
it is recorded rather than repaired here. #46's decision procedure keys the repair to the plain Back
case, which WebKit passes, and the repair, a `pageshow` re-scroll to the nearest section, is the
manual implementation criterion 1 of that issue exists to keep out. The scroll spy is not part of
the gap, because it marks `where-money-comes-from`, which is where WebKit actually put the reader.

With `javaScriptEnabled: false`, sequence 1 restores `scrollY 6000` to `scrollY 6000` at **0px
drift**, in both engines at both viewports. Restoration was never this repository's, so switching
scripting off changes nothing about it. The disclosure is still a native `<details>` with **18**
links and **0** `<button>`s, and it still opens on click at 390×844.

**Affordance, measured from `#limits`, the deepest section on each route.** At 390×844 the
`.navbar-disclosure > summary` is on screen (`top 3.5`, `bottom 47.5`, inside an 844px viewport) and
clears the tap-target floor on all three routes with a contents list: **83.8 × 44** on `/economy/`,
**107.0 × 44** on `/households/`, **109.5 × 44** on `/government/` (WebKit; Chromium within 1px). No
new control was built for #46, because the trigger is #42's, and the folding call is recorded on the
issue. At 1440×900 no affordance is needed, and that is measured too. `.navbar` computes
`display: none`, `.rail` computes `position: sticky`, and from `#limits` the rail's whole 636px runs
`top 0` → `bottom 636` inside a 900px viewport with the **twelfth** of twelve contents links on
screen. Chromium tab stops from load are `.skip-link` → the `<summary>` → inside `main` at 390×844.

*Not executed:* whether a screen reader **reports** the restored position on return, which is #80.
The 44px tap targets, the `display: none` navbar at 1440x900 and the three tab stops above are
**asserted since #67**, because `tests/browser/smoke.test.ts`'s target-size and tab-order checks
re-run all three on every pull request. The rail's sticky geometry is not asserted, and stays with
#80.

### Keyboard-operable scroll containers (#71)

**The rule, and it applies to every table wrapper this site will ever grow.** An element whose
computed `overflow-x` is `auto` or `scroll` is focusable **exactly when it overflows**; while it
overflows it carries `role="group"` and an `aria-label` that names what it contains; and
`ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, `Home` and `End` scroll it. A container that fits
carries `tabindex="-1"`, which keeps it out of the Tab order while still letting it hold a reader
who was standing on it when the window widened.

Before this rule, every wrapper was a plain `<div>`, with no `tabindex`, no role and no name.
Measured at `1b2fcd5` on `/economy` `#prices-rates` at 1440×900, a 1216px table in a 736px box, the
per-column visibility vector after `End` was `[true,true,true,false,false,false,false]`. **Columns
4 to 7 of seven did not exist for a reader without a pointing device.** WCAG 2.1.1, Level A.

**The mechanism is `src/components/islands/scrollRegion.ts`**, one hook spread by all three JSX
sites. The key handler is written out rather than left to the browser's own scrolling of a focused
container, and that is a deliberate testability decision rather than a preference. Measured on a
minimal page in headless **and** headed Chromium, Playwright's synthetic key events do not drive
Chromium's native scrolling at all. A focused horizontal scroller, a focused vertical scroller and
the document itself all stayed at 0 after `ArrowRight`/`ArrowDown`/`End`. A `tabindex`-only fix
would
have shipped behaviour **no check in this repository can observe**.

**`role="group"`, not `role="region"`.** A *named* `region` is a landmark, and the rule would mint
up to 15 of them on `/government` alone. The site already refuses that kind of assistive-technology
noise
(`test_live_regions_do_not_outnumber_charts`). `group` takes an accessible name, is announced on
focus, and is the role every chart `<svg>` already carries for the same "keyboard-operable
composite" reason. The name is the table's own `<caption>` plus `, scrollable table`: the caption
says *what is in it*, which a bare "scrollable region" does not, and the phrasing lives in one
function so it cannot drift across 27 containers.

**Every horizontal scroll container, enumerated from `global.css` rather than from memory.** Two
class selectors declare `overflow-x: auto`, rendered at exactly three JSX sites:

| Class | Rendered at | Instances | Inside a `<details>`? |
|---|---|---|---|
| `.tableview-scroll` | `src/components/islands/TableView.tsx` | 25 (5 `/economy`, 7 `/households`, 13 `/government`) | yes |
| `.tableview-scroll` | `src/components/islands/StateGiveGet.tsx` | 1 (`/government` §11) | **no** |
| `.law-table-scroll` | `src/components/islands/LawExplorer.tsx` | 1 (`/government` §10) | **no** |

`/`, `/sources`, `/glossary` and `/contents` render none.

**Deliberately excluded, each for a stated reason.**

- `.navbar-panel` (`global.css:223`) carries `overflow-y` only, and is already keyboard operable.
  It holds 17 focusable links, opening it moves focus to the container, and arrow keys then scroll
  it. Recorded above as "not a new instance of #71", and still true.
- `.tax-mix-select-content` (`global.css:1073`) is a Radix listbox that declares
  `overflow-x: hidden` *precisely so* it is not a horizontal scroller (#62), guarded by
  `two_axis_scroll_box_failures`. That guard and this rule are opposites on purpose. A listbox must
  not be a horizontal scroll box, and a table wrapper deliberately is one.
- `overflow-wrap: anywhere` sites (`:357`, `:1212`, `:1308`, `:1324`) wrap text rather than scroll.
- `overflow: hidden` (`:111`) clips, and does not scroll.

**The enumeration is self-maintaining.** `test_every_horizontal_scroll_class_is_keyboard_operable`
(S2) fails on a new `overflow-x: auto|scroll` class whose consumer does not spread the hook, and
`test_every_horizontal_scroll_class_is_named_in_the_contract` (S3) fails on one this section does
not name. A future wide table inherits the rule mechanically, not aspirationally.

**Measured Tab-stop cost, `/government`, by a real Tab walk.**

| Walk | before (`1b2fcd5`) | after | bound |
|---|---|---|---|
| whole page, hydrated @1440 | 161 | **163** | `MAX_STOPS_GOVERNMENT` 200 |
| whole page, hydrated @390 | 143 | **145** | 200 |
| to §11, hydrated @1440 | 141 | **142** | `MAX_STOPS_TO_SECTION_11` 160 |
| whole page, **scripting off** @1440 | 136 | **136, unchanged** | 200 |
| to §11, scripting off @1440 | 118 | **118, unchanged** | 160 |
| whole page, every table open @1440 / @390 | — | **166 / 175** | 200 |
| to §11, every table open @1440 / @390 | — | **144 / 153** | 160 |

The two stops the default state gains are §10's law table (1481px in 736px) and §11's by-state table
(745px in 736px). They are the only two containers not inside a `<details>`, and both genuinely
overflow at every asserted viewport, so neither is an empty stop. The other 13 contribute nothing
until a reader opens them. **No bound was raised.** The worst state the site can reach, with every
one of `/government`'s 13 tables open at 390px and 11 overflowing containers above §11, still clears
`MAX_STOPS_TO_SECTION_11` by 7 and `MAX_STOPS_GOVERNMENT` by 25. That all-open state is
asserted by `scroll.test.ts`; no test exercised it before #71.

**How many containers overflow is PLATFORM-DEPENDENT, and no guard pins the number.** `tokens.css`
documents a deliberate system-font stack with no webfont, so table widths differ by operating
system. `/government` at 1440px measures **5** overflowing containers on macOS and **4** in CI's
Linux Chromium, because one table clears its box by a few pixels on one and not the other. Every
assertion here is written against the *invariant*, which is focusable exactly when it overflows, or
self-baselined against a walk with the feature stripped, and never against a count. A future guard
that
pins "5" would be red on half the machines that run it, which is the same class of failure
`TOLERANCE_PX` exists to prevent.

**The focus ring needed no stylesheet change.** The global
`:focus-visible { outline: 1.5px solid var(--ink); outline-offset: 2px; }` paints on the container,
whose box is exactly the `<figure>`'s, and `documentElement.scrollWidth` stays at the viewport width
at both 390 and 1440, so the ring introduces no page overflow. Asserted, with Chromium's own
`outline-style: auto` UA ring explicitly excluded, so a page whose author rules were deleted cannot
satisfy it.

#### Known limitation: with scripting off, no scroll container is keyboard-scrollable

The served bytes carry **no** `tabindex`, `role` or `aria-label` on `.tableview-scroll` or
`.law-table-scroll`, and `test_the_served_bytes_carry_no_focusable_scroll_container` (S1) holds that
as an invariant rather than an accident. Overflow is a *computed layout property*: no build step can
know whether a given table is wider than the box it will land in, because that depends on the
viewport, the fonts and whether a `<details>` is open. So a scripting-off reader gets the same wide
tables and the same inability to scroll them that this issue was filed about.

Server-rendering `tabindex="0"` on every wrapper and removing it at hydration was considered and
rejected. It would give scripting-off readers the browser's native arrow scrolling, and in the
page's default state it costs the same two stops (measured at 138 against 136 scripting-off stops on
`/government`, with both of those containers genuinely overflowing). It is rejected because it
breaks the "not focusable unless it overflows" half of the rule for a scripting-off reader who opens
a table that fits. Each such table would cost an empty Tab stop, which is the cost #68 and #69 spent
two issues removing. The residual gap is recorded here rather than dropped.

The consequence is asserted in both directions. The scripting-off Tab walk on `/government` stays at
**136** stops and **118** to §11, byte-identical to `1b2fcd5`, in `keyboard.test.ts`.

#### What is asserted, and what is only measured

**ASSERTED**, `tests/browser/scroll.test.ts` (Chromium, both viewports, every pull request): the
focusable-exactly-when-it-overflows invariant over all 27 containers on all three routes with every
`<details>` open; arrow/`Home`/`End`/`PageDown` movement with clamping at both ends; all seven
`#prices-rates` columns reaching full visibility during a `Home` → N×`ArrowRight` → `End` traversal;
`role`, the caption-containing name, and a solid author focus ring; Tab-order growth equal to
exactly the overflowing count, self-baselined; both bounds in the all-tables-open state; the
`ResizeObserver`'s two jobs (an inactive Radix tab panel measured 0/0 becoming 545/350 on
activation, and a live 1440→390 resize with no reload); and the invariant after every option of
`#the-laws`' three filters. **ASSERTED**, `pipeline/tests/test_accessibility.py`: S1, S2 and S3.
**ASSERTED**, `src/components/islands/scrollRegion.test.ts`: the pure key→target function.

**MEASURED, NOT ASSERTED.** Closed-`<details>` geometry in Firefox and WebKit. Chromium reports a
closed `<details>`'s true `scrollWidth`/`clientWidth` while contributing zero Tab stops. Firefox and
WebKit `display: none` the subtree, which would measure 0/0. The design does not depend on either,
because the `ResizeObserver` fires on the display transition, and only the Chromium behaviour was
executed, because the browser lane is Chromium. **HUMAN**: whether `role="group"` plus this name
*reads* well in NVDA or JAWS. #30/#80.

**NOT IN SCOPE, and still open.** The *visible* at-rest sign that a table scrolls, whether a fade, a
shadow, a persistent scrollbar or a text hint, is **#76**. `, scrollable table` is an accessible
name rather than a visible affordance, and no ink moved.

### Unique accessible names for choice-set controls (#72)

**SHIPPED 2026-08-27.** Four unit toggles on `/government` were all announced as **"Measured in"**.
A screen reader reads a `radiogroup`'s name on entry, so four groups controlling four different
figures were indistinguishable by name alone. A reader arriving at the second heard exactly what
they heard at the first.

#### What was actually there, re-measured at `6827f0b`

Nine `[role="radiogroup"]` site-wide, eight on `/government` and one on `/households`. **Four**
shared the name "Measured in", all four on `/government`. The issue also alleged two groups pointing
at the *same* id. They did not, and `test_no_page_repeats_an_id` already forbids that shape. Three
defects
the issue did **not** name were live and are fixed here, because each is a direct product of the
mechanism being replaced:

| Defect | Where | Status |
|---|---|---|
| Two ids, identical text (`net-interest-units`, `revenue-units` both "Measured in") | `/government` | Fixed |
| Two identical hardcoded `aria-label`s, the shape **#35** created when it moved `DebtChart` onto the shared `UnitToggle` | `DebtChart`, `BudgetChart` | Fixed |
| Three orphaned label ids: a visible `.controls-label` span that **nothing referenced**, the toggle beside it named by `aria-label` | `DebtChart:80`, `StructuralGap:130`, `VotedAndNot:102` | Fixed |
| **WCAG 2.5.3 Label in Name (Level A)**: visible text "Measured in", accessible name "Structural gap units" / "What Congress votes on units", a voice-control user saying what they could see could not target either control | `StructuralGap`, `VotedAndNot` | **Fixed** |
| No visible label at all, the only one of the nine without one | `BudgetChart` | Fixed |

#### The mechanism: the name is derived rather than typed

The obvious fix is a different string at each call site, and it is the wrong one, because that is
how the bug arrived. A hand-typed name can be unique and still wrong ("Measured in 2"), and a
uniqueness guard would pass on it.

`Figure.astro` puts a manifest-derived id on the figure-number span it already renders, and each
control points at that plus its own visible label:

```
aria-labelledby="fig-net-interest-no net-interest-units"   ->   "Figure 7 Measured in"
```

**Uniqueness is inherited rather than asserted afresh.** `src/data/figures.ts:323` already throws
when a route declares a key twice, and a figure's number is its index in that route's array, so
neither the key nor the number can collide within a page, by build failure. No author invents a
distinct name, and a new toggle inherits one. An island declares only its own manifest **key**, as a
module-level
`FIGURE` constant, and `src/components/islands/figureLabel.ts` is the single place the `fig-…-no` id
shape is written.

**The number rather than the title**, because a group's name is announced on every entry and
"Net interest payments by fiscal year, FY1995 to FY2025" is 12 words. "Figure 7" is short, sits
visibly two lines above the control, and is the page's own cross-reference vocabulary. #49 made
figure numbers real DOM text precisely so they could be referenced.

**A zero-typing derivation is not available, and the design does not pretend otherwise.** Astro
cannot inject props into slotted children, so `<Figure>` cannot hand its key to the island it wraps;
threading a `figure=` prop through nine `.astro` call sites would make the author type the key a
second time beside the `fig('...')` already there. Deriving at runtime with `closest('figure')` was
**rejected**: it would be wrong in the served bytes and correct only after hydration, which
`test_government_section_1_renders_its_whole_apparatus_without_scripting` already forbids. No
`.astro` call site changed.

#### The nine names

| Route | Figure | Name |
|---|---|---|
| `/government` | 1 (`debt`) | Figure 1 Measured in |
| `/government` | 4 (`whole-budget`) | Figure 4 Measured in |
| `/government` | 5 (`structural-gap`) | Figure 5 Measured in |
| `/government` | 6 (`voted-and-not`) | Figure 6 Measured in |
| `/government` | 7 (`net-interest`) | Figure 7 Measured in |
| `/government` | 8 (`law-explorer`) | Figure 8 Democratic votes shown |
| `/government` | 10 (`revenue`) | Figure 10 Measured in |
| `/government` | 12 (`state-give-get`) | Figure 12 Measured |
| `/households` | 7 (`payroll-bill`) | Figure 7 Measured in |

`/households` has one radiogroup, so uniqueness there is vacuous. The group is renamed anyway,
because requirements 2 and 3 are not vacuous. Visible labels are unchanged. Five still read
"Measured in", which is correct, and the figure prefix is what distinguishes them.

#### Guard scope: measured, then narrowed

`CHOICE_SET_ROLES = {radiogroup, combobox, tablist}` covers 14 nodes site-wide (9 / 4 / 1). A
page-wide all-roles rule is **unenforceable** and would have to be allowlisted into decoration:

| role | worst page | nodes | distinct | why the duplicates are legitimate |
|---|---|---|---|---|
| `link` | `/glossary` | 136 | 57 | nav rendered twice by design (bar + panel), "Full entry in the glossary" ×16, per-letter index links, repeated citations. On `/contents` alone a `link` rule fires on 43 duplicate names |
| `button` | `/government` | 45 | 33 | "View as table"/"Hide table" ×13, one per figure, disambiguated by its figure |
| `radio` | `/government` | 20 | 10 | "Nominal" / "% of GDP" inside each group; the **group** is what disambiguates them, and the group is what this section makes unique |
| `navigation` | every page | 4 | 2 | "Site" and "Contents" as bar + panel; `test_route_nav_and_contents_nav_are_separate_landmarks` already asserts the pair is deliberate |
| `group` | `/government` | 28 | 28 | **Deliberately excluded.** Zero collisions today, but this is where the chart `<svg>`s and #71's scroll containers live, and their names are long finding sentences that two similar figures could legitimately share |

`radiogroup` is the mandatory floor. `combobox` (LawExplorer's three filters, StateGiveGet's
jurisdiction) and `tablist` have **zero** violations today and cost nothing to include, and they
lock the same bug out of `Select.tsx` and the Radix tabs before it can be written.

#### Why static over `dist/`, with one browser test as calibration

**Enforcement is static.** The names must be correct in the served bytes with scripting off.
Islands mount `client:visible`, so a browser check on a hydrated page passes even when the SSR
output is wrong, which is exactly the failure #69's lane had, passing 59/59 while 113 data points
sat in the scripting-off tab order. G2's claim, that this group's `aria-labelledby` names a span
inside its **own ancestor figure**, is structural, and it is invisible once the accessibility tree
has flattened a name to text.

The risk of choosing static is that `accessible_name()` is a **model** of the accname algorithm. So
**B1** (`tests/browser/smoke.test.ts`) reads Chromium's real accessibility tree via
`locator.ariaSnapshot()` and asserts 8 distinct names on `/government`, preceded by a scripting-off
count of the same 8 groups and their two-token lists. On 2026-08-27 the engine and the model agreed
name-for-name on all eight. If they ever disagree, the model is what is wrong.

#### The guards

| # | Function | Claim |
|---|---|---|
| G1 | `duplicate_choice_set_name_failures` | No two controls of the same choice-set role share a resolved name on a page. A control with **no** name is reported too, an anonymous control cannot collide, so uniqueness alone would call it correct |
| G2 | `figure_bound_name_failures` | Every `radiogroup` inside a `<figure>` uses `aria-labelledby`, and one token resolves to a `.figure-no` span **whose own ancestor figure is that same figure**. Ancestry, not name-matching |
| G3 | `label_in_name_failures` | Every `radiogroup`'s resolved name contains the text of the `.controls-label` in its own `.controls` row (WCAG 2.5.3) |
| floor | `test_the_choice_set_coverage_did_not_narrow` | The guards see **9** radiogroup, **4** combobox, **1** tablist site-wide, as equalities, plus `set(counts) == CHOICE_SET_ROLES` |

**The three are not redundant, and the mutations below prove it individually.** G1 alone is
satisfied by naming the groups "A", "B", "C", which is unique and useless. G2 alone permits a name
the
reader cannot say. G3 alone permits two figures naming each other's labels.

#### Mutation proofs, EXECUTED 2026-08-27

Every mutation was applied to source, rebuilt, observed red, and reverted; `git status --porcelain`
was empty afterwards. **Two of the eleven did not behave as the plan predicted, and the finding is
recorded rather than the mutation quietly adjusted.**

| # | Mutation | Predicted | Observed |
|---|---|---|---|
| M1 | `RevenueChart`'s toggle points at `net-interest-units` (two groups, one id) | G1 | **G1 red** |
| M2 | Figure 10's `figure-no` text reads "Figure 7" (two ids, identical text) | G1 | **G1 red** |
| M3 | `NetInterest` reverts to `aria-label="Measured in"` | G1 **and** G2 | **G2 red; G1 GREEN**. See below |
| M3b | `NetInterest` **and** `RevenueChart` both revert, the #35 shape | — | **G1 and G2 both red** |
| M4 | `DebtChart`'s toggle points at `fig-revenue-no` (real span, wrong figure) | G2 | **G2 red** (G1 also red: the name duplicates the real Figure 10's) |
| M5 | `labelledByFigure` drops the `fig-…-no` token | G2 | **G2 red on `/government` and `/households`** |
| M6 | Visible span text changed without changing the name | G3 | **G3 red; G1 and G2 GREEN**. See below |
| M7 | `labelledByFigure` drops the local label id, leaving only `fig-…-no` | G3 | **G3 red on both pages; G1 green** |
| M8 | `CHOICE_SET_ROLES` narrowed to `{"radiogroup"}` | the floor | **floor red; G1 GREEN** |
| M9 | Every role in `CHOICE_SET_ROLES` typo'd | the floor | **floor red; G1 GREEN**. But G2/G3 green, see below |
| M9b | `FIGURE_BOUND_ROLE` typo'd (the role G2 and G3 filter on) | — | **floor red; G2 and G3 both GREEN** |
| M10 | `RevenueChart` reverted in source, rebuilt, browser lane only | B1 | **B1 red** |
| M11 | Every `id` removed from `Figure.astro`'s `figure-no` span | G2 on all nine | **G2 red on both pages, every group** |

**M3 did not turn G1 red, and G1 is right.** Reverting **one** toggle to `aria-label="Measured in"`
produces a name no other group holds, because the other eight are "Figure N Measured in". A unique,
plausible, wrong name is precisely what G1 cannot see and what G2 exists for. The plan predicted
both. Only G2 fires, and M3b (reverting *two* toggles, the actual shape #35 created) is what turns
G1 red. That result is evidence the two guards are independent rather than evidence one is
broken.

**M6 as written could not bite, and the reason is structural.** "Change the visible span's text
without changing the name" is *impossible* under the new mechanism: the name is derived from that
very span, so changing it to "Units" changes the name to "Figure 7 Units", which still contains
"Units". G3 correctly stays green. To create the defect M6 targets, the name has to be sourced from
a **different** span than the visible one, so M6 was performed that way (visible "Units", name
sourced from `revenue-units`). It turns **G3 red while G1 and G2 both stay green**, which is a
stronger proof than the original. That the literal M6 cannot be constructed is itself the result,
because this class of drift is now unreachable by construction rather than merely guarded.

**M8 and M9 are the anti-hollow proofs and are why the coverage floor exists.** Both leave the
name guards reporting green while the guards look at a narrowed or empty set. A guard that sees
nothing is indistinguishable from a guard that sees everything and finds nothing, and only the floor
tells them apart.

**M9 found a real hole, and it was closed rather than noted.** Typing the roles wrong in
`CHOICE_SET_ROLES` turned the floor red, as designed, and G2 and G3 stayed green, because each was
filtering on its own bare `"radiogroup"` literal, which the floor did not cover. A typo *there* would
have emptied both guards silently. The literal therefore became `FIGURE_BOUND_ROLE`, used by G2, G3
**and** the floor's own assertion. **M9b** is the proof. Typo it now and the floor goes red while G2
and G3 both fall green, so the typo is caught where before it would not have been.

#### Boundaries

**Not in scope, still open.** The visible at-rest scroll affordance **#76**; the open data-table
height cap **#77**. How any of this *reads* in NVDA or JAWS is **#30** and **#80**. **#73**,
chart-mark hit targets and hover affordance, **#74**, §11's legend swatch wrapping, and **#75**, the
focus-ring width, **have since shipped**, and are covered below.

**`role="group"` is outside `CHOICE_SET_ROLES` by decision**, per the scope table above. Recorded
here as a boundary, not an oversight: if a chart `<svg>` and a scroll container ever do collide on a
finding sentence, that is a different rule with a different remedy.

### Reading a datum with no hover (#73)

**SHIPPED 2026-08-27.** Every chart told a phone reader to do two things a phone cannot do, and its
per-datum marks were too narrow to hit with a finger. The reader's only route to a number was
"View as table", a control the hint never mentioned, in a disclosure that doubles the page
length.

Now: **tap or drag anywhere on the chart, and the readout the keyboard already drives reports the
nearest visible mark.**

#### What was actually there, re-measured at `c6c867d`

| Claim in #73 | Re-measured | Verdict |
|---|---|---|
| marks are `3.3px x 237px` | `3.317px x 237px` on `/economy` | stands, exactly |
| 389 of them across ~350px of plot | 389 marks, plot width 350px | stands, exactly |
| `/economy` grows `11,316px -> 24,195px` with tables open | `11,593px -> 24,671px` (6 `<details>`, 2.13x) | stands, numbers refreshed |
| cartogram tiles ~30x30px | `28.6 x 29px` | stands |
| hint text says `Focus or hover` | 24 occurrences in `dist/**/index.html` | stands |
| "'View as table' is itself a 24px-tall target (#65)" | `summary.tableview-trigger` is `350 x 24px`; `--target-min` is 24px; the lane reports **0 of 6** controls under the floor on `/economy` | **STALE.** #65 set the floor at 24 and this control meets it. Not a defect, and not #73's |
| "#66: annotations clipped at 390px, so a value read out near the right edge may have no visible label" | **0** clipped `<text>` nodes at 390x844 across `/economy` | **STALE.** The concern named in the issue's edge-case list no longer stands, and no work follows from it |

Site-wide at 390px: **1,111 marks, 1,092 of them under 44px wide**, smallest 3.3px.

**New, and not in the issue:** `/government` carries **7 zero-area `[data-mark]` elements**. The
resolver skips them so a tap can never select an invisible datum, verified by sweeping 78 taps
across the two `<svg>`s that own them, 0 of which selected one.

**The plan attributed all seven to `LawExplorer`, and that was wrong.** Re-measured in the hydrated
page, they are two unrelated things:

| Count | Where | Focusable? | Verdict |
|---|---|---|---|
| 5 | `AttributionSplit`'s by-president panel, which Radix keeps mounted (`forceMount`) and hides with `display: none` while the other tab is selected | **No**. A `display: none` subtree never is, and the whole `<svg>` measures 0x0 | Correct as it stands. Not a defect, and not reachable by any route |
| 2 | `StateTaxMix`'s "none levied" categories, in a live and visible chart | **Yes** | **The real case.** A keyboard reader can arrow onto "Individual income tax: none levied" with nothing on screen to look at |

`LawExplorer` has no zero-area marks: all 31 render. Only the second row is a finding, and it is
not fixed here. Why those two render belongs to #30 and #80.

#### The mechanism, and why the hit target stops being the mark

389 marks across 350px is **0.9px per datum**. No per-mark enlargement reaches 24px, let alone 44px,
so the honest answer to the issue's "reconsider the hit-target geometry" bullet is a negative one,
stated rather than skipped: **on a device that cannot hover, the marks stop being hit targets and the
plot becomes one 350x237px target**, with the datum resolved from the pointer's position.

Chosen over two alternatives, against those measurements:

- A **draggable scrubber** adds a control the reader must find first, and the site already has 26
  disclosures and 9 radiogroups per page competing for that attention. It also cannot answer "what
  is *this* point", because the reader must acquire the thumb before reading anything.
- **Nearest-point readout on touchmove alone** gives nothing on first contact, which is the common
  case, because a reader taps a spike and wants that number.
- **Tap-or-drag is one gesture family and one code path**, because a tap is a drag of length zero.
  It answers on first contact, and the drag is what makes a *specific* datum reachable. At 0.9px per
  datum a tap resolves to a band of roughly four years, so without the drag a reader could obtain
  *a* value but never *the* value they wanted. Both fit in one sentence of hint text.

**Why it composes with #69 rather than fighting it.** The gesture's only effect is
`.focus({ preventScroll: true })` on a mark. `useRovingMarks`'s existing `onFocusCapture` then sets
`active` to that mark's index, so the roving state and the reader's finger can never disagree, and
`Tab` afterwards leaves from where the finger last was. `moved.current` is still set only by the key
handler, so `data-roving`, the keyboard-only focus-ring flag, is correctly **not** set by touch.
Because activation runs through `focus`, every island's existing `onFocus` handler drives the
readout unchanged. **Live-region parity is therefore structural rather than a second code path that
has to be kept in step.**

**What "nearest" means, exactly.** Minimum Euclidean distance from the pointer's client coordinates
to the mark's `getBoundingClientRect()`, zero when the point is inside it:

```
dx = max(left - x, 0, x - right)
dy = max(top - y, 0, y - bottom)
d  = hypot(dx, dy)
```

Ties resolve to the **lower index**, which is data order. Zero-area rects are skipped. The snap is
**unconditional**: a pointerdown anywhere in the `<svg>` always selects a mark, because a reader who
taps a chart wants a number rather than silence. The snap does **not** go to axis ticks, because
ticks are a drawing decision rather than data, and snapping to them would make 60 of `/economy`'s 64
years unreachable, which is the opposite of the fix. The rule is geometric rather than
scale-inverted per island because it is correct for every shape the site draws: full-height bands
(where it degenerates to nearest-in-x), cartogram tiles and treemap segments (true 2D), and scatter
points.

**Two dimensions, not one.** The naive resolver compares `x` only. It passes every band chart and is
wrong on every cartogram, where a point below a tile must pick that tile and not the leftmost one in
its row. `nearest.test.ts` carries that case (U1-e) because the wrong implementation is the tempting
one.

#### Two emulated-mouse clobbers, both measured

A tap fires a whole emulated mouse sequence after the pointer events, and it costs the readout twice.
`preventDefault()` on `pointerdown` was **spiked and disproved** as a fix for the first, and is not a
candidate for either.

| # | Measured sequence | Effect | Fix |
|---|---|---|---|
| 1 | `pointerdown` -> the hook's `focus(N)` -> `mouseleave(previous mark)` -> the island's `setFocus(null)` | the readout the tap set is wiped one event later | `@media (hover: none) { .chart [data-mark] { pointer-events: none } }`, no emulated boundary event ever reaches a mark |
| 2 | `pointerdown` -> `focusin(rect)` -> `pointerup` -> `mousedown` -> `focusin(MAIN)` | with the marks inert the click target is the `<svg>`, which is not focusable, so Chromium's default focus action resolves to `<main tabindex="-1">` and the readout resets | `preventDefault()` on a `mousedown` whose preceding `pointerdown` was not a mouse. It suppresses the focus action and nothing else, `click` still fires |

Clobber 2 was **not predicted by the plan** and is the reason a drag worked while a tap did not on
the first build of this. It is recorded because the failure is invisible in a drag test.

The CSS route was chosen over threading activation callbacks through `mark()`, which would touch 32
call sites across 25 islands for the same effect. `pointer-events` does not affect keyboard or
programmatic focus, so #69's roving group is untouched; and on a device that cannot hover, a hover
state was a lie anyway. B3b asserts the computed value in **both** directions.

**`touch-action: pan-y`, not `none`.** Without any `touch-action`, Chromium swallows a horizontal
gesture whole and the `<svg>` receives *nothing*, measured as `[]`, so the scrub genuinely depends
on this line. With `none`, a reader could no longer scroll the page past a chart, and `/government`
is
26,000px of mostly chart. B4 asserts a vertical swipe starting on a chart still scrolls.

#### The hint text

Three mutually exclusive spans, all in the served bytes, switched by CSS. `Focus or hover` goes from
**24 occurrences to 0** site-wide.

| Mode | Shown when | Sentence |
|---|---|---|
| `nojs` | `<noscript>` block in `BaseLayout.astro` | `Open "View as table" below for any value in this chart.` |
| `hover` | `@media (hover: hover)` | `Hover a {noun}, or Tab to it, to read its value.` |
| `touch` | `@media (hover: none)` | `Tap or drag across the chart to read a value.` |

**It is CSS and not React state, deliberately.** The hint sits inside
`<p aria-live="polite" class="readout">`. A `matchMedia`-driven hint would change that live region's
text at hydration and announce "Hover a year…" on every chart as it scrolled into view. Served text
and hydrated text are byte-identical here, so nothing fires. Do not refactor it into state.

**`hover`, not `pointer: coarse`.** `pointer` describes precision; `hover` describes whether the
sentence "hover a year" is a lie, and the criterion is about that sentence.

**The hover sentence changed too**, not only the touch one: #73's own verification greps `dist/` for
the literal `Focus or hover`, and a span still carrying it would be in the served bytes on every
device. Dropping "Focus" for "Tab to it" also trades jargon for the key the reader presses.

**24 of 25 chart readouts carry the hint.** The exception is `AttributionSplit`, whose idle readout
is an announcement of the current tab ("By voting coalition. 3 coalitions, net total …") rather than
an instruction. It never named a gesture, so it was never part of this defect; its chart takes the
tap like every other. `BudgetChart`'s hint is a `<dd>` inside `<dl class="inspector">` rather than a
`<p class="readout">`, because that figure reads out a breakdown and not a single value.

#### The issue's four edge cases, each answered

1. **"Detect the modality, not the viewport."** At two levels, and neither is a width. The
   *interaction* keys on `e.pointerType !== 'mouse'`, because the event itself says what it was,
   which beats any media query. The *hint* keys on `@media (hover: …)`. **The touchscreen laptop**
   (`hover: hover` **and** `any-pointer: coarse`) gets the hover hint, which is true for its primary
   input, while the touch path still works, because the interaction never consults a media query.
   The laptop is told the thing that works, and it is told nothing false. Its marks keep
   `pointer-events`, so hover keeps working, and clobber 2 above can therefore still occur there on
   a gap-tap. Recorded as a known limitation below rather than papered over.
2. **"With JavaScript off there is no interaction at all."** The served bytes show only the `nojs`
   sentence, pointing at the table, which is the one route that genuinely works without scripting
   (`TableView` is a native `<details>`). Asserted by B2c and by
   `test_the_noscript_block_points_a_scripting_off_reader_at_the_table`.
3. **"389 targets across 350px means a tap resolves to a band of several points."** Answered under
   "What 'nearest' means" above, and the *drag* is what answers it.
4. **"This interacts with #66."** Re-measured to **0** clipped `<text>` nodes at 390x844. The premise
   is stale and no work follows from it. Recorded so the next reader does not re-derive it.

#### Guards

| # | Where | Claim |
|---|---|---|
| U1 | `src/components/charts/nearest.test.ts` (9) | the resolver: inside, gap, tie-to-data-order, unconditional snap, zero-area skip, empty list, **2D grid**, diagonal |
| U2 | `src/components/charts/hint.test.ts` (9) | three modes; no non-`hover` string matches `/hover/i`; no string carries `Focus or hover`; class names derived per mode; `HINT_MODES` and `HINTS` agree as sets |
| B1a | `tests/browser/touch.test.ts` | a tap at 30% and at 70% of every one of the **26** tappable charts moves its readout off the hint |
| B1b | ″ | tapping the centre of 5 marks spread across each chart's index range focuses **exactly** the mark the geometry forces, and yields as many distinct readouts as there were distinct marks |
| B1c | ″ | the readout carries the identifier of the mark that actually holds focus, and a `<td>` in that figure's own table carries it too |
| B2a/b/c | ″ | the **visible** hint (`innerText`) is the touch / hover / nojs sentence under `hasTouch` / 1440x900 / `javaScriptEnabled: false` |
| B3a | ″ | a desktop mouse press on empty plot fires **no** focus event on any mark, and produces no readout |
| B3b | ″ | `pointer-events` is `none` under `hasTouch` and **not** `none` on desktop; `touch-action` is `pan-y` and **not** `pan-y` respectively |
| B4 | ″ | a vertical CDP swipe starting on a chart increases `window.scrollY` |
| P1-G1 | `pipeline/tests/test_accessibility.py` | the literal `Focus or hover` appears **0** times in `dist/**/index.html` |
| P1-G2 | ″ | every hint carrier ships one span per mode, in order |
| P1-G3 | ″ | the floor: **23** `p.readout` carriers and **24** total, as equalities |
| P1-G4 | ″ | the three `.hint-*` switches, both `@media (hover: …)` queries, the `pointer-events: none` rule and `touch-action: pan-y` survive the build |

**B1b's oracle is not a second copy of `nearestBox`.** It taps a mark's own centre, so the point is
inside at least one mark and the answer is forced by a far simpler rule, *the lowest-index visible
mark whose rect contains the point*. That formulation is necessary as well as cleaner: the site's
marks **overlap**. `MedianIncome`'s dots are 15.5px wide on a 7.2px stride, so a dot's centre sits
inside its left neighbour too, and "tapping mark N focuses mark N" is simply false there. The tie
rule is observed, not assumed.

**P1-G2 and P1-G3 count through `HINT_CLASSES`, derived from `hint.ts`'s own `HINT_MODES`, and
recognise a hint span by *shape* (`^hint-[a-z]+$`) rather than by membership in that list.** The
combination is #72's lesson applied directly: a mode deleted from the component shrinks the
expectation but not the observation, so G2 fails instead of sweeping one mode fewer.

#### Mutation proofs, EXECUTED 2026-08-27

Every mutation was applied, observed red, and reverted; `git status --porcelain` empty afterwards.

| # | Mutation | Predicted | Observed |
|---|---|---|---|
| U1-a | `nearestBox` returns `0` unconditionally | inside-the-box case | **7 of 9 red** |
| U1-b | `d < best` becomes `d > best` | the gap case | **8 of 9 red** |
| U1-c | remove the zero-area skip | the degenerate-box case | **red on exactly the 3 cases about degeneracy** |
| U1-d | `-1` becomes `0` for an empty list | empty and all-degenerate | **red, that case only** |
| U1-e | drop `dy`, comparing `x` only | the 2D grid case | **red, that case only** |
| U2-a | `HINTS.touch` gets the hover sentence | "no non-`hover` mode mentions hovering" | **red, plus the tap/drag assertion** |
| U2-b | restore `Focus or hover` in `HINTS.hover` | the literal assertion | **red, plus the placeholder assertion** |
| U2-c | delete a member of `HINT_MODES` | arity and set equality | **red, plus the derived-class-name assertion** |
| G1 | one island's pre-#73 string restored | G1 | **G1 red** (G3 too: the carrier count drops) |
| G2 | one island ships 2 spans instead of 3 | G2 | **G2 red; G1 and the floor green** |
| G3(i) | one island's `<ChartHint>` deleted | the floor | **floor red; G1 and G2 green** |
| G3(ii) | **`READOUT_CLASS` -> `"readoutX"`** (the guard's own selector) | the floor, by name | **floor red, reporting `readout carriers 0`** |
| G4 | the `@media (hover: none)` block deleted from `global.css` | G4 | **G4 red** |
| B1a | `onPointerDown` removed from `groupProps` | B1a | **B1a red on all 3 routes** (B1b/c too) |
| B1b | resolve to index 0 unconditionally | B1b | **B1b/c red on all 3 routes; B1a green** |
| B1c | one island's `onFocus` reports the next datum | B1c | **red on `/economy` only**. The parity assertion, in isolation |
| B2a | the `(hover: none)` hint rule deleted | B2a | **B2a red** (B1a too: with no visible hint there is no idle text to move off) |
| B2b | the two media queries swapped | B2b | **B2a and B2b both red** |
| B2c | the `<noscript>` rules removed | B2c | **B2c red on all 3 routes; B2a and B2b green** |
| B3a | the `pointerType === 'mouse'` bail dropped | B3a | **GREEN at first, see below** |
| B3b | `pointer-events` rule unscoped from its media query | B3b's desktop half | **B3b red** |
| B4 | `touch-action: pan-y` -> `none` | B4 | **B4 and B3b both red** |
| blind-a | `svg.chart` -> `svg.chartX` throughout the lane | `TAPPABLE_CHARTS` | **red, reporting `0 tappable charts, expected 5`** |
| blind-b | the hint-carrier selector emptied | `HINT_CARRIERS` | **B2a/b/c red on all 3 routes** |
| blind-c | B3b's mark selector emptied | B3b | **red, `no chart mark to measure`** |

**B3a was a hollow check as first written, and the mutation is what found it.** It read
`document.activeElement` after the press. With the mouse bail removed, the pointer path *does* focus
a mark on `pointerdown`, and clobber 2 above then resolves focus away from it a moment later,
because the `<svg>` is not focusable. The end state is identical either way, and the mutation went
green through all eighteen tests. The guard now records `focusin` events landing on a mark during the
press, which is what actually differs; the mutation turns it red, naming the mark it focused. This is
the fourteenth hollow check removed in this run.

**B3a asserts that no *datum* is selected, not that focus lands on `<body>`.** Chromium resolves a
press on a non-focusable element to the nearest focusable ancestor, so some presses land on `<main>`
and always did. Measuring that would be measuring Chromium.

#### DoD 4: the desktop DOM diff, EXECUTED 2026-08-27

`main` @ `c6c867d` and this branch, both built fresh, hydrated at 1440x900 in a non-touch context,
all three chart routes, every element under `<main>` serialised one node per line with sorted
attributes.

| | main | branch |
|---|---|---|
| nodes | 12,426 | 12,498 |

**Differences inside any `<svg>`: 0.** Asserted directly, not eyeballed.

| Change | Count |
|---|---|
| `<span class="hint-nojs">` added | 24 |
| `<span class="hint-hover">` added | 24 |
| `<span class="hint-touch">` added | 24 |
| hint carriers whose own text node was replaced (`p.readout` x23, `dd` x1) | 24 |
| **span parents outside that carrier set** | **0** |
| **carriers that gained no spans** | **0** |

Two build identifiers also differ and are named rather than hidden: each edited island's
`astro-island` `component-url` (a content hash, which must change because the island's source
changed) and its
`uid` (Astro's per-island hydration id). Neither is rendered content. Normalising those two leaves
**120 changed lines, all of them the table above**.

Behaviourally, DoD 4 is also carried by B3a, B3b, and by `tests/browser/keyboard.test.ts` and
`tests/browser/driven.test.ts` passing **unmodified**.

#### Known limitations, human-judged and named as such

1. **Whether the drag *feels* like a scrub on real hardware is not asserted and is not claimed.**
   The lane proves that a CDP touch drag re-resolves the mark and that the readout follows; it cannot
   prove that a thumb moving across a 350px plot at 0.9px per year feels controllable. That needs a
   person and a phone.
2. **The hybrid touchscreen-laptop gap-tap.** A device reporting `hover: hover` keeps
   `pointer-events` on its marks by design, because its primary input is a mouse and hover must
   keep working. A *finger* tap landing in a gap there can still hit clobber 1, where the emulated
   `mouseleave` reaches the previously hovered mark and clears the readout the tap just set. The tap
   on a mark works, and the tap in a gap may not. Not fixed, because every available fix costs the
   mouse its hover.

#### Boundaries

**Not in scope, still open.** The visible at-rest scroll affordance **#76**; the open data-table
height cap **#77**. How any of this *reads* in NVDA or JAWS is **#30** and **#80**. **#74**, §11's
legend swatch wrapping, and **#75**, the focus-ring width, **have since shipped**, and are covered
below. **Control sizing is #65's, and #73 owns chart marks only**, which is why the issue's "'View
as table' is a 24px target" line is recorded as stale above rather than acted on.

**Recorded, not fixed.** `StateTaxMix` has 2 focusable zero-area marks on
`/government` (the other 5 are an inactive Radix tab panel and are not a defect, per the table
above); and `StatutoryVsEffective`, whose chart draws 44 years and whose table carries only
the CBO anchor years, so three of the values a tap can read out are genuinely absent from the table
below it. B1c names that figure as an explicit exception rather than softening the rule to "where
present", which would pass over any number of charts losing their tables.

### A legend key that wraps between its swatch and its label (#74)

`.state-legend`, GOV-11's give and get key, was a **flat** flex container of six sibling `<span>`s,
swatch, label, swatch, label, swatch, label, under one `flex-wrap: wrap`. Nothing bound a swatch to
the label it belonged to, so the wrap fell wherever the sixth box happened to land. Read left to
right, a stranded swatch sits beside the **next** label and inverts the direction the colour ramp
encodes.

**Measured before and after**, `npm run build` of the branch base, hydrated, Chromium via
`tests/browser/harness.ts`. `top`/`bottom` are absolute document offsets, so only their differences
matter. "Label line" is the line box holding the **first word** of the text the swatch abuts.

| width | before: swatch | before: label line | before | after: swatch | after: label line | after |
|---|---|---|---|---|---|---|
| **320** | 23530-23543 | 23556-23577 | **no overlap** (item 2, "Even", strands at the end of row 1) | 23530-23543 | 23528-23549 | overlap, all three |
| 360 | — | — | ok | — | — | ok |
| **390** | 21543-21557 | 21569-21591 | **no overlap** (item 3) | 21543-21557 | 21542-21563 | overlap, all three |
| **414** | 21111-21125 | 21137-21158 | **no overlap** (item 3) | 21111-21125 | 21110-21131 | overlap, all three |
| 768 / 1440 | — | — | ok | — | — | ok |

The issue reported 390px only. 320px breaks a *different* item and 360px does not break at all,
which is the reason the guard sweeps three widths rather than the reported one.

**The fix** wraps each swatch + glyph + label in one `.state-legend-item`
(`display: inline-flex; align-items: baseline; gap: .35rem; min-width: 0; max-width: 100%;
overflow-wrap: anywhere`), so the parent wraps between items and never inside one. It is the idiom
`StatutoryVsEffective`'s CBO key already uses inline, and no new idiom was introduced. The rule is
`baseline` rather than `center` on reading-order grounds, because a two-line label with `center`
floats the swatch between the lines rather than putting it on the first.

**Driven durability.** The `$113,122 per person` figure is data-driven, so "it fits today" is not
"it fits". At each of the three widths the two currency strings are replaced in the DOM and the
whole invariant re-run, with `$1,113,122,999`, and again with a 45-character unbreakable token.
`.state-legend` measures `scrollWidth` **280** against `clientWidth` **280** at 320px in both cases,
and `documentElement.scrollWidth == clientWidth` throughout. With `min-width: 0`, `max-width: 100%`
and `overflow-wrap: anywhere` all removed, the unbreakable token puts `.state-legend` at **290**
against **280**, which is what those three declarations buy, and either half alone buys it.

**320px is now committed for this invariant, and only this one.** Row 11 above and
`tests/browser/harness.ts`'s `VIEWPORTS` comment were both corrected in place. `VIEWPORTS` itself is
unchanged: the spec declares 320/390/414 locally, so no other spec's cost or coverage moved.

**The glyphs.** `markFor` emits `−`, `·`, `+` and `?`, and nothing on the route said what they
meant, because the prose under the figure covers the midpoint, DC and the grid geometry and is silent about
the marks. The three legend items now carry the first three, from the same constant `markFor` reads,
and `test_the_state_legend_names_every_glyph_it_ships` asserts that every glyph in
`dist/government/index.html` (51 tiles: 28 `+`, 23 `−`) is named by the legend's exactly-3 entries.
`?` has no legend entry **by decision**, because no tile renders it and `describe()` spells the
missing-figure case out in words. That test is the tripwire that turns the day one ships into a
decision rather than an oversight.

**Two premises the issue stated, re-measured and found stale.**

1. "Assert every swatch and its label share a `getBoundingClientRect().top`" is not satisfiable even
   by a correct legend: the swatch is 13.6px and the line box ~21px, so the two tops differ by a few
   pixels when everything is right. The assertion is **vertical overlap with the line box holding
   the abutting text's first word**, red at 320/390/414 before, green at 360/768/1440 before, green
   everywhere after.
2. "Colour is the only encoding of direction" is inaccurate: the tiles' `+`/`−` glyphs and the
   by-state table were already redundant carriers (GOV-11, below). And
   `test_no_island_encodes_a_category_only_in_colour` does **not** cover this island at all, because it
   matches `fill=`/`stroke=` against a literal `var(--<token>)`, and `StateGiveGet` paints through
   `divergingFill(...)`. The guards for this figure are the two new ones, not that test.

**Mutation results, including the three that did not bite.** Every guard was run against the mutant
that removes what it protects. Recorded in full because two of the planned mutations turned out to
be wrong about the mechanism and one is a real limit of the assertion:

| mutation | result |
|---|---|
| Six loose sibling spans (the defect) | **red**. L1 at 320 (2 offenders), 390 and 414; green at 360/768/1440 |
| `.state-legend-item { display: inline }` | **green, did not bite.** A flex item is blockified, so `inline` becomes `block` and the swatch still cannot leave its label. The mutant that does bite is `display: contents`, which removes the item's box entirely: **red** on L1 and L3 |
| `.state-legend-item { align-items: center }` | **green at two-line labels, did not bite.** Centred over two lines the swatch straddles them and still overlaps the first; measured, it goes **red** at four lines. `baseline` is kept on reading-order grounds, which this assertion does not express |
| `.state-legend { flex-wrap: nowrap }` | **red**. But on L3, not L2: with the shipped label the three items shrink onto one row, and it is the driven long value that forces `.state-legend-item` to 25 against 23 |
| Drop `min-width: 0` / `max-width: 100%` / `overflow-wrap: anywhere` | **red** on L3's unbreakable token (290 against 280). Green at `$1,113,122,999`, which is why L3 drives both |
| Empty the sweep's own selector (both `display: none` on every swatch, and narrowing the marker rule to a class that matches nothing) | **red**. The pinned per-route counts fire before any geometry is measured |
| Legend stops naming `−` | **red**, `test_the_state_legend_names_every_glyph_it_ships` |
| One tile emits `?` | **red**. The same test |
| Point the glyph guard at a page with no tiles | **red**. Its `>= 51` tile-count floor, which is what stops "no glyph is unexplained" reading the same as "no glyph was found" |

The `display: contents` mutant also exposed a hole in the assertion and closed it: measuring against
the abutting range's **first line box** passed a legend whose swatch and glyph stayed together while
the words walked off, because the first line box was the glyph. The guard now measures against the
line box holding the first **letter or digit**.

### Greyscale, per chart

Computed from the rendered DOM: the `fill` and `stroke` of every category mark, per plot panel,
converted to WCAG relative luminance, with the ratio taken between every pair of categories that
**co-occur in one panel**. Axis, grid, annotation, band and `.datum` elements are excluded, as are the
surface tokens. Chrome 151.0.0.0, JavaScript on; the values are viewport-independent and were
confirmed identical at 1440×900 and 390×844. A ratio below 3:1 is a defect only where colour is the
sole carrier. Per `test_no_island_encodes_a_category_only_in_colour`, a category also carried as a
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
| `/government/` | GOV-5 structural gap | `--positive` / `--rev-ci` | 1.28:1 | in-plot labels ("Outlays", "Revenue", "Surplus, FY1998-2001"), table columns | PASS (note) |
| `/government/` | GOV-6 voted and not | `--rev-ci` / `--rev-ii` | 1.35:1 | three in-plot band labels ("Mandatory (net)", "Discretionary", "Net interest"), table columns | PASS (note) |
| `/government/` | GOV-7 net interest | `--rev-ci` / `--rev-pr` | 1.95:1 | in-plot callouts, table columns | PASS |
| `/government/` | GOV-8 deficit history | single colour | n/a | table columns | PASS |
| `/government/` | GOV-9 law explorer, coalition | `--mix` / `--gop` | **1.09:1** | each bar labelled in-plot with its coalition name and total | PASS (note) |
| `/government/` | GOV-9 law explorer, president | `--rev-ci` / `--positive` | 1.28:1 | each bar labelled in-plot | PASS (note) |
| `/government/` | GOV-10 revenue by source | `--rev-pr` / `--rev-eg` | **1.00:1** | non-adjacent in the stack; tightest adjacent pair 1.44:1 with a drawn boundary; four of seven sources labelled in-plot; all seven are table columns | PASS (note) |
| `/government/` | GOV-10 OECD comparison | single colour | n/a | country names in-plot | PASS |
| `/government/` | GOV-11 give and get cartogram | adjacent scale steps | **1.00:1** | every tile carries its state abbreviation and a `+`/`−` glyph for direction, and since #74 the legend **names those glyphs** beside its three swatches, an unexplained glyph is a weak carrier, and no prose on the route explains them; magnitude is in the table | PASS (note) |
| `/government/` | GOV-11 state tax mix | `--rev-ii` / `--rev-pr` | 1.44:1 | **nothing in the figure**. No legend and no in-plot label at either viewport; the three segments are named only inside the disclosure table | PASS (note) |
| `/households/` | HH-1 household spread | single colour | n/a | in-plot title, table | PASS |
| `/households/` | HH-2 inequality, both panels | single colour each | n/a | in-plot panel titles, table columns | PASS |
| `/households/` | HH-3 bracket history | `--ink-soft` / `--rev-ii` | 1.31:1 | three separate panels, each with its own in-plot title; table columns | PASS (note) |
| `/households/` | HH-4 statutory vs effective | `--positive` / `--rev-ii` | 1.06:1 | **marker shape**: circle, square, triangle, diamond, ×, +, with a shape legend. Colour carries nothing alone. | PASS |
| `/households/` | HH-5 who pays | no series colour renders | n/a | in-plot "AGI" / "tax" labels per percentile group | PASS |
| `/households/` | HH-6 top-1% share | single colour | n/a | in-plot year callouts, table | PASS |
| `/households/` | HH-7 payroll bill | `--rev-ci` / `--rev-ii` | 1.35:1 | in-plot end labels ("Payroll", "Individual income"), table columns | PASS (note) |
| `/sources/` | — | no chart renders | n/a | — | PASS |

Every `PASS (note)` above is a chart whose category colours separate by less than 3:1 in greyscale and
whose category is therefore being carried by something other than colour. That redundancy is what
`test_no_island_encodes_a_category_only_in_colour` locks. The three thinnest cases are GOV-10's identical
`--rev-pr`/`--rev-eg` luminance, GOV-11's flat cartogram scale, and GOV-11's unlabelled tax-mix bar.
are recorded as design observations rather than as defects under this contract.
## Manual checklist: status per item

Written by PR #15, when no browser, assistive technology or rendered-pixel measurement existed in
this loop. Most of it has since been executed; the results are in **Manual pass results** above and
each item below now carries its own state. Two items are genuinely not executable by any agent and
say so.

### Shared

1. **Tab and Shift-Tab traversal**, start to finish: focus order follows reading order and every
   control (route nav, TOC, unit toggle, chart data points, table disclosure) is reachable and
   operable. **EXECUTED 2026-08-24**, Chrome 151, all four routes. Skip link first, `main`
   focusable, zero positive `tabindex`. The last standing FAIL was **#72** (four identically named
   `radiogroup`s); it has shipped, alongside #69 (no bypass past the data points) and #71 (table
   scroll container not keyboard reachable). No FAILs outstanding on this row. Row `M1`.
2. **Screen-reader pass** (VoiceOver + Safari, NVDA + Firefox): the chart's `aria-label` announces
   usefully, the `<details>` table reads coherently when opened, and the `aria-live` readout
   announces once per focus move rather than flooding. **NOT EXECUTED.** No assistive technology
   exists in this environment and none can be driven from an exec agent. Human required: **#80**.
   Row `M2`.
3. **Roving-tabindex and focus-trap check on the radio groups**: Home/End/arrow-key behaviour matches
   the ARIA radio-group pattern and nothing traps focus. **EXECUTED 2026-08-24**, Chrome 151. All
   20 radios carry `role` + `aria-checked` + a roving tabindex; the three filter dropdowns close on
   Escape and restore focus to their trigger. PASS. Row `M3`.
4. **390px legibility, JavaScript on and off**, including whether the `<noscript>` mitigation's
   enlarged annotation text collides with the plotted curve. **EXECUTED**: JavaScript on
   2026-08-24, JavaScript off 2026-08-26, Chrome 151 at 390×844. The collision question is moot:
   the `<noscript>` mitigation never applies (#78), so with scripting off the text is *too small*
   rather than too large, at 5.10 to 5.59px rendered. FAILs: #62, #63, #64, #66, #74, #77, #78, #79 (#73 **fixed 2026-08-27**, see *Reading a datum with no hover*).
   Rows `M4` and `M5`.
5. **Greyscale render**, confirming no distinction a reader needs is carried by colour alone.
   **EXECUTED 2026-08-26**, Chrome 151, both viewports, JavaScript on, with a computed per-panel
   luminance ratio for every co-occurring category pair. PASS with notes; see **Greyscale, per
   chart**. Row `M6`.
6. **Focus-ring visibility against every background it can appear on, in Safari specifically**,
   where the SVG `stroke` fallback (D6) is the ring that actually paints. **PARTLY EXECUTED
   2026-08-26.** WebKit 26.5 (the Safari 26.5 engine, driven headless, and *not* Safari.app) confirms a
   ring paints on a focused `.datum` on all three chart routes, and computed the 1.5px `outline` rule
   as `1px`, which is the evidence for #75, **fixed 2026-08-27**. The fix also caught what that pass did not
   look for: the `stroke` fallback, the ring WebKit actually paints, rendered **1.944 CSS px at
   390px** because `stroke-width` resolves in user units against a scaled `<svg>`, so it was under
   the minimum too. `vector-effect: non-scaling-stroke` puts it at 2.000 at both viewports.
   **NOT EXECUTED**: visibility against every background in Safari.app itself, and which of
   `outline` and `stroke` is the mechanism a sighted Safari user sees. Human required: **#80**.
   Row `M7`.
7. **Measured contrast over rendered pixels**, including anti-aliased SVG text and any overlap
   between a series fill and text drawn on top of it. **EXECUTED 2026-08-24**, Chrome 151. The
   focus ring measures 13.65:1 against `rgb(221,224,219)`, so colour passes, and since #75 landed
   (2026-08-27) the thickness is 2px and meets the WCAG 2.2 Focus Appearance minimum. PASS, asserted
   by `tests/browser/focus.test.ts` F1 rather than re-walked by hand. Row `M8`.

### Per-consumer

8. **Keyboard models for the interactive primitives that actually render.** Radix `Select` **did**
   land. Two consumers exist, both on `@radix-ui/react-select@2.3.7`: `src/components/islands/Select.tsx`
   (the Government §8 filter bar's three dropdowns) and `src/components/islands/StateTaxMix.tsx`
   (§11's jurisdiction picker). The anticipated `Slider`, `Dialog` and `Tabs` consumers **never
   landed**, and `Tooltip` was rejected for the term markers on the reasoning in Conventions above:
   the site renders **zero `<input>` and zero native `<select>` elements**, and there is no slider,
   no modal and no tab strip in the DOM. Rewritten 2026-08-26 against the four control shapes that
   do render:
   - **`role="radio"` button groups** (`UnitToggle`, and the Government route's four measure
     toggles), at 20 radios site-wide, roving tabindex, `aria-checked` on each. **EXECUTED**, PASS,
     Chrome 151, 2026-08-24. Their *naming* was a separate defect (#72), **fixed 2026-08-27**: each
     group is now named by its own figure, e.g. "Figure 5 Measured in".
   - **Filter dropdown buttons**, the Radix `Select` consumers: three on `/government/` §8
     (`Select.tsx`) and §11's jurisdiction picker (`StateTaxMix.tsx`). Escape closes and restores
     focus to the trigger. **EXECUTED**, PASS, Chrome 151, 2026-08-24. The menu's width at 390px
     **was** an open defect (#62) and is **fixed**. The measurement is in § Manual pass results
     under *Radix `Select` popper width at 390px*.

     The rest of the keyboard model, expected and actual, **EXECUTED 2026-08-27**, Chromium
     **151.0.0.0** (Playwright MCP) against a local build of `dist/` at **390×844**, on
     `/government/` §8's "Control at enactment" dropdown (7 options) and §11's jurisdiction
     dropdown (51 options). **PASS on every line**:

     | Key | Expected | Actual |
     |---|---|---|
     | Enter (on the trigger) | opens the listbox, highlight on the selected option | opened; `data-highlighted` on `Democratic president · Republican House · Republican Senate (DRR)`, the current value; `activeElement` is that `role="option"` |
     | Space (on the trigger) | opens the same way; does not scroll the page | opened; highlight again on the selected option, `scrollY` unchanged |
     | ArrowDown | highlight moves to the next option | `All control configurations` → `… Republican Senate (RRR)`, one step |
     | ArrowUp | highlight moves back to the previous option | ArrowDown then ArrowUp returned to `All control configurations`, same option, not two steps |
     | Home | highlight moves to the first option | `All control configurations` |
     | End | highlight moves to the last option, scrolled into the box | §8: `… Republican Senate (RDR)`, the 7th of 7, inside the content box. §11: `Wyoming`, the 51st of 51, inside the box, the 20rem cap still scrolls to the end |
     | type-ahead | typing `r` highlights the first option starting with it | `Republican president · Republican House · Republican Senate (RRR)` |
     | Escape | closes; focus returns to the trigger; the value is unchanged | closed, `activeElement === trigger`, value still `… (DRR)` after a type-ahead highlight had moved off it. Same on §11: `activeElement === .tax-mix-select`, value still `Alaska` |
     | Enter (on an option) | commits that option, closes, focus returns to the trigger | value became `… Republican Senate (RRR)`, listbox closed, `activeElement === trigger`, `documentElement.scrollWidth` still **390** |
   - **`<details>`/`<summary>` disclosures**, every `<TableView>`, present in the server-rendered
     HTML with scripting off (13 on `/government/`, 7 on `/households/`, 5 on `/`), and since #42
     the **narrow-viewport nav panel** (`details#navbar-disclosure`, one per page, below `62rem`).
     Keyboard operation **EXECUTED**, PASS.

     The nav panel's keyboard model, expected and actual, **EXECUTED 2026-08-26**, Chromium via
     Playwright at 390×844 and 844×390, PASS on every line: Enter or Space on the `<summary>`
     toggles the panel (native, no `aria-expanded` written by hand, because `<summary>` supplies the
     state); opening moves focus to `#navbar-panel`; Escape closes and returns focus to the
     `<summary>`; Tab from the last panel link continues into `main` rather than wrapping, because
     there is no trap; activating an in-panel link closes the panel, and so does a click outside
     it. The Escape listener is bound to `#navbar-disclosure`, not `document`, so it does not
     contend with the three `/government/` filter dropdowns above. Re-checked at 390px, those
     still close on Escape and still restore focus to their own trigger. **With scripting off,
     stated rather than implied:** the toggle works by click and by Enter and all 17 links are
     reachable, while Escape, the focus move, the focus return and both dismissals do not happen.

     #42 evaluated Radix `Dialog` for this panel and chose the native disclosure instead; the
     decision and its four reasons are recorded in Conventions above, so a later reader does not
     re-litigate it. Whether the native disclosure *announces* its state correctly is a
     screen-reader question and is **NOT EXECUTED**, per #80.

   - **In-prose glossary term markers** (`.term`, `src/components/Term.astro`, #47) are the fourth
     control shape, and the first that is a **link which also discloses**: 26 of them, 6 on
     `/economy`, 8 on `/households`, 12 on `/government`. Not a Radix `Popover` and not a
     `Tooltip`; the reasoning is in Conventions above. Keyboard model **EXECUTED 2026-08-26**,
     Chromium **151.0.7922.174** (Playwright MCP) against `astro preview` at 1280×900 and 390×844.
     **PASS on every line**, expected and actual:

     | Key | On the trigger | In the open popover |
     |---|---|---|
     | Tab (to it) | opens; `aria-expanded` goes `false` → `true`. **Actual**: arriving on `.term[data-term="payroll-tax"]` from the rail's last contents link opened it, `aria-expanded="true"`, 1 popover open | — |
     | Tab (from it) | moves to `.term-more`, the popover's own link; **popover stays open**. **Actual**: `.term-more`, `href="/income-tax/glossary#payroll-tax"`, still open | moves to the next focusable and the popover closes. **Actual**: landed on the next marked term's trigger, the first term's `aria-expanded` back to `false`, exactly 1 popover open (the new one) |
     | Shift-Tab | closes, moves to the previous element | moves back to the trigger; **popover stays open**. **Actual**: `aria-expanded="true"`, 1 open |
     | Enter / Space | opens; **does not navigate** | `.term-more` navigates to `/glossary#<slug>` |

     **Re-verified 2026-08-26**, Chromium 151 (Playwright MCP), `/economy`: an `<a>` synthesizes a
     click on Enter but not on Space, so Space had no handler and fell through to its native
     default, scrolling the page, until this pass added an explicit `keydown` intercept in
     `termPopovers()`. **Actual**, after the fix: focusing `.term-trigger[data-term="real"]`,
     closing with Escape, then pressing Space, with `aria-expanded` `false` → `true`, `activeElement`
     unchanged (still the trigger), `location.href` unchanged, `window.scrollY` **0** before and
     after. The row above previously carried no **Actual** line, unlike its neighbors; this is
     that gap closed, not a re-statement of an old result.
     | Escape | closes; **focus stays exactly where it is**. **Actual**: `activeElement` still the trigger, `window.scrollY` 0 before and after | closes; focus returns to the trigger. **Actual**: `activeElement` the trigger, `scrollY` unchanged |

     **The refinement, recorded rather than silently implemented.** #47's checklist says "Tab again
     moves on and closes it", which describes a one-tab-stop trigger. The same issue also, and
     correctly, as its own reason for rejecting `Tooltip`, requires a `/glossary` link *inside* the
     popover, and a link inside an open popover is a focusable node in DOM order. So a marked term
     is **one tab stop while closed and two while open**, and "Tab moves on" happens one stop later
     than that sentence implies. That satisfies the criterion's actual requirement, which is to be in the natural
     focus order, not skipped and not a tab trap, in both directions, which the Shift-Tab row
     above verifies.

     **No focus trap and no focus move on open, so no focus return is owed.** Opening moves nothing
     (unlike the nav panel, which focuses its container); the only scripted focus call in the whole
     IIFE is Escape's return from inside the popover, and it is guarded so it cannot re-enter the
     trigger's own focus handler and reopen what Escape just dismissed.

     **The Escape listener is bound to the wrapper `<span class="term">` rather than `document`.** The
     same decision the nav panel made, for the same reason. Re-checked in the same session at
     390×844: the first `/government/` filter dropdown still opens, still closes on Escape, and
     still restores focus to its own trigger (`aria-expanded` `false,false,false`, `activeElement`
     the trigger), and `#navbar-disclosure` still closes on Escape and returns focus to its
     `<summary>`.

     **What scripting off costs, stated rather than implied.** Verified at 390×844 and 1280×900
     with `javaScriptEnabled: false`, all three routes: all 26 markers are `<a>` elements with a
     base-path-joined `href`, **zero** carry `aria-expanded`, **zero** popovers have any rendered
     height, every `short` is in the DOM as the trigger's `aria-describedby` target, and clicking a
     marker lands on `/glossary#<slug>` with the `<dt>` at 64px, clear of the 52px bar. Console
     clean, 0 errors and 0 warnings. What is lost is exactly the disclosure: no hover, no
     focus-open, no Escape, no dismissal. Nothing becomes inert and nothing becomes a `<button>`.

     Whether the definition *announces* as the trigger's description is a screen-reader question
     and is **NOT EXECUTED**, per #80.

   Any PR that introduces the first consumer of a further primitive adds its keyboard-model check
   here, with expected and actual key behaviour, before this item can be marked anything but blocked
   for that primitive.
9. **Screen-reader pass, Households and Economy routes.** **NOT EXECUTED.** Human required, #80.
10. **Screen-reader pass, Government §§2-12 and `/sources`.** **NOT EXECUTED.** Human required, #80.
11. **Greyscale render, all three routes.** **EXECUTED 2026-08-26.** See item 5 and the per-chart
    table. Every section that colour-codes a category now exists and was rendered.
12. **Cross-route keyboard sweep** (feature-matrix `A11Y-2`): the full Tab/Shift-Tab traversal across
    all three routes and `/sources`, end to end. **EXECUTED 2026-08-24**, Chrome 151. Tab stops
    counted per route: `/` 408 (389 data points), `/government/` 471 (380), `/households/` 356. Row
    `M1`. `A11Y-2` nevertheless stays at `In progress` until #80 closes, because the row's own
    definition of done includes the screen-reader half.
13. **Section-level `aria-current` under a screen reader** (feature-matrix `A11Y-4`): navigating into
    either contents list reports the current section on demand, **and** scrolling the page rapidly
    announces nothing at all. Both halves matter, because a mark no one can find is useless, and a mark
    that speaks on every section boundary is worse than none. The silence half is argued statically
    (`test_contents_lists_are_not_live_regions` plus the ARIA rule that an attribute change on an
    unfocused, non-live element is not announced) and the reporting half is not observable without
    an assistive technology. **NOT EXECUTED.** Human required: **#80**.
