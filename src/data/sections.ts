/** The section anchors of every route that carries a contents list, as one map.
 *
 *  These arrays used to be a `const sections` in each route page's frontmatter, where nothing
 *  outside the page could read them. `/glossary`'s `first_used` check needs to assert that a
 *  term's declared anchor still exists on the route it names, and a hand-copied second list
 *  would drift silently the first time a section is renamed — which is the exact failure
 *  `first_used` exists to catch. So the rendered nav and the build-time check read the same
 *  array: they cannot disagree.
 *
 *  `/sources` is deliberately absent: it passes no `sections` prop, carries one section, and is
 *  documented as such in docs/contracts/accessibility.md.
 *
 *  `/` is absent for a different reason. Since #48 it *does* pass a `sections` prop, but a
 *  page-local array declared in its own frontmatter, not an entry here. This map's keys are the
 *  domain of `ContentRoute` below — the routes a glossary term's `first_used.route` may name —
 *  and a term whose first prose use is the front door is a category error; the front door names
 *  no term. Widening `ContentRoute` would also make the failure mode obscure: a term declaring
 *  `first_used.route: '/'` would type-check here and then `KeyError` inside
 *  `test_every_first_used_route_carries_its_term_marker`, which resolves the route through its
 *  own `_PAGE_FOR_ROUTE` dict of the three content routes. A glossary term whose first prose use
 *  is on `/` or `/sources` is a build failure, which is correct — none is.
 *
 *  Consumers: the three route pages (each passes its own slice to BaseLayout),
 *  src/pages/glossary.astro, and src/pages/index.astro, which reads only the `.length` of each
 *  route's array for its section counts. #49's index route is the next one. */

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
