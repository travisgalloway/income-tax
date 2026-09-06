# Design note: the typographic system

This note describes the type system that ships, in `src/styles/tokens.css` and
`src/styles/global.css`. An earlier version of this note described a `.dn`-scoped
proposal in a file called `design-next-type.css`. That file does not exist. The
proposal was adopted directly into the shipped stylesheets, with changes, and
the section headed "Superseded" at the foot records what did not survive.

## Faces

Three roles, and no webfont loads.

`--font-text` is the reading face and it is the system sans: `system-ui` first,
so the page uses whatever the reader's own system uses, with named faces behind
it for the engines that resolve `system-ui` poorly. `--font-data` is the same
stack, because a serif table under sans prose read as a second document.
One face throughout: prose, tables, controls and chart furniture alike.

This reverses the serif-only decision recorded here previously, and it returns
the site to `BRIEF.md:73`, which specified IBM Plex Sans for body text. The
serif was the departure, not the sans.

Chart furniture was held on the serif for one commit, and the hold-back rested
on a measurement taken over the wrong corpus. `ADVANCE_EM` estimates the width
of the five annotation classes `smoke.test.ts` sweeps, and that test says in
terms that axis ticks are not among them: a two-glyph tick reports a
per-character advance that says nothing about a label's fit. The 0.637 that
justified holding back was a tick, "1950".

Measured over the classes the constant does govern, on all three report routes
at 390px and 1440px with every island hydrated:

| Route | Worst ratio | Carried by |
|---|---|---|
| `/economy` | 0.597 | "Unemployment" |
| `/government` | 0.602 | "Longest instrument, 30-year bond" |
| `/households` | **0.6255** | "20.6%" |

So the sans does exceed 0.62, and the earlier reading of 0.579 was `/government`
alone. One route is not the corpus. `ADVANCE_EM` rose to **0.65**, which the
constant's own contract permits in that direction and only that direction.

Three things followed from the wider estimate, each a margin rather than a
retreat. `NARROW.margin.left` went 52 to 54, because "$1000k" is a real
formatter output needing 42.9 units and the old gutter held 42.
`NARROW.margin.right` went 12 to 16, because a last x-axis tick is centred on
its gridline and half of it hangs past the plot: `/households` Figure 6 overran
its surface by 1.9px. And `BudgetChart`'s caption line box went from 1.2 to 1.35
times the font size, because the sans carries more ascent and the caption was
cut by 1.3px at 390px.

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
face. The reason has changed. The old stack spanned six serif families and
several exposed no 600, so the browser synthesised the weight and it landed at
a different strength per machine. A system sans has a real 600 everywhere, so
the constraint is gone and the limit is now a choice: two weighted levels per
route is what the hierarchy needs, and adding more would spend a channel the
size ladder already covers.

The tracking went with the face. `h1` and `h2` kept a reduced negative step,
-0.01em and -0.005em against -0.02em and -0.015em, and `h3` lost its outright.
Negative tracking was fitted to Baskerville at display sizes; a system sans is
already fitted there and the same step closes its counters.

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

Prose numerals are lining, not old-style. No system sans ships old-style
figures, so `--num-prose` is very nearly a no-op and is kept declared rather
than deleted, so a reader whose fallback face has them still gets them. The
`.finding` lost this as one of its three channels and took the `--quiet` fill in
its place.

Small caps is synthesised rather than drawn, and the cost was measured. A
browser scales capitals when the face has no `smcp`, and the result is wider
than the real small caps Baskerville and Georgia drew: the navbar wordmark went
98px to 103px and the bar's headroom at 320px went from 4.9px to zero. The bar
never overflowed, because the wordmark is shrinkable; what it did was clip the
wordmark by 3px, which no overflow check reports. The wordmark's tracking
dropped to 0.05em and the bar's gap to 0.45rem, which together buy back 10px.

Small caps is still the only label channel. It marks a locator or a unit:
`.kicker`, `.figure-no`, `figcaption .lead`, `.tableview .unit`, `.glossary dt`.

## Measures

There is one reading measure and everything in the reading face takes it. The
measures used to form a descending ladder of five values, 70, 55, 46, 40 and
36rem, all flush left, so the right edge of a section stepped in and out five
times. The ladder existed to keep a heading's rule shorter than the rules
around it, and that only worked while the body was the widest thing on the
page.

`--measure` is 45rem, being 720px. At 19px the system sans advances about 9.5px
per character, measured in the browser, so that sets about 76 characters. It was
40rem while the face was Baskerville, which advances 8.6px: the same 76
characters cost 5rem more once the face changed, because a sans is about 11
percent wider per character at the same size. That is why the face change and
the widening are one change and not two. Table 3 gives the four
publications the site was measured against.

**Table 3. Reading measure, this site against four comparable publications, at
a 1440px viewport.** Characters per line derived from the rendered glyph
advance. Retrieved 2026-09-04.

| Site | Body face | Size | Line height | Column | Characters |
|---|---|---|---|---|---|
| This site | System sans | 19px | 30.4px | 720px | 76 |
| Institute for Fiscal Studies | Tablet Gothic | 20px | 32px | 747px | 76 |
| Works in Progress | Editor | 18px | 27px | 728px | 78 |
| Asterisk | Noe Text | 18px | 29px | 750px | 80 |
| Our World in Data | Lato | 16px | 24px | 628px | 80 |

The old 55rem ran 108 characters, which is 35 percent wider than any of them
and is where a reader loses the line return.

`--measure-wide` is the reading column plus the margin column plus the gap
between them, 996px. It is not a separate number any more, and only a
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

## One left edge

Every block of text on a route starts on the same vertical. The page had four
of them on the front door alone, at 320, 334.4, 336 and 339px, and each of the
three strays came from a filled block insetting its own text.

The rule is now stated once. A filled block insets its text by `--fill-pad` and
cancels that inset with a negative margin of the same size, so the tint runs
`--fill-pad` past the column on each side and the first character lands on the
column's own edge. Five blocks obey it: `.finding`, `.limits > li`,
`.apparatus`, `.brief-quote` and a `figcaption` on the reading spine.
`--fill-pad` is 1rem, and it widens to 1.25rem below 62rem, which is the page's
own gutter there, so the tint reaches the window edge rather than stopping 4px
short of it.

A caption in the margin column is the one exception and keeps its inset. In the
margin the fill is the column: every caption on a route insets by the same
13.6px, nothing else is set against that edge, and bleeding it would cut the
36px between a chart and its note to 20px. A caption under a wide figure, and
every caption below 67.25rem, sits on the reading column's own edge and bleeds
with the rest.

Three edges outside the reading column survive, and each is a column of its own:
the `.apparatus` definition track at 384.5px, a margin-column caption at
1089.6px, and the `.holders-foreign-list` row inside Figure 2.

The bar and the footer take the same vertical. `--page-max` is declared on
`:root` and `header.navbar` indents by whatever `.page` is centred by, where the
bar used to pin its content at `--page-pad` from the window edge: the wordmark
sat 84px left of the rail at 1440px, 47px at 1366px and 4px at 1280px.

`/sources` renders no rail, so its shell declares no rail track and its document
starts on that same vertical rather than centring the remainder, which put it at
222px, level with nothing.

## Breakpoints are sums

Each layout step is the width its own layout stops fitting at, written as a
range query so the boundary keeps the layout that fits there. Three tracks plus
two gaps plus two page pads is 79.5rem; two tracks plus one gap plus two pads is
67.25rem. They were 78rem and 64rem, which held each layout past its own width:
the reading column rendered at 697 to 719px from 1249 to 1271, and at 669 to
719px from 1025 to 1075, against the 720px the measure is specified at. A track
declared `minmax(0, var(--measure))` shrinks silently, so no overflow check
reported it.

The 62rem disclosure breakpoint did not move, and the wide bar was made to fit
above it instead. The bar measured 934.6px against the 913px a 993px window
leaves, so a route link wrapped and the bar stood 89px tall from 993 to 1014px.
The row gap went 1.25rem to 1rem and the route list's gap 1.4rem to 1.1rem,
which gives back 36px and fits the wide bar down to 979px.

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
