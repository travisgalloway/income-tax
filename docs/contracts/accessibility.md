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

**A figure contributes at most one tab stop per chart `<svg>`, however many marks it draws.** Marks
are not removed from the keyboard. Each chart SVG is one **roving-tabindex group**: exactly one mark
carries `tabindex="0"`, every other carries `tabindex="-1"`, and Left/Up, Right/Down, Home and End
move focus between them in **DOM order, which is data order, not screen geometry**. Tab enters the
figure at the active mark and leaves the chart entirely. This is the roving-tabindex convention of
the ARIA composite-widget pattern **without wrapping**: a chart's marks are a series, and jumping
from the last year to the first reads as a discontinuity in the data, so the ends clamp. `Down` is
included because `OecdChart`'s dot plot runs vertically and "next" reads downward there.

**The rule holds in the served HTML, not only after hydration.** Islands mount `client:visible`,
which server-renders the markup and defers only hydration, so before #69
`dist/government/index.html` shipped all 369 marks focusable before a line of JavaScript ran. The
active index is therefore React state and `tabIndex` is derived from it **during render** — never
written by an effect, which would be both absent from the served bytes and clobbered by the next
re-render. `useRovingMarks()` (`src/components/charts/roving.ts`) is the only way to make a chart
mark focusable; `Chart` passes its `mark` to the render prop as a second argument, and the three
islands that hand-roll their own `<svg>` (`BracketHistory`, `StateGiveGet`, `StateTaxMix`) call the
hook directly.

A figure that draws marks still carries its `<details>` "View as table". That table stays the
complete non-visual equivalent and is **the one route this rule may never shorten**.

No bypass *control* is added — no "skip this chart" link, and so no new off-screen focusable content
of the `left: -9999px` kind. Roving needs none: it bounds the tab order for every reader rather than
only for one who finds and activates a control.

Enforced by `test_each_chart_svg_offers_exactly_one_tab_stop` and
`test_no_island_hardcodes_a_focusable_chart_mark` over `dist/`, and by `tests/browser/keyboard.test.ts`
in a real browser. The counts, at 1440x900 on `/government`:

| | Before #69 | After #69 |
|---|---|---|
| Tab presses from the top of `/government` to §11 `#by-state` | **438** | **141** hydrated, **118** with scripting off |
| Tab stops on the whole of `/government` | **512** | **161** hydrated, **136** with scripting off |
| `tabindex="0"` marks per chart `<svg>` in `dist/government/index.html` | `32,7,3,64,31,31,31,31,3,5,64,11,51,5` | `1` x 14 |

The 369 marks on `/government` (389 on `/economy`, 356 on `/households`) are all still there and all
still reachable; `test_the_label_coverage_did_not_narrow` pins the total at 1114 so the roving change
cannot quietly shrink the corpus every other guard reads.

Two things about it stay human-judged and are **parked**, not fixed here: nothing announces to a
keyboard reader that the arrow keys work inside a group (announcement is #30's territory), and
whether an index-based active mark reads sensibly across a filter change is a judgement, not a
measurement.

**Every figure has an accessible name, and it is the finding.** `Figure.astro`'s `ariaLabel` prop
renders as the `<figure>`'s own `aria-label`, in addition to the `<svg>`'s. The two are
deliberately the same sentence — a figure with no name announces as bare "figure", the worse
failure. Enforced by `test_every_figure_has_an_accessible_name`.

**Every `<TableView>` is a native `<details>`/`<summary>` disclosure, present in the
server-rendered HTML with scripting off.** Not a component that unmounts its content while closed.
The open/close label swaps via `.tableview[open] .tv-open`/`.tv-close` CSS, never a `useState`
read. Enforced by `test_every_chart_has_a_real_table_in_the_static_html`. `open` is **not** restored
across a history navigation — that is the platform's behaviour, not ours, and it is right: the
disclosure is a request to see a table now, not a preference. The reader's *position* is preserved
regardless; see "Scroll restoration is the platform's" below for what absorbs the resulting
11,854px document shrink, and where it does not.

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
there would outrank the page's `<h1>`. Since #42 there are **four** `<nav>` elements in the DOM,
not two: the desktop rail carries one pair, the narrow-viewport bar the other. Exactly two are in
the accessibility tree at any viewport, because `.rail` and `.navbar` are mutually `display: none`
across the `62rem` breakpoint. All four are named, and the two headings are `toc-heading` (rail)
and `navbar-toc-heading` (panel) — **they must never collide**, because `aria-labelledby`
resolution against a duplicated id is undefined. Enforced by
`test_route_nav_and_contents_nav_are_separate_landmarks`,
`test_every_nav_landmark_has_an_accessible_name` and `test_no_page_repeats_an_id`.

**Two `aria-current` values, two lists.** The route lists carry
`aria-current="page"`, server-rendered by `BaseLayout.astro` on whichever of the six routes is
open. The contents lists carry `aria-current="true"`, written at runtime by the `sectionSpy()` IIFE
in the layout's one `<script is:inline>` block, on whichever section contains the **viewport
midpoint** — the lowest section in document order whose top edge is at or above it, decided by one
`IntersectionObserver` whose `rootMargin` collapses the root to a thin band across that midpoint.
Four things follow, and each is load-bearing.

- **The counts are 2 in the DOM and 1 in the accessibility tree, for each value**, the same
  `.rail`/`.navbar` mutual-`display: none` reason the four-`<nav>` paragraph above gives: both lists
  exist on every page, and the marked anchors are addressed by one `querySelectorAll` over
  `a[data-section="<id>"]`, so the rail and the panel cannot disagree. Enforced by
  `test_no_built_page_ships_a_section_level_aria_current` (which also pins `page` at exactly 2, so
  it cannot go green by the route markers vanishing) and
  `test_every_contents_anchor_is_addressable_by_the_spy`.
- **With scripting off, nothing is marked, and that is the correct behaviour** — not a degradation
  to paper over. Reading position is derived from scroll position; server-rendering a mark on
  section 1 would be wrong for every reader who is not at the top. The built HTML therefore carries
  zero `aria-current="true"`, and `/sources`, which passes no `sections` prop, makes the IIFE
  return before it observes anything. `/` passed no `sections` prop until #48; it now passes a
  page-local array of four and carries a contents list like any route.
- **Nothing is announced while scrolling.** An `aria-current` change on an element that is neither
  focused nor inside a live region is not announced, so a fast scroll down `/government`'s twelve
  sections produces no stream of speech; the state is there, silently, for a reader who navigates
  into the list and asks for it. That holds only while neither contents list — nor any ancestor of
  one — is a live region, which is what `test_contents_lists_are_not_live_regions` checks. Never add
  `aria-live`, `aria-atomic`, `role="status"` or `role="alert"` to `.toc` or `.navbar-toc`.
- **The two values are styled apart, and the selector is never bare.** A route link marks as ink
  **plus an underline**; a section marks as ink **alone**, the whole row including its numeral. Both
  section rules match `[aria-current='true']` scoped to the contents list — a bare `[aria-current]`
  would collapse the distinction, and `test_section_state_selector_is_scoped_and_not_bare` fails if
  one appears anywhere in `global.css`. The mark is colour-only on purpose, so that changing it
  reflows nothing in a 13rem rail; the non-visual channel is the `aria-current` attribute itself.
- **After a history restore the spy marks the *restored* section, not the pre-restore one.** The
  restore emits scroll events like any other scroll; `schedule()` coalesces them into a single
  `requestAnimationFrame` and `apply()` therefore reads the settled position. Observed on
  `/government/` across an 11,854px document shrink (all 13 tables open on leaving, none on
  returning): Chromium marks `the-laws`, matching `#the-laws` at `top 64`, and WebKit marks
  `where-money-comes-from`, matching *its* restored position — the two engines restore to different
  places (below) and the spy agrees with each. Exactly 2 anchors carry `aria-current="true"` in both
  cases, one per list.

**No scripted scrolling exists anywhere in the navigation chrome.** The spy reads scroll position
and writes an attribute; it moves nothing. The rail is not a scroll container and the panel is never
auto-scrolled, so `prefers-reduced-motion` is satisfied here the same way the bar satisfies it —
vacuously and greppably, rather than by relying on the global reduce block to zero out a motion that
was written anyway. Enforced by `test_the_section_spy_introduces_no_scripted_scrolling`, which also
asserts the `IntersectionObserver` is still there so it cannot pass by finding no script at all.

**Narrow-viewport navigation is a native disclosure, not a modal.** Below `62rem` the rail is
replaced by a bar fixed to the top of the viewport carrying the site title, the current route name
and a `<details>`/`<summary>` trigger; behind the trigger, `#navbar-panel` holds all six route
links and the page's full contents list, internally scrolled (`overflow-y: auto` against a
`100dvh`-derived `max-height`), so opening it never grows the page.

- **The primitive is native `<details>`/`<summary>`, and Radix `Dialog` was evaluated and
  rejected.** `<details>` needs no scripting, which is what makes the JS-off guarantee below
  achievable at all; `Dialog` would have required the whole route list duplicated into
  `<noscript>`, a second source of truth and the duplicate-id hazard above. It is also the
  repository's established disclosure primitive (every `TableView`; see checklist item 8), and it
  keeps the site's navigation chrome off the React hydration path — a hydration-gated nav bar is a
  worse failure than the scrolling block of links it replaced. `@radix-ui/react-dialog` therefore
  still has no consumer. Recorded here so it is not re-litigated.
- **There is no focus trap, deliberately.** The panel is non-modal: no `aria-modal`, no `inert`,
  nothing behind it is `aria-hidden`. Three reasons. (1) It is a dropdown, not a dialog, and the
  panel sits in DOM order immediately after its own trigger, so Tab past the last panel link
  continues into `main` — the correct disclosure behaviour. (2) It matches the site's existing
  precedent: checklist item 3 records the three `/government/` filter dropdowns as PASS, "Escape
  closes and restores focus to their trigger… nothing traps focus." (3) A trap is reachable only
  through scripting, which would put focus management in direct conflict with the JS-off
  guarantee. Escape-to-close and focus-return are progressive enhancements and may degrade;
  trapping cannot be enhanced — it is load-bearing or absent.
- **It works with scripting off.** The disclosure opens and closes by click and by Enter, and
  every route link and section link is reachable, with zero JavaScript. Only Escape-to-close,
  focus-move-on-open, focus-return and the two dismissals (in-panel link, outside click) need the
  inline `<script>`; with scripting off Escape does nothing and the panel stays open until the
  trigger is activated again. Verified in Chromium at 390×844 with `javaScriptEnabled: false`.
- **The panel's scroll container is keyboard-reachable, so it is not a new instance of #71.** #71
  is about wide table containers that scroll but hold nothing focusable, leaving a keyboard user
  no way to scroll them. `#navbar-panel` contains 17 focusable links; tabbing through them scrolls
  it, and opening the panel moves focus to the container itself, which arrow keys then scroll. It
  is deliberately not filed again.
- **No transition and no animation exists on any `.navbar*` rule.** That is how
  `prefers-reduced-motion` is satisfied here — vacuously, and greppably, rather than by relying on
  the global reduce block to zero out a motion that was written anyway. Enforced by
  `test_nav_bar_open_close_is_not_animated`.
- **The bar costs exactly one tab stop, before `main`.** Tab stop 1 remains `.skip-link`, stop 2
  is the trigger, stop 3 is inside `main`. It skips nothing inside `main` and is therefore not a
  bypass mechanism for #69. Its own height is `--navbar-h`, 52px, which is also the offset
  `section[id]` and `#main` subtract via `scroll-margin-top` below `62rem`.

**An in-prose glossary marker is a link that also discloses, and it is native (#47).** Each marked
term is `src/components/Term.astro`: a `<span class="term" data-term="<slug>">` wrapper holding a
real `<a class="term-trigger" href="/income-tax/glossary#<slug>">` around the prose word, and,
**as a DOM descendant of that same wrapper**, a `<span class="term-pop" id="def-<slug>" hidden>`
carrying the term's `short` and a link to the full entry. `termPopovers()` in `BaseLayout.astro`
is the only script; there is no island and no `client:` directive. Five things about that shape
are load-bearing and each is easy to undo while "improving" it:

- **No Radix primitive, for the third time.** `TableView`'s original `Collapsible` left every
  disclosure unreachable with scripting off because `Collapsible.Content` is not in the DOM while
  closed (#15); #42 evaluated `Dialog` for the nav panel and chose native again. A Radix `Popover`
  here would portal the definition, unmount it while closed, make every marked term a React island
  (~25 on `/government/`), and inherit the positioning machinery that clips the filter menus at
  390px (#62). `@radix-ui/react-popover` is not a dependency and must not become one. Radix
  `Tooltip` is rejected separately: it is not focusable, it dismisses on pointer-out, and a link
  inside it is unreachable.
- **The popover is a DOM descendant of the wrapper.** `pointerleave` on the wrapper does not fire
  when the pointer travels from the trigger onto the popover, so WCAG 1.4.13 *hoverable* is met by
  the DOM shape; the 150ms close delay is redundancy, not the mechanism. Portalling it, or
  absolutely positioning it against anything but its own paragraph, breaks the criterion
  structurally and no delay recovers it.
- **Nothing closes on a timer** — 1.4.13 *persistent*. Only Escape, a Tab out of the wrapper, a
  click outside, or another term opening. Do not add an auto-close "for tidiness".
- **`left: 0; right: 0` against the paragraph**, whose `max-width` is `--measure`. The popover is
  exactly as wide as the prose it interrupts, so it cannot overflow any viewport the prose fits —
  no collision detection, no width clamp, and #62's defect out of reach by construction.
- **`preventDefault()` on click is uniform across pointer types**, never branched on
  `pointerType`: hover emulation is where phone support goes wrong, and a branch is a second path
  nobody tests on a phone. One tap opens and never navigates first; navigation is the popover's own
  link. Modifier-, middle- and shift-clicks are left to the platform, so open-in-new-tab still
  reaches `/glossary`.

**With scripting off** each marker is a plain, followable link — never a `<button>`, never an inert
element — and the definition is still in the served bytes as the trigger's `aria-describedby`
target, which every major AT includes in the accessible description even while `hidden`. **There is
no live region**: no `aria-live`, no `aria-atomic`, no `role="status"` in the added markup or
script. #44 established that this layout deliberately has none, and a popover announcing on every
hover would be the same defect class, louder. **And no transition and no animation exists on any
`.term*` rule**, so `prefers-reduced-motion` is satisfied vacuously and greppably here too.
Enforced by the five `test_*term*` checks in `pipeline/tests/test_accessibility.py`.

The triggers are inline text inside sentences, so their hit area is the line box (~29px at
17px/1.7) and they fall under WCAG 2.2 SC 2.5.8's explicit **Inline exception** — a genuinely
different case from #73's 3.3px chart data points, which have no such exception. #73 is neither
fixed nor worsened here.

**Scroll restoration is the platform's, and four declarations would take it away.** Back and
Forward return the reader to the place they were reading because `history.scrollRestoration` is at
its `'auto'` default and **nothing in `src/` assigns it**. There is no implementation of ours to go
wrong, and deliberately so:

- **No storage.** Not `sessionStorage`, not `localStorage`, not `history.state`. The history entry
  the browser already keeps *is* the storage. So there is no storage read, and therefore no
  private-mode failure mode, no quota failure, and no second source of truth that can disagree with
  the browser's own. Reconciling two correct answers is how you get one wrong one.
- **`'auto'`, never `'manual'`.** Setting `'manual'` opts out of the restore *and* of scroll
  anchoring's correction of it, replacing a pixel-exact result with a hand-rolled offset.
- **Position wins over the anchor.** Returning to a URL carrying a hash restores the *position*,
  not the fragment — a reader who arrived at `/government/#by-state` and read on to `#the-laws`
  comes back to `#the-laws`. That is the right resolution, because it preserves where they were
  *within* a section rather than snapping to its top.
- **Scroll anchoring is what makes the two hard cases work**, and it is invisible: it is a default
  (`overflow-anchor: auto`) that nothing declares. It absorbs the ~115px of layout change that lands
  *after* the restore when `useChartSize` swaps its WIDE preset for NARROW on every chart, and the
  11,854px document shrink when the `<details>` tables come back closed.

Four one-line changes elsewhere in this repo would each remove all of that silently, with every
other test still green — so five static guards in `pipeline/tests/test_accessibility.py` exist to
turn red instead:

| Change that would break restoration | Guard |
|---|---|
| `history.scrollRestoration = 'manual'` | `test_scroll_restoration_is_left_to_the_browser` |
| `html { scroll-behavior: smooth }` | `test_no_stylesheet_requests_smooth_scrolling` |
| `overflow-anchor: none` on `html`/`body`/`main` | `test_scroll_anchoring_is_not_disabled` |
| an `unload` or `beforeunload` listener (disqualifies the page from bfcache) | `test_the_layout_registers_no_bfcache_disqualifying_listener` |
| a `scrollIntoView`/`scrollTo`/`behavior:` reaching a built page | `test_no_built_page_scripts_a_scroll` |

Each asserts an absence and is paired with a positive assertion that fails if the file it reads is
empty, moved or gutted. **WebKit has no scroll anchoring**; what that costs is measured under
"Scroll restoration and the back button (#46)" below.

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

**This section owns the scripting-OFF case only (#78).** It used to be read as covering annotation
legibility generally, and that reading is now wrong: with scripting **on**, chart annotations are
clamped to their SVG's edges by `src/components/charts/annotate.ts` and asserted by five guards in
`pipeline/tests/test_accessibility.py` (#64, § Right-edge annotation clipping below). Enlarging
`.annotation` under `<noscript>` was never the fix for #64 and would not have been — the defect was
placement past the viewBox edge, not type size, and larger type at the same `x` clips *sooner*.

## The browser lane, and what it now asserts

Every geometric claim in the sections below was, until #67, a number a person measured once in a
browser and nothing re-ran. `npm run test:browser` (`tests/browser/`, `node --test` driving
Playwright's Chromium) re-runs the machine-checkable half on every pull request, via
`.github/workflows/checks.yml`; `deploy.yml` calls the same workflow, so **a failure blocks the
deploy**. Seven routes, 390x844 and 1440x900, plus a scripting-off pass.

**Legend.** **ASSERTED** — the spec fails if it regresses. **ASSERTED (driven)** — asserted, but
only after the spec operates a control. **HUMAN** — stays with #30/#80; the spec does not claim it.
**COVERED ELSEWHERE** — a static or unit guard already holds it, and the browser lane deliberately
does not duplicate it.

| # | Deferred measurement | Disposition |
|---|---|---|
| 1 | Radix `Select` popper width at 390px: listbox and every option inside `innerWidth` | **ASSERTED (driven)** — `driven.test.ts`, all 3 `.select-trigger`s at both viewports |
| 2 | Option text wraps, never truncates (`text-overflow` computes `clip`) | **ASSERTED (driven)** — `getComputedStyle` per option |
| 3 | Whether the seven wrapped labels still *read* as distinguishable | **HUMAN** — a copy judgement, #80 |
| 4 | #62 E1: forcing `--radix-select-content-available-width` invalid still clamps | **HUMAN** — asserting it would pin us to a Radix internal, which is the thing the fallback exists to survive |
| 5 | #62 E4: the clamp is inert at desktop width | **ASSERTED (driven)** — the 1440x900 pass measures the same inertness |
| 6 | By-state `.tableview-scroll` overflows its client while the page does not | **ASSERTED** — `driven.test.ts`, and again in the scripting-off pass |
| 7 | Pinned row header holds at full-right scroll | **ASSERTED (driven)** — `scrollLeft` set to max, then measured against the container's left edge |
| 8 | #63 E4: the five sort buttons clicked at full-right scroll, geometry re-measured after each | **ASSERTED (driven)** |
| 9 | #63 E2: `border-collapse` hairlines still paint across and along the pinned column | **HUMAN** — established by screenshot; no non-pixel assertion expresses it |
| 10 | #63 E6: identical geometry with `javaScriptEnabled: false` | **ASSERTED** — the scripting-off pass |
| 11 | #63 E9: 320x568 still fits name + `Net balance` | **HUMAN** — 320px is explicitly outside this contract; asserting it would widen the contract silently |
| 12 | #64 rendered pixels: no annotation overruns its SVG, both viewports, all routes | **ASSERTED** — generalised past `.annotation` to **every** `<text>` in every `<svg>` |
| 13 | #64 criterion 4: a clamped label must not land on the series it names | **HUMAN** — needs the set of labels the clamp *moved*, knowable only by re-running the placement. The clip guard was green throughout while this was broken, so a green spec must not imply it |
| 14 | #64 `ADVANCE_EM`: worst `getComputedTextLength()/(chars x fontPx)` <= 0.62 | **ASSERTED** — one-sided, over exactly the classes `estimateTextWidth` estimates |
| 15 | #64: no annotation moves between SSR paint and hydration | **COVERED ELSEWHERE** — `test_annotation_placement_is_not_measured_at_runtime` |
| 16 | #65: adjacent controls' hit areas on a **wrapped** 390px row | **ASSERTED** — pairwise intersection over every control's hit area, both viewports, zero intersecting pairs |
| 17 | #65: every control's hit area is >= `--target-min`, read from `:root` at runtime | **ASSERTED** — the floor is **read**, never hardcoded. One named exception, below |
| 18 | #65 E7: `elementFromPoint` at the track centre returns the range, not the thumb | **ASSERTED (driven)** |
| 19 | #65 E8: two thumbs at `minStepsBetweenThumbs` clear the hit-area floor | **ASSERTED (driven)** — both thumbs driven to minimum separation with the keyboard |
| 20 | #65 E2: an open `.select-content` does not intersect its trigger's hit band | **ASSERTED (driven)** |
| 21 | #65 E9: overlays inside `.law-table-scroll` still measure the floor | **ASSERTED** — falls out of 17 |
| 22 | #66 rendered pixels, **NOT EXECUTED in that pass**: relocated category labels, staggered leader labels, four shortened titles | **ASSERTED** — same walk as 12; widening it past `.annotation` is what closes this |
| 23 | #66 E8: that `WhoPays`' label reads as belonging to its own bar pair | **HUMAN** — recorded there as human-judged and **not** claimed as verified; that sentence stands |
| 24 | #66 per-figure grid, the rows reading NOT EXECUTED for figures in their **default** state | **ASSERTED** — the default-state geometry of all 25 figures is covered by 12 and 22 |
| 25 | ...of those, the 5 rows whose deferral names an **interactive** state | **ASSERTED (driven)** — `#whole-budget`, `#the-laws`, `#by-state`, `#what-a-household-earns`, `#the-spread`: each named control operated once, the figure re-measured |
| 26 | #66: "Browser lane not run in this pass" as a standing FAIL disposition | **RESOLVED** — asserted since #67 |
| 27 | #46/#42 contents affordance: 44px tap targets, tab order `.skip-link` -> `<summary>` -> `main` | **ASSERTED** — the 44px falls out of 17; the tab order is the first three stops below 62rem. The rail's sticky geometry stays **HUMAN** |
| 28 | "nothing re-runs any of the above" | **RESOLVED** — rewritten in place to name the spec |
| 29 | M8: the focus ring computes under WCAG 2.2's 2px minimum (a standing **FAIL**, #75) | **ASSERTED as a known failure** — a named expected-failure entry carrying #75, which flips to a plain assertion the day #75 lands. Chromium computes the `1.5px` rule as `1px` |
| 30 | M1/M3/M5/M6/M7/M8 on `/glossary` and `/contents`: **NOT EXECUTED** | **PARTLY ASSERTED** — the spec covers all seven routes, so the width, overflow, target-size, console and skip-link halves close. The screen-reader and greyscale-reading halves stay **HUMAN** |
| 31 | M2 screen-reader pass, every route | **HUMAN** — no assistive technology runs in CI. Explicitly out of #67's scope |
| 32 | M6 greyscale render | **HUMAN** for the reading judgement. The luminance-ratio table below is mechanisable but is #30's artefact — **parked**, `docs/parked-findings.md` |
| 33 | Safari.app focus-ring check | **HUMAN** — Playwright's WebKit is **not** Safari.app, and a lookalike engine must not be allowed to satisfy it. #80 |
| 34 | M12 JavaScript disabled: page `scrollWidth` == viewport, and the trigger shapes | **ASSERTED** for the width and overflow half, by the scripting-off pass; the trigger-shape half is **COVERED ELSEWHERE** by the static `test_*term*` guards |
| 35 | #69: the tab order through a chart route, and that every datum stays reachable once it is bounded | **ASSERTED** — `keyboard.test.ts`. A real Tab walk (press, read `document.activeElement`) on `/government` hydrated and with scripting off; per-svg stop enumeration on all three chart routes at both viewports, scripting on and off; arrow traversal over the largest group on each route; and the same enumeration after every option of `#the-laws`' three filters and both `YearRange` extremes |

| 36 | #71: that a wide table's scroll container is reachable and scrollable by keyboard, and that making it so does not add empty Tab stops | **ASSERTED** — `tests/browser/scroll.test.ts`. The focusable-exactly-when-it-overflows invariant over all 27 containers on three routes at both viewports with every `<details>` open; arrow/`Home`/`End` movement with clamping; all seven `#prices-rates` columns brought fully into view by keys alone; role, caption-containing name and a solid author focus ring; Tab-order growth equal to exactly the overflowing count, self-baselined; and both `keyboard.test.ts` bounds re-walked in the all-tables-open state. The served-bytes half is `test_the_served_bytes_carry_no_focusable_scroll_container` |

**Of the 36, 23 are asserted, 3 are covered elsewhere, and 10 remain human-judged** — every one of
the 10 for a stated reason that is not "we ran out of time": assistive technology that does not exist
in CI, a pixel judgement, a copy judgement, a viewport outside this contract, or a probe whose
assertion would pin us to a third-party internal.

### What the lane found on its first run

Two defects, both **parked and not fixed in #67** — the lane reports, it does not repair:

- **Vertical clipping.** `Chart.tsx` renders with a `viewBox` and no `overflow: visible`, so a
  `<text>` drawn below the box is cut mid-glyph exactly as #64's horizontal case was. 19 of them,
  `YEARS TO MATURITY` on `/government#how-old` worst. The counts are pinned per route and viewport in
  `smoke.test.ts`'s `VERTICAL_CLIP_BASELINE`, asserted with `<=`, so the set cannot grow silently.
- **`.basis-toggle-item`**, the `#by-state` per-person/total toggle, is `.unit-toggle-item`'s twin
  but was never added to the shared `::before` overlay, so its hit area measures 16px against the
  24px floor. Carried as a named, issue-referenced entry in `smoke.test.ts`'s `KNOWN_UNDERSIZED` —
  a named exception, never a lowered floor.

### What this lane deliberately does not do

- It does not re-derive `annotate.test.ts` and `axisFit.test.ts`'s NARROW-lane geometry, nor the
  static guards in `pipeline/tests/test_accessibility.py`. The three-lane boundary below stands.
- It runs **Chromium only**. WebKit is not installed, because Playwright's WebKit is not Safari.app
  and installing it would let a lookalike engine appear to close #80.
- It is **not a required status check**. A required check that never reports blocks every merge
  permanently with no error message, and this repository had zero CI contexts before #67. The
  precondition — green on a real pull request — is parked in `docs/parked-findings.md`.

**Font metrics.** `src/styles/tokens.css:4-5` ships a deliberate system-font stack with no webfont,
so macOS and Linux metrics differ by design. The lane takes a **tolerance, not a pinned container**:
a container would make CI reproducible at the cost of making the developer's local run the divergent
one, which is the run that has to be trusted while someone is fixing a failure. `TOLERANCE_PX = 1` on
containment; every other assertion is an integer or a one-sided inequality, so drift can only make
the lane stricter.

## Manual pass results

Issue #30's sweep, in two sittings. **2026-08-24**: keyboard traversal, roving tabindex and focus
restoration, 390px legibility, rendered-pixel contrast — recorded in #30's comments and transcribed
here unaltered. **2026-08-26**: the greyscale pass with computed per-chart luminance ratios, the
390px JavaScript-off measurement, and the WebKit focus-ring paint check.

**2026-08-26, second sitting (#57).** The 390px width measurement re-run on all six routes after
the `/sources` overflow fix, in headless Chromium at 390×844 against a local build of `dist/`
rather than the deployed site — the fix is not deployed yet, and measuring the deployed page would
have recorded the old number. Every route reads `documentElement.scrollWidth` **390** against
`clientWidth` **390**: `/`, `/economy/`, `/government/`, `/households/`, `/sources/`, `/glossary`,
`/contents`. Only the width check was re-run; no other M-row moved, and the rows that need
assistive technology or Safari.app are still NOT EXECUTED and still carried by #80.

**Tooling.** Chrome **151.0.0.0** (headless Chromium, Playwright MCP) at 1440×900 and 390×844, and
WebKit **26.5** (Playwright WebKit, `AppleWebKit/605.1.15 Version/26.5` — the Safari 26.5 engine,
*not* Safari.app), both against the deployed site `https://travisgalloway.com/income-tax/`. No
assistive technology and no Safari.app exist in this environment; every row that needs one reads
**NOT EXECUTED** and is carried by #80, which blocks `A11Y-2` from `Shipped`.

The greyscale pass is **JavaScript on**, because that is the state a sighted reader is in. It is not
because the charts are missing without it: every section island server-renders its full `<svg>`,
`DebtChart` included — measured in #36 across all three routes, 25 of 25 figures, and held there
by `test_every_figure_server_renders_its_chart_svg`. `client:visible` defers *hydration*, not
rendering. The JavaScript-off state is checked by `M5` instead, on its own terms.

The figure number is **real text**, not CSS generated content. Until #49 it was a counter on
`.figure-head::before` (`content: 'Figure ' counter(figure)`), which put it outside the accessibility
tree in the engines that skip generated content, and outside the served bytes entirely. It is now a
`<span class="figure-no">Figure 13</span>` rendered from `src/data/figures.ts`, with the same
typography — so the number a reader hears is the number the page shows, and `/contents` names the
same one.

| Check | Route | Result | Tool | Evidence / issue |
|---|---|---|---|---|
| M1 keyboard traversal | `/` | PASS | Chrome 151 + browser lane | Skip link is the first tabbable element at (8,8), 135×44, `href="#main"`, `main[tabindex="-1"]`; zero positive `tabindex` site-wide. **The "389 of 408 tab stops are data points" reading recorded here was `/economy`'s, taken before the intro-route split**: `/` now renders zero figures, zero `<svg>` and 20 tab stops. `/economy`'s own figure was 389 of 437, and is 53 since #69. No wide table renders on this route, so #71 does not arise here either. |
| M1 keyboard traversal | `/government/` | FAIL | Chrome 151 + browser lane | Skip link and landmark order as above. The "380 of 471" reading predates the intro-route split; at `d69e4e6` it was **364 of 512**, with **438** presses to §11. Since #69 each chart `<svg>` is one roving group: **161** stops and **141** to §11 hydrated, **136** and **118** with scripting off, every one of the 369 marks still reachable by arrow key. Since #71 it is **163** and **142**, the two extra stops being the two wide tables that are not inside a `<details>`; scripting off is unchanged at 136/118. Walked on every pull request by `keyboard.test.ts`. Was FAIL for **#72 alone** (four `radiogroup`s all resolved to the name "Measured in"); **#72 has shipped** and all nine now resolve distinctly — see *Unique accessible names for choice-set controls*. **PASS** on naming as of 2026-08-27. |
| M1 keyboard traversal | `/households/` | PASS | Chrome 151 + browser lane | Skip link and landmark order as above. The 356 recorded here is the **mark** count, not the tab-stop count; the walk at `d69e4e6` was 428 stops of which 356 were marks. Since #69: **80** stops, all 356 marks still reachable by arrow key, including `BracketHistory`'s 113 — the largest group on the site. #71 resolved the scroll-container half: this route's seven wrappers are focusable exactly while they overflow, and the walk is unchanged at 80/67 because all seven sit inside a `<details>`. **PASS as of #71.** |
| M1 keyboard traversal | `/sources/` | PASS | Chrome 151 | Skip link first at (8,8) 135×44; `main[tabindex="-1"]`; zero positive `tabindex`; no focusable datum and no scroll container renders on this route, so #71 does not arise here. |
| M1 keyboard traversal | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M1 keyboard traversal | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M2 screen-reader pass | `/` | NOT EXECUTED | — | No assistive technology exists in this environment. Human required — #80. |
| M2 screen-reader pass | `/government/` | NOT EXECUTED | — | As above — #80. |
| M2 screen-reader pass | `/households/` | NOT EXECUTED | — | As above — #80. |
| M2 screen-reader pass | `/sources/` | NOT EXECUTED | — | As above — #80. |
| M2 screen-reader pass | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M2 screen-reader pass | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M3 roving tabindex / focus trap | `/` | PASS | Chrome 151 | Radio groups carry `role` plus `aria-checked` plus a roving tabindex; no control traps focus. |
| M3 roving tabindex / focus trap | `/government/` | PASS | Chrome 151 | All 20 radios site-wide carry `role` + `aria-checked` + roving tabindex; the three filter dropdowns close on Escape and restore focus to their trigger. The naming defect was #72, not focus behaviour; #72 has shipped. |
| M3 roving tabindex / focus trap | `/households/` | PASS | Chrome 151 | As above; no focus trap. |
| M3 roving tabindex / focus trap | `/sources/` | PASS | Chrome 151 | Vacuous — no roving-tabindex control renders on this route. |
| M3 roving tabindex / focus trap | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M3 roving tabindex / focus trap | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M4 390px legibility, JS on | `/` | FAIL | Chrome 151, 390×844 | Body does not scroll horizontally (`scrollWidth` 390 = `clientWidth`). Right-edge annotations clipped — #64. Chart legibility sweep — #66. "Focus or hover" instruction with 3.3px hit targets — #73. Open tables uncapped, page 11,316px → 24,195px — #77. |
| M4 390px legibility, JS on | `/government/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. Filter menu wider than the phone — **fixed 2026-08-27 (#62)**, measurement below. §11's by-state table was unreadable at this width — every column was present and scrollable, but the name column scrolled away with the numbers and the caption's box was the table's 745px — **fixed 2026-08-27 (#63)**, measurement below. #64, #66, #73. §11 legend wraps a swatch away from its label — #74. Wide tables still give no at-rest sign that they scroll — #76. |
| M4 390px legibility, JS on | `/households/` | FAIL | Chrome 151, 390×844 | No horizontal body scroll. §4 Figure 4 clipped at the right edge — #64. #66, #73. |
| M4 390px legibility, JS on | `/sources/` | **PASS** (was FAIL) | Chromium (Playwright MCP), 390×844 | **Re-measured 2026-08-26 after #57.** `documentElement.scrollWidth` **390** against `clientWidth` **390** — no horizontal body scroll, against 520 vs 390 before. Widest of the 45 `<code>` spans is now **348px**, against 500px; none is clipped (`scrollWidth == clientWidth` on all 45) and none carries `text-overflow: ellipsis`, so nothing was bought by truncation. Fixed by `overflow-wrap: anywhere` on `.reference-doc code`, contained at the element and never at the page. **#79 closes as fixed-by-#57.** The route also gained 23 `main` hyperlinks, from zero. |
| M4 390px legibility, JS on | `/glossary` | **PASS** (width only) | Chromium (Playwright MCP), 390×844 | **Executed 2026-08-26 (#57)**, for the width check only: `scrollWidth` **390** = `clientWidth` **390**, with the 25 new external source links in place. The rest of M4 — chart legibility, hit targets, table caps — is vacuous here (zero `<figure>`, zero `<svg>`, zero islands). The keyboard and screen-reader rows below are still NOT EXECUTED. |
| M4 390px legibility, JS on | `/contents` | **PASS** (width only) | Chromium (Playwright MCP), 390×844 | **Executed 2026-08-26 (#57)**, for the width check only — the check this route's own edge case is about: `scrollWidth` **390** = `clientWidth` **390**, so the long derived source lines do not overflow the way `/sources`' did (#79). Zero external hyperlinks, which is #49's stated decision and not an omission. The rest of M4 is vacuous here, and the keyboard and screen-reader rows below are still NOT EXECUTED. |
| M5 390px legibility, JS off | `/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | `useChartSize` never runs, so the 720×396 `WIDE` viewBox renders into 350 CSS px (scale 0.486): `.axis-title` **5.10px**, `.axis-label` **5.35px**, `.annotation` **5.59px**. The `<noscript>` mitigation is emitted before the bundled stylesheet and loses the cascade, so it never applies. New finding, filed as #78. Same page with JS on: 10.21 / 10.69 / 11.18px. |
| M5 390px legibility, JS off | `/government/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | Same wide-preset scaling and the same overridden mitigation — #78. All 13 `<details>` tables are present in the static HTML with scripting off. |
| M5 390px legibility, JS off | `/households/` | FAIL | Chrome 151, 390×844, `javaScriptEnabled: false` | 5.10px minimum, same cause — #78. All 7 `<details>` tables present with scripting off. |
| M5 390px legibility, JS off | `/sources/` | **PASS** (was FAIL) | Chromium (Playwright MCP), 390×844 | No chart renders, so #78 does not apply; the `<code>` overflow that made this row fail is gone at the CSS layer, which does not depend on scripting — see the M4 row and #79. |
| M5 390px legibility, JS off | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M5 390px legibility, JS off | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M6 greyscale render | `/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.03:1** (ECO-4 rates panel, `--ink-soft` #5A6268 against `--rev-ci` #55606B). Every series carries an in-plot end label and a `<TableView>` column, at both viewports. See the per-chart table below. |
| M6 greyscale render | `/government/` | PASS (note) | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.00:1** (GOV-10, `--rev-pr` #C77D28 against `--rev-eg` #A8895A), non-adjacent bands in the stack; the tightest *adjacent* band pair is 1.44:1 and every boundary is drawn. GOV-11's cartogram carries direction as a `+`/`−` glyph on every tile. See the per-chart table below. |
| M6 greyscale render | `/households/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Worst co-occurring pair **1.06:1** (HH-4, `--positive` against `--rev-ii`) and it does not matter: HH-4 encodes its five income groups as **marker shapes** (circle, square, triangle, diamond, ×, +) with a shape legend, so colour carries nothing on its own. |
| M6 greyscale render | `/sources/` | PASS | Chrome 151, 1440×900 and 390×844, JS on | Vacuous — zero `<figure>`, zero `<svg>`, and every `main` text colour is `--ink` or `--ink-soft`. No colour-coded category renders on this route. |
| M6 greyscale render | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M6 greyscale render | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M7 focus ring paints on SVG | `/` | PASS | WebKit 26.5 | Focused `rect.datum` (389 of them): `outline: 1px solid rgb(17,22,27)`, `outline-offset: 1px`, `stroke: rgb(17,22,27)`, `stroke-width: 2px`. A ring paints, confirmed by screenshot. WebKit computes the 1.5px rule as **1px** — evidence for #75. Safari.app itself NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/government/` | PASS | WebKit 26.5 | Focused `circle.datum` (249): same computed ring. Safari.app NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/households/` | PASS | WebKit 26.5 | Focused `circle.datum` (356): same computed ring. Safari.app NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/sources/` | PASS | WebKit 26.5 | Vacuous — no `.datum` renders on this route. Focus-ring visibility on the route's links in Safari.app NOT EXECUTED — #80. |
| M7 focus ring paints on SVG | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M7 focus ring paints on SVG | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |
| M8 measured rendered-pixel contrast | `/` | FAIL | Chrome 151 | Focus ring measured as `outline: 1.5px solid rgb(17,22,27)` at 13.65:1 against `rgb(221,224,219)`. The colour passes comfortably; the **thickness is under the WCAG 2.2 Focus Appearance 2px minimum** — #75. Text tokens measured against the shipped grounds pass (see the token table above). |
| M8 measured rendered-pixel contrast | `/government/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |
| M8 measured rendered-pixel contrast | `/households/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |
| M8 measured rendered-pixel contrast | `/sources/` | FAIL | Chrome 151 | Same shared-layer ring, same measurement — #75. |
| M8 measured rendered-pixel contrast | `/glossary` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. |
| M8 measured rendered-pixel contrast | `/contents` | NOT EXECUTED | — | The route postdates the 2026-08-26 pass and has not been walked in a browser. It renders zero `<figure>`, zero `<svg>` and zero islands, so the chart-legibility, greyscale and focus-ring checks are expected to be vacuous here as they are on `/sources/`; that is a prediction, not a result. Its own edge case is the one `/sources/` failed (#79): every line on it is a derived string and the source lines are long, so the 390px rows are the ones that matter. |

Two review results are recorded here because they were checked and found **correct**, so that a later
reader does not "fix" them: both `<nav>` landmarks *are* named (`aria-label="Site"` and
`aria-labelledby="toc-heading"` resolving to "Contents" — an early review said otherwise and was
wrong), and the site renders **zero `<input>` and zero `<select>` elements**. Console output is clean
on all four routes at both viewports: 0 errors, 0 warnings. #70 (three in-prose links skip the base
path and 404 in production) came out of the same review; it is a link-target defect rather than one
of the eight checks, and it is filed and open.

### In-prose glossary term markers (#47)

**EXECUTED 2026-08-26**, Chromium **151.0.7922.174** (Playwright MCP, `Chrome/151.0.0.0` UA),
against `astro preview` at 390×844 and 1280×900. Console clean throughout: **0 errors, 0 warnings**,
scripting on and off. 26 markers: 6 on `/economy`, 8 on `/households`, 12 on `/government`. `/`,
`/sources` and `/glossary` carry **0** and the IIFE returns on its first line there — verified,
with no console error (E9).

| Check | Route | Result | Tool | Evidence |
|---|---|---|---|---|
| M9 390px clipping, longest `short` | all three | PASS | Chromium 151, 390×844 | Every one of the 26 popovers opened in turn. `documentElement.scrollWidth` **390** at every open; every `getBoundingClientRect()` fully inside the viewport; every popover **350px** wide — one value on all three routes, because the width is the paragraph's, not the content's. Longest `short` per route: `real` 137 chars (`/economy`), `marginal-rate` 148 (`/households`), `debt-held-by-the-public` 152 (`/government`) — all inside. `offsetParent` is `P.standfirst` or `P.prose` in every case, never a higher ancestor (E4 holds). Exactly **1** popover open at a time across all 26 (E3), and 0 after the sweep. |
| M9 line-break case (E5) | `/households` | PASS | Chromium 151, 390×844 | `marginal-rate` wraps two line boxes at 390px; its popover's top sits **0px** below the trigger's `getBoundingClientRect().bottom`, i.e. below the *whole* trigger rather than through it. Every single-line marker measures 0–1px. |
| M10 keyboard, 1280 and 390 | `/households`, `/government` | PASS | Chromium 151, 1280×900 and 390×844 | Full expected/actual table in checklist item 8. Tab in opens; Tab reaches `.term-more` with the popover open; Tab again closes it and continues; Shift-Tab from `.term-more` returns to the trigger with it still open; Escape closes with `activeElement` on the trigger and `window.scrollY` **0** before and after, from both positions. No trap in either direction. Contention re-check in the same session: the first `/government/` filter dropdown still closes on Escape and restores focus to its own trigger, and `#navbar-disclosure` still closes on Escape and returns focus to its `<summary>`. |
| M11 touch and pointer, 1.4.13 | `/government` | PASS | Chromium 151, 390×844 | One `pointerType: 'touch'` tap on `outlays` opened the popover and `location.href` was **unchanged**; a second tap did not navigate either. A real mouse move from the trigger onto the popover left it open (`:hover` on the popover confirmed) — **hoverable**, met by the DOM shape. Held open **3s** with no pointer or key input — **persistent**, no auto-close timer exists. **Dismissable** is Escape (M10) and an outside click, both verified. Clicking `.term-more` navigated to `/income-tax/glossary#outlays` with the `<dt>` at **64px**, clear of the 52px bar (E6). Platform affordances intact: `metaKey` and middle-click clicks were **not** `preventDefault`ed and opened real new tabs on `/glossary#real`; a plain left click **was**. |
| M12 JavaScript disabled | all three | PASS | Chromium 151, `javaScriptEnabled: false`, 390×844 and 1280×900 | All 26 triggers are `<a>` — **0** `<button>`, 0 inert elements. Every `href` starts `/income-tax/glossary#`, so no unbased link reaches a reader. **0** triggers carry `aria-expanded` (nothing advertises a state it does not have). **0** popovers have any rendered height, and every `short` is nonetheless in the DOM as the trigger's `aria-describedby` target. Following a marker landed on `/glossary#real`, `<dt>` at 64px at 390 and at the top at 1280. `scrollWidth` equals the viewport at both. Console: 0 errors, 0 warnings. |

The `<button>` count is **unchanged** from the pre-change build — `/government/` 57, `/households/`
2, everything else 0 — which is the form criterion 5 takes here, because islands server-render real
buttons and the right assertion is "unchanged", not "zero".

**Not executed, and not executable here.** Whether the definition announces as the trigger's
*description* under VoiceOver + Safari and NVDA + Firefox. No assistive technology exists in this
environment and none can be driven from an exec agent — **NOT EXECUTED, human required, #80**, the
same disposition as items 2, 9, 10 and 13. The machine-provable half is `aria-describedby` resolving
to an in-DOM element inside the same wrapper carrying the term's `short` verbatim, with no portal
and no live region, and it is asserted by the five `test_*term*` checks.

### Radix `Select` popper width at 390px (#62)

**A measured browser observation, not an automated assertion.** CSS width and overflow are
*computed*, and Radix mounts `Content` only while a listbox is open — `dist/government/index.html`
contains `select-content` **zero** times against `select-trigger` **3** times — so no static test in
this repository can see this defect, and the three guards added in
`pipeline/tests/test_accessibility.py` do not claim to: they assert the *declarations* are present,
so a later sweep that deletes one turns red. The observation below is **asserted since #67** by
`tests/browser/driven.test.ts` — every `.select-trigger` is opened at both viewports and the listbox
and every option are measured against `innerWidth`. See *The browser lane, and what it now asserts*.

**Executed 2026-08-27**, Chromium **151.0.0.0** (Playwright MCP), `dist/` served locally at
**390×844**, `/government/`. Before and after are the same build path, changing only the CSS clamp
in `.select-content` / `.tax-mix-select-content` and the `collisionPadding={8}` the two `Content`
call sites now pass.

| Measurement, at 390×844 | Before | After |
|---|---|---|
| §8 "Control at enactment" listbox | 426.6px wide, laid out **x=10 → 436.6** | 374px wide, **x=8 → 382** |
| its 7 options' right edge | **435.6** — 45.6px past the 390px viewport, on every one | **381**, inside the viewport on every one |
| `--radix-select-content-available-width` on the `Content` | 370px (Radix's own default padding of 10), unused — `max-width` computed `none` | 374px, and `max-width` computes to it |
| option height | 32.2px, single line | 32.2px for the short option, **53.3px** for the six that now wrap to two lines |
| §8 "Vote character" listbox | x=20 → 174 | unchanged, x=20 → 174 |
| §8 "President" listbox | x=168 → 295.1 | unchanged, x=168 → 295.1 |
| §11 jurisdiction listbox | x=126 → 268.3, computed **`overflow-x: auto`** | x=126 → 268.3, computed **`overflow-x: hidden`**, `scrollWidth == clientWidth` |
| `documentElement.scrollWidth` with the longest option selected | 390, but the trigger's own label unbounded | **390**; the trigger wraps inside `.filters`, x=20 → 370, and `Clear filters` arrives at right=86.8 without pushing the row |

**Distinguishability, the point of the issue.** All seven options render their full text with the
trailing chamber and party intact and no truncation — `text-overflow` computes to `clip` on every
one, and each of the six configuration labels still ends in `Senate (DRR)`, `(RRR)`, `(RDD)`,
`(DDD)`, `(DRD)`, `(RDR)`. The strategy for long labels is **wrap**, not abbreviate and not
truncate: right-truncation is the defect the issue was filed about, and an abbreviated label would
need a copy decision the issue puts out of scope.

**Consequence, recorded rather than presented as a fix.** A wrapped option is 53.3px tall against
32.2px. That is a by-product of wrapping, **not** a target-size fix — thumb-sized hit targets are
**#65**, still open, and the trigger's own 22px height is untouched here.

**Fallback (E1).** Forcing `--radix-select-content-available-width` to the guaranteed-invalid value
on the open `Content` makes `max-width` compute to **366px** — `calc(100vw - 1.5rem)` — with the
listbox at x=16 → 382, every option's right edge at 381 and `documentElement.scrollWidth` still 390.
The clamp does not depend on the var surviving a Radix upgrade.

**Desktop (E4).** At **1280×900** the clamp is inert: the §8 listbox is **426.6px** wide before and
after, x=639 → 1065.6 both times, every option 32.2px tall and unwrapped, with `max-width` computing
to 1264px.

### Government §11's by-state table at 390px (#63)

**A measured browser observation, not an automated assertion.** Width, `overflow`, sticky offsets
and `cqi` resolution are all *computed*; `dist/` carries markup and a stylesheet, not a layout, so
no static test in this repository can see this defect. The four guards added to
`pipeline/tests/test_accessibility.py` do not claim to — three assert the *declarations* are
present (`test_the_by_state_row_header_column_is_pinned`,
`test_the_by_state_caption_is_bound_to_its_scroll_container`,
`test_no_stylesheet_rule_hides_a_table_cell_at_a_breakpoint`) so a later sweep that deletes one
turns red, and the fourth
(`test_the_by_state_table_serves_all_five_columns_with_scripting_off`) reads the built bytes.
`test_the_by_state_guards_bite_the_ways_the_fix_can_regress` is their negative test. Automating the
observation below is **asserted since #67** by `tests/browser/driven.test.ts`. See *The browser
lane, and what it now asserts*.

**The defect class, established before the fix and worth recording**: this was never hidden
columns. `global.css` had no width breakpoint at all — its only two `@media` blocks were `62rem`
for the navbar and `prefers-reduced-motion` — and none of its nine `display: none` rules touched a
table cell. The 745px came from `.sortable-table th, .sortable-table td { white-space: nowrap }`
over five columns with four long headers.

**Executed 2026-08-27**, Chromium **151.0.0.0** (Playwright MCP), `dist/` served locally under
its `/income-tax/` base at **390×844**, `/government/` §11. Before and after are the same build
path, changing only `global.css`.

| Measurement, at 390×844 | Before | After |
|---|---|---|
| `.tableview-scroll` (§11's) `clientWidth` / `scrollWidth` | 350 / **745** | 350 / **496** — the header and row-name wrap inside `@media (max-width: 30rem)` removes 249px of scroll without removing a column |
| cells whose right edge is past x=390, at `scrollLeft: 0` | **171** | 171 — unchanged **by design**: this is a scroll, and the fix is that scrolling now works, not that the table shrank to fit |
| `Wyoming (WY)` row header, scrolled fully right | x **−375 → −168** — entirely off-screen while its numbers were readable | x **20 → 128**, pinned; its text runs 32 → 88 |
| `Net balance` cell of the same row, at that scroll position | x 149 → 260 | x 192 → 303; its text runs 222 → **291**. **Name and value are inside the viewport simultaneously** — the issue's criterion 2 |
| `Get / give ratio` cell of the same row, at that scroll position | off the right of the 745px table | x 303 → 370, text 332 → 358 — the *last* column is reachable with the name still pinned |
| pinned column's share of the window | — | **108px of 350 = 31%**. It was 59% before the row header was allowed to wrap (E3, which is why that declaration is there) |
| `<caption>` box | **745px wide**, x 20 → **765** — 375px of its first line past the phone | **350px** wide, x 20 → **370**, at `scrollLeft: 0` **and** at full right |
| five `<th scope="col">` sort buttons | four off-screen at rest | all five fully inside the viewport at some scroll offset; `display`/`visibility` hidden on **0** of the table's cells, captions and buttons |
| `documentElement.scrollWidth` / `clientWidth` | 390 / 390 | **390 / 390** — the pinned column did not convert a contained scroll into a page scroll |

**Sorting while scrolled right (E4).** Each of the five sort buttons clicked at full-right scroll,
re-measured after each: the pinned column holds x 20 → 128 and `Net balance` holds x 192 → 303 in
all five sorted orders. Sorting re-renders rows, not layout.

**Keyboard, at 390×844.** Tab moves between the five `.sort-button`s in column order; **Enter** and
**Space** both sort, `aria-sort` reads `descending` on exactly one `<th>` after each, and the
browser brings the focused button inside the viewport by scrolling the wrapper (the second button
lands at x 140 → 221). The pinned column does not intercept focus — it declares no `tabindex` and
no role, and it still does not: #71 made the *wrapper* focusable, never a cell inside it.

**`border-collapse` (E2).** `.sortable-table` is `border-collapse: collapse`, and a sticky cell can
paint over a collapsed rule that belongs to the table rather than the cell. Screenshotted at both
scroll positions: the `tbody tr` hairline and the `thead th` rule both still paint across and along
the pinned column, so no `box-shadow` substitute was needed and the table's borders are untouched.

**Scripting off (E6).** Same build, `javaScriptEnabled: false`, 390×844: five `<th scope="col">`,
five `.sort-button`s, **56** `<th scope="row">`, wrapper 350 / 496, caption 350 wide at x 20 → 370,
and `Wyoming (WY)` at x 20 → 128 with `Net balance` at x 192 → 303 scrolled fully right. Identical
to the scripted numbers — none of this fix is scripted.

**320px (E9).** Nothing hardcodes 390. At **320×568** the wrapper is 280 / 496, the caption is
280px wide at x 20 → 300, and the name (x 20 → 128) and `Net balance` (x 122 → 233) are both inside
the viewport at full-right scroll, with `documentElement.scrollWidth` **320**.

**Desktop (check 7), 1280×900.** The table is unchanged: all five column rects identical before and
after (x 336 → 543, 543 → 706, 706 → 860, 860 → 971, 971 → 1081), no breakpoint active, and the
pinned column visually identical because the scroll range is 9px. **One box did move, and it is
recorded rather than glossed**: the caption is now bound to the wrapper's 736px rather than the
table's 745px, so its right edge is 1072 instead of 1081. It stays a single line at both widths.

**Another route (check 9), `/economy/`.** `container-type` on the shared `.tableview-scroll` is the
only site-wide declaration #63 adds, and it costs nothing elsewhere. The route's first three
wrappers measure 350 / 534, 350 / 578 and 350 / 628 at 390×844 and 736 / 736 at 1280×900 — identical
before and after — each still scrolls (`scrollWidth > clientWidth`), their captions keep the table's
own width, their body cells compute `position: static` and their headers keep `white-space: nowrap`.
The pinned column and the header wrap are `.sortable-table` rules, and `.sortable-table` is §11's
alone.

**Themes (E8).** The sticky cell paints `var(--ground)`, the same token `body` uses, and the diff
adds no literal colour; the stylesheet declares no `prefers-color-scheme` or `data-theme` variant
today, so there is one palette to match and it matches it.

**Not fixed here, deliberately.** The table still gives **no at-rest sign that it scrolls** — no
fade, no shadow, no persistent scrollbar, no text hint — on this wrapper or on §10's
`.law-table-scroll`. That is **#76**, which scopes it site-wide; two of #63's Definition-of-done
boxes were moved there on 2026-08-27 rather than implemented under this number. Keyboard
operability of the scroll wrappers shipped under **#71** — this wrapper is focusable while it
overflows, named after its caption and scrolled by the arrow keys — and the `.sort-button`'s 21px
height is **#65**.

### Right-edge annotation clipping (#64)

**Asserted statically, unlike #62 and #63 — and this is the part worth reading first.** Those two
were CSS-layout defects: `dist/` carries markup and a stylesheet, not a layout, so no static test in
this repository could see them and the guards could only assert that the *declarations* were
present. #64 is different in kind. An annotation's `x`, its `text-anchor`, its ancestor
`transform`s, its text content and its SVG's `viewBox` are **all in the served bytes**, so
`pipeline/tests/test_accessibility.py` reproduces the clip arithmetic directly over `dist/` and
asserts the geometry itself. Only the text *width* is estimated, and it is estimated with the same
constant the runtime clamp uses — so the guard proves the clamp was **applied**, using the
arithmetic the clamp is built on.

**This is a correctness defect, not a layout blemish.** `Chart.tsx` renders with a `viewBox` and no
`overflow: visible`, so an annotation drawn past the SVG edge is **clipped, not spilled**: cut
mid-glyph, with no ellipsis, no scrollbar and no visual cue that anything is missing. Households §5
rendered `2022: top 1% 31.5%` as **`2022: top 19`** — a complete-looking label carrying a number
that is not the number, on a site whose whole claim is that every figure traces to a source. The fix
is therefore stronger than "make annotations visible": `placeAnnotation` returns `null` for a label
too wide to fit its span, and `<Annotation>` renders nothing on `null`. **A label that cannot fit is
absent, never truncated.** The finding stays reachable either way — every figure carries a
`TableView` and a finding-stating `aria-label`, both already enforced
(`test_every_chart_has_a_real_table_in_the_static_html`, `test_every_chart_svg_states_a_finding`).

**Measured before the fix**, walking `dist/` with the suite's own `parse_html` at a 720-unit
viewBox. All fifteen were clipped in the shipped build:

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

After the fix: **zero overruns across all 63 annotation nodes**, and the per-route counts are
unchanged (19 / 24 / 12 `class="annotation"`, six `Last actual, FY`, one dotplot average) — so
nothing was dropped from the server render to achieve it, which is the failure mode a clipping fix
invites.

#### What is asserted, and what is only measured

This distinction is the point of the section; the three lanes cover different geometry and only one
of them is a browser.

| Geometry | Lane | Status |
|---|---|---|
| **WIDE, 720 units** — every annotation in `dist/` | `pytest -k annotation`, five guards over the served bytes | **ASSERTED**, and unattended |
| **NARROW, 360 units** — client-only, the worst case, and the only place a label clips off the LEFT edge | `npm run test:unit` over the pure helper (`src/components/charts/annotate.test.ts`) | **ASSERTED**, at the unit level |
| **Rendered pixels**, real `getBoundingClientRect()` and `getComputedTextLength()` at 390x844 and 1440x900 | browser | **ASSERTED since #67** — `npm run test:browser`, on every pull request. Recorded below |

SSR cannot reach NARROW at all: `useChartSize.ts` returns the WIDE preset before the first client
measurement, so the server render — and therefore every assertion any pytest guard can make — only
ever observes 720. That is why the unit lane exists for this issue rather than being optional.

#### Executed 2026-08-27 (the browser lane)

Chromium **151.0.0.0** (Playwright MCP) against a local `npm run preview` of this branch's `dist/`,
under its `/income-tax/` base, at **1440x900** and **390x844**. Islands are `client:visible`, so the
page was scrolled end to end before measuring; at 390 the charts then report a **360**-unit viewBox,
confirming the NARROW path was genuinely exercised and not just SSR scaled down.

| Route | Viewport | Annotations | Overrunning their SVG | `documentElement` scrollWidth / clientWidth |
|---|---|---|---|---|
| `/economy` | 1440x900 | 19 | **0** | 1440 / 1440 |
| `/households` | 1440x900 | 24 | **0** | 1440 / 1440 |
| `/government` | 1440x900 | 20 | **0** | 1440 / 1440 |
| `/economy` | 390x844 | 19 | **0** | 390 / 390 |
| `/households` | 390x844 | 24 | **0** | 390 / 390 |
| `/government` | 390x844 | 16 | **0** | 390 / 390 |

`/government` drops from 20 to 16 by design, not by clipping: `BudgetChart` replaces its four
in-chart series labels with a text legend below the figure at narrow, which it already did.

#### Criterion 4: a clamped label must not land on what it names

This one is not provable from the bytes, and looking at the numbers was not enough — the first pass
of the fix satisfied every clipping assertion above **and broke this**. Three `BudgetChart` labels
and Households §4's `Top statutory rate` flipped from the right margin into the plot and came to
rest on the series they name. The clip guard was green throughout. It is recorded here because the
lesson generalises: "the annotation is visible now" and "the annotation is correct now" are
different claims, and only one of them has a static test.

Checked by hit-testing real paint (`elementsFromPoint` across nine points along each label, at three
heights), restricted to the labels the clamp actually **moved** — a label that already fitted is
returned unchanged by `placeAnnotation` and cannot have been pushed anywhere. Results after the fix:

| Route | Labels moved by the clamp | On their own series | Label-on-label collisions |
|---|---|---|---|
| `/economy` | 6 | **0** | 1, pre-existing — see below |
| `/households` | 4 | **0** | **0** |
| `/government` | 5 | **0** | **0** |

Three changes were needed to get there, and each is a different answer because the charts differ:

- **`BudgetChart` (stacked area).** A stacked area chart has no "just above the line" free space —
  every point inside the plot is inside some band. Flipping the labels there put them on the bands.
  They now sit inside the plot right-anchored **with a panel-coloured halo**, which is the treatment
  `RevenueChart`'s `.legend-label` band labels two sections down already used for exactly this
  problem. The plan named `VotedAndNot` as the shape to converge on; that is right for a line chart
  and wrong for this one.
- **`StatutoryVsEffective` (line).** Here `VotedAndNot`'s idiom does apply: end-anchored at the last
  point and lifted 8 units clear of the curve. Flipping it in place had laid it along the flat
  right-hand end of the very line it names.
- **`BoundaryRule`'s clearance became a `gap`.** `x + 4` reads as "4 units right of the rule" while
  the anchor is `start`, and inverts to "overlap the rule by 4" the moment the clamp flips it to
  `end` — which it always does, since the rule marks the last actual year and sits near the right
  edge by construction. A `gap` flips its sign with the anchor. On `/economy` §1 the difference is
  visible: without it all six boundary labels sat on their own dashed rule and the top one collided
  with `CBO projection`. All six now clear the rule (label right edge 538.4, rule at 542.4).

`BudgetChart`'s own label-collision guard was generalised in passing: it spaced the net-interest and
revenue labels alone, and on FY2025 data it is **discretionary** and revenue whose centres fall 0.24T
apart. Naming a specific pair was the bug; the labels are now sorted and spaced. The minimum gap is
**15** units, not the font's 11.5, because an `.annotation`'s painted box measures 13.3 units tall.

**One collision is left, and it is not this issue's.** `/economy` §4's `Fed funds` and `10-year note`
overlap each other. Both are `end`-anchored at the same x with y offsets of -8 and -20, both fit
their SVG comfortably, and `placeAnnotation` returns them unchanged — their positions are identical
to `main`'s. Recorded in `docs/parked-findings.md`.

**No annotation moves between the SSR paint and hydration.** At 1440x900 the hydrated preset is the
same WIDE preset SSR emitted, so every placement must be byte-identical; comparing each annotation's
`x` and `text-anchor` before and after forcing hydration gives **0 of 20 changed**. That is
criterion 5, and it holds by construction — placement is a pure function of `(x, label, frame,
anchor)`, with no `getBBox`, no `getComputedTextLength`, no `useEffect` and no measurement of any
kind. `test_annotation_placement_is_not_measured_at_runtime` keeps it that way.

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

**0.5889 against 0.62 — the constant over-estimates by 5.3%.** That is the safe direction and the
whole reason it is written as an over-estimate: clamping a little too early costs a few units of
whitespace, while clamping a little too late reproduces the defect. **The rule is that this constant
is raised, never lowered.** If a future measurement here exceeds 0.62, raise it in both files; if a
future measurement comes in lower, leave it alone.

#### Boundaries

- **#66** owns chart legibility at 390px generally — axis tick and axis-title text, tick density,
  hit-target size, and the direct labels that are **not** in the annotation family. `holders-label`
  on `/government` §2 is the live example: `Foreign $9.64T (30% of publicly held debt)` still paints
  past its SVG. It is recorded in `docs/parked-findings.md` and deliberately not fixed here.
  `test_no_annotation_class_ships_outside_the_guarded_set` is an `==` audit over every `<text>` class
  in `dist/`, so that boundary is explicit in the suite rather than implied.
- **Asserted since #67.** `tests/browser/smoke.test.ts` re-measures the worst ratio on every route
  and viewport on every pull request, against `ADVANCE_EM` imported from the source rather than
  restated. The assertion is one-sided (`worst <= ADVANCE_EM`), so the rule above — raised, never
  lowered — is the direction it enforces.
- **#78** owns the scripting-off `<noscript>` geometry; see § Known limitation above.
- **`overflow: visible` on the SVG is not the fix** and was not used. It would spill annotations into
  adjacent prose and could reintroduce page-level horizontal overflow; `Chart.tsx` is untouched, and
  `documentElement.scrollWidth == clientWidth` still holds at both viewports (table above).
- **`NARROW.margin.right` stays 12**, revisited under this issue. Widening it to hold `Mandatory
  (net)` (~90 units) would spend 30% of a 296-unit plot on gutter, and it is the wrong lever anyway:
  with the clamp in place, no annotation's legibility depends on the right margin's width. The reason
  is written into `useChartSize.ts`.

#### The two ways this guard could report healthy while blind

Both cost a cycle during the investigation, both are silent, and both are now covered by
`test_the_annotation_clipping_guard_sees_the_whole_corpus` plus the negative test:

1. **`html.parser` lowercases attribute names.** `svg.get("viewBox")` returns `None` for every SVG
   in `dist/`; the attribute is `viewbox`. Reading it the obvious way finds **zero** annotations and
   passes green on a broken tree. Demonstrated: with the camelCase read restored, the corpus check
   reports `found only 0 nodes` and the negative test reports `a start-anchored label running off the
   right edge passed`.
2. **A `<text>` with no `x` attribute.** `BracketHistory` emitted one, positioned entirely by an
   ancestor `<g transform>`. Skipping it would drop a real node; a missing `x` is **0**, not "not my
   problem". That label is now placed explicitly, and the guard reads absent `x` as 0.

### Target size for controls (#65)

**The floor is 24 CSS px, and the success criterion is WCAG 2.2 SC 2.5.8 Target Size (Minimum),
Level AA.** It is carried by one token, `--target-min: 1.5rem` in `src/styles/tokens.css`. `html`
sets no `font-size`, so the root is the 16px default and the rem is exact — the same reading
`test_nav_bar_tap_targets_clear_44px` already makes of its `2.75rem`.

**Why 24 and not the 44 of SC 2.5.5 (Enhanced, AAA).** This is a decision, not a convenience, and
at 44px the arithmetic fails outright. `.controls` declares `gap: 0.5rem 1rem` — an 8px row gap —
and `.unit-toggle-item` computes to a 16px box, so a wrapped control row has a **24px pitch**. Two
44px hit areas on that pitch would **overlap by 20px**, and every tap in the overlap would be
ambiguous: a worse defect than the one being fixed, and a direct failure of the issue's own
"adjacent controls' hit areas do not overlap". At 24px the pitch of 24 exactly accommodates the
floor — the areas tile, touching but not overlapping. The nav bar keeps its own 44px floor: it is a
dedicated surface with no dense control rows, and nothing here lowers it.

**One technique for all eight: a transparent `::before` overlay.** `position: absolute`, centred on
the control, `height: var(--target-min)`, and `left: 0; right: 0` for seven of the eight so it is
exactly the host's own width. The slider thumb's is the one that also grows horizontally, so it
centres on both axes. The issue invited a per-control choice between padding, an overlay and
line-height; the overlay wins every time, for a different reason each time:

| Control | Why not padding / `min-height` | Why the overlay |
|---|---|---|
| `.unit-toggle-item` | A flex item under `align-items: baseline`; asymmetric vertical padding shifts it against its siblings and against `.controls-label`. Its `border-bottom` is the on-state affordance, and padding detaches the rule from the word | Out of flow, so the baseline and the rule stay exactly where they are |
| `.tableview-trigger` | It **is** the `<summary>`, and its full-width `border-bottom` is the affordance; `min-height` drops the rule away from the label | Same — no ink moves |
| `.select-trigger` | Only 2px short, so padding is tempting, but it would still move the hairline | Consistency, and no ink moves |
| `.tax-mix-select` | Hairline affordance, and a flex item in `.controls` under `align-items: baseline` | Same two reasons as `.unit-toggle-item` |
| `.attrib-tab` | `border-bottom` carries the active-tab state; padding moves the tab underline off the text | Same |
| `.sort-button` | **Padding widens the `<th>`** in a `border-collapse` table, which makes §11's 745px scroll worse — #71/#76's problem. `min-height` avoids the width, but the `<th>` is `vertical-align: bottom` in one table and unset in the other, so the label would lift off the head rule in one and not the other | Adds no width and no height. The table geometry is untouched and the label does not move |
| `.law-name-button` | Long statute names already wrap to ~105px cells, and padding would add ~9px to *every* row of a 100-row table | Tall cells untouched **by construction**; only the short ones gain a hit area |
| `.year-range-thumb` | Resizing the element to 24×24 changes the box Radix positions the thumb by, shifting it against the track and changing the track's usable extent. The 15px dot **is** the element | The element stays and paints 15×15; only the overlay is 24×24 |

**Two corrections to the issue's own table, found against the tree and worth recording.**
`.select-item` is listed as failing but **measures 32px and already passed** — it is unchanged, and
`test_the_target_size_guards_bite_each_way_the_fix_can_regress` asserts it was *not* swept in,
because sweeping it in would be scope drift. And `.sort-button` is declared **twice** — the rule it
shares with `.law-name-button`, and the one #63 added for §11's `.sortable-table` — so a fix
editing one leaves the other governing two different tables. Both carry `position: relative`, and
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
*declarations*, which for absolute units are literal bytes; they cannot read a **computed** box.
`.unit-toggle-item` measures 16px precisely because a `<button>` does not inherit `body`'s
`line-height: 1.62` and keeps the UA's `normal`, and that number appears nowhere in `src/`.
`npm run test:unit` cannot close the gap either — it is `node --test` over TypeScript modules, with
no DOM and no layout.

The overlay technique is chosen so that this does not matter. Every overlay is out of flow, so the
layout height added across the whole site is **zero**, and "did a figure move down the page" and
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

**What no test here asserts:** the wrapped-row vertical clearance at 390px. An 8px row gap plus a
16px computed line box is a 24px pitch against a 24px floor — a touch at 0px clearance, not an
overlap — and both halves of that sentence are computed values. It is measured below and
**asserted since #67**: `tests/browser/smoke.test.ts` tests every pair of control hit areas for
intersection at both viewports and requires zero intersecting pairs, so the case bites the day a row
does wrap. On the tree as it stands no `.controls` row wraps its toggles onto two lines at
390px, so the 0px case does not currently arise; the tightest measured vertical clearance is 45.7px.

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
| `.select-item` (3, popup open) | 152 × **32.2** | none — `::before` computes `content: none` | — |

**Criterion 5, measured rather than argued.** Every pair of control hit areas on a route was tested
for intersection: **0 overlapping pairs** out of 67 controls on `/government`, 13 on `/households`
and 5 on `/economy`, at both viewports. The tightest vertical clearance is **45.7px** and the
tightest horizontal is **14.4px** — `.unit-toggle`'s `gap: 0.9rem`, exactly as declared.

**Criteria 3 and 6, proved in the browser and not only from the stylesheet.** With the page loaded,
the whole change was disabled at runtime (`content: none` on every overlay, `position: static` on
every host) and 106 boxes — the eight controls plus `.controls-label`, `.figure` and `.chart` —
were compared before and against. **0 boxes moved.** The `.unit-toggle-item` underline sits where
it did, the toggles keep their baseline with `.controls-label`, and no figure moved down the page.
The same result is visible from the build side: every `dist/**/index.html` is byte-identical to its
pre-change build once the stylesheet content-hash is normalised.

**E7, the check the plan could not settle from the stylesheet.** Radix leaves `Slider.Thumb`'s
`position` to CSS — the thumb's computed `position` reads `relative`, ours. `elementFromPoint` at
the centre of `.year-range-track` returns `.year-range-range`, **not** `.year-range-thumb`, so the
overlay is anchored to the thumb and does not swallow taps on the track.

**E8, the two thumbs at minimum range.** `minStepsBetweenThumbs={4}` over a 1984–2024 domain on a
350px track at 390px is 8.75px per year, so the thumbs are never closer than **35px** — **11px of
clearance** between two 24px hit areas. At 1440px the track is 736px and the separation is 73.6px.

**E2, the popup over the trigger.** With a `.select-content` open, `elementFromPoint` inside the
popup returns `.select-viewport`; the popup's box begins at y=437 while the trigger's hit band ends
at y=434.2, so they do not even intersect.

**E9, overlays inside a clipping ancestor.** All 26 `.law-name-button` and `.sort-button` overlays
inside `.law-table-scroll` (`overflow-x: auto`) measure 24px tall. They add no horizontal size, so
there is nothing for the scroll container to clip horizontally.

**One measurement artefact, not a defect of this change.** `.tax-mix-select` reads 0 × 2.6 until its
island hydrates, because Radix's `Select.Value` has no text to show until then; it settles at
38.1 × 17.6 with a 38.1 × 24 hit area. Parked in `docs/parked-findings.md` — it is a hydration
question, not a target-size one, and this change neither causes nor fixes it.

### Chart legibility at 390px (#66)

The broad 390px sweep. Four cluster issues took pieces of it first — **#62** the `Select` popup,
**#63** the by-state table columns, **#64** the four annotation classes, **#65** the 24px target
floor — and all four are merged. What was left is the part none of them touched: **axis text, tick
density, and every remaining `<text>` class that leaves its own SVG**.

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

All seven are the #64 shape on classes #64 did not own — a complete-looking label carrying a number
that is not the number. `$30,000,000` shipped as `0,000,000`. **The parked finding recorded one
`holders-label` defect; there were two**, and the intragovernmental one had never been written down.

Widening the walk found three more the original probe could not see, and one it could see only once
its own arithmetic was corrected:

- `/government` **`Presidency`**, +2.2 left. `BudgetChart`'s control-strip row labels already
  carried a long/short pair, chosen by the `narrow` boolean — so at the *wide* preset it went on
  emitting the long one into a gutter 2.2 units too small. A breakpoint cannot see a gutter it is
  not measuring; the pair is now chosen by fit.
- `/government` §2's **three leader labels on one baseline**. The Japan / UK / China points are 46.6
  units apart and `United Kingdom $880B` alone is 136 units wide, so the three sat on top of each
  other. Every clipping assertion was green throughout — this is E8 in the served bytes, not in
  theory — and it is why `test_no_two_holders_labels_on_one_row_intersect` exists. They are now
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
| **WIDE, 720 units** — every `<text>` of every class in `dist/`, horizontally | `pytest -k "chart_text or left_axis_tick or holders_labels"`, over the served bytes | **ASSERTED**, and unattended |
| **WIDE, 720 units** — rotated axis titles, vertically | `pytest -k rotated_axis_title` | **ASSERTED** |
| **NARROW, 360 units** — the left gutter (42 units, six characters), the right-edge bottom tick, the rotated title down a short panel | `npm run test:unit` over the pure helpers (`src/components/charts/axisFit.test.ts`) | **ASSERTED**, at the unit level |
| **Rendered pixels**, real `getBoundingClientRect()` at 390x844 and 1440x900 | browser | **ASSERTED since #67** — `npm run test:browser` walks every `<text>` in every `<svg>`, not only `.annotation` |

SSR cannot reach NARROW at all: `useChartSize.ts` returns the WIDE preset before the first client
measurement, so the server render — and therefore every assertion any pytest guard can make — only
ever observes 720. `axisFit.test.ts` is not optional cover for this issue; it is the only lane that
reaches half of it.

**320px viewports and landscape phones are explicitly outside this contract** (E11). 390x844 is the
stated floor. The 360 preset applies below a **560px container** width, so 320 uses the same
geometry with less room — recorded as untested, not as passing.

**Type size with scripting on cannot fail by construction**, which is why no lane asserts it as an
observation: the viewBox matches the container (`useChartSize.ts:12-21`), so 11px is 11px at every
width. The below-intended-size failure is the scripting-**off** path only, which is **#78**'s.

#### The browser lane, and why it is NOT EXECUTED here

This pass did **not** run the browser lane, and records that rather than inferring it. The nearest
prior measurement is #64's, executed 2026-08-27 on this branch's ancestor and recorded above at
`Right-edge annotation clipping (#64)` — 0 overrunning annotations and
`documentElement.scrollWidth === clientWidth` on all three routes at 390x844, with the charts
reporting a **360**-unit viewBox, which is what proves the NARROW path was genuinely exercised
rather than SSR scaled down. That measurement covers DoD items 3 and 4 for the geometry that has not
moved.

It does **not** cover what this issue moved, and saying so is the point: `WhoPays`' six category
labels are now inside the plot, `DebtHolders`' leader labels are staggered, and four titles took a
shorter variant. Those are the rows in the table below reading **NOT EXECUTED**, and each names
**#67** as the owner, and #67 closed it: `mountIslands()` step-scrolls at 0.8x the viewport and then
*waits on* the exact hydrated `<svg>` count rather than sampling it. A sweep that measured unmounted `client:visible` islands would report a false
PASS, which is the most expensive outcome available here (E1) — so the lane is recorded as unrun
rather than run cheaply.

**Human-judged, not asserted (E8).** `WhoPays`' narrow treatment moves each category label into
empty plot space above its own bar pair. That the label reads as belonging to *that* pair rather
than to the pair above it is a judgement about reading, and no static lane makes it. It is recorded
here as human-judged and is **not** claimed as verified.

#### Per-figure results, 390x844, scripting on

25 figures: `/economy` 5, `/households` 7, `/government` 13. (`/` is the intro route and carries no
figures — the DoD's original route list predates that split.) Each cell is PASS, FAIL with the
specific failure, or NOT EXECUTED with a reason; none is blank.

- **PASS (S)** — asserted statically against `dist/` by a named guard in
  `pipeline/tests/test_accessibility.py`.
- **PASS (C)** — true by construction, with the mechanism asserted rather than the outcome sampled.
- **PASS (B)** — asserted in a real browser by `npm run test:browser` (#67), on every pull request.
  `driven` marks a figure whose named control the spec operates before re-measuring.
- **NOT EXECUTED** — needs rendered pixels; owner named.

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
| /government `#whole-budget` | Federal outlays from fiscal 1962 to 2025 stacked into mand… | PASS (S) | PASS (C) | PASS (B), driven — unit toggle | PASS (S) | PASS (S) | owned by **#78** |
| /government `#structural-gap` | Revenue averaged 17.2% of GDP against outlays at 21.1% acr… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#what-congress-votes-on` | Share of GDP from FY1995 to FY2025: mandatory rose from 9.… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#net-interest` | Net interest rose from $232 billion in FY1995 to $970 bill… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#the-laws` | Sixteen of the twenty-three major deficit-moving laws sinc… | PASS (S) | PASS (C) | PASS (B), driven — coalition/president filter | PASS (S) | PASS (S) | owned by **#78** |
| /government `#passed-signed` | Both attributions total the same $16.75 trillion in net te… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#where-money-comes-from` | Federal revenue by source held near 17 to 18 percent of GD… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#where-money-comes-from` | The United States collected 25.6% of GDP in tax in 2024, 3… | PASS (S) | PASS (C) | PASS (B) | PASS (S) | PASS (S) | owned by **#78** |
| /government `#by-state` | Federal gross tax collections against federal award spendi… | PASS (S) | PASS (C) | PASS (B), driven — basis toggle | PASS (S) | PASS (S) | owned by **#78** |
| /government `#by-state` | Each state's own tax collections by category as a share of… | PASS (S) | PASS (C) | PASS (B), driven — basis toggle | PASS (S) | PASS (S) | owned by **#78** |
| /households `#what-a-household-earns` | Real median household income rose from $65,380 in 1995 to… | PASS (S) | PASS (C) | PASS (B), driven — year range | PASS (S) | PASS (S) | owned by **#78** |
| /households `#the-spread` | The family Gini index rose from 0.421 in 1995 to 0.456 in… | PASS (S) | PASS (C) | PASS (B), driven — year range | PASS (S) | PASS (S) | owned by **#78** |
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
| `/government` §2's foreign label can no longer carry its percentage on the chart | **Parked** — `docs/parked-findings.md`. The full share is still on the figure's `aria-label`, in its live readout, and in both columns of its table |
| `PricesAndRates`' converging series labels | **Parked** by #64, and stays parked: it is annotation text, and it collides at every width, so it is not a 390px defect |
| Browser lane not run in this pass | **Asserted since #67** — `npm run test:browser`, every pull request |
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
annotation classes and their NARROW coverage in `annotate.test.ts`, **#65** the **24px** target floor
(**deliberately not 44px** — at these controls' 24px pitch that would create 20px ambiguous
overlaps, E12; no target-size CSS is touched). Also out: **#71**/**#76** table scroll wrappers,
**#73** chart marks, **#74** §11's legend swatch, **#77**
the data-table height cap. (**#72**, the toggles' shared accessible name, **has since shipped** —
see *Unique accessible names for choice-set controls* below.)

### Reading position in the contents list (#44)

**EXECUTED 2026-08-26**, Chromium **151.0.7922.174** (Playwright), against `astro preview` at
1440×900 and 390×844. Console output clean on all five routes: 0 errors, 0 warnings.

| Check | Result |
|---|---|
| Top of page, `scrollTo(0, 0)` | `#forty-trillion` / `#one-picture` / `#what-a-household-earns` on `/government`, `/economy`, `/households`. Never a JS-running state with nothing marked |
| Bottom of document, `scrollTo(0, body.scrollHeight)` | `#limits` on all three, at both viewports |
| Counts, at every sampled position | `[aria-current="true"]` **2** in the DOM, **1** in the rail list, **1** in the panel list; `[aria-current="page"]` stays **2** |
| Monotonicity, 200px steps | `/government` at 1440×900: 112 samples, **0** decreases, all **12** sections visited. At 390×844: 128 samples, 0 decreases, 12 visited. `/economy` 49 samples, 0 decreases, 6 of 6. `/households` 53 samples (the exact document bottom appended), 0 decreases, **7 of 7** — its `limits` is 1058px against an 844px viewport and the midpoint never enters it before the bottom, which is precisely what the bottom-of-document rule is for |
| Taller than the viewport | `#the-laws` (5.38 × viewport) marked across all 24 samples inside its bounds and `#by-state` (4.99 ×) across all 22, with no other id appearing |
| Anchor jump, 390×844 | all **12** panel links clicked in turn: the marked href equals the clicked one every time, including §12 `#limits`; the panel closes on each; the target's top lands at 64px, clearing the 52px bar |
| Panel open while the page scrolls behind it | rail and panel agree at every sampled offset (0 → 19,000px) with the disclosure held open |
| Routes with no contents list | `/sources` — **0** marks with JavaScript **on** at top, middle and bottom, 0 `a[data-section]`, and no console error: the IIFE returns before observing. `/` was in this class when the pass ran and behaved identically; it left the class when #48 gave it four sections, and the spy is **NOT EXECUTED** against `/` at its new contents list |
| `javaScriptEnabled: false` | **0** `[aria-current="true"]` and **2** `[aria-current="page"]` on all five routes. Paired against the same context with scripting **on**, which shows 2 at load with no scrolling — the difference is the proof that the script, not the server, writes the mark. #36's guard is intact in the same run: 14 of 14 `figure.figure svg.chart` server-render on `/government` with scripting off |
| Layout shift on a mark change | the rail's contents `<ol>` measures 208 × 314.34 before and after the mark moves — identical |
| Desktop-unchanged proof | with the stylesheet content-hash normalised, `dist/government/index.html` and `dist/index.html` each differ from their pre-change build by **92 added lines and zero removed lines**, all of them the `sectionSpy()` block. No markup changed |

### Scroll restoration and the back button (#46)

**EXECUTED 2026-08-26**, Playwright against `astro preview`, in **both** engines — Chromium
**151.0.7922.34** and **WebKit 26.5** — at 390×844 and 1440×900. Nothing in `src/` changed for this
issue; the numbers below are what the platform does on its own, and they are why.

**bfcache was not in play for a single measurement.** A `window.__marker` set before leaving did not
survive any back navigation, so every number here is the *harder* full-reload path, not the free
one. `history.scrollRestoration` read `'auto'` in every context.

Sequence 1 — scroll to a section, navigate to `/sources/`, `history.back()`, wait 2.5s for
hydration to settle, and compare the section's `getBoundingClientRect().top`:

| Route, anchor | 390×844 Chromium | 390×844 WebKit | 1440×900 Chromium | 1440×900 WebKit |
|---|---|---|---|---|
| `/economy/` `#prices-rates` | **+0.3px** | −114.7px | **0.0px** | **0.0px** |
| `/households/` `#who-pays` | **−0.7px** | −238.7px | **0.0px** | −124.0px |
| `/government/` `#by-state` | **+0.3px** | −237.7px | **0.0px** | −4.0px |

Chromium is exact, and stays exact through Forward-then-Back-again (`#by-state` at `top 64.58`,
+0.3px, on the second return). The `top 64` is `calc(var(--navbar-h) + 0.75rem)` = 52 + 12 — #42's
`scroll-margin-top`, honoured by the restore with no accounting of our own.

**WebKit's drift is the missing scroll anchoring, and its size is the charts' hydration growth.**
WebKit restores the saved `scrollY` faithfully and then does not correct for the ~115–240px the
document gains above the reader when `useChartSize` swaps WIDE for NARROW. The worst case measured
is **238.7px against an 844px viewport — 28% of one screen**, which leaves the reader inside the
section they left. Per #46's plan, drift within one viewport on the plain Back case ships as-is: a
restore that is within a screen returns the reader to what they were reading, and the alternative —
a hand-rolled `pageshow` re-scroll — would be a second, worse implementation of a thing the browser
already does better on the engine where it works at all.

Sequence 2, hash URL — arrive at `/government/#by-state`, read on to `#the-laws`, leave, return:
**both engines restore the position, not the anchor**, at both viewports. `#the-laws` comes back to
`top 63.8` (Chromium 390) / `top 63.6` (WebKit 390) / `top 0.27` (both, 1440) — 0.0px drift in every
case — while `#by-state` sits 9,237px (Chromium) / 9,287px (WebKit) below the viewport top. Nothing
re-jumps to the fragment. The URL still carries `#by-state`.

Sequence 3, opened tables — open all **13** `main details` on `/government/`, scroll to
`#the-laws`, leave, return. `open` is not restored by either engine, so the document comes back
**11,854–11,970px shorter** (37,226 → 25,256px in Chromium at 390):

| | Chromium 390×844 | WebKit 390×844 | Chromium 1440×900 | WebKit 1440×900 |
|---|---|---|---|---|
| `#the-laws` drift | **−0.1px** | **−6,826px** | **−0.4px** | **−6,592px** |
| `aria-current="true"` section | `the-laws` | `where-money-comes-from` | `the-laws` | `where-money-comes-from` |
| `aria-current="true"` count | 2 | 2 | 2 | 2 |

Chromium's scroll anchoring absorbs the whole 11,970px shrink and lands the reader on the pixel.
**WebKit does not**: it restores `scrollY 15,287` into a 25,445px document and the reader arrives
roughly eight screens above where they left. This is a real gap on iOS Safari, it is **open**, and
it is recorded rather than repaired here: #46's decision procedure keys the repair to the plain Back
case, which WebKit passes, and the repair — a `pageshow` re-scroll to the nearest section — is the
manual implementation criterion 1 of that issue exists to keep out. The scroll spy is not part of
the gap: it marks `where-money-comes-from`, which is where WebKit actually put the reader.

With `javaScriptEnabled: false`, sequence 1 restores `scrollY 6000` to `scrollY 6000` — **0px
drift** — in both engines at both viewports. Restoration was never ours, so switching scripting off
changes nothing about it. The disclosure is still a native `<details>` with **18** links and **0**
`<button>`s, and it still opens on click at 390×844.

**Affordance, measured from `#limits` — the deepest section on each route.** At 390×844 the
`.navbar-disclosure > summary` is on screen (`top 3.5`, `bottom 47.5`, inside an 844px viewport) and
clears the tap-target floor on all three routes with a contents list: **83.8 × 44** on `/economy/`,
**107.0 × 44** on `/households/`, **109.5 × 44** on `/government/` (WebKit; Chromium within 1px). No
new control was built for #46 — this is #42's trigger, and the folding call is recorded on the
issue. At 1440×900 no affordance is needed and that is measured too: `.navbar` computes
`display: none`, `.rail` computes `position: sticky`, and from `#limits` the rail's whole 636px runs
`top 0` → `bottom 636` inside a 900px viewport with the **twelfth** of twelve contents links on
screen. Chromium tab stops from load are `.skip-link` → the `<summary>` → inside `main` at 390×844.

*Not executed:* whether a screen reader **reports** the restored position on return — #80. The
44px tap targets, the `display: none` navbar at 1440x900 and the three tab stops above are
**asserted since #67** — `tests/browser/smoke.test.ts`'s target-size and tab-order checks re-run all
three on every pull request; the rail's sticky geometry is not, and stays with #80.

### Keyboard-operable scroll containers (#71)

**The rule, and it applies to every table wrapper this site will ever grow.** An element whose
computed `overflow-x` is `auto` or `scroll` is focusable **exactly when it overflows**; while it
overflows it carries `role="group"` and an `aria-label` that names what it contains; and
`ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, `Home` and `End` scroll it. A container that fits
carries `tabindex="-1"` — invisible to the Tab order, but still able to hold a reader who was
standing on it when the window widened.

Before this, every wrapper was a plain `<div>`: no `tabindex`, no role, no name. Measured at
`1b2fcd5` on `/economy` `#prices-rates` at 1440×900 — a 1216px table in a 736px box — the
per-column visibility vector after `End` was `[true,true,true,false,false,false,false]`. **Columns
4 to 7 of seven did not exist for a reader without a pointing device.** WCAG 2.1.1, Level A.

**The mechanism is `src/components/islands/scrollRegion.ts`**, one hook spread by all three JSX
sites. The key handler is written out rather than left to the browser's own scrolling of a focused
container, and that is a deliberate testability decision, not a preference: measured on a minimal
page in headless **and** headed Chromium, Playwright's synthetic key events do not drive Chromium's
native scrolling at all — a focused horizontal scroller, a focused vertical scroller and the
document itself all stayed at 0 after `ArrowRight`/`ArrowDown`/`End`. A `tabindex`-only fix would
have shipped behaviour **no check in this repository can observe**.

**`role="group"`, not `role="region"`.** A *named* `region` is a landmark, and this would mint up to
fifteen of them on `/government` alone; the site already refuses that kind of AT noise
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

- `.navbar-panel` (`global.css:223`) — `overflow-y` only, and already keyboard operable: it holds 17
  focusable links, opening it moves focus to the container, and arrow keys then scroll it. Recorded
  above as "not a new instance of #71" and still true.
- `.tax-mix-select-content` (`global.css:1073`) — a Radix listbox that declares `overflow-x: hidden`
  *precisely so* it is not a horizontal scroller (#62), guarded by `two_axis_scroll_box_failures`.
  That guard and this rule are opposites on purpose: a listbox must not be a horizontal scroll box,
  a table wrapper deliberately is one.
- `overflow-wrap: anywhere` sites (`:357`, `:1212`, `:1308`, `:1324`) — text wrapping, not scroll.
- `overflow: hidden` (`:111`) — clipping, no scroll.

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
| whole page, **scripting off** @1440 | 136 | **136 — unchanged** | 200 |
| to §11, scripting off @1440 | 118 | **118 — unchanged** | 160 |
| whole page, every table open @1440 / @390 | — | **166 / 175** | 200 |
| to §11, every table open @1440 / @390 | — | **144 / 153** | 160 |

The two stops the default state gains are §10's law table (1481px in 736px) and §11's by-state table
(745px in 736px) — the only two containers not inside a `<details>`, and both genuinely overflowing
at every asserted viewport, so neither is an empty stop. The other thirteen contribute nothing until
a reader opens them. **No bound was raised**, and the worst state the site can reach — every one of
`/government`'s thirteen tables open at 390px, where eleven overflowing containers sit above §11 —
still clears `MAX_STOPS_TO_SECTION_11` by 7 and `MAX_STOPS_GOVERNMENT` by 25. That all-open state is
asserted by `scroll.test.ts`; no test exercised it before #71.

**How many containers overflow is PLATFORM-DEPENDENT, and no guard pins the number.** `tokens.css`
documents a deliberate system-font stack with no webfont, so table widths differ by operating
system: `/government` at 1440px measures **5** overflowing containers on macOS and **4** in CI's
Linux Chromium, because one table clears its box by a few pixels on one and not the other. Every
assertion here is written against the *invariant* — focusable exactly when it overflows — or
self-baselined against a walk with the feature stripped, never against a count. A future guard that
pins "5" would be red on half the machines that run it, which is the same class of failure
`TOLERANCE_PX` exists to prevent.

**The focus ring needed no stylesheet change.** The global
`:focus-visible { outline: 1.5px solid var(--ink); outline-offset: 2px; }` paints on the container,
whose box is exactly the `<figure>`'s, and `documentElement.scrollWidth` stays at the viewport width
at both 390 and 1440 — the ring introduces no page overflow. Asserted, with Chromium's own
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
rejected. It would give scripting-off readers the browser's native arrow scrolling, and in the page's
default state it costs the same two stops (measured: 138 against 136 scripting-off stops on
`/government`, both of those containers genuinely overflowing). It is rejected because it breaks the
"not focusable unless it overflows" half of the rule for a scripting-off reader who opens a table
that fits — an empty Tab stop per such table, which is the cost #68 and #69 spent two issues
removing. The residual gap is recorded in `docs/parked-findings.md` rather than dropped.

The consequence is asserted in both directions: the scripting-off Tab walk on `/government` stays at
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
closed `<details>`'s true `scrollWidth`/`clientWidth` while contributing zero Tab stops; Firefox and
WebKit `display: none` the subtree, which would measure 0/0. The design does not depend on either —
the `ResizeObserver` fires on the display transition — but only the Chromium behaviour was executed,
because the browser lane is Chromium. **HUMAN**: whether `role="group"` plus this name *reads* well
in NVDA or JAWS. #30/#80.

**NOT IN SCOPE, and still open.** The *visible* at-rest sign that a table scrolls — fade, shadow,
persistent scrollbar, text hint — is **#76**. `, scrollable table` is an accessible name, not a
visible affordance; no ink moved.

### Unique accessible names for choice-set controls (#72)

**SHIPPED 2026-08-27.** Four unit toggles on `/government` were all announced as **"Measured in"**.
A screen reader reads a `radiogroup`'s name on entry, so four groups controlling four different
figures were indistinguishable by name alone — a reader arriving at the second heard exactly what
they heard at the first.

#### What was actually there, re-measured at `6827f0b`

Nine `[role="radiogroup"]` site-wide — eight on `/government`, one on `/households`. **Four** shared
the name "Measured in", all four on `/government`. The issue also alleged two groups pointing at the
*same* id; they did not, and `test_no_page_repeats_an_id` already forbids that shape. Three defects
the issue did **not** name were live and are fixed here, because each is a direct product of the
mechanism being replaced:

| Defect | Where | Status |
|---|---|---|
| Two ids, identical text (`net-interest-units`, `revenue-units` both "Measured in") | `/government` | Fixed |
| Two identical hardcoded `aria-label`s — the shape **#35** created when it moved `DebtChart` onto the shared `UnitToggle` | `DebtChart`, `BudgetChart` | Fixed |
| Three orphaned label ids: a visible `.controls-label` span that **nothing referenced**, the toggle beside it named by `aria-label` | `DebtChart:80`, `StructuralGap:130`, `VotedAndNot:102` | Fixed |
| **WCAG 2.5.3 Label in Name (Level A)**: visible text "Measured in", accessible name "Structural gap units" / "What Congress votes on units" — a voice-control user saying what they could see could not target either control | `StructuralGap`, `VotedAndNot` | **Fixed** |
| No visible label at all — the only one of the nine without one | `BudgetChart` | Fixed |

#### The mechanism: the name is derived, not typed

The obvious fix is a different string at each call site, and it is the wrong one — it is how the bug
arrived. A hand-typed name can be unique and still wrong ("Measured in 2"), and a uniqueness guard
would pass on it.

`Figure.astro` puts a manifest-derived id on the figure-number span it already renders, and each
control points at that plus its own visible label:

```
aria-labelledby="fig-net-interest-no net-interest-units"   ->   "Figure 7 Measured in"
```

**Uniqueness is inherited, not asserted afresh.** `src/data/figures.ts:323` already throws when a
route declares a key twice, and a figure's number is its index in that route's array — so neither
the key nor the number can collide within a page, by build failure. Nobody invents a distinct name;
a new toggle inherits one. An island declares only its own manifest **key**, as a module-level
`FIGURE` constant, and `src/components/islands/figureLabel.ts` is the single place the `fig-…-no` id
shape is written.

**The number, not the title**, because a group's name is announced on every entry and
"Net interest payments by fiscal year, FY1995 to FY2025" is twelve words. "Figure 7" is short, sits
visibly two lines above the control, and is the page's own cross-reference vocabulary — #49 made
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

`/households` has one radiogroup, so uniqueness there is vacuous — it is renamed anyway, because
requirements 2 and 3 are not vacuous. Visible labels are unchanged: five still read "Measured in",
which is correct, and the figure prefix is what distinguishes them.

#### Guard scope: measured, then narrowed

`CHOICE_SET_ROLES = {radiogroup, combobox, tablist}` — 14 nodes site-wide (9 / 4 / 1). A page-wide
all-roles rule is **unenforceable** and would have to be allowlisted into decoration:

| role | worst page | nodes | distinct | why the duplicates are legitimate |
|---|---|---|---|---|
| `link` | `/glossary` | 136 | 57 | nav rendered twice by design (bar + panel), "Full entry in the glossary" ×16, per-letter index links, repeated citations. On `/contents` alone a `link` rule fires on 43 duplicate names |
| `button` | `/government` | 45 | 33 | "View as table"/"Hide table" ×13 — one per figure, disambiguated by its figure |
| `radio` | `/government` | 20 | 10 | "Nominal" / "% of GDP" inside each group; the **group** is what disambiguates them, and the group is what this section makes unique |
| `navigation` | every page | 4 | 2 | "Site" and "Contents" as bar + panel; `test_route_nav_and_contents_nav_are_separate_landmarks` already asserts the pair is deliberate |
| `group` | `/government` | 28 | 28 | **Deliberately excluded.** Zero collisions today, but this is where the chart `<svg>`s and #71's scroll containers live, and their names are long finding sentences that two similar figures could legitimately share |

`radiogroup` is the mandatory floor. `combobox` (LawExplorer's three filters, StateGiveGet's
jurisdiction) and `tablist` have **zero** violations today and cost nothing to include — they lock
the same bug out of `Select.tsx` and the Radix tabs before it can be written.

#### Why static over `dist/`, with one browser test as calibration

**Enforcement is static.** The names must be correct in the served bytes with scripting off: islands
mount `client:visible`, so a browser check on a hydrated page passes even when the SSR output is
wrong — exactly the failure #69's lane had, passing 59/59 while 113 data points sat in the
scripting-off tab order. And G2's claim ("this group's `aria-labelledby` names a span inside its
**own ancestor figure**") is structural; it is invisible once the accessibility tree has flattened a
name to text.

The risk of choosing static is that `accessible_name()` is a **model** of the accname algorithm. So
**B1** (`tests/browser/smoke.test.ts`) reads Chromium's real accessibility tree via
`locator.ariaSnapshot()` and asserts 8 distinct names on `/government`, preceded by a scripting-off
count of the same 8 groups and their two-token lists. On 2026-08-27 the engine and the model agreed
name-for-name on all eight. If they ever disagree, the model is what is wrong.

#### The guards

| # | Function | Claim |
|---|---|---|
| G1 | `duplicate_choice_set_name_failures` | No two controls of the same choice-set role share a resolved name on a page. A control with **no** name is reported too — an anonymous control cannot collide, so uniqueness alone would call it correct |
| G2 | `figure_bound_name_failures` | Every `radiogroup` inside a `<figure>` uses `aria-labelledby`, and one token resolves to a `.figure-no` span **whose own ancestor figure is that same figure**. Ancestry, not name-matching |
| G3 | `label_in_name_failures` | Every `radiogroup`'s resolved name contains the text of the `.controls-label` in its own `.controls` row (WCAG 2.5.3) |
| floor | `test_the_choice_set_coverage_did_not_narrow` | The guards see **9** radiogroup, **4** combobox, **1** tablist site-wide, as equalities, plus `set(counts) == CHOICE_SET_ROLES` |

**The three are not redundant, and the mutations below prove it individually.** G1 alone is
satisfied by naming the groups "A", "B", "C" — unique and useless. G2 alone permits a name the
reader cannot say. G3 alone permits two figures naming each other's labels.

#### Mutation proofs — EXECUTED 2026-08-27

Every mutation was applied to source, rebuilt, observed red, and reverted; `git status --porcelain`
was empty afterwards. **Two of the eleven did not behave as the plan predicted, and the finding is
recorded rather than the mutation quietly adjusted.**

| # | Mutation | Predicted | Observed |
|---|---|---|---|
| M1 | `RevenueChart`'s toggle points at `net-interest-units` (two groups, one id) | G1 | **G1 red** |
| M2 | Figure 10's `figure-no` text reads "Figure 7" (two ids, identical text) | G1 | **G1 red** |
| M3 | `NetInterest` reverts to `aria-label="Measured in"` | G1 **and** G2 | **G2 red; G1 GREEN** — see below |
| M3b | `NetInterest` **and** `RevenueChart` both revert — the #35 shape | — | **G1 and G2 both red** |
| M4 | `DebtChart`'s toggle points at `fig-revenue-no` (real span, wrong figure) | G2 | **G2 red** (G1 also red: the name duplicates the real Figure 10's) |
| M5 | `labelledByFigure` drops the `fig-…-no` token | G2 | **G2 red on `/government` and `/households`** |
| M6 | Visible span text changed without changing the name | G3 | **G3 red; G1 and G2 GREEN** — see below |
| M7 | `labelledByFigure` drops the local label id, leaving only `fig-…-no` | G3 | **G3 red on both pages; G1 green** |
| M8 | `CHOICE_SET_ROLES` narrowed to `{"radiogroup"}` | the floor | **floor red; G1 GREEN** |
| M9 | Every role in `CHOICE_SET_ROLES` typo'd | the floor | **floor red; G1 GREEN** — but G2/G3 green, see below |
| M9b | `FIGURE_BOUND_ROLE` typo'd (the role G2 and G3 filter on) | — | **floor red; G2 and G3 both GREEN** |
| M10 | `RevenueChart` reverted in source, rebuilt, browser lane only | B1 | **B1 red** |
| M11 | Every `id` removed from `Figure.astro`'s `figure-no` span | G2 on all nine | **G2 red on both pages, every group** |

**M3 did not turn G1 red, and G1 is right.** Reverting **one** toggle to `aria-label="Measured in"`
produces a name no other group holds — the other eight are "Figure N Measured in". A unique,
plausible, wrong name is precisely what G1 cannot see and what G2 exists for. The plan predicted
both; only G2 fires, and M3b (reverting *two* toggles, the actual shape #35 created) is what turns
G1 red. This is evidence the two guards are independent, not evidence one is broken.

**M6 as written could not bite, and the reason is structural.** "Change the visible span's text
without changing the name" is *impossible* under the new mechanism: the name is derived from that
very span, so changing it to "Units" changes the name to "Figure 7 Units", which still contains
"Units". G3 correctly stays green. To create the defect M6 targets, the name has to be sourced from
a **different** span than the visible one — so M6 was performed that way (visible "Units", name
sourced from `revenue-units`). It turns **G3 red while G1 and G2 both stay green**, which is a
stronger proof than the original. The fact that the literal M6 cannot be constructed is itself the
result: this class of drift is now unreachable by construction, not merely guarded.

**M8 and M9 are the anti-hollow proofs and are why the coverage floor exists.** Both leave the
name guards reporting green while the guards look at a narrowed or empty set. A guard that sees
nothing is indistinguishable from a guard that sees everything and finds nothing, and only the floor
tells them apart.

**M9 found a real hole, and it was closed rather than noted.** Typing the roles wrong in
`CHOICE_SET_ROLES` turned the floor red, as designed — but G2 and G3 stayed green, because each was
filtering on its own bare `"radiogroup"` literal, which the floor did not cover. A typo *there* would
have emptied both guards silently. So the literal became `FIGURE_BOUND_ROLE`, used by G2, G3 **and**
the floor's own assertion. **M9b** is the proof: typo it now and the floor goes red while G2 and G3
both fall green — caught, where before it would not have been.

#### Boundaries

**Not in scope, still open.** Chart-mark hit targets and hover affordance **#73**; §11's legend
swatch wrapping **#74**; focus-ring width **#75**; the visible at-rest scroll affordance **#76**; the
open data-table height cap **#77**; how any of this *reads* in NVDA or JAWS **#30**/**#80**.

**`role="group"` is outside `CHOICE_SET_ROLES` by decision**, per the scope table above. Recorded
here as a boundary, not an oversight: if a chart `<svg>` and a scroll container ever do collide on a
finding sentence, that is a different rule with a different remedy.

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
   focusable, zero positive `tabindex`. The last standing FAIL was **#72** (four identically named
   `radiogroup`s); it has shipped, alongside #69 (no bypass past the data points) and #71 (table
   scroll container not keyboard reachable). No FAILs outstanding on this row. Row `M1`.
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

8. **Keyboard models for the interactive primitives that actually render.** Radix `Select` **did**
   land — two consumers, both on `@radix-ui/react-select@2.3.7`: `src/components/islands/Select.tsx`
   (the Government §8 filter bar's three dropdowns) and `src/components/islands/StateTaxMix.tsx`
   (§11's jurisdiction picker). The anticipated `Slider`, `Dialog` and `Tabs` consumers **never
   landed**, and `Tooltip` was rejected for the term markers on the reasoning in Conventions above:
   the site renders **zero `<input>` and zero native `<select>` elements**, and there is no slider,
   no modal and no tab strip in the DOM. Rewritten 2026-08-26 against the four control shapes that
   do render:
   - **`role="radio"` button groups** (`UnitToggle`, and the Government route's four measure
     toggles) — 20 radios site-wide, roving tabindex, `aria-checked` on each. **EXECUTED**, PASS,
     Chrome 151, 2026-08-24. Their *naming* was a separate defect (#72), **fixed 2026-08-27**: each
     group is now named by its own figure, e.g. "Figure 5 Measured in".
   - **Filter dropdown buttons** — the Radix `Select` consumers: three on `/government/` §8
     (`Select.tsx`) and §11's jurisdiction picker (`StateTaxMix.tsx`). Escape closes and restores
     focus to the trigger. **EXECUTED**, PASS, Chrome 151, 2026-08-24. The menu's width at 390px
     **was** an open defect (#62) and is **fixed** — the measurement is in § Manual pass results
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
     | ArrowUp | highlight moves back to the previous option | ArrowDown then ArrowUp returned to `All control configurations` — same option, not two steps |
     | Home | highlight moves to the first option | `All control configurations` |
     | End | highlight moves to the last option, scrolled into the box | §8: `… Republican Senate (RDR)`, the 7th of 7, inside the content box. §11: `Wyoming`, the 51st of 51, inside the box — the 20rem cap still scrolls to the end |
     | type-ahead | typing `r` highlights the first option starting with it | `Republican president · Republican House · Republican Senate (RRR)` |
     | Escape | closes; focus returns to the trigger; the value is unchanged | closed, `activeElement === trigger`, value still `… (DRR)` after a type-ahead highlight had moved off it. Same on §11: `activeElement === .tax-mix-select`, value still `Alaska` |
     | Enter (on an option) | commits that option, closes, focus returns to the trigger | value became `… Republican Senate (RRR)`, listbox closed, `activeElement === trigger`, `documentElement.scrollWidth` still **390** |
   - **`<details>`/`<summary>` disclosures** — every `<TableView>`, present in the server-rendered
     HTML with scripting off (13 on `/government/`, 7 on `/households/`, 5 on `/`), and since #42
     the **narrow-viewport nav panel** (`details#navbar-disclosure`, one per page, below `62rem`).
     Keyboard operation **EXECUTED**, PASS.

     The nav panel's keyboard model, expected and actual, **EXECUTED 2026-08-26**, Chromium via
     Playwright at 390×844 and 844×390, PASS on every line: Enter or Space on the `<summary>`
     toggles the panel (native, no `aria-expanded` written by hand — `<summary>` supplies the
     state); opening moves focus to `#navbar-panel`; Escape closes and returns focus to the
     `<summary>`; Tab from the last panel link continues into `main` rather than wrapping, because
     there is no trap; activating an in-panel link closes the panel, and so does a click outside
     it. The Escape listener is bound to `#navbar-disclosure`, not `document`, so it does not
     contend with the three `/government/` filter dropdowns above — re-checked at 390px, those
     still close on Escape and still restore focus to their own trigger. **With scripting off,
     stated rather than implied:** the toggle works by click and by Enter and all 17 links are
     reachable, while Escape, the focus move, the focus return and both dismissals do not happen.

     #42 evaluated Radix `Dialog` for this panel and chose the native disclosure instead; the
     decision and its four reasons are recorded in Conventions above, so a later reader does not
     re-litigate it. Whether the native disclosure *announces* its state correctly is a
     screen-reader question and is **NOT EXECUTED** — #80.

   - **In-prose glossary term markers** (`.term`, `src/components/Term.astro`, #47) — the fourth
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
     default — scrolling the page — until this pass added an explicit `keydown` intercept in
     `termPopovers()`. **Actual**, after the fix: focusing `.term-trigger[data-term="real"]`,
     closing with Escape, then pressing Space — `aria-expanded` `false` → `true`, `activeElement`
     unchanged (still the trigger), `location.href` unchanged, `window.scrollY` **0** before and
     after. The row above previously carried no **Actual** line, unlike its neighbors; this is
     that gap closed, not a re-statement of an old result.
     | Escape | closes; **focus stays exactly where it is**. **Actual**: `activeElement` still the trigger, `window.scrollY` 0 before and after | closes; focus returns to the trigger. **Actual**: `activeElement` the trigger, `scrollY` unchanged |

     **The refinement, recorded rather than silently implemented.** #47's checklist says "Tab again
     moves on and closes it", which describes a one-tab-stop trigger. The same issue also — and
     correctly, as its own reason for rejecting `Tooltip` — requires a `/glossary` link *inside* the
     popover, and a link inside an open popover is a focusable node in DOM order. So a marked term
     is **one tab stop while closed and two while open**, and "Tab moves on" happens one stop later
     than that sentence implies. That satisfies the criterion's actual requirement — in the natural
     focus order, not skipped and not a tab trap — in both directions, which the Shift-Tab row
     above verifies.

     **No focus trap and no focus move on open, so no focus return is owed.** Opening moves nothing
     (unlike the nav panel, which focuses its container); the only scripted focus call in the whole
     IIFE is Escape's return from inside the popover, and it is guarded so it cannot re-enter the
     trigger's own focus handler and reopen what Escape just dismissed.

     **The Escape listener is bound to the wrapper `<span class="term">`, not `document`** — the
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
     and is **NOT EXECUTED** — #80.

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
13. **Section-level `aria-current` under a screen reader** (feature-matrix `A11Y-4`): navigating into
    either contents list reports the current section on demand, **and** scrolling the page rapidly
    announces nothing at all. Both halves matter — a mark nobody can find is useless, and a mark
    that speaks on every section boundary is worse than none. The silence half is argued statically
    (`test_contents_lists_are_not_live_regions` plus the ARIA rule that an attribute change on an
    unfocused, non-live element is not announced) and the reporting half is not observable without
    an assistive technology. — **NOT EXECUTED.** Human required: **#80**.
