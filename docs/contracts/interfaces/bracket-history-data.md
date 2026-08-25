# Interface: bracket history and CBO effective rates (`src/data/bracket_history.json`, `src/data/cbo_effective_rates.json`)

The consumer contract for the two datasets behind Households §3 (`BracketHistory.tsx`) and §4
(`StatutoryVsEffective.tsx`). Read this before changing either builder or either island — it exists
so a shape change surfaces here rather than as a silent chart regression.

## `bracket_history.json` (`pipeline/oneshot/bracket_history.py`)

One row per tax year, 1913-2025, 113 rows, no gaps. `_meta.coverage.filing_status` gives the first
year each status appears (`single` 1913, `mfj`/`mfs` 1949, `hoh` 1952).

```json
{ "y": 1913, "top": 7.0, "sched_top": 7.0, "adj": null, "nb": 7,
  "s": { "single": [ { "r": 1.0, "lo": 0, "hi": 20000, "rlo": 0, "rhi": 634528.79 }, ... ],
         "mfj": null, "mfs": null, "hoh": null } }
```

| Field | Contract |
|---|---|
| `y` | Tax year. |
| `top` | The PUBLISHED top statutory rate (percent), from `curated/top_rates.yaml` — the site's one canonical top-rate figure, used everywhere else (`income_inequality.top`). |
| `sched_top` | `max(rate)` on the raw bracket-schedule ladder for the `single` status (percent). Differs from `top` in exactly twelve years. |
| `adj` | `null` unless `top` and `sched_top` disagree, in which case `{schedule, published, why, source}` — both numbers plus the documented reason. A year where the two agree NEVER carries an `adj` entry. |
| `nb` | Bracket count on the `single` schedule — the only status spanning all 113 years. Ranges from 2 (1988) to 56 (1918). |
| `s.<status>` | `single` \| `mfj` \| `mfs` \| `hoh`. `null` before that status existed in this data (never a back-projected copy of `single`). Otherwise a list of brackets sorted by `lo`. |
| bracket `.r` | Marginal rate, percent. |
| bracket `.lo` / `.hi` | Nominal-dollar floor / ceiling. `.hi` is `null` on exactly the top bracket of each ladder, never `0`. Pre-2020 rows set `.lo` equal to the previous bracket's `.hi` (as published); 2020 onward (and the curated 2019 regression year) set `.lo` one dollar higher. See `_meta.threshold_convention`. |
| bracket `.rlo` / `.rhi` | Same thresholds in constant 2024 dollars, via `_meta.deflator` (FRED CPIAUCNS, calendar-year mean of 12 monthly observations, rebased to the 2024 annual average = 100). `.rhi` is `null` exactly where `.hi` is. |

`_meta.adjustments` mirrors the twelve `adj` entries keyed by year. `_meta.bracket_count` gives
`{min, min_year, max, max_year}`, asserted against the computed extremes rather than hardcoded.
`_meta.traps` is the corrected, per-item trap list (surtax years named explicitly, ordinary-income-
only, capital gains, AMT, NIIT, the 1981 part-year blend) — `curated/top_rates.yaml`'s `_comment`
no longer carries the blanket "Excludes surtaxes" claim that 1940 and 1968-1970 contradict.

**Known upstream data defect, worked around, not out of scope:** the fetched Tax Foundation CSV
carries one corrupt row (1985, single: a duplicate zero-rate bracket with an open-ended top,
alongside the real 0%-to-$2,390 "zero bracket amount" row). `bracket_history.py`'s
`_drop_phantom_zero_row` detects and drops exactly this one known corruption and raises
`SourceUnavailable` on any other duplicate `lo` it has not already accounted for, rather than
guessing how to resolve an unfamiliar corruption.

**Known upstream data gap, dated, not invented:** the October 2025 CPI-U was never collected (2025
government shutdown; BLS stated it could not retroactively gather it — the first gap in this
monthly series since 1921). `bracket_history.py` accepts 11 monthly observations for calendar year
2025 only (`EXPECTED_MONTHS`), and raises for any other year with fewer than 12.

## `cbo_effective_rates.json` (`pipeline/monthly/curated_snapshots.py`)

A curated snapshot, not a builder in its own right — same shape family as `debt_holders` /
`income_tax_by_group`. `data.rows` is **published anchor points, never an annual series**:
1979, 2000, 2007, 2019, 2022, each independently transcribed from CBO's own table.

```json
{ "as_of": "2026-01-15", "basis": "... INCLUDES PAYROLL TAX ...",
  "not_an_annual_series": "Published anchor years only. ...",
  "groups": ["lowest", "second", "middle", "fourth", "highest", "top1"],
  "rows": [ { "year": 1979, "source_table": "CBO, ...", "v": { "lowest": 9.3, ..., "top1": 35.1 } }, ... ] }
```

| Field | Contract |
|---|---|
| `basis` | Must name `"payroll"` — the comparability trap against `income_tax_by_group` (income-tax-only) is structural, checked at the validation gate, not left to editorial memory. |
| `rows[].source_table` | Non-empty on every row — no anchor point may be invented. |
| `rows[].v.top1` | Always `>= v.highest`, which is always `> v.lowest`, in every anchor year. |

**A chart consuming this must never draw a connecting line between rows.** Render each as a
discrete, directly-labelled marker (see `StatutoryVsEffective.tsx`).

## Consumers

`src/data/types.ts` adds `FilingStatus`, `Bracket`, `RateAdjustment`, `BracketYear`,
`CboEffectiveRates`. `src/data/index.ts` exports `bracketHistory` as `Dataset<BracketYear[]>`
(single-assertion convention) and `cboEffectiveRates` as `Dataset<Record<string, unknown>>` with a
narrowing accessor through `unknown` — `astro check` rejected a single assertion for
`CboEffectiveRates`'s non-tabular shape, the same situation issue #9's `debtHolders` /
`incomeGroups` already document.
