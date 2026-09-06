# Design note: the figure apparatus

This note describes the figure layer that ships, in `src/styles/global.css` and
`src/components/Figure.astro`. An earlier version described a proposal in three
`.dn`-scoped files, `design-next-figure.css`, `FigureNext.astro` and
`figure-demo-data.ts`. None of those files exists. Part of the proposal was
adopted into the shipped stylesheet and part was not, and the section headed
"Not adopted" at the foot records which is which.

## The apparatus

Every figure carries the same four parts, in this order.

A head, ruled off above with a 1px `--ink` line drawn at `--measure-wide`. It
holds the figure number and the figure title on one baseline.

The plot, at 100% of the figure width, with both axes named and their units
given. `Figure.astro` throws at build time when `ariaLabel`, the title, the
source, `xUnit` or `yUnit` is missing, so the apparatus cannot be shipped
incomplete.

A caption, ruled off above with a `--rule-hair` line in `--rule`, set in
`--font-data` at `--ts-data`. It carries `Units.`, `Note.`, `Source.` and
`Follow.`, each opened by a small-caps `.lead`, in that order. The source string
renders verbatim; BRIEF.md rule 1 forbids summarising it.

An optional table view, opened by a `<summary>` beneath the plot.

These two rules, the head's and the caption's, are the only figure rules the
site draws, and they are the only two rules the reader is meant to read as
apparatus. Everything else that used to draw one at the same length has stopped.

## The figure head

The head had an inverted hierarchy and it is fixed. `.figure-no` was 18px in
`--ink` while `.figure-title` was 15px in `--ink-soft`, in the same flex row, so
the locator outranked the thing it located.

Both channels are reversed. The title takes `--ts-0` and `--ink`. The number
takes `--ts-meta` and the `--ink-soft` it shares with every other locator on the
site, and keeps its small caps, its tabular figures and its `nowrap`.

The number is real text in the served bytes rather than a CSS counter. Every
unit toggle composes its accessible name from the number's span id through
`labelledByFigure`, so a counter would leave four controls named by nothing.

## The table view trigger

`.tableview-trigger` is the `<summary>`, so it is block-level by default, and its
`border-bottom` painted the full width of the content column. Every figure
carried one, 11px under the caption's own rule and the same length as it. Twelve
of the 157 full-width rules on `/government` were this control, doubling a rule
that already belonged to the caption.

It is now `display: inline-block`, so the border is an underline on the label.
That is the same affordance `.select-trigger` and the toggle groups already
draw. Toggling is unaffected: a `<summary>`'s activation behaviour does not
depend on its `display`. The `::before` target overlay is `left: 0; right: 0`,
so it shrinks with the host and still spans it, and the vertical padding stays
at `0 0 0.1rem`, which
`pipeline/tests/test_accessibility.py::_TARGET_HOST_VERTICAL_PADDING` asserts as
an equality.

## One graphic height

Every figure's graphic box is `--graphic-h`, 400px. Before this the rendered
heights ran 136px to 724px, a factor of 5.3, because rendered height is always
`container width x (H / W)` and each island set its own H.

| Was | Now | How |
|---|---|---|
| 17 standard islands at 400 | 400 | the `WIDE` preset, whose height is the token |
| `DebtHolders` 229, `DebtMaturity` 196 | 400 | one factor scales the bars, bands and gutters together, so their proportions are untouched |
| `OecdChart` 394 | 400 | the row pitch is derived from the budget rather than fixed, which also makes the figure proof against its own row count |
| `HouseholdSpread` 460, `BracketHistory` 624, `WhoWorks` and `PricesAndRates` 664 | 400 | `heightShare` on `useFrame` divides the budget among stacked panels at the ratios they already had |
| `StateGiveGet` 724, `StateTaxMix` 136 | centred in 400 | not scaled |

`heightShare` is applied inside `useFrame` rather than at the render site,
because the frame, the y scale, `chartStyle` and every tick derive from
`size.height`. Overriding the height downstream leaves the scales built against
the old one and draws the marks off the plot.

The two hand-written SVGs are the deliberate exception. A 50-state cartogram is
an 8-row grid of 36-unit tiles and the tax-mix bar is a single stacked row;
their shapes come from the data, and stretching a 60-unit strip to 400px is a
6.7x distortion. The cartogram is bounded by height so the browser derives its
width from the 440:320 aspect, and the strip keeps its natural 136px. Both are
centred in a 400px box, so they occupy the same vertical band without being
misdrawn.

Whole-figure heights still vary and always will. The controls row wraps, the
`aria-live` readout grows to two or three lines when a reader hovers a mark, and
the law explorer and the cartogram each render an always-visible table below the
graphic. The graphic box is the lever worth pulling; the figure block is not.

## Width and the margin column

A figure spans the reading column and the margin column and adopts both with
`grid-template-columns: subgrid`. Its head rule runs the whole band, its
graphic sits in the reading column at 720px, the measure of the prose around
it, and its caption sits beside the graphic in the margin at 240px. The caption
also takes the `--quiet` fill, so it reads as apparatus rather than as prose set
small.

This is the arrangement the earlier version of this note proposed and the site
never adopted. The caption used to run the full 1120px underneath the graphic,
where its Note and Source lines reached about 130 characters.

`.figure--wide` is the exception. There the graphic takes the whole band, 996px, and the caption returns beneath it at the reading measure with its rule
back. Three figures carry it: the law explorer and the two state panels.

Nothing in a figure is auto-placed. The graphic is an Astro island, which
renders as `<astro-island>` at `display: contents`, so its children rather than
it become the grid items of whatever contains it. `Figure.astro` wraps the slot
in `.figure-graphic` so a figure contributes exactly three items: head, graphic,
caption.

The plot area itself sits at `--panel`, one step toward the ink from `--ground`
at 1.14:1 in light and 1.15:1 in dark. It was 1.06:1 and, measured rather than
assumed, 1.03:1 in dark, where the plot rectangle could not be seen at all.
Three islands draw no gridline and no axis line, so the `--panel` fill is the
only thing that states the plot rectangle. `docs/design-notes-color.md` records
the ratios.

## Colour and accessibility

Colour never carries meaning alone. A single-series chart is named by its title,
a line is named at its end by `.series-label`, a stacked band is labelled
directly on the plot, and a small-multiple panel is named by `.panel-title`.
Both axes name their units, enforced by a throw rather than by review.

Nothing in the figure layer transitions, animates or moves, so
`prefers-reduced-motion` has nothing to reduce.

`.series-label`, `.dotplot-label-us` and `.dotplot-value-us` declare a style or
a weight and no size, because each only ever ships alongside a base class that
carries the size. Each is written as a compound selector, `.annotation.series-label`
and so on, so the pairing is a fact in the stylesheet rather than a convention
in a `.tsx` file. A second `font-size` on any of them would be a fourth copy of
a number that `pipeline/tests/test_accessibility.py` already pins in three
places.

## Not adopted

The following appeared in the earlier version of this note and does not describe
the site.

The four figure widths (`inline` 33rem, `wide` 46rem, `full` 54rem, `bleed`
70rem). Two ship: the reading measure, and `--measure-wide` for the three
`.figure--wide` figures. The `bleed` width's cost, a sticky rail painted over by
an opaque figure, never arose.

The two small-multiples grids, `.dn-figure-grid-2` and `.dn-figure-grid-3`, and
their measured collapse points at 72rem and 48rem. `HouseholdSpread` and
`BracketHistory` stack their panels inside one SVG instead, and `.panel-title`
and `.panel-empty` are what remains of the grid proposal.

The geometry the widths were derived from. The page is an 11rem contents rail,
a 45rem reading column and a 15rem margin column, with a 2.25rem gap between
each and 2.5rem of page padding, totalling 1272px. The reading column widened
with the face: a system sans needs 45rem to set the 76 characters Baskerville
set in 40rem. The rail is on the LEFT and
leaves the accessibility tree below 78rem; the margin column follows it below
64rem, and its contents reflow inline beneath whatever they annotate.

The 700-weight figure title, the per-width title and deck sizes, and the 2px
head rule on a hero figure. The title is `--ts-0` at weight 400 at every figure,
and every head rule is 1px. Commit `1263e30` briefly set the title to 600;
`docs/design-notes-type.md` records why weight stops at h2.

The optional deck between the title and the plot. No figure has one.

The `--dn-furniture` indirection and the recommendation to move `--font-data` to
a system sans. `--font-data` is Georgia-led and `docs/design-notes-type.md`
records why the move was rejected.
