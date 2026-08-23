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

## Households route

| ID | Pipeline (pytest) | Build-time | Manual | Gaps |
|----|--------------------|-----------|--------|------|
| HH-1 | `test_median_income_reproduces_the_published_figures`, `test_1947_has_a_gini_but_no_median_income`, `test_series_start_years_match_the_declared_coverage`, `test_absent_observations_are_null_not_zero` | `npx astro check`, `npm run build`, static-render greps against `dist/households/index.html` (verification 5 in `.claude/plans/issue-9.md`) | M1, M2, M6–M9 in `.claude/plans/issue-9.md` (slider keyboard operation, datum focus parity, table units, 390px width, greyscale) — **not executed in this environment, no browser tooling available** | no automated JS coverage of `MedianIncome.tsx` or `YearRange.tsx` interactions; manual items above are unexecuted, not merely unautomated |
| HH-2 | `test_family_gini_reproduces_the_published_figures`, `test_cbo_top1_share_is_two_published_points_not_a_series`, `test_gini_is_labelled_as_families`, `test_absent_observations_are_null_not_zero` | `npx astro check`, `npm run build`, static-render greps against `dist/households/index.html` | M1, M2, M3–M6, M9, M10 in `.claude/plans/issue-9.md` (empty-range state, no-connector check, table units, greyscale, VoiceOver) — **not executed in this environment, no browser tooling available** | no automated JS coverage of `HouseholdSpread.tsx`; manual items above are unexecuted, not merely unautomated |
