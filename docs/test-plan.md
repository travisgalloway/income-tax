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
| HH-3 | `test_bracket_history_reproduces_curated_top_rates`, `test_bracket_history_adjustment_years_are_documented`, `test_bracket_thresholds_carry_both_nominal_and_constant_dollars`, `test_filing_statuses_are_not_projected_backwards`, `test_bracket_count_runs_from_two_in_1988_to_fiftysix_in_1918`, `test_bracket_history_absent_values_are_null_not_zero`; `check_bracket_history` at the build validation gate | `npx astro check`, `npm run build`; static-render greps in `.claude/plans/issue-10.md` V6 (both sections present, `scaleLog` used, SVGs server-rendered) | M1 (Tab-focus/live-region parity), M2 ("View as table" + units), M3 (`no data` not `0` pre-1949/1952), M4 (no-JS render), M5 (390px legibility), M6 (greyscale), M7 (log-axis label), M8 (VoiceOver) — **not executed in this environment, no browser tooling available** | no automated JS coverage of `BracketHistory.tsx` interactions; M1-M8 are unexecuted, not merely unautomated |
| HH-4 | `test_cbo_effective_rates_are_anchor_points_not_a_series`, `test_cbo_effective_rates_basis_names_payroll_tax`; `check_cbo_effective_rates` at the build validation gate | `npx astro check`, `npm run build`; static-render greps (`Nobody pays the top rate on their whole income`, `includes payroll tax`) | M4 (no-JS render), M6 (greyscale, marker shapes distinguish the five groups without colour), M8 (VoiceOver) — **not executed in this environment, no browser tooling available** | no automated JS coverage of `StatutoryVsEffective.tsx` interactions; the no-connector (anchor-point, not line) rendering is proved only by manual inspection, unexecuted here |
