# Interface: `src/data/revenue_sources.json` and `src/data/oecd.json`

The consumer contract for the two datasets behind GOV-10 (`RevenueChart.tsx`, `OecdChart.tsx`).
Read this before charting either, because the two are easy to conflate and BRIEF.md rule 3 depends on
never doing so.

## `revenue` (`src/data/revenue_sources.json`, typed `Dataset<RevenueYear[]>`)

One row per fiscal year, FY1962-FY2025, 64 rows, contiguous, **zero null fields**
(`test_revenue_series_is_contiguous_and_has_no_null_fields`).

### Unit families

Three, by prefix, for seven components (`ii` individual income tax, `pr` payroll, `ci` corporate
income tax, `ex` excise, `cu` customs, `eg` estate and gift, `mi` miscellaneous) plus `tot`:

| Prefix | Meaning |
|---|---|
| `n_` | Nominal $ trillions |
| `g_` | Percent of GDP |
| `s_` | Percent of total revenue |

**There is no `r_` (real-dollar) family on this dataset.** `charts/format.ts`'s `Unit` type and
`UnitToggle` component hardcode `nominal \| real \| gdp` and do not fit this series; `RevenueChart`
deliberately does not use `UnitToggle` and defines its own three-way `View` type
(`'nominal' | 'gdp' | 'share'`) with a local Radix `ToggleGroup` instead.

### Sum-to-total invariant, in every unit family

`ii + pr + ci + ex + cu + eg + mi ≈ tot`, for the matching prefix, in every row:

| Family | Tolerance | Test |
|---|---|---|
| `n_` | 0.003 $T | `test_revenue_components_sum_to_total` |
| `g_` | 0.01 pp | `test_revenue_components_sum_in_the_gdp_and_share_families` |
| `s_` | 0.05 pp of 100 | `test_revenue_components_sum_in_the_gdp_and_share_families` |

Both `pipeline/lib/validate.py`'s `check_revenue` and pytest assert all three; a build fails rather
than shipping a stack that silently stops summing to its total.

### The `share` view is normalised; `gdp` and `nominal` are not

`s_*` sums to 100 **by construction**, because it is a share-of-total series, so a stack built from it
always tops out at 100. `g_tot` does **not** behave the same way: its real range across the series
is 14.53 (the FY2020 trough era) to 20.02 (FY2000), nowhere near 100. A GDP-share stack must use a
y-domain derived from the data (`niceExtent([0, max g_tot])`), never a fixed `[0, 100]`, because doing so
would visually claim the GDP-share stack sums to the same thing the share-of-revenue stack does,
which is false. `nominal` is likewise unnormalised, domain derived from `n_tot`.

### `mi` (miscellaneous) is never zero

`n_mi` and `g_mi` are positive in every one of the 64 years (min `n_mi` $0.8B, min `g_mi` 0.144% of
GDP). A consumer must draw this band, name it in every readout/`aria-label`, and give it its own
table column in all three views. Never drop it silently for being small
(`test_miscellaneous_revenue_is_never_zero`).

### Customs duties

The fastest-growing component by share of GDP: `g_cu` FY2025/FY1995 ratio is 2.518, the highest of
all seven components (next highest, `g_ii`, is 1.121). In nominal dollars: $19B (FY1995) to $195B
(FY2025). Proved by `test_customs_is_the_fastest_growing_revenue_line`.

## `oecd` (`src/data/oecd.json`, typed `Dataset<OecdComparison>`)

Single-object payload (not an array): `year`, `us_pct_gdp`, `oecd_average_pct_gdp`, `us_rank`,
`of_countries`, `countries: OecdCountry[]`, `us_history: { year, v }[]`.

### The country list is a SELECTION

`countries` has 11 rows (10 named countries plus one `is_average`-flagged row) against
`of_countries: 38`. Any chart built from `countries` is showing a selection of the full OECD
membership and **must say so**. `test_oecd_average_is_flagged_and_the_country_list_is_a_selection`
and `pipeline/lib/validate.py`'s `check_snapshots` both assert `len(countries) < of_countries`.

### `is_us` / `is_average` flags

Exactly one row carries `is_us: true` (`United States`, `v` equal to `us_pct_gdp`) and exactly one
carries `is_average: true` (`OECD average`, `v` equal to `oecd_average_pct_gdp`). Both are absent
(never `false`) on every other row. `OecdChart` **removes the average row from the country rows
entirely** and draws it as a labelled vertical reference line instead, which is how "marked as an
average, not a country" is satisfied structurally rather than by a legend note. The US row is
marked by three channels (fill weight, dot size, bold label with inline value), never by hue alone.

## BRIEF.md rule 3: these two datasets are NOT comparable

`revenue_sources.json`'s `g_tot` is **federal revenue only** (17.24% of GDP in FY2025).
`oecd.json`'s `us_pct_gdp` (25.6%) counts **federal, state and local government together**. Both
datasets' `_meta.notes` state this explicitly
(`test_oecd_and_federal_revenue_are_marked_as_different_scopes`), and the government route states
it a third time, in body copy. Never only in a `Figure` `note`, and never in a tooltip
(`src/pages/government/index.astro`, the paragraph containing "federal, state and local").

## Two dating exceptions

`oecd.json` is 2024 preliminary data, the latest OECD year, breaking the FY1995/FY2025 convention
used elsewhere on this route. The IRS tax-year-2023 shares-by-income-group figures (`sections.md`
§10's "Who pays the income tax" paragraph) are a second, unrelated dating exception; that content
belongs to the households route (issues #9/#11) and is not rendered by this section at all.
Nothing is outstanding here, and the content is out of scope.

## `OecdChart`'s margin deviation

`OecdChart` passes an explicit `margin` to `<Chart>` (`{ top: 34, right: 24, bottom: 40, left: 118
wide / 96 narrow }`) rather than the `useChartSize` presets, because country names need more left
gutter than either preset's `left` provides. It still reads its `narrow` flag and breakpoint from
`useChartSize`; only the margin values themselves are overridden. See
`docs/contracts/interfaces/charts.md`'s `useChartSize` section.

## Schema

`pipeline/schemas/revenue_sources.schema.json`, enforced on every build by `check_schema`
(#37). A consumer may rely on:

- `data` is an array of at least 60 rows, each carrying all 25 keys with none optional: `y`
  (integer) plus the three families `n_` / `g_` / `s_` × `ii`, `pr`, `ci`, `ex`, `cu`, `eg`, `mi`,
  `tot`.
- The `s_*` share family is bounded `0 … 100`, as is `g_*` (percent of GDP). `n_*` is
  `minimum: 0`. Nothing here is nullable, because a missing component is a build failure rather than a hole.
- `_meta` requires `source` (`minLength: 12`), `title`, `provenance` and `coverage`
  (`start`, `end`).

Shape and range only. That `s_tot` is exactly 100 and that the components reconcile to `tot` stay
in `validate.py`'s `check_revenue`.
