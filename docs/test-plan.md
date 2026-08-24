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

## Cross-cutting

| ID | Pipeline (pytest) | Build-time | Manual | Gaps |
|----|--------------------|-----------|--------|------|
| A11Y-1 | `pipeline/tests/test_accessibility.py` — a generic static conformance suite over every built page and every island component | `npx astro check`, `npm run build` | The itemised "Shared" checklist in `docs/contracts/accessibility.md` (Tab/Shift-Tab traversal, screen-reader pass, focus-trap check, 390px legibility, greyscale render, Safari focus-ring visibility, measured pixel contrast) | No browser-driven test of any kind exists anywhere in this repo — every criterion that requires a DOM, assistive technology, or rendered pixels is manual, not automated, and stays that way until one is added |
| A11Y-2 | none | none | The itemised "Per-PR" checklist in `docs/contracts/accessibility.md` (cross-route keyboard sweep, screen-reader passes per route, per-PR Radix keyboard-model checks) | Same gap as A11Y-1, and additionally blocked on #16–#28 landing before there is anything to sweep |
