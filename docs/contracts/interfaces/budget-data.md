# Interface: `src/data/budget.json`

The consumer contract for `budget` (`src/data/index.ts`, typed as `Dataset<BudgetYear[]>` in
`src/data/types.ts`). Read this before charting anything from `budget.data` — two of its fields
have a sign or nullability convention that silently breaks a stack or a strip if assumed away.

## Shape

`Dataset<BudgetYear[]>`: `{ _meta: Meta, data: BudgetYear[] }`. One row per fiscal year,
FY1962–FY2025 (`_meta.coverage.start` / `.end`), 64 rows total.

## Unit families

Every dollar/GDP field is carried three times, by prefix:

| Prefix | Meaning |
|---|---|
| `n_` | Nominal $ trillions |
| `r_` | Real $ trillions, FY2025 dollars (GDP price index) |
| `g_` | Percent of GDP |

`charts/format.ts`'s `UNIT_PREFIX` maps the `Unit` type (`'nominal' \| 'real' \| 'gdp'`) to these
three. Switching units must only change which prefix a component reads — it must never change
which rows are shown or drop a year, because all three families cover the same 64 rows (verified
by `test_every_unit_family_covers_the_full_span`).

## The gross/net trap (`ma` / `or`)

- `ma` — mandatory outlays, **gross**.
- `or` — offsetting receipts, always **negative**.
- The identity that holds in every row and every unit family (tolerance 0.002 nominal, 0.004 real,
  0.02 GDP): `ma + or + di + ni = ot`.

**A consumer that charts `ma` alone charts the wrong, gross figure and the stack will not sum to
`ot`.** The net mandatory figure — the one that belongs in a stacked-outlays chart — is `ma + or`.
Net mandatory is positive in every year (min $0.028T in FY1962, min 4.49% of GDP), so the stack
never inverts once the fields are combined correctly.

Proved by `test_outlay_components_sum_to_total_in_every_unit_family` and
`test_net_mandatory_is_positive_in_every_year` in `pipeline/tests/test_pipeline.py`.

## Deficit / surplus sign (`de`)

`de = re - ot`. Negative is a deficit, positive is a surplus. Surplus years in the current series:
FY1969, FY1998, FY1999, FY2000, FY2001 (`test_surplus_years_are_positive_deficit_values`). A
consumer rendering the deficit/surplus band must read sign and vertical position as the primary
cue — colour is a secondary reinforcement only (`BRIEF.md` rule: colour never carries meaning
alone).

## Party control (`ctl`)

`ctl` is `Control | null`:

```ts
interface Control {
  p: string        // president's name
  pp: 'D' | 'R'     // president's party
  h: 'D' | 'R'      // House majority party
  s: 'D' | 'R'      // Senate majority party
  ctl: 'D' | 'R' | 'M'  // unified D, unified R, or mixed
  t: boolean        // handoff year (new president took office)
}
```

**`ctl` is `null` for every row outside FY1995–FY2025** (`_meta.coverage.control_start` /
`.control_end`; exactly 31 non-null rows, `test_party_control_is_null_outside_fy1995_2025`). This is
not "unknown" or "not yet curated" in a way that should render as a blank or greyed cell — a
consumer must render **no strip at all** for those years: no rect, no background, no outline. A
blank grey cell would visually assert "control exists but we don't know it," which is a different
and false claim.

## Laws (`L`)

`L: Law[]`, empty in 47 of the 64 rows. No row before FY1997 has any entries. A consumer must
render an explicit "no major law enacted this fiscal year" (or table `no data`) rather than an
empty string or `0` — this dataset follows the site-wide rule that absence is never rendered as
zero.

## `_meta`

- `_meta.source` — render **verbatim** wherever this dataset backs a `Figure` (`BRIEF.md` rule 1).
  Do not summarise it; put any scope/method caveat (e.g. "mandatory is net of offsetting receipts")
  in `Figure`'s `note` prop instead.
- `_meta.title` currently reads "…FY1995-FY2025" even though `_meta.coverage` and `_meta.notes[3]`
  correctly state the series now runs FY1962–FY2025. This is a known stale field — see
  `docs/parked-findings.md`. No component reads `_meta.title`; do not start.
