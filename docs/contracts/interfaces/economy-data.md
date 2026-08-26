# Interface: `src/data/economy.json` (+ the `income_inequality.json` join)

The consumer contract for `economy` (`src/data/index.ts`, typed as `Dataset<EconomyYear[]>` in
`src/data/types.ts`). Read this before charting anything from `economy.data` — one field is an
active projection, not an actual, and one field's index base is not the one this route displays.

## Shape

`Dataset<EconomyYear[]>`: `{ _meta: Meta, data: EconomyYear[] }`. One row per fiscal year,
FY1950-FY2036 (`_meta.coverage.start` / `.end`), 87 rows total. Fiscal years, not calendar years:
FY2025 ran October 2024 to September 2025.

Fields the Economy route's §§1-3 read: `rgdp`, `gdp`, `prod`, `unemp`, `nairu`, `lfpr`. All six are
non-null in all 87 rows (there is no `mhi`-style coverage gap on this file).

`EconomyYear` also carries `chained_cpiu` and `core_cpiu` (`number | null`), the chained CPI-U and
core CPI-U index levels. They are emitted so the file holds every CBO price series the sections
need; **no component reads them yet** (#38 emits, it does not rewire §4).

## Actuals versus projections (`actual`, `_meta.estimate_boundary`)

CBO publishes actuals and its baseline projection in one series running to FY2036.
`_meta.estimate_boundary.last_actual_fy` (currently `2025`) is the last actual fiscal year;
`row.actual` is `true` for every row through that year and `false` after it.

`_meta.notes[0]`, in capitals: **"No chart may draw actual and projected values as one continuous
line."** Every chart on this route that touches `economy.json` must split at the boundary using
`splitAtBoundary` (`src/components/charts/estimates.tsx`), which throws if a row is flagged
`actual` past the boundary, and must mark the split with a labelled `BoundaryRule` rather than
relying on the dash pattern alone.

## `prod`'s native index base is not 1984

`prod` ("output per hour, nonfarm business, index") is published by CBO on its own base year,
approximately 2017 = 100. `_meta.units.prod` does **not** state that base — it just says "index" —
so a consumer must not assume `prod`'s raw values are meaningful on their own axis without
re-indexing. Section 2 re-indexes `prod` to 1984 = 100 (`100 * v / vAtBase`) specifically so it is
comparable to `income_inequality.json`'s `mhi`, which has no native index at all. Do not chart raw
`prod` values against a "since 2017" or "since 1950" axis title without checking what CBO's
underlying base actually is; the safest default is always to re-index to the window the chart uses.

## The `income_inequality.json` join (Section 2)

`src/components/islands/GrowthAndShadow.tsx` is the current consumer of this join, and computes
the shared window itself (about six lines, inline) rather than importing a helper — see the
Economy-route conflict register in `.claude/plans/issue-12.md` for why `charts/series.ts` is not
created here.

Section 2 draws `economy.prod` against `income_inequality.mhi`. Two different files, on two
different calendars, joined on year number only:

| | `economy.json` | `income_inequality.json` |
|---|---|---|
| Calendar | Fiscal year | Calendar year |
| Basis | CBO, nonfarm business output per hour worked | Census Bureau household survey median, via FRED |
| Coverage of the joined fields | `prod` non-null on every actual row, 1950-2025 | `mhi` non-null 1984-2024 only (`_meta.coverage.mhi`) |

The shared window a chart can honestly draw over is the intersection: **1984 to 2024** with the
shipped data. This is computed, never hardcoded, as the first and last year where both an actual
`prod` row and a non-null `mhi` exist — a future data refresh that shifts either boundary must move
the chart's window with it rather than silently truncating or extending past real coverage.
`test_output_per_hour_and_median_income_share_1984_to_2024` in `pipeline/tests/test_pipeline.py`
guards that the shipped window is exactly `[1984, 2024]`.

The two series are not directly commensurable: different sources, different deflators, different
units of observation (per hour worked versus per household). A chart joining them must say so in
body copy, must index both to the same base year in the standfirst/finding/axis title, and must
never suggest that the gap between the two indexed lines is itself a measurable quantity.

## The noncyclical rate (`nairu`) is an estimate, not an observation

`nairu` is CBO's estimate of the unemployment rate consistent with neither excess nor shortfall of
demand relative to the economy's capacity. Unlike `unemp`, it is not observed; CBO revises it over
time. Any chart pairing `unemp` and `nairu` must say so in body copy (Section 3 does), because
otherwise the two lines read as two observations of the same kind of thing.

`WhoWorks.tsx` (`src/components/islands/`) is the current consumer: `unemp` and `nairu` share a
zero-based top panel because both are percentages of the labour force, while `lfpr` (percent of
the civilian population 16+) gets its own panel with a non-zero-based, padded axis rather than a
second y-axis on the same chart — see the two-panel convention in
`docs/contracts/interfaces/charts.md`.

## Cross-checking the budget route (`gdp`)

`economy.gdp` (nominal $ trillions) is the same GDP CBO uses as the denominator for every `g_`
(percent-of-GDP) field in `budget.json`. FY1995: `economy.gdp = 7.56`, and `budget.json`'s implied
denominator `100 * n_ot / g_ot` = `1.516 / 20.05 * 100` = `7.5611`, agreeing to `0.0011`.
`test_nominal_gdp_fy1995_matches_the_budget_route_denominator` pins this at FY1995 only: the same
check at FY2025 differs by 0.03, likely rounding in one of the two published series, which is why
no chart should claim the two files' GDP figures agree to better than about a cent on the dollar
outside a spot-checked year.

## `_meta`

- `_meta.source` — render **verbatim** wherever this dataset backs a `Figure` (`BRIEF.md` rule 1).
  For the two-source Section 2 figure, both `economy._meta.source` and
  `income_inequality._meta.source` (exported as `income`) appear verbatim, each prefixed only by a
  label naming which series it belongs to.
- `income._meta.provenance` carries neither `vintage` nor `retrieved_at`, so `vintageOf(income._meta)`
  returns `null`. Section 2's `Figure` uses `vintageOf(economy._meta)` only, for that reason.

## `cpi`, `chained_cpiu`, `core_cpiu` and `core_pce` are index levels, not rates (Section 4)

`_meta.units.cpi`, `.chained_cpiu`, `.core_cpiu` and `.core_pce` all say `"index"`. None is a
percent, and none may be labelled "inflation" directly: `PricesAndRates.tsx` derives the year-over-year percent
change once (`100 * (cur - prev) / prev`) and charts, tables and axis titles all name that
transform. Coverage: `cpi` is non-null from FY1950 (so the derived rate is derivable from FY1951,
one year later, since the first index year has no predecessor); `core_pce` is non-null from FY1960
(derived rate from FY1961); `core_cpiu` is non-null from FY1958 (derived rate from FY1959); and
`chained_cpiu` is non-null from FY2002 (derived rate from FY2003), which is simply where CBO's
series begins. Each of the four sits on its own base, so levels are comparable within a series
over time and never across two of them — chart derived rates, or re-index, but do not overlay raw
levels. `ff` is non-null from FY1955, `t3m` from FY1950, `t10` from FY1954 —
these three are already percentages and are charted at their native level, not derived.

No rate in this file goes negative: the minima are `ff` FY2021 `0.083` and `t3m` FY2015 `0.028`,
both near-zero fiscal-year values on the same zero-anchored axis as the `ff` FY1981 peak of
`16.945`. What *is* negative is the derived inflation series — CPI-U year-over-year is negative in
FY1955 and again `-0.301%` in FY2009 — so the inflation panel's domain admits negative values and
carries a `ZeroLine`, while the rates panel stays zero-anchored throughout.

## `wage_share` and `profit_share` are shares of GDP, not of national income (Section 5)

`_meta.notes[2]` states this exactly: **"wage_share and profit_share are shares of GDP, not of
national income, so they do not sum to 100 with anything. They are comparable to each other over
time, not to a factor-share decomposition."** `LaborAndCapital.tsx` plots both on one zero-based
axis (they share the same GDP denominator, unlike `WhoWorks`'s two bases) and repeats the exact
string in both the `Figure` note and body prose — any consumer adding a third series to this panel
must carry the same caveat, not drop it because "it was already said once."

Range: `wage_share` runs from a FY1970 peak of `51.532` to a FY2024 low of `42.229` (`42.402` at
FY2025); `profit_share` runs from a FY1982 low of `7.020` to a FY2025 peak of `13.066`. Both are
non-null in all 87 rows — no coverage gap to render as `no data` on this panel, unlike `core_pce`,
`ff` and `t10` in Section 4.

## FY2020 wage/profit share moves are a denominator artefact, not a trend (Section 5)

Nominal GDP fell in FY2020, so both shares moved without a corresponding move in bargaining:
`wage_share` **rose** from `43.278` (FY2019) to `43.981` (FY2020) — a share's numerator can rise
relative to a shrinking denominator without anything newly earned — while `profit_share` fell from
`11.484` (FY2019) to `11.270` (FY2020) before rising to `12.674` in FY2021. A chart or caption using
these years must name the denominator explicitly, not describe the moves as a change in who is
paid what. `test_fy2020_share_moves_are_denominator_artefacts` pins the direction of all three
moves.

## Schema

`pipeline/schemas/economy.schema.json`, enforced on every build by `check_schema` (#37). The
joined series has its own schema, `pipeline/schemas/income_inequality.schema.json` — see
`income-inequality-data.md`.

A consumer may rely on:

- `data` is an array of at least 80 rows, each carrying all 20 keys. `y` is an integer, `actual`
  is a boolean.
- **The five nullable series are `core_pce`, `chained_cpiu`, `core_cpiu`, `ff` and `t10`**, typed
  `["number", "null"]` with `not: {"const": 0}`. Absence is `null` and can never arrive as `0`; a
  pre-1959 core-PCE year, or a pre-FY2002 chained-CPI-U year, written as zero fails the build
  rather than plotting as deflation. Every other numeric field is
  a plain `number` and is always present.
- `unemp`, `nairu`, `lfpr`, `wage_share` and `profit_share` are bounded `0 … 100`. `gdp`, `rgdp`,
  `potential_rgdp`, `cpi` and `gdp_deflator` are `exclusiveMinimum: 0`.
- `_meta` requires `source` (`minLength: 12`), `title`, `provenance`, `coverage` and
  `estimate_boundary` (`last_actual_fy`, `note`) — the projections boundary is part of the
  contract, not a convention.

Shape and range only; the actual/projection split and the index-base checks stay in
`validate.py`'s `check_economy`.
