# Interface: `src/data/states_balance.json` and `src/data/states_tax_mix.json`

The consumer contract for issue #14 (Government §11, "By state, and which states give more than
they get"). Both outputs are **objects, not bare arrays** — `lib/report.py`'s `_dig` walks dotted
paths and `_rows` requires a `y` key these rows do not have, so a chart reads `data.jurisdictions`,
never `data` itself as a list.

## Source discovery

Both fetched sources are discovered, never hardcoded, the same way `lib/sources.py`'s
`latest_cbo_vintage` discovers CBO vintages:

- `latest_irs_table5()` scrapes the SOI Table 5 landing page for linked `.xlsx` files and picks the
  newest by the leading two-digit fiscal year in the basename. The basename convention itself
  changed between FY2024 (`24dbs01t05co.xlsx`) and FY2025 (`25db-1-05-co.xlsx`); a hardcoded path
  would have silently kept serving FY2024.
- `latest_census_stc()` walks `.../stc/tables/` newest-year-first and returns the first year whose
  `FY{year}-STC-Detailed-Table-Transposed.xlsx` actually fetches.

**Consequence a reader of this contract must know**: at the time this pipeline was built, both
discoveries independently resolved to **FY2025** — not the FY2024 Census vintage the original
planning probe observed. Discovery is mandatory precisely so that a newly published vintage is
picked up automatically; do not assume any specific year without reading `_meta.provenance.vintage`
on the actual output. `states_balance.fy_give` and `.fy_get` are always equal by construction
(`_usaspending_by_state` derives its fetch window from the discovered IRS fiscal year); `fy` on
`states_tax_mix` is independent and can differ.

## `states_balance`

```jsonc
{
  "fy_give": 2025, "fy_get": 2025,
  "national": { "give_b": 5313.762, "get_b": 5235.962, "population": 335073176 },
  "color_domain": { "basis": "balance_pc", "min": -113121.99, "max": 113121.99, "mid": 0, "excludes": ["DC"] },
  "summary": { "n_get_more": 28, "n_give_more": 23, "n_with_both": 51 },
  "jurisdictions": [ /* 56: 50 states + DC + PR/GU/VI/MP/AS */ ]
}
```

### give / get, and what neither side is

- **`give_b`** — IRS SOI Data Book Table 5, gross federal tax collections, classified by the
  filer's address (a corporation's tax is booked to its principal office; withholding is booked to
  the employer's location). $ billions.
- **`get_b`** — USASpending `spending_by_geography`, award spending classified by **place of
  performance**, not the recipient's residence. $ billions.
- **This is not a balance of payments.** The Rockefeller Institute publishes the actual
  balance-of-payments study; its series ends FY2022 and is cited in `SOURCES.md`, never ingested (no
  machine-readable feed exists). Give and get here are both narrower than their balance-of-payments
  equivalents and are not opposite sides of one ledger. Any consumer rendering these figures must
  say so in body copy — never in a tooltip or chart furniture (`Figure`'s `note` prop, or a `<p
  class="prose">`, are the only sanctioned places).

### `is_state` vs `in_grid` — read this before filtering

These are **not the same set** and the distinction is load-bearing:

| Flag | True for | False for |
|---|---|---|
| `is_state` | The 50 actual states only | DC and the 5 territories |
| `in_grid` | The 50 states plus DC (51) | The 5 territories only |

`is_state` is false for DC **deliberately**, because `color_domain` is computed only over
`is_state` rows and DC — an extreme outlier by construction as the seat of federal employment —
is excluded from it so it does not compress the scale for all 50 states (`test_states_dc_is_flagged_and_excluded_from_the_colour_domain`
in `pipeline/tests/test_pipeline.py`). DC is still `in_grid: true`: it is drawn on the tile
cartogram and listed in the sortable table, just never used to compute the colour bounds. A
consumer that filters jurisdictions for the tile grid must use `in_grid`; a consumer computing or
re-deriving a colour scale must use `is_state`.

### Null semantics — absence is never zero

Every derived field (`give_pc`, `get_pc`, `balance_b`, `balance_pc`, `ratio`) is `null` when either
side is missing, never `0`. The five territories (`PR`, `GU`, `VI`, `MP`, `AS`) have `give_b: null`
— IRS Table 5 carries no state-level breakdown for them — while `get_b` is populated, an asymmetry
that must render as `no data` on the give side, not as `$0`. `ratio` (`get_b / give_b`) is `null`
whenever `give_b` is `0` or missing, never `Infinity` or a divide-by-zero.

### `color_domain`

`min`/`max` are symmetric about zero (`max(abs(lo), abs(hi))` mirrored) and computed over
`is_state` jurisdictions only. `excludes: ["DC"]` records that DC is drawn but not counted toward
the bounds; a consumer must state this in the legend, not only in code.

## `states_tax_mix`

```jsonc
{
  "fy": 2025,
  "categories": [
    { "k": "income_ind", "label": "Individual income tax", "item": "T40" },
    { "k": "income_corp", "label": "Corporate income tax", "item": "T41" },
    { "k": "sales_general", "label": "General sales tax", "item": "T09" },
    { "k": "property", "label": "Property tax", "item": "T01" },
    { "k": "other", "label": "All other taxes", "item": "derived" }
  ],
  "jurisdictions": [ /* 51: 50 states + DC */ ]
}
```

`shares[k]` is percent of that jurisdiction's own `total_b`, not of the US total. `other` is
derived (`total_b` minus the four named categories), not a Census item code of its own.

### `not_levied` vs a missing figure — the two must never collapse

A Census cell of `"X"` means the state **does not levy** that tax at all — Alaska has no general
sales tax and no individual income tax, which is a fact, not a gap. This is recorded as
`shares[k] = null` **and** `k` appended to that jurisdiction's `not_levied` array. A consumer must
render this as `"none levied"`, distinct from `"no data"`, which is reserved for a `null` share
whose category is absent from `not_levied` (only reachable if a future vintage's `T00` total itself
fails to parse — see `partial`, below). Rendering both the same way — as a blank, a dash, or `$0` —
is exactly the fabrication this pipeline's gate exists to prevent.

`partial: true` (optional, omitted when false) flags a jurisdiction whose total (`T00`) itself could
not be read; every share is `null` in that case and none is in `not_levied`, because "not levied"
is a specific claim about a specific tax that cannot be made without a total to compare against.

### `stc_includes_dc`

`_meta.coverage.stc_includes_dc` is read from the fetched header, never assumed: the source's
US-total column is labelled as excluding DC regardless of whether DC has its own jurisdiction
column, and whether it does is a property of the specific vintage fetched.

## JSON Schema

`pipeline/schemas/states_balance.schema.json` and `states_tax_mix.schema.json` were the first two
schemas in what was an empty `pipeline/schemas/` directory. Since #37 the coverage is **universal
and mandatory**: `lib/validate.py`'s `check_schema` validates every output `build.py` emits, and an
output with no `schemas/<name>.schema.json` is a recorded build failure naming the output and the
expected path — never a skip. `test_every_published_output_has_a_schema` holds the population
whole, and `test_every_schema_rejects_a_realistic_corruption` proves both of these two schemas
bite: a jurisdiction's `ratio` written as `0` and a `shares` value over `100` are each rejected.

These two schemas are unchanged by #37 — they are the reference form the other twelve follow.
