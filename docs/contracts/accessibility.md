# Contract: accessibility (`docs/contracts/accessibility.md`)

Issue #15's audit found `main` shipping only the shared layer plus Government §1 — the other
eleven sections across all three routes are open, unmerged PRs (#16–#28) rendering
`Not built yet.`. There is no cross-route keyboard/AT sweep to perform against placeholder
paragraphs, so this contract has two parts: the conventions every section must satisfy (enforced,
where provable, by `pipeline/tests/test_accessibility.py`), and the manual checklist that remains
once a browser exists in this loop.

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

`--rule` clears neither the 4.5:1 text threshold nor the 3:1 non-text threshold on either ground.
It is used only for hairline rules, never for text or a category-carrying series, so it is marked
`role: rule` rather than `text` or `series` and carries no enforcement test of its own — recorded
here so a future use of `--rule` for anything else is a deliberate decision, not an oversight.

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

**This mitigates legibility; it does not fix the underlying geometry.** The plot area itself still
uses the wide viewBox with scripting off, so it is proportionally smaller than the JS-enabled
narrow layout, and the now-larger annotation text may crowd the plotted curve at the narrowest
widths. Degraded but readable, not equivalent. Checking whether that crowding is actually a problem
at 390px requires a rendered viewport — see the manual checklist.

## Manual checklist — not executable in exec, not claimed by PR #15

No browser, assistive technology, or rendered-pixel measurement exists in the environment that
produced this contract or the PR that shipped it. Every item below is unchecked and stays that way
until a human runs it. Per route once each of #16–#28 lands; the "Shared" items apply today,
against Government §1, the one section currently built.

### Shared (checkable today, against Government §1)

1. **Tab and Shift-Tab traversal**, start to finish: confirm focus order follows reading order and
   every control (route nav, TOC, unit toggle, the 32 chart data points, the table disclosure) is
   reachable and operable. — Manual, not executable in exec.
2. **Screen-reader pass** (VoiceOver + Safari, NVDA + Firefox): confirm the chart's `aria-label`
   announces usefully, the `<details>` table reads coherently when opened, and the `aria-live`
   readout announces once per focus move rather than flooding. — Manual, not executable in exec.
3. **Radix focus-trap check on `ToggleGroup`** (roving tabindex): confirm Home/End/arrow-key
   behaviour matches the ARIA radio-group pattern and nothing traps focus. — Manual, not executable
   in exec.
4. **390px legibility, JavaScript on and off**, including whether the `<noscript>` mitigation's
   enlarged annotation text collides with the plotted curve. — Manual, not executable in exec.
5. **Greyscale render** of Government §1, confirming the `--mand` area fill is not the sole carrier
   of any distinction a reader needs. — Manual, not executable in exec.
6. **Focus-ring visibility against every background it can appear on, in Safari specifically**,
   where the SVG `stroke` fallback (D6) is the ring that actually paints. — Manual, not executable
   in exec.
7. **Measured contrast over rendered pixels**, including anti-aliased SVG text and any overlap
   between a series fill and text drawn on top of it. — Manual, not executable in exec.

### Per-PR (no consumer exists yet; each item applies once the named PR lands)

8. **Radix `Select`, `Slider`, `Dialog`, `Tabs`, `Tooltip` keyboard models** — none has a consumer
   on `main`. Each PR that introduces the first consumer of one of these primitives must add its
   keyboard-model check here (expected/actual key behaviour, focus-trap correctness) before this
   item can be marked anything but blocked. — Manual, not executable in exec.
9. **Screen-reader pass, Households and Economy routes**, once #23–#27 land. — Manual, not
   executable in exec.
10. **Screen-reader pass, Government §§2–12 and `/sources`**, once #16–#22 and #28 land. — Manual,
    not executable in exec.
11. **Greyscale render, all three routes**, once every section that colour-codes a category exists
    to render. — Manual, not executable in exec.
12. **Cross-route keyboard sweep** (feature-matrix `A11Y-2`): the full Tab/Shift-Tab traversal
    across all three routes and `/sources`, end to end. Blocked on #16–#28; not claimed by this PR.
    — Manual, not executable in exec.
