# Test plan

Mirrors `docs/feature-matrix.md` row for row, by the same ID. This repository has one automated
test runner (`cd pipeline && uv run pytest`, in `pipeline/tests/test_pipeline.py`) plus Astro's
build-time checks (`npx astro check`, `npm run build`); there is no JS unit or e2e runner, so
component-level and interaction coverage is manual and named explicitly rather than left implicit.

## Government route

| ID | Pipeline (pytest) | Build-time | Manual | Gaps |
|----|--------------------|-----------|--------|------|
| GOV-1 | — | `npx astro check`, `npm run build` | ad hoc | no automated coverage of `DebtChart.tsx` interactions |
| GOV-2 | `test_crossing_date_is_reconciled_not_competing`, `test_foreign_share_always_carries_its_denominator`, `test_public_split_is_keyed_to_its_denominator`, `test_section_2_uses_no_party_colours`, `test_federal_reserve_absent_from_rendered_section_2`, `test_tic_revision_note_is_carried` | `npx astro check`, `npm run build` (`curatedVintage` throws at build time if `debtHolders._meta.refresh.mode` is not `curated`) | M1 keyboard, M3 390px, M4 greyscale, M5 screen reader — **not executed, no browser tooling in this environment** | no automated JS coverage of `DebtHolders.tsx`'s bar/connector geometry; "View as table" (M6) could not be verified against `dist/government/index.html` because Radix `Collapsible.Content` does not render its children in the closed-state SSR output (also true of the pre-existing `DebtChart.tsx` table, not a regression here) — table correctness (units, `no data` cells) is proved by the component's row-building logic and by `TableView`'s own `?? 'no data'` contract, not by a static grep of the built HTML |
| GOV-4 | `test_outlay_components_sum_to_total_in_every_unit_family`, `test_party_control_is_null_outside_fy1995_2025`, `test_net_mandatory_is_positive_in_every_year`, `test_every_unit_family_covers_the_full_span`, `test_surplus_years_are_positive_deficit_values` | `npx astro check`, `npm run build` | M1–M12 in `.claude/plans/issue-2.md` (unit-sum spot check, control strip absent pre-1995, keyboard inspection parity, GDP-view clipping, no-JS render, 390px width, greyscale) | no automated JS coverage of `BudgetChart.tsx` — the stacking, strip and inspector logic are proved only by the pytest data invariants above plus the manual checks; no JS test runner exists in this repo to close that gap |
