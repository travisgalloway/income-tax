# Build brief: an interactive site about the US federal budget

You are building a static, interactive data site for GitHub Pages. Everything you
need is in this folder. Read this file completely before writing code.

The material already exists as a ten-slide social carousel. This is not a port of
that. The carousel had to make its argument in a fixed order with no interaction;
a site can let a reader test the argument themselves. Build for that.

---

## What this is about, in one paragraph

US federal debt passed $40 trillion in August 2026, and it doubled in ten years.
The site explains where that came from using only primary data: thirty-one years
of federal budget figures, every major deficit-moving law since 1995 with its
cost and its vote, who holds the debt, where revenue comes from, and how US taxes
compare internationally. The through-line is that the popular story — one party
did this — does not survive contact with the data. Split control covers 19 of 31
years, sixteen of the twenty-three biggest laws passed with votes from both
parties, and net interest, which nobody votes on, is 39% of all deficits.

The site's job is to let a reader check that for themselves, not to be persuaded
of it.

---

## Stack and deployment

- **Vite + React + TypeScript.** No SSR, no server, no API. GitHub Pages serves
  static files only.
- **Charts: hand-rolled SVG components** with `d3-scale` for scales and
  `d3-shape` for line and area generators. Do not add Recharts, Chart.js, or
  Plotly. The charts need precise control over axis labels, annotation placement
  and dual-panel layouts, and every charting library fights you on exactly those.
  A shared `<Chart>` primitive with margin conventions is about 150 lines and
  gives you everything.
- **No CSS framework.** Plain CSS with custom properties, one stylesheet. The
  design tokens below are the whole system.
- **Deploy via GitHub Actions** to Pages. Set `base` in `vite.config.ts` to the
  repo name (`/repo-name/`) or the build will 404 on assets — this is the single
  most common failure for Vite on Pages.
- Data files ship as static JSON in `public/data/` and are fetched at runtime, or
  imported directly if you prefer a single bundle. Either is fine; importing is
  simpler and the total payload is under 40 KB.

---

## Design tokens

Match the existing carousel exactly. These are not suggestions.

```css
--ground:   #DDE0DB;  /* page background, a cool stone */
--panel:    #F3F4F0;  /* chart plot areas */
--ink:      #11161B;
--ink-soft: #5A6268;
--rule:     #B4BAB3;

/* party, used ONLY for partisan data */
--dem: #1D4E89;  --gop: #A8322D;  --mix: #6E3FA3;

/* budget categories */
--mand: #55606B;  --disc: #3E7C86;  --int: #C77D28;

/* non-partisan series (holders, maturity, OECD) */
--domestic: #55606B;  --foreign: #93A8B3;
--public: #3E7C86;    --intragov: #C77D28;
--positive: #2E7D5B;  /* surplus, deficit reduction */
```

Type: **Bricolage Grotesque** 800 for display, **IBM Plex Sans** for body,
**IBM Plex Mono** for all numbers, axis labels, kickers and captions. Load from
Google Fonts. Numbers are always mono — this is the strongest single cue that
ties the site to the deck.

Kickers are mono, uppercase, ~11px, letter-spacing 0.16em. Body copy is sentence
case. Never use em dashes in prose.

**Do not** reuse party colours for non-partisan data. Debt holders and OECD
comparisons have no partisan content and colouring them red and blue invents a
claim the data does not make.

---

## Structure

Eleven sections, scroll-driven, each anchored so it can be linked. A persistent
thin nav rail on desktop, collapsing to a top bar on mobile.

1. **The $40 trillion** — hero. The debt series, with the ten-year doubling.
2. **Who holds it** — public vs intragovernmental, domestic vs foreign.
3. **How old is the debt** — the 30-year ceiling against the six-year average.
4. **The whole budget** — outlays stacked, revenue line, deficit below zero.
5. **The structural gap** — revenue vs outlays as a share of GDP.
6. **What Congress votes on** — mandatory vs discretionary vs interest.
7. **Net interest** — the fastest-growing line.
8. **The laws** — every major law, its cost, its vote, its enactment date.
9. **Who passed it, who signed it** — the same $16.75T sorted two ways.
10. **Where the money comes from** — revenue by source, brackets, OECD.
11. **What this cannot tell you** — the caveats, in full, not a footnote.

Section 11 is not optional and does not get collapsed behind a disclosure. It is
load-bearing.

---

## The interactions that matter

Most of these charts are static in the deck because they had to be. Pick the
handful where interaction genuinely adds something and build those well, rather
than making everything hoverable.

**Required:**

- **Unit toggle** on every dollar chart: nominal, real (FY2025 dollars), percent
  of GDP. The data files carry all three (`n_`, `r_`, `g_` prefixes). This is the
  single most valuable interaction on the site, because the choice of unit is the
  main way this subject gets distorted and letting people flip is the honest
  answer.
- **Law explorer** (section 8): a sortable, filterable table of all 23 laws.
  Filter by vote character, by signing president, by control at enactment. Sort
  by cost, date, or margin. Clicking a law highlights its enactment date on the
  deficit chart above. This is the thing a static carousel could never do.
- **Year inspection**: hovering or focusing any year in the budget chart shows a
  panel with that year's full breakdown, the control configuration, and any laws
  enacted.
- **Attribution toggle** (section 9): switch between "by the coalition that
  passed it" and "by the president who signed it." Both total $16.75T, which is
  the point.

**Explicitly do not build:** a "build your own budget" simulator, a debt clock, a
personal tax calculator, or anything with a countdown. They are all engagement
bait and they would undercut the site's credibility.

---

## Accessibility, which is a hard requirement

Every chart must be usable without sight and without a mouse.

- Each chart gets a `role="img"` and an `aria-label` giving the finding in a
  sentence, not a description of the shape. The alt text in
  `content/sections.md` is written for this; use it.
- Every data point that can be hovered must also be focusable with Tab and give
  the same information.
- Every chart has a corresponding data table, reachable via a "View as table"
  toggle. Not a hidden table for screen readers only; a real one anyone can open.
- Colour never carries meaning alone. Party is also encoded in the strip labels;
  deficit versus surplus is also encoded by sign and position.
- Respect `prefers-reduced-motion`. If you add scroll-triggered reveals, they
  must degrade to instant.
- Target contrast: body text at 4.5:1 minimum against `--ground`. `--ink-soft` on
  `--ground` passes; check anything lighter.

---

## Data integrity rules

These are the rules that keep the site defensible. Bake them into the components
so they cannot be violated by accident.

1. **Every chart renders its source.** A mono caption beneath every figure naming
   the agency, the dataset and the vintage. The `_meta.source` field in each JSON
   file has the exact string. Do not summarise it to "CBO data."
2. **Every chart labels both axes with units.** No bare numbers. `$40T`, `17.2%
   of GDP`, `71 months`.
3. **Never mix scopes without saying so.** The OECD figure (25.6% of GDP) counts
   federal, state and local. The CBO figure (17.2%) is federal only. Both appear
   in section 10. The section must state the difference in body copy, not a
   tooltip.
4. **Never mix gross and net without saying so.** Section 9's president
   breakdown is net of deficit reductions ($16.75T total). If you also show gross
   increases ($20.73T), label both.
5. **Read `_meta.notes` in every data file before charting it.** Each one
   contains at least one trap. The mandatory spending field is gross and needs
   `or` added to it. The Gini is for families, not households. The income tax
   shares exclude payroll tax.
6. **Vote composition is partly classified, not counted.** Only PL 115-97 (TCJA)
   has verified per-party splits. Everything else is classified party-line or
   cross-party from published vote character. Section 8 must say so plainly and
   section 11 repeats it. Do not render classified data in a way that implies
   precision it does not have.

---

## Copy

`content/sections.md` has, for every section: the heading, the standfirst, body
copy, the finding to lead with, alt text, and the source line. Use it. It has
been fact-checked line by line against the primary sources and the numbers in it
reconcile.

If you need copy that is not there, write it in the same register: plain, direct,
no hype, figures always with units, and never asserting causation the data does
not support. Do not write "shocking," "staggering," or "crisis."

---

## Files in this folder

```
README.md                  this brief
SOURCES.md                 every source, with vintage and known discrepancies
content/sections.md        all headings, copy, findings and alt text
data/
  budget-fy1995-2025.json      outlays, revenue, deficit, control, 23 laws
  debt-fy1995-2026.json        total debt and debt-to-GDP
  debt-holders.json            public vs intragov, domestic vs foreign
  debt-maturity.json           instrument mix and average maturity
  revenue-by-source.json       seven revenue lines, 1995 vs 2025
  income-tax-by-group.json     IRS shares by income percentile
  income-inequality-rates.json median income, Gini, top statutory rate
  oecd-tax.json                international comparison
```

Every file is `{"_meta": {...}, "data": ...}`. The meta block carries title,
source, units, field definitions and notes. Surface `_meta.source` in the UI.

---

## Suggested order of work

1. Scaffold Vite + React + TS, set `base`, get a blank page deploying to Pages
   via Actions. Confirm the deploy works before building anything.
2. Build the `<Chart>` primitive, the axis components and the unit toggle. Get
   one chart right end to end, including its table view and keyboard navigation.
3. Sections 1, 4 and 8, which carry the argument. If the site shipped with only
   these three it would still be worth reading.
4. Everything else.
5. Section 11, in full.
6. An accessibility pass with keyboard only and a screen reader before you call
   it done.

## What "done" looks like

A reader can land on the site, flip any chart between nominal dollars and share
of GDP, filter the law table to just the party-line votes, see that they total
$7.5T against $9.24T for the bipartisan ones, open the underlying table, find the
CBO vintage in the caption, and leave understanding why the simple version of
this story is wrong. Without a mouse, if they need to.
