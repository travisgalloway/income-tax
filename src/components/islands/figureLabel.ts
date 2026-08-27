/** Where a choice-set control's accessible name comes from (#72).
 *
 *  Four unit toggles on /government were all called "Measured in". A screen
 *  reader announces a radiogroup's name on entry, so four groups controlling
 *  four different figures were indistinguishable by name alone — and the
 *  obvious fix, typing a different string at each call site, is the wrong one.
 *  A hand-typed name can be unique and still wrong ("Measured in 2"), and a
 *  uniqueness guard would pass on it.
 *
 *  So the name is DERIVED. Every choice-set control on this site sits inside a
 *  `<figure class="figure">` whose head already renders `Figure {n}` from the
 *  manifest in `src/data/figures.ts`. Point the control at that span plus its
 *  own visible label and the name composes itself:
 *
 *      aria-labelledby="fig-net-interest-no net-interest-units"
 *                                   ->  "Figure 7 Measured in"
 *
 *  Uniqueness is INHERITED from an invariant the build already enforces rather
 *  than asserted afresh: `figures.ts` throws when a route declares a key twice,
 *  and a figure's number is its index in that route's array, so neither the key
 *  nor the number can collide within a page. Nobody invents a distinct name; a
 *  new toggle inherits one.
 *
 *  The number rather than the title, because the title is announced in full on
 *  every entry — "Net interest payments by fiscal year, FY1995 to FY2025" is
 *  twelve words in front of every visit to the control. "Figure 7" is short, is
 *  the page's own cross-reference vocabulary (#49 made figure numbers real DOM
 *  text precisely so they could be referenced), and sits visibly two lines above
 *  the control, so a sighted screen-reader user matches the two instantly.
 *
 *  An island passes its manifest KEY, not prose. That key is checked against the
 *  manifest by `figure(route, key)` at build time, and
 *  `figure_bound_name_failures` in `pipeline/tests/test_accessibility.py` proves
 *  from `dist/` that the id a control references belongs to its OWN ancestor
 *  figure — so a copy-pasted key fails a guard rather than relying on care. */

/** The id `Figure.astro` puts on a figure's number span. Written here and
 *  nowhere else: two spellings of this shape is how the reference and the
 *  referent drift apart silently, leaving a control named by nothing. */
export function figureNoId(key: string): string {
  return `fig-${key}-no`
}

/** The `aria-labelledby` token list for a control inside figure `key`, naming
 *  the figure first and the control's own visible label second. Order is the
 *  announcement order, and the figure comes first because it is what
 *  disambiguates: "Figure 7 Measured in", not "Measured in Figure 7".
 *
 *  `labelId` is the id of the control's own `.controls-label` span. It is
 *  required in spirit — a figure-only name would make the three comboboxes
 *  inside Figure 8 identical to each other — but defaults to the conventional
 *  `${key}-units` so a unit toggle need not repeat itself. */
export function labelledByFigure(key: string, labelId?: string): string {
  return `${figureNoId(key)} ${labelId ?? `${key}-units`}`
}
