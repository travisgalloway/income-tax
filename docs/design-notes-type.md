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
| `--ts-2` | 1.33 | 1.66 | h3 |
| `--ts-1` | 1.22 | 1.33 | h4, small caps |
| `--ts-lede` | 1.3125 | 1.3125 | standfirst |
| `--ts-0` | 1.1875 | 1.1875 | running text |

The ladder skips a step between h1 and h2. The realised ratio there is 1.5625,
which is 1.25 squared. An h1 appears once per route and names the whole
document, so the wider gap is what separates a document title from a section
head. A `--ts-4` token held that step open as a reserve and no rule ever read
it. It has been removed.

`--ts-0` is 1.1875rem, being 19px. It went 1.0625 to 1.125 when the measure
widened to 70rem, and to 1.1875 when the measure came back to 40rem. A shorter
line carries a larger glyph, and the body leading came down with it, from 1.7
to 1.6. The 1.7 was bought to survive a 108-character return sweep. A
76-character line does not need it, and long lines with open leading compound,
because both widen the distance the eye travels back.

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

Weight is a hierarchy channel at h1 and h2, and nowhere else in the reading
face. The stack spans Baskerville, Minion, Garamond, Palatino, Georgia and
Times, and several of those expose no 600. The browser then synthesises the
weight or snaps it to bold, so a 600 lands at a different strength on a
different machine. Two elements per route can absorb that risk.

The rule used to be 400 at every level. Commit `1263e30` set `font-weight: 600`
on 16 selectors, which is what made the risk worth bounding rather than
restating. Twelve of those are reverted: h3, h4, `.kicker`, `.section-no`,
`.figure-title`, `.navbar-title`, the current-route nav link, the three table
captions, `.index-figure-title`, and the three control on-states, each of which
already marks itself with `--ink` plus a `border-bottom` in `--ink`.

Two more are kept beyond h1 and h2, both `thead th`, in `--font-data`. Georgia
leads that stack and has a real bold, and a column head has to separate itself
from 40 rows of numbers set in the same face.

Weight above 400 also survives in three older places, all in `--font-data` and
all marking a state rather than a level: `.law-name-button[aria-pressed='true']`,
`.dotplot-label-us` and `.control-strip-glyph`.

## Italic is retired

Italic used to appear at 26.6px, 21px, 15px, 14px, 12px and 10.5px, on a
heading, a deck, a label, a caption and two running sentences. Two clauses
governed it: above the body size it marked h3 and `.standfirst`, and at or
below it named a figure's title, a table's caption, a panel's title, a series
name, a reference label and an index entry.

Commit `1263e30` removed all of it, on the ground that italic slows reading on
screen at these sizes. Two instances survive, both SVG and both left behind by
that sweep: `.annotation.series-label` and `.dotplot-average-label`.

Small caps is now the only label channel. It marks a locator or a unit:
`.kicker`, `.figure-no`, `figcaption .lead`, `.tableview .unit`, `.glossary dt`.

## Measures

There is one reading measure and everything in the reading face takes it. The
measures used to form a descending ladder of five values, 70, 55, 46, 40 and
36rem, all flush left, so the right edge of a section stepped in and out five
times. The ladder existed to keep a heading's rule shorter than the rules
around it, and that only worked while the body was the widest thing on the
page.

`--measure` is 40rem, being 640px. At 19px the reading face advances about
8.6px per character, so that sets about 76 characters. Table 3 gives the four
publications the site was measured against.

**Table 3. Reading measure, this site against four comparable publications, at
a 1440px viewport.** Characters per line derived from the rendered glyph
advance. Retrieved 2026-09-04.

| Site | Body face | Size | Line height | Column | Characters |
|---|---|---|---|---|---|
| This site | Baskerville | 19px | 30.4px | 640px | 76 |
| Institute for Fiscal Studies | Tablet Gothic | 20px | 32px | 747px | 76 |
| Works in Progress | Editor | 18px | 27px | 728px | 78 |
| Asterisk | Noe Text | 18px | 29px | 750px | 80 |
| Our World in Data | Lato | 16px | 24px | 628px | 80 |

The old 55rem ran 108 characters, which is 35 percent wider than any of them
and is where a reader loses the line return.

`--measure-wide` is the reading column plus the margin column plus the gap
between them, about 952px. It is not a separate number any more, and only a
`.figure--wide` figure reads it: the law explorer and the two state panels.
`--measure-lede` is gone, its three consumers folded into `--measure`.

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
