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
