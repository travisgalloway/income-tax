# Design proposal

## What this is

This note summarises a redesign proposal and points at the six notes carrying
its reasoning. The proposal is rendered at `/design`, which is a page for
review rather than a route of the site. Nothing on the seven live routes
changes, and the proposal and the current design build from the same source.

Every proposed rule is scoped under a `.dn` class. That scoping is what lets
one screen show the current design beside the proposed one, and it is why
`src/styles/tokens.css` and `src/styles/global.css` are untouched.

## The four references, and what each supplied

The request named four references. Each contributed a different part.

The Financial Times supplied colour and the chart template. The values come
from the Origami package `@financial-times/o-colors` 6.7.1, read directly
rather than quoted from a listing. The chart template supplied the order of a
figure, being title, subtitle, plot, then source.

The New York Times supplied the weighting and the widths. A bold short title
sits over a lighter deck, charts break out of the text measure, and a panel is
named directly rather than through a legend.

satnaing/astro-paper supplied the theming mechanism. A `data-theme` attribute
selects a palette, and the operating-system preference supplies the default.

The New Yorker supplied the heading hierarchy and the vertical rhythm, which
the type scale below carries.

## What changed

Four systems change and no content changes.

**Typography.** The scale uses two ratios. Display sizes step by 1.25, the
major third, and sizes below the body step by 1.118, where two pixels decide
whether an axis label fits. The current `h3` is set at 1.0625rem, the same size
as body text, so it reads as an emphasised paragraph. It now sits two steps
above the body. A six-step spacing scale at ratio 1.5 replaces 17 ad-hoc
values. Space above a heading exceeds space below it by 3.3 to 1 at every
level, so a heading binds to the text it introduces.

**Figure layout.** Four widths replace one. Today every figure renders at
46rem inside a 54rem column, so no figure breaks out and no two figures sit
side by side. The proposal adds 33rem for a supporting chart, 54rem for the
whole column, and 70rem for one hero per route. Two grids carry small
multiples, collapsing at measured points rather than round ones.

**Colour.** The ground warms from a cool stone to a warm paper, one step
deeper than FT paper. Oxford blue and claret become the party pair and teal
becomes the discretionary hue. The site gains its first dark theme, with all 13
data hues re-stepped for a dark ground rather than inverted.

**Charting libraries.** Neither is recommended. The measurements are below.

## Two defects in the shipped site, found while measuring

Both of these describe the site as it ships today, and neither depends on
adopting the proposal.

Protanopic readers cannot separate mixed control from Democratic control. The
shipped `--mix` sits OKLab dE 4.9 from `--dem` under simulated protanopia,
against a floor of 6. The shipped `--disc` and `--mand` sit at 6.5 under
deuteranopia. Both pairs appear together in the law explorer and the budget
chart's control strip.

Six series tokens score under 3:1 against the shipped panel. The proposal
clears 3:1 on every series token in both modes, and the gain comes from the
lighter ground rather than from any single hue.

## Recharts and nivo, measured

Both libraries were rebuilt against Government Figure 1, the debt series, and
both were configured with explicit dimensions. That configuration is the only
one under which either library can render on the server, so the comparison
tests the libraries rather than a setup they cannot meet.

Table 1 gives the result. Verified by parsing the built page rather than by
taking either measurement on trust.

**Table 1. The same figure, drawn three ways.** Sources: `dist/design/index.html`
parsed per figure for the served column, and the same page driven in Chromium at
a 390px viewport for the scaling column. Built 2026-08-29.

| Drawn by | Server-rendered graphic | Right edge at a 390px viewport | Tab stops | Added weight, gzipped |
|---|---|---|---|---|
| The current chart layer | yes | 370px, inside | 3 | none |
| Recharts 3.10.1 | no | 370px, inside | 3 | 81,546 |
| nivo 0.99.0 | yes | 740px, overflows | 3 | 90,253 |

The two libraries fail in different places. Recharts serves no graphic and then
scales correctly once the browser has it. nivo serves its graphic and cannot
scale it, because it writes width and height without a view box. Each failure
alone rules its library out for this site.

**Recharts renders no graphic on the server.** The served page carries the
island wrapper and its props, and nothing else. The chart appears only after
the browser hydrates it. Three pytest guards read `dist/` and fail on that, and
no prop reaches the cause.

**The nivo graphic carries no scalable view box.** It writes width and height
only. Measured in Chromium at a 390px viewport, its right edge sits at 740px
against a document width of 390, so it cannot take the `full` or `bleed` widths
this proposal introduces. The site's own `Chart.tsx` emits a view box, which is
what makes those widths possible at all.

**Both fought the keyboard model.** Under its own focus model nivo put 33 tab
stops in one figure, which is the pattern issue #69 exists to remove. Parity
was reached in both rebuilds only by switching the library's own marks off and
drawing marks by hand through `useRovingMarks`.

**nivo animates outside the reach of `prefers-reduced-motion`.** It animates
through react-spring, which writes inline styles from a frame loop. The
`prefers-reduced-motion` block in `global.css` overrides CSS properties and
cannot reach it. A chart left at the default animates for a reader who asked
for no motion, and nothing in the repository fails if `animate={false}` is
omitted.

The build brief rejects Recharts on the grounds that a charting library fights
axis labels, annotation placement and dual-panel layouts. That charge is half
right. Recharts 3 handles axis labels without argument. It has no answer for
the annotation contract, and its escape hatch is to draw the annotation by
hand, which is where the site already is.

## Recommendation

Adopt the typography, spacing, figure-width and colour systems. Adopt neither
charting library, and keep `src/components/charts/`.

The colour changes should be taken whether or not the rest is, because two of
them repair defects that ship today.

## Test results

Table 2 records the lanes. The seven failures are listed and explained below
it, and none is a defect in a proposed system.

**Table 2. Verification lanes, run 2026-08-29 from the worktree root.**

| Lane | Result |
|---|---|
| `npx astro check` | 0 errors, 0 warnings |
| `npm run build` | 8 pages |
| `npm run test:unit` | 80 pass, 0 fail |
| `npm run test:browser` | 123 pass, 0 fail |
| `cd pipeline && uv run pytest` | 629 pass, 7 fail, 7 skipped |

The seven failures fall into three groups.

Four are baseline counts that an eighth page inflates. They are
`test_the_label_coverage_did_not_narrow`,
`test_the_choice_set_coverage_did_not_narrow`,
`test_the_hint_reaches_every_readout_that_had_one` and
`test_the_hint_guards_bite`. Each holds a hardcoded total, such as 1,114
keyboard-reachable marks or 23 readout carriers, and each says in its own
message that the number is a deliberate re-baseline.

Two follow from the page not being a route.
`test_the_criterion_three_audit_covers_every_page` requires a row in
`docs/contracts/prose.md` for every built page, and
`test_no_built_page_ships_a_section_level_aria_current` requires the two route
lists to mark a current page. `/design` is absent from `siteRoutes` on purpose,
so neither can pass. The audit tables are not edited here, because editing them
would record a section set the site does not intend to keep.

One is the Recharts finding, reported as a test failure.
`test_live_regions_do_not_outnumber_charts` counts 7 live regions against 5
server-rendered charts. The Recharts figure ships a readout with no chart
behind it, which is the same defect Table 1 records.

Five failures were found and fixed during assembly rather than explained away.
Four figures shared one manifest key and put duplicate ids on the page, three
radiogroups shared the accessible name `Figure 1 Measured in`, the prose
shouted two acronyms, a comment tripped a source grep, and the proposed figure
head omitted the class the radiogroup guard selects.

## Where the reasoning is written

- `docs/design-notes-type.md`, the two ratios, the spacing map and the
  recommendation on `--font-data`.
- `docs/design-notes-figures.md`, the four widths, the grid collapse points and
  the cost of the bleed width.
- `docs/design-notes-color.md`, every token with its contrast ratio and its
  colour-vision separation.
- `docs/design-notes-recharts.md`, the Recharts measurements.
- `docs/design-notes-nivo.md`, the nivo measurements.

## Open decisions

Three decisions need a ruling before any of this merges.

**`--font-data` stays a serif, or moves to a system sans.** The typography note
recommends the move, because the New York Times and the Financial Times both
set chart furniture in a sans and 10.5px is below the size a text serif was
drawn for. A system sans loads no webfont, so the rule in `tokens.css` holds
either way. The risk is measured rather than hypothetical. The token feeds 40
selectors, `tests/browser/harness.ts` asserts text metrics with a one-pixel
tolerance, and four assertion groups would move.

**The bleed width covers the nav rail.** A 70rem figure passes over the sticky
rail and paints above it. The proposal limits the width to one figure per
route, in the opening section, where no reading-position mark exists yet.

**Adopting `FigureNext` on a route needs two guards widened.**
`pipeline/tests/test_accessibility.py` selects `figure.figure`, and the proposed
component renders `figure.dn-figure`. Nothing changes today, because the
proposal ships no route.
