# Design note: the typographic system

This note describes the type system that ships, in `src/styles/tokens.css` and
`src/styles/global.css`. An earlier version of this note described a `.dn`-scoped
proposal in a file called `design-next-type.css`. That file does not exist. The
proposal was adopted directly into the shipped stylesheets, with changes, and
the section headed "Superseded" at the foot records what did not survive.

## Faces

Two roles, both system serifs, and no webfont loads.

`--font-text` is the reading face. It leads with Baskerville and falls through
Minion, Garamond and Palatino to Georgia and Times. `--font-data` is the face
for tables, controls and chart furniture. It leads with Georgia, which was
drawn for screens and holds a numeric column at 11px.

A system sans for `--font-data` was proposed and rejected. `tokens.css` states
a serif-only decision, and the change would have moved every text metric under
40 selectors at once, against a browser lane whose tolerance is one device
pixel.

## Type scale

The scale uses two ratios. Above the body size the ratio is 1.25, the major
third, which gives a jump a reader sees across a page. Below the body size the
ratio is not maintained, and the reason is in the second table.

**Table 1. Type scale at and above the body size, in rem.** Each clamp reaches
its minimum at a 360px viewport and its maximum at 1184px.

| Token | Minimum | Maximum | Role |
|---|---|---|---|
| `--ts-5` | 2.15 | 3.24 | h1 |
| `--ts-3` | 1.50 | 2.08 | h2 |
| `--ts-2` | 1.33 | 1.66 | h3, italic |
| `--ts-1` | 1.22 | 1.33 | h4, small caps |
| `--ts-lede` | 1.3125 | 1.3125 | standfirst |
| `--ts-0` | 1.125 | 1.125 | running text |

The ladder skips a step between h1 and h2. The realised ratio there is 1.5625,
which is 1.25 squared. An h1 appears once per route and names the whole
document, so the wider gap is what separates a document title from a section
head. A `--ts-4` token held that step open as a reserve and no rule ever read
it. It has been removed.

`--ts-0` is 1.125rem, raised from 1.0625rem when the measure widened. It stayed
at 1.125rem when the measure came back to 55rem, because a 110-character line
still reads better at 18px than at 17px.

**Table 2. Type scale below the body size, in rem.** Each value is a size the
site already sets. None of these is a step on the 1.118 ladder the earlier
proposal used.

| Token | Value | Pixels | Role |
|---|---|---|---|
| `--ts-chrome` | 1 | 16 | the site bar, set in small caps |
| `--ts-meta` | 0.9375 | 15 | a label or a locator beside running text |
| `--ts-caption` | 0.875 | 14 | a caption or a tab, in the reading face |
| `--ts-data` | 0.8125 | 13 | anything set in `--font-data` |
| `--ts-micro` | 0.75 | 12 | the smallest text the site sets in HTML |

Three of these tokens were declared at 15.2px, 13.6px and 12.16px and read by
no rule, while 46 declarations hardcoded 17, 16, 15, 14, 13 and 12px. The
values moved to the shipped sizes rather than the other way round. Each of the
shipped sizes was chosen against a measurement, such as the 24px target floor
of WCAG 2.2 SC 2.5.8, the 320px site-bar row, or the 350px window §11's table
scrolls inside. Moving one by 0.6px moves a layout that was measured.

The 17px step is gone. Its two rules were `.glossary dt` and `.brief-quote p`,
and both belong at the body size.

Chart furniture is sized in px against a viewBox rather than from this scale,
because it scales with the SVG. Those sizes are pinned to the TypeScript
constants that place the labels, by
`pipeline/tests/test_accessibility.py::test_the_text_font_sizes_match_the_stylesheet`.

## Weight

Weight stays at 400 at every level of the reading face. The serif stack spans
Baskerville, Minion, Garamond and Georgia, and those families expose different
intermediate weights, so a weight step would land differently per machine.

Two rules broke that and both are fixed. `.glossary dt` was 600 and is now
small caps at the body size. `.index-term-name` was 600 and now matches it,
because it is the same term in the other place it appears.

Weight above 400 survives in three places, all in `--font-data` and all marking
a state rather than a level: `.law-name-button[aria-pressed='true']`,
`.dotplot-label-us` and `.control-strip-glyph`.

## What italic means

Italic used to appear at 26.6px, 21px, 15px, 14px, 12px and 10.5px, on a
heading, a deck, a label, a caption and two running sentences. Two clauses now
govern it, and nothing else on the site is italic.

Above the body size, italic is the third heading level (h3) and the deck that
follows a heading (`.standfirst`). Size already says "heading", and the italic
says which of the two it is.

At or below the body size, italic names something else on the page. That covers
a figure's title, a table's caption, a panel's title, a series name on a line,
a reference line's label, and an index entry's figure title.

Italic is never running text and it is never a value. That is what moved
`.empty-state` and `.panel-empty` out of it. Both report that a control the
reader set returned nothing, so both are set in `--font-data` in `--ink-soft`.

Small caps is the other label channel and the two do not overlap. Small caps
marks a locator or a unit: `.kicker`, `.figure-no`, `figcaption .lead`,
`.tableview .unit`, `.glossary dt`.

## Measures

The measures form a descending ladder, and the reason it descends is the rules.
Every rule on the site is a `border-top` or a `border-bottom` on a block, so a
rule is exactly as long as its block's measure. When prose, findings, headings
and figures all shared a 70rem bound, every rule on `/government` was 1120px
and two rules at different levels read as siblings.

**Table 3. Measure tokens and heading caps, in rem, against the 70rem content
column.** Character counts are measured at 1440px in Baskerville, from the
rendered box and the face's own mean advance width.

| Where | Value | Box at 1440px | Characters |
|---|---|---|---|
| `--measure-wide` | 70 | 1120px | figures and tables |
| `--measure` | 55 | 880px | 110 at 18px |
| h1 | 46 | 736px | 32 at 51.8px |
| h2 | 40 | 640px | 43 at 33.3px |
| `--measure-lede` | 40 | 640px | 83 at 21px |
| h3, h4 | 36 | 576px | 59 at 26.6px |

This reverses, for running text only, an earlier decision to widen everything
to the content column. Figures did not narrow. A chart drawn at 880px loses
resolution that a paragraph does not lose.

`--measure-lede` is 40rem rather than a value of its own, because a deck belongs
to the heading above it and 11 of the 12 decks on a report route follow an h2.

## Spacing scale

The spacing ratio is 1.5, the perfect fifth, rounded to a 0.05rem grid.
Realised ratios run from 1.43 to 1.56.

The spacing ratio is wider than the type ratio deliberately. A reader detects a
size difference in glyphs sooner than a difference in whitespace, so space needs
the larger interval to register as a step.

**Table 4. Spacing steps, in rem, against the ad-hoc values they replaced in
`global.css`.**

| Token | Value | Replaces |
|---|---|---|
| `--sp-1` | 0.3 | 0.22, 0.28, 0.30 |
| `--sp-2` | 0.45 | 0.35, 0.40, 0.45 |
| `--sp-3` | 0.7 | 0.55, 0.60, 0.70 |
| `--sp-4` | 1 | 0.90, 1.10 |
| `--sp-5` | 1.5 | 1.40, 1.50, 1.60 |
| `--sp-6` | 2.3 | 2.60, 2.80 |
| `--sp-section` | 2.3 to 3.45 | 3.40 |

`--sp-section` is the one fluid value, and it is now the only mark on a section
boundary. The hairline that used to sit there was drawn in the same weight and
the same `--rule` as a figure's caption rule, so a reader met 11 section rules
and 13 caption rules on `/government` with nothing to tell them apart by.

## Vertical rhythm

One rule governs every heading. Space above a heading exceeds space below it by
a constant 3.3 to 1, so a heading binds to the text it introduces and detaches
from the text it follows.

The space above steps down the spacing scale as the level descends, from
`--sp-6` at h2 to `--sp-4` at h4. An h1 takes no top space, because the section
boundary supplies it. An eyebrow belongs to the heading beneath it, so a heading
after a `.kicker` gives up its own top space.

## Superseded

The following appeared in the earlier version of this note and does not
describe the site.

The `.dn` scope and `src/styles/design-next-type.css`. The proposal was adopted
into `tokens.css` and `global.css`, and no file scoped under `.dn` exists.

The 74rem page, the 54rem right column, and the left rail. The page is 70rem of
content plus a 3rem gap and a 13rem contents rail, and the rail is on the right.
The measures in the old Table 3 (33rem body, 46rem figure, 30rem lede) are all
superseded by Table 3 above.

The 1.0625rem body size, the 1.19rem standfirst, and the `--ts-axis` token.

The run-on book setting. Consecutive `.prose` paragraphs were set with no blank
line and a 1.35em first-line indent. The indent was reversed and has not come
back: a blank line marks a paragraph at any width, and the indent only reads as
one at a book's measure.
