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
| GOV-10 | `test_revenue_components_sum_in_the_gdp_and_share_families`, `test_miscellaneous_revenue_is_never_zero`, `test_revenue_series_is_contiguous_and_has_no_null_fields`, `test_customs_is_the_fastest_growing_revenue_line`, `test_oecd_average_is_flagged_and_the_country_list_is_a_selection`, `test_oecd_and_federal_revenue_are_marked_as_different_scopes` (plus the pre-existing `test_revenue_components_sum_to_total`), `uv run python build.py --tier monthly --dry-run` (0 validation failures) | `npx astro check`, `npm run build` | M1–M7 in `.claude/plans/issue-7.md` (no-JS render, 390px width, keyboard sweep parity, greyscale, view-toggle consistency, table units, screen-reader announce order) — **not executed**, no browser tooling in the exec environment; unrun | no automated JS coverage of `RevenueChart.tsx`/`OecdChart.tsx` interactions — the stacking, focus/readout and dot-plot logic are proved only by the pytest data invariants above plus the (unrun) manual checks; no JS test runner exists in this repo to close that gap |
