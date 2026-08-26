# Interface: `src/data/income_inequality.json` and the CBO top 1% block

The consumer contract for two datasets that back the Households route's §§1-2 (`MedianIncome.tsx`,
`HouseholdSpread.tsx`). Read this before charting either — both carry a trap that looks like a
normal annual series and is not.

## `income` (`Dataset<IncomeYear[]>`, `src/data/income_inequality.json`)

113 rows, `y` 1913…2025. Three fields, each `null` where the series has no observation for that
year (never `0` — `test_absent_observations_are_null_not_zero`):

| Field | Coverage | Meaning |
|---|---|---|
| `mhi` | 1984–2024, 41 rows, no internal gaps | Real median household income, **2024 dollars** (`_meta.coverage.mhi`) |
| `gini` | 1947–2024, 78 rows, no internal gaps | **Family** Gini index, ratio 0–1 (`_meta.coverage.gini`) |
| `top` | 1913–2025 | Top statutory marginal income tax rate. **Out of scope for §§1-2** (issue #10) — not charted, tabled or mentioned there. |

### The families-vs-households Gini trap

`_meta.gini_basis === 'families'`. The household Gini series runs about 0.47–0.49 — noticeably
higher than the family series' 0.456 (2024). **A consumer must read the label from
`_meta.gini_basis`, never hardcode the word "families"** — that is what
`test_gini_is_labelled_as_families` locks down, and what `giniBasis` (`src/data/index.ts`) exists
to surface. The household range belongs only in a figure's `note`, never in the chart itself
(`git grep -n "0\.47\|0\.49"` in a Households component should only ever match a note string).

### The two-deflator trap

`mhi` is in **constant 2024 dollars**. The budget series elsewhere on this site (`budget.json`) is
in **FY2025 dollars** — a different deflator (CPI-U-RS vs. the GDP price index) and a different
base year. `UnitToggle` / `UNIT_LABEL` / `UNIT_PREFIX` (`charts/format.ts`) are built around the
budget's `n_`/`r_`/`g_` field-family convention; `income_inequality.json` carries none of those
fields, so there is no honest unit toggle to offer here. A figure using this dataset must state the
deflator difference in its `note` rather than implying comparability via a shared control.

### 1947–1983: a Gini with no median income

`mhi` begins in 1984 because that is where the Census/FRED constant-dollar series begins — the
years before it are not flat, they are unobserved by this measure. `gini` runs back to 1947. A
consumer must derive each chart's own start year from the data
(`seriesSpan(rows, 'mhi')` / `seriesSpan(rows, 'gini')`) rather than clip one series to the other's
window (`test_series_start_years_match_the_declared_coverage`).

## `incomeGroups.cbo_top1_income_share` (`src/data/income_tax_by_group.json`)

`incomeGroups` stays typed as `Dataset<Record<string, unknown>>` in `src/data/index.ts` — widening
it to a full interface covering `groups` and `top1_tax_share_history` is issue #11's job. This
branch types only the one field it reads, at the access site, via the narrow
`IncomeGroupsTop1` interface (`src/data/types.ts`) and the `cboTop1IncomeShare` accessor.

### Two published points, not a series

```json
[{"year": 1979, "v": 9}, {"year": 2022, "v": 18}]
```

That is the entire array — **exactly two rows**, both nation-level top 1% share of income
**before transfers and taxes** (a different measure from the tax-share figures the rest of the
Households route uses). `test_cbo_top1_share_is_two_published_points_not_a_series` locks the array
down to exactly these two `(year, v)` pairs.

**No line generator may be imported for a panel drawing this series, and no connector — dashed or
solid — may be drawn between the two marks.** A connecting line would assert 43 years of
observations that were never published. Draw both as separate, focusable `.datum` marks with
direct text labels instead.

### Curated, not refreshable, no vintage

`incomeGroups._meta.refresh.mode === 'curated'` (`reason`: "source publishes as a document, not a
machine-readable feed"). It carries neither `provenance.vintage` nor `provenance.retrieved_at`, so
`vintageOf(incomeGroups._meta)` returns `null`. A consumer must name this in the figure `note`
("a curated snapshot, refreshed by hand") rather than passing it through `vintageOf` and getting
silence — `curatedVintage`, a helper that would render this case, arrives with #20 and is not this
branch's to add.

## Empty-range handling

A chart driven by a shared year-range control can be scrolled to a window containing neither 1979
nor 2022. That must render an explicit "no published observation in this range" state — never an
empty axis (which could read as zero) and never a hidden panel.

## Schema

`pipeline/schemas/income_inequality.schema.json`, enforced on every build by `check_schema`
(#37). A consumer may rely on:

- `data` is an array of at least 100 rows; every row carries `y`, `top`, `mhi` and `gini` — the
  sparse years are present with `null` values, never absent keys.
- `mhi` and `gini` are `["number", "null"]` with `not: {"const": 0}`. **A year with no observation
  is `null` and can never be `0`**; the schema rejects a zero-filled Gini before it reaches a
  chart. `gini` is additionally bounded `0 … 1` (it is a ratio, not a percent), `top` `0 … 100`.
- `_meta` requires `source` (`minLength: 12`), `title`, `provenance`, `coverage` (with per-series
  `mhi` / `gini` / `top` spans) and `gini_basis`, which is pinned to the literal `"families"` —
  the basis is a schema constant, so a switch to the household series fails the build.
- `_meta.title` names **one span per series**, derived from those per-series coverage blocks
  (#41): "Real median household income 1984-2024, family Gini index 1947-2024 and top statutory
  marginal rate 1913-2025". It previously read a single "1995-2024" that matched no series and no
  chart window — `MedianIncome` takes its domain from `seriesSpan(rows, 'mhi')`, never from a
  year in the title. `check_meta_titles` fails the build if a curated title types a year rather
  than templating it.

Shape and range only; reproduction of the published figures stays in `validate.py`'s
`check_income` and the pytest suite.
