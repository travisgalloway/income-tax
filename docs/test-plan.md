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
| HH-5 | `test_top1_income_share_is_present_and_paired`, `test_percentile_groups_are_nested_not_a_partition`, `test_unpublished_group_cells_are_absent_not_zero` | `npx astro check`, `npm run build` | M1 (390px legibility), M2 (keyboard parity), M3 (greyscale), M4 (screen-reader pass over `WhoPays`, absent cells announce as "no data") in `.claude/plans/issue-11.md` | no automated JS coverage of `WhoPays.tsx` / `Top1TaxShare.tsx` interactions — the nesting, absence and non-annual invariants are proved only by the pytest data checks above plus manual review |
| HH-6 | none new — reuses `check_revenue`'s FY2025 `g_pr`/`s_pr` assertions in `pipeline/lib/validate.py`, run via `uv run python build.py --tier monthly --dry-run` | `npx astro check`, `npm run build` | M1 (390px, end labels not overlapping), M2 (keyboard parity), M3 (greyscale) in `.claude/plans/issue-11.md` | no automated JS coverage of `PayrollBill.tsx`'s two-view toggle |
| HH-7 | none — prose only, no chart | `npx astro check`, `npm run build` | manual review of the five numbered limits against the grep-pinned phrases in `.claude/plans/issue-11.md` | no chart, so no data-invariant test applies |
