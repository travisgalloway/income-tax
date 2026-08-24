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
  /** Present on curated snapshots (not auto-fetched). See curatedVintage(). */
  refresh?: { mode: string; reason: string }
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

export interface DebtHolders {
  total_debt_t: number
  as_of: string
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
  avg_maturity_as_of: string
  longest_instrument_years: number
  marketable_total_t: number
  /** `share_pct` is present on bills only and DISAGREES with amount_t /
   *  marketable_total_t. Geometry comes from amount_t; a percentage is
   *  rendered only where this field supplies one. */
  composition: { k: string; label: string; maturity: string; share_pct?: number; amount_t: number }[]
  /** NOT rendered. sections.md §3: "Do not build this as a time series." */
  history_months: { date: string; v: number }[]
}
