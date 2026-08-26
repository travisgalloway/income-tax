# Interface: `src/data/income_tax_by_group.json`

The consumer contract for `incomeGroups` (`src/data/index.ts`, typed as `Dataset<IncomeGroups>` in
`src/data/types.ts`). Read this before charting anything from `incomeGroups.data` — the shape
looks like a row array at a glance and is not one, and three cells are absent by design.

The companion series, `revenue_sources.json` (`g_pr` / `s_pr`, the payroll line §6 uses), has its
own contract owned by #22 at `docs/contracts/interfaces/revenue-data.md`; this document does not
restate it.

## Shape

`Dataset<IncomeGroups>`: `{ _meta: Meta, data: IncomeGroups }`. Unlike `budget` or `debt`, `data`
is **not** an array of per-year rows — it is one object for one tax year, carrying three
differently-shaped fields:

```ts
interface IncomeGroups {
  tax_year: number
  groups: IncomeTaxGroup[]
  top1_tax_share_history: Top1IncomeSharePoint[]
  cbo_top1_income_share: Top1IncomeSharePoint[]
}
```

`tax_year` is currently `2023` — the latest IRS Statistics of Income year, not the FY1995/FY2025
convention the Government route uses. A consumer stating a year in prose must say "tax year 2023",
not imply it is a fiscal year.

## `groups: IncomeTaxGroup[]` — nested, not a partition

```ts
interface IncomeTaxGroup {
  g: string
  income_share_pct?: number
  tax_share_pct: number
  avg_rate_pct?: number
}
```

Six groups, in data order: `Top 1%`, `Top 5%`, `Top 10%`, `Top 25%`, `Top 50%`, `Bottom 50%`. The
first five are **nested** — Top 1% is the wealthiest slice inside Top 5%, which is inside Top 10%,
and so on. They are not five disjoint slices of one hundred percent, and `Bottom 50%` is a
separate half not contained in any of them.

**Traps**

- **Never stack these, and never sum them.** The six `tax_share_pct` values sum to well over 100
  because each wider group's share includes every narrower group's tax paid. A stacked bar or a
  pie built from these six values silently double- and triple-counts. `pipeline/lib/validate.py`
  asserts each narrower group's `tax_share_pct` is `<=` the next-wider group's, as a monotone
  ladder check — this is a **necessary** consequence of nesting, not sufficient proof a consumer
  used the values correctly.
- **`income_share_pct` is absent, not zero, for `Top 5%`, `Top 25%` and `Bottom 50%`.** The IRS
  table this is drawn from does not publish an AGI share at those cutpoints. A chart that renders
  the absent cell as `0` asserts a fact the source does not support. Render "no data" — never a
  zero-height bar, never an empty half of a paired bar that implies zero.
- **`avg_rate_pct` is present only for `Top 1%` (26.3) and `Bottom 50%` (3.7)** — absent for the
  other four groups. Same rule: absent, never zero.
- `pipeline/tests/test_pipeline.py::test_unpublished_group_cells_are_absent_not_zero` and
  `::test_percentile_groups_are_nested_not_a_partition` guard both traps above.

## `top1_tax_share_history: Top1IncomeSharePoint[]` — five scattered years

```ts
interface Top1IncomeSharePoint {
  year: number
  v: number
}
```

Five published years — 2001, 2019, 2021, 2022, 2023 — **not an annual series**. The 2001-to-2019
gap is 18 years. A consumer must draw these as discrete points on a true linear year axis (so the
gap is visible as a gap) and must not import a line generator or interpolate between them: a line
would assert 17 years of data that were never published.
`pipeline/lib/validate.py` asserts the maximum year-to-year gap exceeds 1, specifically so this
series is revisited if it ever becomes annual.

## `cbo_top1_income_share: Top1IncomeSharePoint[]` — exactly two points

Same `Top1IncomeSharePoint` shape, exactly two observations: 1979 (9) and 2022 (18) — the top 1%
share of income before transfers and taxes. This is drawn once, on the Households route's §2 (the
spread), not redrawn here; §5 cites both numbers in body copy with a link to `#the-spread` rather
than duplicating the chart.

## `_meta.notes` — four caveats, all consumer obligations

1. **Individual income tax only.** Excludes payroll tax, which is the larger bill for most
   households outside the top decile. Any chart or paragraph built from this dataset must say so.
2. **Refundable credits are excluded** from the IRS series, which overstates the effective rate at
   the bottom.
3. **Tax year 2023 is the latest IRS year.** The 1995 comparison point used elsewhere on this site
   was not retrieved for this series; 2001 (33.2%) is the earliest verified anchor in
   `top1_tax_share_history`.
4. **Concentration of tax paid tracks concentration of income.** Showing the tax-share column
   alone, without the income-share column beside it, misleads about who "pays the most" versus who
   "earns the most."

`refresh.mode` is `"curated"` (`monthly/curated_snapshots.py`) — this source publishes as a
document, not a machine-readable feed, so it is hand-maintained rather than re-fetched.

## `_meta.source`

Render **verbatim** wherever this dataset backs a `Figure` (`BRIEF.md` rule 1): "IRS Statistics of
Income, individual tables by tax rate and income percentile, tax year 2023. CBO Distribution of
Household Income 2022 for the top 1% income share." Do not summarise it to "IRS data."

## Schema

`pipeline/schemas/income_tax_by_group.schema.json`, enforced on every build by `check_schema`
(#37). This is a curated snapshot, so its `_meta` requires `refresh` and carries **no** `coverage`;
the full constraint list, including why `income_share_pct` and `avg_rate_pct` are optional rather
than nullable, is in `curated-snapshots.md` § Schema.
