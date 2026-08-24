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
| GOV-11 | 10 tests (`pytest -k state`): 51 in-grid jurisdictions, DC flagged and colour-excluded, territory give/get asymmetry, no derived field silently zero, give/get same fiscal year, jurisdiction give sums reconcile to the national total, ratio null-or-positive, tax-mix shares in `[0,100]` or null, `not_levied` vs missing distinct, no party-colour token in the section source | `npx astro check`, `npm run build`, plus `check_schema`/`check_states` in `lib/validate.py` (JSON Schema + 8 reconciliation invariants, gates every `--tier monthly` run) | keyboard walk across all 51 tiles into the sortable table (Enter/Space to sort), 390px legibility, JS-disabled render, focus-ring visibility — **not executable in this environment (no browser tooling)**; structural proxies for all four are in `.claude/plans/issue-14.md` Definition of done 8/11/12 | no browser-driven test exists anywhere in this repo (consistent with GOV-1/GOV-4); the tile grid's 51-target keyboard walk and the sortable table's Enter/Space activation are unverified by anything but the manual pass |
