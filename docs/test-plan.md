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
| GOV-8 | `test_every_law_joins_to_a_counted_split`, `test_filter_totals_render_to_the_published_two_places`, `test_the_two_1997_laws_carry_no_score_but_do_carry_votes`, `test_cares_house_cell_has_no_countable_vote`, `test_vp_tiebreak_laws_are_exactly_the_three_named`, `test_narrowest_chamber_margin_is_defined_for_every_law`, `test_deficit_share_exists_for_every_enactment_fiscal_year`, `test_section_8_no_longer_claims_classified_composition` | `npx astro check`, `npm run build`, `uv run python build.py --tier monthly --dry-run` | M1–M14 in `.claude/plans/issue-3.md` (filter/totals spot checks, basis toggle, CARES/1997/50-50 rendering, margin and score sort stability, keyboard-only Select/sort/selection, no-JS render, 390px width, greyscale) | no JS test runner exists in this repo, so `LawExplorer.tsx`'s filter, sort, selection and basis-toggle logic is proved only by the pytest data invariants above (`derive.ts`'s pure functions are mirrored in Python for the pipeline tests, not unit-tested directly in TS) plus the manual checks |
