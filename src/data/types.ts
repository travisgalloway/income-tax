/** Types for the generated data in src/data/*.json.
 *
 *  These mirror pipeline/schemas.
 *
 *  A single `as Dataset<T>` assertion is used at the import site rather than the
 *  double `as unknown as`: TypeScript checks a single assertion for structural
 *  overlap, so a gross shape change does surface in `astro check`. It is still an
 *  assertion, not validation. TypeScript cannot fully verify imported JSON against
 *  these interfaces, because fields that are null in some rows and populated in
 *  others widen to unions that no longer match.
 *
 *  Real enforcement lives in two places: the pipeline's JSON Schemas and its 870
 *  reconciliation checks, and `assertDataset` below, which runs at build time. */

export interface Provenance {
  generator: string
  git_sha: string
  generated_at: string
  vintage?: string
  retrieved_at?: string
}

export interface Meta {
  title: string
  /** Rendered VERBATIM beneath every figure. Never summarise it. */
  source: string
  units?: Record<string, string>
  fields?: Record<string, string>
  notes?: string[]
  provenance: Provenance
  coverage?: Record<string, unknown>
  estimate_boundary?: { last_actual_fy: number; note: string }
  /** How this output is kept current. `'curated'` — nothing is fetched, see
   *  `curatedVintage()`. `'mixed'` — part fetched and part curated, carrying two
   *  dates, see `mixedVintage()`. Absent on a fully fetched output, where
   *  `vintageOf()` answers the freshness question. */
  refresh?: { mode: 'curated' | 'mixed'; reason: string }
  [key: string]: unknown
}

export interface Dataset<T> {
  _meta: Meta
  data: T
}

export interface Control {
  p: string
  pp: 'D' | 'R'
  h: 'D' | 'R'
  s: 'D' | 'R'
  ctl: 'D' | 'R' | 'M'
  t: boolean
}

export interface Law {
  name: string
  public_law: string | null
  date: string
  score_t: number | null
  vote_character: string
  president: string
  president_party: 'D' | 'R'
  control_at_enactment: string
  control_year: string
  legacy_comp: string
  rollcall: { congress: number; house: number | null; senate: number | null; note?: string }
}

/** One fiscal year of the budget. `n_` nominal, `r_` real FY2025, `g_` % of GDP.
 *  `ma` is GROSS mandatory; add `or` (negative) for the net figure. */
export interface BudgetYear {
  y: number
  n_ma: number; n_or: number; n_di: number; n_ni: number
  n_re: number; n_de: number; n_ot: number
  r_ma: number; r_or: number; r_di: number; r_ni: number
  r_re: number; r_de: number; r_ot: number
  g_ma: number; g_or: number; g_di: number; g_ni: number
  g_re: number; g_de: number; g_ot: number
  /** null outside FY1995-FY2025, where party control is not curated. */
  ctl: Control | null
  L: Law[]
}

export interface DebtYear {
  y: number
  debt: number
  /** null where final GDP is not available. Never zero. */
  gdp_share: number | null
  year_end: boolean
  as_of?: string
  note?: string
}

export interface EconomyYear {
  y: number
  /** false for CBO baseline projections. Never chart these continuous with actuals. */
  actual: boolean
  gdp: number | null
  rgdp: number | null
  potential_rgdp: number | null
  output_gap: number | null
  unemp: number | null
  nairu: number | null
  lfpr: number | null
  cpi: number | null
  /** Chained CPI-U index level. null before FY2002 — CBO carries no earlier value. */
  chained_cpiu: number | null
  /** Core CPI-U index level. null before FY1958. */
  core_cpiu: number | null
  core_pce: number | null
  ff: number | null
  t10: number | null
  t3m: number | null
  prod: number | null
  gdp_deflator: number
  wage_share: number | null
  profit_share: number | null
}

export interface IncomeYear {
  y: number
  /** null before the series starts. Never zero. */
  mhi: number | null
  gini: number | null
  top: number | null
}

export interface RevenueYear {
  y: number
  [k: string]: number | null
}

export interface VoteTally {
  yea: number
  nay: number
  other: number
}

export interface ChamberVote {
  r: VoteTally
  d: VoteTally
  i: VoteTally
  /** Democrats plus caucusing independents: the basis published tallies use. */
  d_caucus: VoteTally
  yea: number
  nay: number
  rollnumber: number
}

/** One published observation of the CBO top 1% income share. Two of these
 *  exist in total (1979, 2022) — see `IncomeGroups` below. Never a
 *  continuous annual series. */
export interface Top1IncomeSharePoint {
  year: number
  v: number
}

/** One row of the OECD total-tax-revenue comparison. `is_us` and `is_average`
 *  are mutually exclusive flags: at most one row of each per dataset. Absent
 *  on every other country row — never `false`. */
export interface OecdCountry {
  c: string
  v: number
  is_us?: boolean
  is_average?: boolean
}

export interface OecdComparison {
  year: number
  us_pct_gdp: number
  oecd_average_pct_gdp: number
  us_rank: number
  of_countries: number
  /** A SELECTION of `of_countries` members, not the full membership. Any
   *  chart built from this must say so. */
  countries: OecdCountry[]
  us_history: { year: number; v: number }[]
}

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh'

/** One bracket on a filing status's ladder for one tax year. `hi`/`rhi` are
 *  null on exactly the top bracket, never zero. `rlo`/`rhi` are constant 2024
 *  dollars. */
export interface Bracket {
  r: number
  lo: number
  hi: number | null
  rlo: number
  rhi: number | null
}

/** Present only in the twelve years where the published top rate diverges
 *  from the raw bracket-schedule ladder top. Both numbers are kept. */
export interface RateAdjustment {
  schedule: number
  published: number
  why: string
  source: string
}

/** One tax year of `bracket_history.json`. `s.<status>` is null before that
 *  status existed (never a back-projected copy of `single`). */
export interface BracketYear {
  y: number
  top: number
  sched_top: number
  adj: RateAdjustment | null
  nb: number
  s: Record<FilingStatus, Bracket[] | null>
}

/** `cbo_effective_rates.json`'s `data` blob: PUBLISHED ANCHOR POINTS, never an
 *  annual series. Kept structurally loose (`Record<string, unknown>` at the
 *  import site) because its shape does not overlap enough with any tabular
 *  `T[]` for a single `as Dataset<T>` assertion; narrow through this type at
 *  the point of use instead. */
export interface CboEffectiveRates {
  as_of: string
  basis: string
  not_an_annual_series: string
  groups: string[]
  rows: {
    year: number
    source_table: string
    v: { lowest: number; second: number; middle: number; fourth: number; highest: number; top1: number }
  }[]
}

export interface PartySplit {
  public_law: string | null
  name: string
  date: string
  congress: number
  /** null means NO ROLL CALL EXISTS (a voice vote). Never unanimity. */
  house: ChamberVote | null
  senate: ChamberVote | null
  character: 'cross-party' | 'party-line' | 'no recorded vote'
  legacy_classification: string
  note?: string
}

/** One jurisdiction's give/get row. `is_state` is true ONLY for the 50 actual
 *  states — DC is false, deliberately, because it is excluded from the
 *  colour-scale domain. `in_grid` is the 51 the tile cartogram draws (the 50
 *  states plus DC); territories are in the data but not on the grid. Every
 *  derived field (`*_pc`, `balance_*`, `ratio`) is null when either side is
 *  missing — see docs/contracts/interfaces/state-data.md. */
export interface StateJurisdiction {
  code: string
  name: string
  is_state: boolean
  in_grid: boolean
  give_b: number | null
  get_b: number | null
  pop: number | null
  give_pc: number | null
  get_pc: number | null
  balance_b: number | null
  balance_pc: number | null
  ratio: number | null
}

export interface StatesBalance {
  fy_give: number
  fy_get: number
  national: { give_b: number; get_b: number; population: number }
  color_domain: { basis: string; min: number; max: number; mid: number; excludes: string[] }
  summary: { n_get_more: number; n_give_more: number; n_with_both: number }
  jurisdictions: StateJurisdiction[]
}

export interface TaxMixCategory {
  k: string
  label: string
  item: string
}

/** `shares[k] === null` alone means "not reported"; `shares[k] === null` PLUS
 *  `k` present in `not_levied` means the state does not levy that tax at all.
 *  The two must never render the same way. */
export interface TaxMixJurisdiction {
  code: string
  name: string
  total_b: number | null
  shares: Record<string, number | null>
  not_levied: string[]
  partial?: boolean
}

export interface StatesTaxMix {
  fy: number
  categories: TaxMixCategory[]
  jurisdictions: TaxMixJurisdiction[]
}

export interface DebtHolders {
  total_debt_t: number
  /** Debt to the Penny's as-of date, for the split and the total. */
  as_of: string
  /** The pinned Treasury International Capital release month, `YYYY-MM`, for
   *  `top_foreign` only. A SECOND date, deliberately: the foreign holdings come
   *  from a different release with a different vintage, and presenting one date
   *  for both is the failure. `mixedVintage()` renders the pair. */
  tic_as_of: string
  split: { k: 'public' | 'intragov'; label: string; amount_t: number; share_pct: number }[]
  /** Deliberately `share_of_public_pct`, NOT `share_pct`: the denominator is
   *  part of the field name so a renderer cannot silently print it as a share
   *  of gross debt. See discrepancies.yaml -> foreign_share_of_debt. */
  public_split: { k: 'domestic' | 'foreign'; label: string; share_of_public_pct: number }[]
  top_foreign: { country: string; amount_t: number }[]
  foreign_share_history: { year: number; share_of_gross_pct: number }[]
}

export interface DebtMaturity {
  avg_maturity_months: number
  /** The Joint Economic Committee update's month, `YYYY-MM`, for the average
   *  maturity, the longest instrument and `history_months`. */
  avg_maturity_as_of: string
  /** The pinned Monthly Statement of the Public Debt month, `YYYY-MM`, for
   *  `composition` and `marketable_total_t`. A SECOND date, deliberately: the
   *  instrument amounts are fetched from a different release with a different
   *  vintage, and presenting one date for both is the failure. `mixedVintage()`
   *  renders the pair. */
  mspd_as_of: string
  longest_instrument_years: number
  /** The total over EVERY marketable class, TIPS and floating-rate notes
   *  included — NOT the bills + notes + bonds subtotal. It read `28.0` while it
   *  was a curated constant, which was the subtotal wearing this label (#56). */
  marketable_total_t: number
  /** `share_pct` is present on bills only, and RECONCILES with amount_t /
   *  marketable_total_t to within half a point. Geometry comes from amount_t; a
   *  percentage is rendered only where this field supplies one, so notes and
   *  bonds have nothing to derive one from. */
  composition: { k: string; label: string; maturity: string; share_pct?: number; amount_t: number }[]
  /** NOT rendered. sections.md §3: "Do not build this as a time series." */
  history_months: { date: string; v: number }[]
}

/** One percentile group of tax units, IRS Statistics of Income.
 *
 *  The groups are NESTED — "Top 1%" is inside "Top 5%" — so they never
 *  partition a whole. They must not be summed, and must not be drawn as one
 *  bar divided into parts.
 *
 *  `income_share_pct` and `avg_rate_pct` are ABSENT, not zero, where the IRS
 *  does not publish them. Income share is absent for Top 5%, Top 25% and
 *  Bottom 50%; average rate is absent for every group but Top 1% and Bottom
 *  50%. Rendering an absent cell as 0 is a factual error, not a display
 *  choice. */
export interface IncomeTaxGroup {
  g: string
  income_share_pct?: number
  tax_share_pct: number
  avg_rate_pct?: number
}

/** `income_tax_by_group.json`. INDIVIDUAL INCOME TAX ONLY: it excludes payroll
 *  tax, which is the larger bill outside the top decile, and it excludes
 *  refundable credits, which overstates the effective rate at the bottom. */
export interface IncomeGroups {
  tax_year: number
  groups: IncomeTaxGroup[]
  /** Five scattered published years, not an annual series. */
  top1_tax_share_history: Top1IncomeSharePoint[]
  cbo_top1_income_share: Top1IncomeSharePoint[]
}
