# Test plan

Mirrors `docs/feature-matrix.md` row for row, by the same ID. This repository has one automated
test runner (`cd pipeline && uv run pytest`, in `pipeline/tests/test_pipeline.py`) plus Astro's
build-time checks (`npx astro check`, `npm run build`); there is no JS unit or e2e runner, so
component-level and interaction coverage is manual and named explicitly rather than left implicit.

## Government route

| ID | Pipeline (pytest) | Build-time | Manual | Gaps |
|----|--------------------|-----------|--------|------|
| GOV-1 | — | `npx astro check`, `npm run build` | ad hoc | no automated coverage of `DebtChart.tsx` interactions |
| GOV-4 | `test_outlay_components_sum_to_total_in_every_unit_family`, `test_party_control_is_null_outside_fy1995_2025`, `test_net_mandatory_is_positive_in_every_year`, `test_every_unit_family_covers_the_full_span`, `test_surplus_years_are_positive_deficit_values` | `npx astro check`, `npm run build` | M1–M12 in `.claude/plans/issue-2.md` (unit-sum spot check, control strip absent pre-1995, keyboard inspection parity, GDP-view clipping, no-JS render, 390px width, greyscale) | no automated JS coverage of `BudgetChart.tsx` — the stacking, strip and inspector logic are proved only by the pytest data invariants above plus the manual checks; no JS test runner exists in this repo to close that gap |

## Economy route

| ID | Pipeline (pytest) | Build-time | Manual | Gaps |
|----|--------------------|-----------|--------|------|
| ECO-1 | `test_real_gdp_is_positive_in_every_fiscal_year`, `test_nominal_gdp_fy1995_matches_the_budget_route_denominator` | `npx astro check`, `npm run build`, `grep -o '<svg' dist/index.html` (no-JS render proof) | 390px width and greyscale checks (`.claude/plans/issue-12.md` V-16, V-17) — no browser tooling in this environment, unexecuted | no automated JS coverage of `RealGdpLogScale.tsx`'s focus/readout interaction; proved only by the pytest data invariants plus the manual checks |
| ECO-2 | `test_output_per_hour_and_median_income_share_1984_to_2024` | `npx astro check`, `npm run build` | same 390px/greyscale gap as ECO-1, unexecuted | no automated JS coverage of `GrowthAndShadow.tsx`'s interaction |
| ECO-3 | `test_unemployment_peak_over_actuals_is_fy1983`, `test_participation_peak_over_actuals_is_fy2000`, `test_fy2020_unemployment_is_a_fiscal_year_average_not_a_monthly_peak` | `npx astro check`, `npm run build` | same 390px/greyscale gap as ECO-1, unexecuted | no automated JS coverage of `WhoWorks.tsx`'s two-panel interaction |
| ECO-4 | `test_rate_series_start_at_their_documented_first_year`, `test_no_rate_series_is_negative_and_the_minima_are_near_zero`, `test_cpi_inflation_is_negative_in_fy1955_and_fy2009` | `npx astro check`, `npm run build`, `grep -o '<svg' dist/index.html` (no-JS render proof) | tab/live-region parity (M1), table contents (M2), 390px width (M3) and greyscale (M4) checks in `.claude/plans/issue-13.md` — no browser tooling in this environment, unexecuted | no automated JS coverage of `PricesAndRates.tsx`'s two-panel interaction; proved only by the pytest data invariants plus the manual checks |
| ECO-5 | `test_wage_and_profit_share_are_gdp_shares_and_do_not_sum_to_100`, `test_fy2020_share_moves_are_denominator_artefacts` | `npx astro check`, `npm run build` | same M1-M4 gap as ECO-4, unexecuted | no automated JS coverage of `LaborAndCapital.tsx`'s interaction |
