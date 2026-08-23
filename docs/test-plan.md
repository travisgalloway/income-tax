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
| GOV-9 | `test_attribution_both_breakdowns_reconcile_to_the_same_total`, `test_attribution_coalition_totals_match_the_published_finding`, `test_attribution_president_totals_match_the_published_finding`, `test_attribution_gross_and_net_differ_by_the_reductions`, `test_attribution_excludes_the_two_1997_laws`, `test_attribution_party_line_side_is_counted_not_classified`, `test_attribution_every_law_joins_to_a_counted_split` | `npx astro check`, `npm run build` (runs `aggregate.ts`'s import-time reconciliation invariant) | M1–M8 in `.claude/plans/issue-4.md` (keyboard tab switch + bar traversal, screen-reader announcement, no-JS render, 390px width, greyscale, table disclosure totals, reduced-motion, contrast) | no automated JS coverage of `AttributionSplit.tsx` — the bar geometry, tab wiring and live-region text are proved only by the pytest reconciliation tests above plus the manual checks; no JS test runner exists in this repo to close that gap |
