# Design notes: colour

## Scope

This note proposes a replacement palette for the site, in a light mode and a dark
mode. The proposal lives in `src/styles/design-next-color.css`, scoped under
`.dn`. `src/styles/tokens.css` and `src/styles/global.css` are unchanged. Nothing
here alters a shipped colour until a separate change adopts it.

The 13 semantic data tokens keep their meanings exactly. `--dem`, `--gop` and
`--mix` still carry partisan data and nothing else. `--mand`, `--disc` and `--int`
still carry the three budget categories. `--domestic`, `--foreign`, `--public`,
`--intragov` and `--positive` still carry non-partisan series. The seven `--rev-*`
tokens still carry the revenue sources. Only the hex values move.

## Reference values and where they came from

The Financial Times values quoted in this note were read from the Origami package
`@financial-times/o-colors`, version 6.7.1, file `src/scss/_palette.scss`. That
file records paper `#FFF1E5`, oxford `#0F5499`, claret `#990F3D`, teal `#0D7680`,
slate `#262A33` and velvet `#593380`. The package was downloaded and read
directly, and no secondary listing supplied a value.

Two of those values enter the proposal unchanged. Oxford blue becomes `--dem` and
claret becomes `--gop`. Teal becomes `--disc` and `--public`. Velvet was rejected
for the reason recorded under "Colour-vision separation" below.

## Method

Every ratio in this note was computed by script, using the WCAG 2.1
relative-luminance formula. The same formula runs inside
`src/components/design/Swatches.astro`, so the rendered swatch labels are computed
at build time rather than typed in.

Colour-vision separations were measured with the `dataviz` skill validator,
`scripts/validate_palette.js`. Its distances are Euclidean in OKLab, multiplied by
100. It simulates protanopia and deuteranopia with the Machado-Oliveira-Fernandes
2009 model at severity 1.0. Its target for an adjacent pair is 8, and its floor
is 6. Its normal-vision floor for the same pair is 15.

## The proposed ground

The page ground moves from a cool stone `#DDE0DB` to a warm paper `#EDE5D9`. The
new ground sits one step deeper than FT paper `#FFF1E5`, so it reads as stock
rather than as white. The plot panel moves from `#F3F4F0` to `#F2EBE1`.

The warm ground is also lighter, and the extra lightness pays for the
accessibility work.

The panel-to-ground separation narrows to 1.06:1, from 1.21:1 today. The panel
first went to `#FDFAF5`, which held the old separation at 1.20:1 and sat within
1.05:1 of white. Against warm paper that value read as a bright card rather
than as a plot area, so a second pass moved it to `#F2EBE1`. A statistical
publication prints the plot area at the paper colour or a shade off it. The
dark panel moved the same way, from `#1F1B16` to `#1C1914`, and its separation
narrows to 1.06:1 from 1.08:1.

The two surfaces are not made identical, because three islands draw no gridline
and no axis line. `DebtMaturity`, `DebtHolders` and `WhoPays` state the plot
rectangle with the `--panel` fill alone. At 1.06:1 that rectangle still reads.

Six series tokens score under 3:1 against the current panel. Every series token in
the proposal clears 3:1 against both proposed surfaces, in both modes. The gain
comes from the lighter ground, which allowed each hue to move darker without
losing its identity.

## Proposed light palette

Table 1 lists every token, its current value, its proposed value, and its measured
contrast against the two proposed surfaces. Role and threshold follow
`docs/contracts/accessibility.md`, which holds text at 4.5:1 and a graphical
object at 3:1. The verdict column reports the weaker of the two ratios.

**Table 1. Proposed light palette, against ground `#EDE5D9` and panel `#F2EBE1`.**
Ratios are WCAG 2.1 contrast, computed from the hex values in this table.

| Token | Current | Proposed | vs ground | vs panel | Role | Verdict |
|---|---|---|---|---|---|---|
| `--ground` | `#DDE0DB` | `#EDE5D9` | 1.00 | 1.06 | surface | no threshold |
| `--panel` | `#F3F4F0` | `#F2EBE1` | 1.06 | 1.00 | surface | no threshold |
| `--ink` | `#11161B` | `#14181D` | 14.27 | 15.06 | text | passes 4.5:1 |
| `--ink-soft` | `#5A6268` | `#57534B` | 6.13 | 6.47 | text | passes 4.5:1 |
| `--rule` | `#B4BAB3` | `#857E72` | 3.22 | 3.40 | rule | passes 3:1 |
| `--dem` | `#1D4E89` | `#0F5499` | 6.12 | 6.46 | series | passes 3:1 |
| `--gop` | `#A8322D` | `#990F3D` | 6.75 | 7.13 | series | passes 3:1 |
| `--mix` | `#6E3FA3` | `#421A5C` | 10.96 | 11.57 | series | passes 3:1 |
| `--mand` | `#55606B` | `#37434F` | 8.09 | 8.54 | series | passes 3:1 |
| `--disc` | `#3E7C86` | `#0D7680` | 4.29 | 4.53 | series | passes 3:1 |
| `--int` | `#C77D28` | `#A85C11` | 4.00 | 4.22 | series | passes 3:1 |
| `--domestic` | `#55606B` | `#37434F` | 8.09 | 8.54 | series | passes 3:1 |
| `--foreign` | `#93A8B3` | `#647E9C` | 3.36 | 3.54 | series | passes 3:1 |
| `--public` | `#3E7C86` | `#0D7680` | 4.29 | 4.53 | series | passes 3:1 |
| `--intragov` | `#C77D28` | `#A85C11` | 4.00 | 4.22 | series | passes 3:1 |
| `--positive` | `#2E7D5B` | `#1E7A4B` | 4.27 | 4.50 | series | passes 3:1 |
| `--band` | `#C9CCC3` | `#DCD3C6` | 1.19 | 1.25 | rule | below 3:1 |
| `--rev-ii` | `#3E7C86` | `#0D7680` | 4.29 | 4.53 | series | passes 3:1 |
| `--rev-pr` | `#C77D28` | `#A85C11` | 4.00 | 4.22 | series | passes 3:1 |
| `--rev-ci` | `#55606B` | `#37434F` | 8.09 | 8.54 | series | passes 3:1 |
| `--rev-ex` | `#93A8B3` | `#647E9C` | 3.36 | 3.54 | series | passes 3:1 |
| `--rev-cu` | `#263038` | `#1B2026` | 13.12 | 13.85 | series | passes 3:1 |
| `--rev-eg` | `#A8895A` | `#6E4D22` | 6.12 | 6.46 | series | passes 3:1 |
| `--rev-mi` | `#B7BDB0` | `#807F78` | 3.22 | 3.40 | series | passes 3:1 |

## Proposed dark palette

Table 2 lists the dark values. The site has never had a dark mode, so no current
column applies. No value here is an inversion of its light counterpart. Each hue
was re-stepped for the dark ground and measured as a set.

Two tokens change their position in the lightness order. `--mand` and its shared
partners `--domestic` and `--rev-ci` become the lightest marks in their groups.
`--rev-cu` becomes a light warm cream. A near-black band would be invisible on a
near-black ground.

**Table 2. Proposed dark palette, against ground `#16130F` and panel `#1C1914`.**
Ratios are WCAG 2.1 contrast, computed from the hex values in this table.

| Token | Proposed | vs ground | vs panel | Role | Verdict |
|---|---|---|---|---|---|
| `--ground` | `#16130F` | 1.00 | 1.06 | surface | no threshold |
| `--panel` | `#1C1914` | 1.06 | 1.00 | surface | no threshold |
| `--ink` | `#EDE5D9` | 14.82 | 14.03 | text | passes 4.5:1 |
| `--ink-soft` | `#A79E90` | 7.00 | 6.62 | text | passes 4.5:1 |
| `--rule` | `#786D5C` | 3.65 | 3.45 | rule | passes 3:1 |
| `--dem` | `#6FA8E8` | 7.44 | 7.04 | series | passes 3:1 |
| `--gop` | `#E8798D` | 6.66 | 6.30 | series | passes 3:1 |
| `--mix` | `#8E6BC8` | 4.49 | 4.24 | series | passes 3:1 |
| `--mand` | `#C4CBD2` | 11.30 | 10.70 | series | passes 3:1 |
| `--disc` | `#3FA9B4` | 6.65 | 6.30 | series | passes 3:1 |
| `--int` | `#DB9440` | 7.34 | 6.94 | series | passes 3:1 |
| `--domestic` | `#C4CBD2` | 11.30 | 10.70 | series | passes 3:1 |
| `--foreign` | `#5F7A8A` | 4.09 | 3.87 | series | passes 3:1 |
| `--public` | `#3FA9B4` | 6.65 | 6.30 | series | passes 3:1 |
| `--intragov` | `#DB9440` | 7.34 | 6.94 | series | passes 3:1 |
| `--positive` | `#4FB27F` | 7.06 | 6.68 | series | passes 3:1 |
| `--band` | `#2B251D` | 1.22 | 1.16 | rule | below 3:1 |
| `--rev-ii` | `#3FA9B4` | 6.65 | 6.30 | series | passes 3:1 |
| `--rev-pr` | `#DB9440` | 7.34 | 6.94 | series | passes 3:1 |
| `--rev-ci` | `#C4CBD2` | 11.30 | 10.70 | series | passes 3:1 |
| `--rev-ex` | `#5F7A8A` | 4.09 | 3.87 | series | passes 3:1 |
| `--rev-cu` | `#E8D2A8` | 12.53 | 11.86 | series | passes 3:1 |
| `--rev-eg` | `#BE9660` | 6.81 | 6.44 | series | passes 3:1 |
| `--rev-mi` | `#726F66` | 3.69 | 3.49 | series | passes 3:1 |

## Tokens that fail a contrast threshold

One token fails a threshold, in both modes. `--band` measures 1.19:1 against the
light ground and 1.22:1 against the dark ground. The token shades crisis and
pandemic spans, and it never carries a party or category meaning. The current
palette treats it the same way, and `docs/contracts/accessibility.md` records it
as `role: rule` for that reason.

No series token falls below 3:1 in either mode. The proposal therefore retires
seven `redundant-encoding:` notes from the contract's token table. Those notes
cover `--int`, `--intragov`, `--foreign`, `--rev-pr`, `--rev-ex`, `--rev-eg` and
`--rev-mi`. They exist because the current values score between 1.44:1 and 2.97:1
against `--panel`.

`--rule` moves from 1.48:1 to 3.22:1. The old value is faint enough to disappear
on a bright screen. The new value clears the 3:1 threshold for a graphical object,
so a hairline reads as a real boundary.

## Colour-vision separation

Table 3 reports the worst pair in each chart grouping, under simulated protanopia
or deuteranopia and again under unsimulated vision. Distances are OKLab multiplied
by 100. The party row uses the all-pairs test. The three party colours can sit side
by side in a legend and in a scatter.

**Table 3. Worst pair per grouping, OKLab distance multiplied by 100.**
Simulation model is Machado-Oliveira-Fernandes 2009 at severity 1.0. The
colour-vision floor is 6 and the target is 8. The normal-vision floor is 15.

| Grouping | Current, worst CVD | Current, worst normal | Proposed light, worst CVD | Proposed light, worst normal | Proposed dark, worst CVD | Proposed dark, worst normal |
|---|---|---|---|---|---|---|
| Party, all pairs | 4.9 | 12.6 | 11.3 | 17.5 | 11.5 | 15.6 |
| Budget stack | 6.5 | 8.3 | 13.7 | 15.7 | 12.9 | 18.2 |
| Holders pair | 14.6 | 21.6 | 13.7 | 20.7 | 15.0 | 21.6 |
| Origin pair | 23.5 | 23.6 | 20.7 | 20.9 | 26.6 | 27.6 |
| Revenue stack | 14.6 | 15.5 | 13.7 | 16.2 | 15.0 | 17.3 |

Two current failures drove two of the value changes. `--mix` at `#6E3FA3` sits
4.9 from `--dem` under protanopia, below the floor of 6. A reader with protanopia
therefore cannot separate the mixed-control band from the Democratic band. FT
velvet `#593380` measures worse still, at 3.2 under deuteranopia. The proposal
moves `--mix` to a deep aubergine `#421A5C`. The new value sits a clear lightness
step below both party hues, and lifts the worst party pair to 11.3.

`--disc` at `#3E7C86` sits 6.5 from `--mand` under deuteranopia and 8.3 under
unsimulated vision. Both readings are below the normal-vision floor of 15. The
proposal darkens `--mand` to `#37434F` and adopts FT teal `#0D7680` for `--disc`.
Those two moves lift the worst budget pair to 13.7 simulated and 15.7
unsimulated.

## Pairs that still need a redundant encoding channel

Table 4 lists every within-group pair that measures below the normal-vision floor
of 15. Exactly one of these pairs registers as a stacking neighbour, and the
token listing order produced that reading. The non-partisan tokens form two
separate charts. Those are holders (`--public` against `--intragov`) and origin
(`--domestic` against `--foreign`). `--foreign` and `--public` therefore never
share a plot.

Each pair below needs a channel other than colour. The site already supplies one.
`docs/contracts/accessibility.md` requires a `<TableView>` column for every
category an island paints, and `test_no_island_encodes_a_category_only_in_colour`
enforces it. Direct labels on the stack bands supply a second channel.

**Table 4. Within-group pairs below the normal-vision floor of 15.**
Distances are OKLab multiplied by 100, unsimulated vision.

| Mode | Grouping | Pair | Distance | Share a plot |
|---|---|---|---|---|
| Light | Non-partisan | `--foreign` / `--public` | 9.1 | no |
| Light | Non-partisan | `--public` / `--positive` | 8.7 | no |
| Light | Non-partisan | `--foreign` / `--positive` | 14.8 | no |
| Light | Revenue | `--rev-ex` / `--rev-mi` | 6.6 | yes, non-adjacent |
| Light | Revenue | `--rev-ii` / `--rev-ex` | 9.1 | yes, non-adjacent |
| Light | Revenue | `--rev-ii` / `--rev-mi` | 11.8 | yes, non-adjacent |
| Light | Revenue | `--rev-pr` / `--rev-eg` | 12.0 | yes, non-adjacent |
| Light | Revenue | `--rev-ci` / `--rev-eg` | 12.2 | yes, non-adjacent |
| Light | Revenue | `--rev-pr` / `--rev-mi` | 12.7 | yes, non-adjacent |
| Light | Revenue | `--rev-ci` / `--rev-cu` | 13.7 | yes, non-adjacent |
| Dark | Non-partisan | `--public` / `--positive` | 8.9 | no |
| Dark | Non-partisan | `--foreign` / `--public` | 13.2 | no |
| Dark | Revenue | `--rev-pr` / `--rev-eg` | 5.2 | yes, non-adjacent |
| Dark | Revenue | `--rev-ex` / `--rev-mi` | 5.7 | yes, non-adjacent |
| Dark | Revenue | `--rev-ci` / `--rev-cu` | 8.0 | yes, non-adjacent |
| Dark | Revenue | `--rev-ii` / `--rev-ex` | 13.2 | yes, non-adjacent |

The revenue stack carries seven bands, and seven distinguishable hues do not fit
inside one register at one contrast floor. The `dataviz` skill states the same
limit and caps an all-pairs form at three series. The stack keeps seven bands
because the data has seven sources. The table column and the direct label
therefore carry the identity for the pairs above.

## Dark-mode mechanism

The dark palette follows `satnaing/astro-paper`. A `data-theme` attribute selects
the palette, and a media query supplies the operating-system default. Both live in
`src/styles/design-next-color.css`.

The media block is written as
`:where(:root:not([data-theme='light'])) .dn:not([data-theme='light'])`. The
`:where()` wrapper holds the root part at zero specificity. The two
`:not([data-theme='light'])` guards let an explicit light choice win on an
operating system set to dark. The attribute block
`.dn[data-theme='dark'], :root[data-theme='dark'] .dn` follows the media block. An
explicit dark choice therefore wins on an operating system set to light.

Each block also sets `color-scheme`, so form controls, scrollbars and the
browser's own surfaces follow the palette.

## Deviations from the `dataviz` skill

Two of the skill's six categorical checks fail on this palette by intent. This
note records both failures, and neither one was corrected. The first is the chroma
floor of 0.10 in OKLCH. The proposal holds 11 distinct data values per mode. Six
of the 11 sit below the floor in each mode. The publication uses near-neutral
greys where a series carries no partisan or directional meaning. In light mode
`--mand` measures 0.026 and `--rev-mi` measures 0.010.

The second is the lightness band. The skill sets it at 0.43 to 0.77 in light mode
and at 0.48 to 0.67 in dark mode. In light mode three values fall below the band,
`--mix` at 0.313, `--mand` at 0.377 and `--rev-cu` at 0.241. Each of the three was
pushed darker for one of two reasons. The move bought contrast against the light
paper ground, or separation from a neighbour under simulated colour vision.

In dark mode eight of the 11 values sit above the band. They run from `--disc` at
0.679 to `--rev-cu` at 0.872. The dark ground at `#16130F` is darker than the
surface the skill assumes. A lighter mark therefore gains contrast on it. The
trade in both modes favours the measured numbers in Tables 1, 2 and 3.

The skill's remaining four checks pass on every grouping in both modes. Those are
the fixed hue order, the colour-vision separation, the normal-vision floor and the
contrast against the surface.
