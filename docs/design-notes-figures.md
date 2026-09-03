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
`border-bottom` painted the full 1120px of the content column. Every figure
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

## Width

Every figure renders at `--measure-wide`, which is `--content-w`, 70rem, or
1120px at 1440px. Running text renders at `--measure`, 55rem. The two were the
same number until this change, and making them different is what lets a
figure's rules read as a different level from a paragraph's.

The plot area itself sits at `--panel`, one hair from `--ground` at 1.06:1.
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
70rem). One width ships, `--measure-wide`, and it is 70rem. The `bleed` width's
cost, a sticky rail painted over by an opaque figure, never arose.

The two small-multiples grids, `.dn-figure-grid-2` and `.dn-figure-grid-3`, and
their measured collapse points at 72rem and 48rem. `HouseholdSpread` and
`BracketHistory` stack their panels inside one SVG instead, and `.panel-title`
and `.panel-empty` are what remains of the grid proposal.

The geometry the widths were derived from. The page is not 74rem with a 54rem
right column and a left rail. It is 70rem of content plus a 3rem gap and a 13rem
contents rail on the right, and the rail leaves the accessibility tree below
76rem.

The 700-weight figure title, the per-width title and deck sizes, and the 2px
head rule on a hero figure. The title is `--ts-0` at weight 400 at every figure,
and every head rule is 1px.

The optional deck between the title and the plot. No figure has one.

The `--dn-furniture` indirection and the recommendation to move `--font-data` to
a system sans. `--font-data` is Georgia-led and `docs/design-notes-type.md`
records why the move was rejected.
