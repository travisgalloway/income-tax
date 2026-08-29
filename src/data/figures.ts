/** Every numbered figure on the site, declared once, in the order its route renders them.
 *
 *  Why this file exists (#49). A figure's number used to be a pure CSS counter, `counter-reset`
 *  on `main`, `counter-increment` on `.figure`, `content: 'Figure ' counter(figure)` on
 *  `.figure-head::before`. That number lived only in the rendered layout: it was absent from the
 *  DOM, from `dist/`, and from anything another page could read, so an index of the site's figures
 *  could not name one. The counter is retired; `n` below is the number, resolved at build time,
 *  and `Figure.astro` renders it as real text.
 *
 *  This is deliberately **not** a second list beside the pages. The call sites themselves consume
 *  it, each `<Figure fig={fig('key')}>` takes its title, source and vintage from here, so
 *  `/contents` and the route it indexes read the same entry. A manifest only the index read would
 *  be a hand-maintained copy that drifts the first time a figure is added, silently, which is the
 *  exact failure `src/data/sections.ts` exists to prevent for section anchors.
 *
 *  Why a manifest rather than parsing the `.astro` call sites: `source` is a JS expression, not a
 *  literal. A parser would recover `{debt._meta.source}` and not the sentence a reader must see.
 *  Here the expression is the same one the call site used, moved rather than retyped, so "the
 *  source is rendered verbatim" holds by construction and `assertDataset` in `src/data/index.ts`
 *  still stands behind every one of them.
 *
 *  `ariaLabel`, `xUnit`, `yUnit` and `note` deliberately stay at the call site: they belong beside
 *  the chart, no consumer outside the page reads them, and moving them would double the diff for
 *  nothing. */

import {
  bracketHistory,
  budget,
  cboEffectiveRates,
  debt,
  debtHolders,
  debtMaturity,
  economy,
  income,
  incomeGroups,
  mixedVintage,
  oecd,
  revenue,
  statesBalance,
  statesTaxMix,
  vintageOf,
} from './index'
import { routeSections, type ContentRoute } from './sections'
import {
  citationFormsOf,
  citesOf,
  sourceLinks,
  type SourceLink,
} from './source-register'

export interface FigureDecl {
  /** Stable handle the call site names this figure by. Unique within its route. */
  key: string
  /** The `id` of the section this figure renders inside, an id in `routeSections[route]`. */
  section: string
  /** Short italic title beside the figure number. */
  title: string
  /** `_meta.source`, VERBATIM. Never summarised to "CBO data". */
  source: string
  /** The published OUTPUTS this figure draws from, `pipeline/curated/sources.yaml` `outputs:`
   *  keys, not register keys. The register turns them into the source keys the output's own
   *  `_meta.source` names, so the links under a caption cannot become a second hand-kept list
   *  beside the sentence they are supposed to be links FOR. `build()` proves the two agree. */
  cites: string[]
  /** Optional vintage or retrieval stamp, appended to the source line as its own sentence. */
  vintage?: string | null
}

export interface FigureEntry extends FigureDecl {
  route: ContentRoute
  /** 1-based within its route. Numbering restarts per route, as the CSS counter did. */
  n: number
  /** Source and vintage composed into the one line both the figure and the index render. */
  sourceLine: string
  /** The same citations, followable (#57). Rendered BENEATH the verbatim line, never instead of
   *  it. `/contents` deliberately does not render these, it is an index, and each entry already
   *  links to the figure itself (#49 owns that page). */
  sources: SourceLink[]
}

/** The source string is rendered verbatim, so the vintage is appended as its own sentence rather
 *  than run onto the end of it. Moved out of `Figure.astro` so the figure and `/contents` compose
 *  the line identically instead of nearly identically. */
export function sourceLineOf(source: string, vintage?: string | null): string {
  return vintage ? `${source.replace(/[.\s]*$/, '')}. ${vintage}` : source
}

const declared = {
  '/economy': [
    {
      key: 'real-gdp',
      section: 'one-picture',
      title: 'Real GDP, fiscal 1950 to 2036, log scale',
      source: economy._meta.source,
      cites: ['economy'],
      vintage: vintageOf(economy._meta),
    },
    {
      key: 'growth-shadow',
      section: 'growth-shadow',
      title: 'Output per hour and real median household income, 1984 to 2024, indexed',
      source: `Output per hour: ${economy._meta.source}. Median household income: ${income._meta.source}`,
      cites: ['economy', 'income_inequality'],
      vintage: vintageOf(economy._meta),
    },
    {
      key: 'who-works',
      section: 'who-works',
      title: 'Unemployment, the noncyclical rate and labour force participation, fiscal 1950 to 2036',
      source: economy._meta.source,
      cites: ['economy'],
      vintage: vintageOf(economy._meta),
    },
    {
      key: 'prices-rates',
      section: 'prices-rates',
      title: 'Inflation and interest rates, fiscal 1950 to 2036',
      source: economy._meta.source,
      cites: ['economy'],
      vintage: vintageOf(economy._meta),
    },
    {
      key: 'labor-capital',
      section: 'labor-capital',
      title: 'Wages and salaries against corporate profits, fiscal 1950 to 2036',
      source: economy._meta.source,
      cites: ['economy'],
      vintage: vintageOf(economy._meta),
    },
  ],
  '/households': [
    {
      key: 'median-income',
      section: 'what-a-household-earns',
      title: 'Real median household income, 1984 to 2024',
      source: income._meta.source,
      cites: ['income_inequality'],
      vintage: vintageOf(income._meta),
    },
    {
      key: 'the-spread',
      section: 'the-spread',
      title: 'Family Gini index, 1947 to 2024, and the CBO top 1% income share',
      source: `Family Gini index: ${income._meta.source} Top 1% share: ${incomeGroups._meta.source}`,
      cites: ['income_inequality', 'income_tax_by_group'],
      vintage: vintageOf(income._meta),
    },
    {
      key: 'bracket-history',
      section: 'a-century-of-brackets',
      title: 'Bracket count, top-bracket threshold and top statutory rate, 1913-2025',
      source: bracketHistory._meta.source,
      cites: ['bracket_history'],
      vintage: vintageOf(bracketHistory._meta),
    },
    {
      key: 'statutory-vs-effective',
      section: 'statutory-vs-effective',
      title: 'Top statutory rate against CBO average federal tax rates by income group, 1979-2022',
      source: `${bracketHistory._meta.source}. ${cboEffectiveRates._meta.source}.`,
      cites: ['bracket_history', 'cbo_effective_rates'],
    },
    {
      key: 'who-pays',
      section: 'who-pays',
      title:
        'Share of AGI and share of federal individual income tax paid, by income percentile group, tax year 2023',
      source: incomeGroups._meta.source,
      cites: ['income_tax_by_group'],
      vintage: vintageOf(incomeGroups._meta),
    },
    {
      key: 'top1-share',
      section: 'who-pays',
      title: 'Share of federal individual income tax paid by the top 1%, published years only',
      source: incomeGroups._meta.source,
      cites: ['income_tax_by_group'],
      vintage: vintageOf(incomeGroups._meta),
    },
    {
      key: 'payroll-bill',
      section: 'the-bill-you-do-not-see',
      title:
        'Payroll tax and individual income tax, share of GDP and share of total revenue, FY1962-FY2025',
      source: revenue._meta.source,
      cites: ['revenue_sources'],
      vintage: vintageOf(revenue._meta),
    },
  ],
  '/government': [
    {
      key: 'debt',
      section: 'forty-trillion',
      title: 'Total public debt outstanding at fiscal year end, 1995 to 2026',
      source: debt._meta.source,
      cites: ['debt'],
      vintage: vintageOf(debt._meta),
    },
    {
      key: 'debt-holders',
      section: 'who-holds-it',
      title: 'Who holds the federal debt, 7 August 2026',
      source: debtHolders._meta.source,
      cites: ['debt_holders'],
      vintage: mixedVintage(debtHolders._meta, debtHolders.data.as_of),
    },
    {
      key: 'debt-maturity',
      section: 'how-old',
      title: 'Maturity structure of marketable Treasury debt, June 2026',
      source: debtMaturity._meta.source,
      cites: ['debt_maturity'],
      vintage: mixedVintage(debtMaturity._meta, debtMaturity.data.avg_maturity_as_of, {
        fetched: 'Treasury Monthly Statement of the Public Debt',
        curated: 'Joint Economic Committee monthly debt update',
        curatedAs: 'month',
      }),
    },
    {
      key: 'whole-budget',
      section: 'whole-budget',
      title: 'Federal outlays, revenue and the deficit, fiscal 1962 to 2025',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'structural-gap',
      section: 'structural-gap',
      title: 'Federal revenue and outlays by fiscal year, FY1995 to FY2025',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'voted-and-not',
      section: 'what-congress-votes-on',
      title: 'Mandatory, discretionary and net interest spending by fiscal year, FY1995 to FY2025',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'net-interest',
      section: 'net-interest',
      title: 'Net interest payments by fiscal year, FY1995 to FY2025',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'law-explorer',
      section: 'the-laws',
      title: 'Major deficit-moving laws, 1997 to 2025, against the annual deficit',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'attribution',
      section: 'passed-signed',
      title:
        'Net ten-year legislative cost by voting coalition and by signing president, laws enacted 1995 to 2025',
      source: budget._meta.source,
      cites: ['budget'],
      vintage: vintageOf(budget._meta),
    },
    {
      key: 'revenue',
      section: 'where-money-comes-from',
      title: 'Federal revenue by source, fiscal 1962 to fiscal 2025',
      source: revenue._meta.source,
      cites: ['revenue_sources'],
      vintage: vintageOf(revenue._meta),
    },
    {
      key: 'oecd',
      section: 'where-money-comes-from',
      title: 'Total tax revenue as a share of GDP, OECD comparison, 2024',
      source: oecd._meta.source,
      cites: ['oecd'],
      vintage: vintageOf(oecd._meta),
    },
    {
      key: 'state-give-get',
      section: 'by-state',
      title: 'What each state gives the federal government and gets back, FY2025',
      source: statesBalance._meta.source,
      cites: ['states_balance'],
      vintage: vintageOf(statesBalance._meta),
    },
    {
      key: 'state-tax-mix',
      section: 'by-state',
      title: "State tax collections by category, as a share of each state's own total",
      source: statesTaxMix._meta.source,
      cites: ['states_tax_mix'],
      vintage: vintageOf(statesTaxMix._meta),
    },
  ],
} satisfies Record<ContentRoute, FigureDecl[]>

/** Five throws at module load, in the spirit of `glossary.astro`'s five: a manifest that has
 *  silently drifted from the pages renders an index that looks right and is wrong, which is worse
 *  than a build failure with a name on it.
 *
 *  The fifth is #57's, and it is rule A at figure granularity. `cites` names the outputs a figure
 *  draws from, and the links under its caption are resolved from those outputs' register entries.
 *  A hand-declared key list beside a hand-composed sentence is exactly the drift
 *  `content-sources.md` forbids, the links would go on pointing at CBO after the caption moved to
 *  Treasury, and nothing would say so. So every register key a figure's `cites` resolves to must
 *  be NAMED, in one of its registered `cited_as` forms, in that figure's own source string. */
function build(): Record<ContentRoute, FigureEntry[]> {
  const out = {} as Record<ContentRoute, FigureEntry[]>
  for (const route of Object.keys(declared) as ContentRoute[]) {
    const decls: FigureDecl[] = declared[route]
    const seen = new Set<string>()
    const sectionIds = routeSections[route].map((s) => s.id)
    let lastSectionIndex = -1

    out[route] = decls.map((d, i) => {
      if (seen.has(d.key)) {
        throw new Error(
          `Figure manifest: ${route} declares the key "${d.key}" twice. Keys are how a call site names its figure, so a duplicate makes one of the two unreachable.`
        )
      }
      seen.add(d.key)

      if (!d.title?.trim() || !d.source?.trim()) {
        throw new Error(
          `Figure manifest: ${route} figure "${d.key}" is missing a title or a source. Both are required and the source is rendered verbatim.`
        )
      }

      const sectionIndex = sectionIds.indexOf(d.section)
      if (sectionIndex === -1) {
        throw new Error(
          `Figure manifest: ${route} figure "${d.key}" declares section "${d.section}", and ${route} has no section with that id. Fix the section, or it was renamed — see src/data/sections.ts.`
        )
      }
      if (sectionIndex < lastSectionIndex) {
        throw new Error(
          `Figure manifest: ${route} figure "${d.key}" is declared in section "${d.section}", which renders before the section of the figure declared above it. The manifest's order is the figure numbering, so it must not contradict the order the route renders its sections in.`
        )
      }
      lastSectionIndex = sectionIndex

      const keys = [...new Set(d.cites.flatMap((output) => citesOf(output)))]
      for (const key of keys) {
        const forms = citationFormsOf(key)
        if (!forms.some((form) => d.source.includes(form))) {
          throw new Error(
            `Figure manifest: ${route} figure "${d.key}" cites ${d.cites.join(', ')}, which the register resolves to the source "${key}" — and no form of that citation (${forms.join(' / ')}) appears in the figure's own source line. Either the source line moved and cites did not, or cites names an output this figure does not draw from. A caption whose links point somewhere its sentence does not is the drift #57 exists to prevent.`
          )
        }
      }

      return {
        ...d,
        route,
        n: i + 1,
        sourceLine: sourceLineOf(d.source, d.vintage),
        sources: sourceLinks(keys),
      }
    })
  }
  return out
}

/** Every figure, by route, in rendered order. `n` is the array index + 1, so a duplicated or
 *  skipped figure number is not expressible. */
export const routeFigures: Record<ContentRoute, FigureEntry[]> = build()

/** Look one up. Throws rather than returning `undefined`: a call site naming a key that does not
 *  exist is a typo, and a figure that renders with no number and no source is the failure the
 *  whole apparatus exists to prevent. */
export function figure(route: ContentRoute, key: string): FigureEntry {
  const found = routeFigures[route].find((f) => f.key === key)
  if (!found) {
    throw new Error(
      `Figure manifest: ${route} has no figure keyed "${key}". Declared keys: ${routeFigures[route]
        .map((f) => f.key)
        .join(', ')}.`
    )
  }
  return found
}

/** Curried for a route page's frontmatter: `const fig = figuresOf('/government')`, then
 *  `fig('net-interest')` at each call site. */
export const figuresOf = (route: ContentRoute) => (key: string) => figure(route, key)
