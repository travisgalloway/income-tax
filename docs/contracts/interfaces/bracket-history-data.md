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

The **published** 1985 single ladder is therefore correct and is asserted positively, not merely
parsed: 16 brackets — a 0% zero bracket `$0–$2,390`, then 11/12/14/15/16/18/20/23/26/30/34/38/42/
48/50 %, the top 50% bracket open-ended above `$85,130`. Primary source: IRS 1985 Form 1040 Tax
Rate Schedule X (1985 was the first indexed year under ERTA'81; the single-filer zero bracket
amount was $2,390), reproduced in IRS SOI Historical Table 23.

Both halves of the guard are proven to bite:

| Guard | Where | Proven by |
|---|---|---|
| Ingest: drop the one known phantom row, raise on any other duplicate `lo` | `oneshot/bracket_history.py` `_drop_phantom_zero_row` | `test_phantom_zero_row_guard_rejects_a_duplicate_in_any_other_year` |
| Published output: bracket floors strictly increase in **every** year/status ladder, plus the 1985-single fingerprint above | `lib/validate.py` `check_bracket_history` | `test_check_bracket_history_rejects_a_duplicate_bracket_floor` |

The output-side check is a `validate.py` invariant, not a JSON-Schema one — JSON Schema cannot
express "strictly increasing across array items". A duplicate floor in any year fails the build
with a message naming the year, the status and the duplicated floor.

**Known upstream data gap, dated, not invented:** the October 2025 CPI-U was never collected (2025
government shutdown; BLS stated it could not retroactively gather it — the first gap in this
monthly series since 1921). `bracket_history.py` accepts 11 monthly observations for calendar year
2025 only (`EXPECTED_MONTHS`), and raises for any other year with fewer than 12.

### Where the 1913-2019 ladder comes from, and why it is not fetched from IRS (#55)

`_meta.source` names the Tax Foundation `income-tax-rates.csv` as a **compilation of** IRS SOI
Historical Table 23 and the IRS Revenue Procedures. That wording is deliberate and it is the
outcome of a live probe, not an impression. Probed **2026-08-26**:

| URL | Status | Bytes | What it is |
|---|---|---|---|
| `https://www.irs.gov/pub/irs-soi/histab23.xls` | **200** | **99,840** | Table 23 itself. Legacy BIFF8 `.xls` (Composite Document File V2), last saved 2021-01-13. |
| `https://www.irs.gov/statistics/soi-tax-stats-historical-table-23` | 200 | 104,147 | The landing page linking the above. |
| `https://www.irs.gov/pub/irs-soi/histab23.xlsx` | **404** | — | No modern-format twin. |
| `https://www.irs.gov/pub/irs-soi/histabb.xls` | 200 | 56,320 | A different historical table, not the ladder. |
| `https://www.irs.gov/pub/irs-soi/histaba.xls` | 404 | — | — |
| `https://www.irs.gov/pub/irs-soi/histab24.xls` | 404 | — | No Table 24. |
| `https://www.irs.gov/pub/irs-soi/23in01ts.xls` | 404 | — | — |
| `https://www.irs.gov/pub/irs-soi/02inrate.xls` | 404 | — | — |
| `https://www.irs.gov/statistics/soi-tax-stats-historical-data-tables` | 200 | 122,703 | Index of the historical-tables release. |

SHA-256 of the fetched `histab23.xls`, re-verified at execution:
`57aed4c02ac6c6dcd39d0fea18ca231ebe22085acedf098b3b993fb154399557`.

**Table 23's actual granularity, read out of the file** (`Sheet1`, 245 rows × 15 columns, header
rows 2-4) is eight columns:

```
Tax year | Personal exemptions [Single, Married, Dependents]
         | Tax rates for regular tax
             Lowest bracket  [rate, taxable income under]
             Highest bracket [rate, taxable income over]
```

**Two rates per year — the lowest and the highest.** There is no per-bracket ladder, no filing-status
dimension beyond the exemption columns, and nothing resembling the
`(year, filingStatus, rate, incomeGreaterThan, incomeNotGreaterThan)` tuples `_fetch_ladder`
consumes. Coverage is **1913-2018, 106 rows, no gaps** — it does not reach 2019, where the fetched
CSV ends.

**So the fetcher stays on the Tax Foundation CSV.** Not as a shortcut: no IRS release publishes the
ladder at per-year, per-filing-status, per-bracket granularity, so there is no primary feed to move
to. Tax Foundation is a compiler of primary data here, not a reporter on it, which is why it is not
in `sources.yaml`'s `not_a_source`. `pipeline/oneshot/bracket_history.py` is unchanged by #55:
`TF_CSV`, `_drop_phantom_zero_row`, `min_bytes=150_000` (measured, not guessed) and
`EXPECTED_MONTHS = {2025: 11}` all keep exactly the state documented above.

### The top-rate series is anchored on Table 23, and the anchor is checked (#55)

Table 23's *highest bracket* column **is** the series `curated/top_rates.yaml` publishes, so the
citation that file already carried is now an observation rather than a claim.
`pipeline/curated/top_rates_soi_anchor.yaml` holds that column for 1913-2018 with full provenance
(URL, SHA-256, retrieval date, sheet, column, and the `uv run --with xlrd` reproduction command).
It is curated and frozen — Table 23 ends at 2018 and was last saved 2021-01-13 — and `xlrd` is
deliberately **not** a project dependency, because nothing in the build reads `.xls`.

`lib/validate.py` `check_top_rates_anchor` runs **unconditionally** at the validation gate (it
reconciles two curated files and needs no output, so a tier gate would only make it skippable,
#37). It fails naming the year and both values, and asserts the anchor covers 1913-2018 with no
gaps — the half that stops a footnote-prefixed cell (`[19] 91.0` at 1954, `[24, 25] 70.0` at 1974,
`[36] 39.6` at 2000) being silently dropped and quietly shrinking the check's reach. Proven to
bite by `test_the_soi_anchor_check_rejects_a_top_rate_that_drifts_from_it`.

**All 106 overlapping years agree to the digit; no published value changed.** The remaining seven
years, 2019-2025, are outside Table 23's range and are anchored on PL 115-97 and Revenue Procedures
2018-57 through 2024-40, transcribed in `curated/brackets_modern.yaml`. **Tax Policy Center was
removed** from every citation: every value it was cited for is corroborated by Table 23 or by a
Revenue Procedure, so it was doing no work the register could point a reader at.

Removing it reached one place outside this dataset. The `marginal-rate` glossary term cited
`tax_policy_center` as its sole source, and #50's `check_glossary_sources` correctly refused to
build a term whose citation no longer resolves. It now cites `irs_soi_table_23` and
`irs_revenue_procedures` — the same pair its sibling `statutory-rate` cites, and the primary
documents that actually publish the ladder the definition describes.

Incidental corroboration of the 1985 defect above, from the same primary source: Table 23's 1985
row reads lowest bracket **11.0%**, highest **50.0%** over **$169,020** (that floor is the
married-filing-jointly figure; the single-filer 50% floor is $85,130, which is what the site
publishes). An 11% lowest rate is independent confirmation that the open-ended **0%** row is
corrupt and that the real 0% row is the $2,390 zero-bracket amount. The existing guard is right and
#55 changed no part of it.

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

## Schema

`pipeline/schemas/bracket_history.schema.json`, enforced on every build by `check_schema` (#37).
The effective-rate companion, `cbo_effective_rates.json`, is a curated snapshot — its schema is
described in `curated-snapshots.md`.

A consumer may rely on:

- `data` is an array of at least 110 rows, each carrying `y`, `top`, `sched_top`, `nb`, `s` and
  `adj`. `nb` is an integer `minimum: 1`; `top` and `sched_top` are bounded `0 … 100`.
- `adj` is `["object", "null"]`; when present it requires `schedule`, `published`, `why` and
  `source`, so an undocumented adjustment year cannot ship.
- `s` requires all four filing statuses (`single`, `mfj`, `mfs`, `hoh`), each `["array", "null"]`.
  **`null` means the status did not exist that year** — 1913–1948 for `mfj`/`mfs`, 1913–1951 for
  `hoh` — and is never an empty array.
- Each bracket requires `r`, `lo`, `hi`, `rlo`, `rhi`. `lo` and `rlo` are plain numbers
  `minimum: 0` (a bottom bracket legitimately starts at zero). **`hi` and `rhi` are
  `["number", "null"]` with `not: {"const": 0}`** — the top bracket's open ceiling is `null`, and a
  ceiling written as `0` fails the build. This is the same rule
  `test_bracket_history_absent_values_are_null_not_zero` guards in Python.
- `_meta` requires `source` (`minLength: 12`), `title`, `provenance`, `coverage`, `deflator`
  (`series_id`, `basis`, `base_year`), `adjustments` and `bracket_count`.
