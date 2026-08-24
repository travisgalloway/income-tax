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
