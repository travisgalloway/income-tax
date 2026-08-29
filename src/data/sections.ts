/** The section anchors of every route that carries a contents list, as one map.
 *
 *  These arrays used to be a `const sections` in each route page's frontmatter, where nothing
 *  outside the page could read them. `/glossary`'s `first_used` check needs to assert that a
 *  term's declared anchor still exists on the route it names, and a hand-copied second list
 *  would drift silently the first time a section is renamed, which is the exact failure
 *  `first_used` exists to catch. So the rendered nav and the build-time check read the same
 *  array: they cannot disagree.
 *
 *  `/sources` is deliberately absent: it passes no `sections` prop, carries one section, and is
 *  documented as such in docs/contracts/accessibility.md.
 *
 *  `/` is absent for a different reason. Its four sections live in `introSections` below, not as
 *  an entry in this map, and since #49 they are lifted out of the page's own frontmatter so
 *  `/contents` reads the same array the front door renders. They stay out of `routeSections`
 *  because this map's keys are the domain of `ContentRoute` below, the routes a glossary term's
 *  `first_used.route` may name, and a term whose first prose use is the front door is a category
 *  error; the front door names no term. Widening `ContentRoute` would also make the failure mode
 *  obscure: a term declaring `first_used.route: '/'` would type-check here and then `KeyError`
 *  inside `test_every_first_used_route_carries_its_term_marker`, which resolves the route through
 *  its own `_PAGE_FOR_ROUTE` dict of the three content routes. A glossary term whose first prose
 *  use is on `/` or `/sources` is a build failure, which is correct, none is.
 *
 *  Consumers: the three route pages (each passes its own slice to BaseLayout),
 *  src/pages/glossary.astro, src/pages/index.astro, src/data/figures.ts (which checks every
 *  figure's declared section against the route that renders it), and src/pages/contents.astro,
 *  which enumerates the whole site from `siteRoutes` below. */

export interface RouteSection {
  id: string
  label: string
}

export const routeSections = {
  '/economy': [
    { id: 'one-picture', label: 'One picture' },
    { id: 'growth-shadow', label: 'Growth and its shadow' },
    { id: 'who-works', label: 'Who works' },
    { id: 'prices-rates', label: 'Prices and rates' },
    { id: 'labor-capital', label: 'Labor and capital' },
    { id: 'limits', label: 'Limits' },
  ],
  '/households': [
    { id: 'what-a-household-earns', label: 'What a household earns' },
    { id: 'the-spread', label: 'The spread' },
    { id: 'a-century-of-brackets', label: 'A century of brackets' },
    { id: 'statutory-vs-effective', label: 'Statutory is not effective' },
    { id: 'who-pays', label: 'Who pays the income tax' },
    { id: 'the-bill-you-do-not-see', label: 'The bill you do not see' },
    { id: 'limits', label: 'Limits' },
  ],
  '/government': [
    { id: 'forty-trillion', label: 'The $40 trillion' },
    { id: 'who-holds-it', label: 'Who holds it' },
    { id: 'how-old', label: 'How old is the debt' },
    { id: 'whole-budget', label: 'The whole budget' },
    { id: 'structural-gap', label: 'The structural gap' },
    { id: 'what-congress-votes-on', label: 'What Congress votes on' },
    { id: 'net-interest', label: 'Net interest' },
    { id: 'the-laws', label: 'The laws' },
    { id: 'passed-signed', label: 'Who passed it, who signed it' },
    { id: 'where-money-comes-from', label: 'Where the money comes from' },
    { id: 'by-state', label: 'By state' },
    { id: 'limits', label: 'What this cannot tell you' },
  ],
} satisfies Record<string, RouteSection[]>

/** The routes a glossary term's `first_used.route` may name. */
export type ContentRoute = keyof typeof routeSections

/** The four sections of `/`. Moved here verbatim from `src/pages/index.astro` by #49, for the
 *  reason the header gives: the front door renders these, and `/contents` lists them, and a
 *  hand-copied second list is exactly the drift this module exists to make impossible. See the
 *  header for why they are not an entry in `routeSections`. */
export const introSections: RouteSection[] = [
  { id: 'what-this-is', label: 'What this site is' },
  { id: 'where-to-start', label: 'Where to start' },
  { id: 'how-to-read-a-figure', label: 'How to read a figure' },
  { id: 'where-the-numbers-come-from', label: 'Where the numbers come from' },
]

/** The base-path join, moved verbatim out of `BaseLayout.astro` by #49 so there is exactly one
 *  implementation of it. Every internal href on the site is built from this: the site is served
 *  from `/income-tax/`, and an href that skips the base resolves to a 404 in production while
 *  working fine in `astro dev`, which is how #70 reached production. A page full of derived links
 * , `/contents`, is precisely where a third private copy of this expression would be worst. */
const base = import.meta.env.BASE_URL
export const join = (p: string) =>
  `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`.replace(/\/$/, '') || '/'

export interface SiteRoute {
  /** Unbased path, e.g. `/economy`. Pass through `join` before rendering it as an href. */
  path: string
  label: string
  /** The route's own section anchors, in document order. Empty where a route passes no
   *  `sections` prop to BaseLayout. */
  sections: RouteSection[]
}

/** Every destination the site names, in rail order: the front door, the three routes that carry
 *  the argument, then the three reference pages. The rail and the narrow-viewport navbar both map
 *  this one array, so a route added here appears in both, and `/contents` derives its whole
 *  outline from it rather than from a list of its own.
 *
 *  `/sources` and `/glossary` declare no sections because neither passes a `sections` prop:
 *  `/sources` carries one section, and `/glossary`'s real structure is its terms, which
 *  `/contents` enumerates term by term rather than as letter groups. */
export const siteRoutes: SiteRoute[] = [
  { path: '/', label: 'Introduction', sections: introSections },
  { path: '/economy', label: 'Economy', sections: routeSections['/economy'] },
  { path: '/households', label: 'Households', sections: routeSections['/households'] },
  { path: '/government', label: 'Government', sections: routeSections['/government'] },
  { path: '/contents', label: 'Contents', sections: [] },
  { path: '/sources', label: 'Sources', sections: [] },
  { path: '/glossary', label: 'Glossary', sections: [] },
]
