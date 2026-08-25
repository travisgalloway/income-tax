# Interface: `src/components/attribution/aggregate.ts`

The consumer contract for §9's derivation — joining `laws` to `splitByLaw`
(`src/data/index.ts`) and bucketing the result two ways. Read this before touching
`AttributionSplit.tsx` or adding a third breakdown: the join key, the exclusion
rule and the rounding rule are each a single place, and moving them anywhere
else reopens the reconciliation bug this module exists to prevent.

## Join key

`law.public_law` against `PartySplit.public_law` (`src/data/party_splits.json`).
All 23 laws in `laws` resolve, including the composite key `"111-148 / 111-152"`,
which matches on both sides as one exact string. A law with no match throws at
import time rather than being silently dropped.

## Exclusion rule

A law with `score_t === null` is dropped from every sum in both breakdowns. That
is exactly `105-33` and `105-34` (the two 1997 laws, which predate the ten-year
scoring convention and carry no comparable figure). It is still counted toward
its coalition's `lawsInCoalition` total, which is why the cross-party coalition
reports 16 laws in prose but 14 scored laws in the bar and table.

## Bucket definitions

- **Coalition** (`byCoalition`): `'cross-party'`, `'party-line-r'`, `'party-line-d'`.
  Assignment reads **only** `PartySplit.character` and, for `'party-line'`, the
  counted yea totals (`house`/`senate` `.r.yea` vs `.d_caucus.yea`, summing across
  chambers with a `null` chamber contributing nothing — a `null` chamber means NO
  ROLL CALL, never a zero vote). `legacy_classification`, `legacy_comp` and
  `vote_character` are never read; those are the classified predecessor this
  replaces. `character === 'no recorded vote'` throws rather than being silently
  bucketed — no law has this value today.
- **President** (`byPresident`): keyed on `Law.president`, ordered by the date of
  each president's earliest scored law (chronological, not the order the
  verbatim finding paragraph lists them in).

## Net vs. gross

- `increases` — sum of positive `score_t` values in the bucket, $T.
- `reductions` — sum of negative `score_t` values, kept **negative**, $T.
- `net` — `increases + reductions`.

A bucket with no reductions reports `reductions: 0`, a counted zero, never
absent — `TableView`'s `no data` stays reserved for a series that does not
reach, and this figure has none.

## Rounding rule

Every `score_t` is converted with `Math.round(score * 1000)` into thousandths of
a trillion and summed as an **integer**. Division by 1000 happens exactly once,
at the point a `Bucket`'s `increases`/`reductions`/`net` fields are produced.
Never sum already-rounded, already-displayed $T values — `$5.21T + $2.31T`
displays as `$7.52T` by naive addition, but `5.206 + 2.306 = 7.512` rounds to
`$7.51T`. This module always does the latter.

## The reconciliation invariant

After both breakdowns are built, the module compares, as integer thousandths:

```
sum(byCoalition[*].increases) === sum(byPresident[*].increases) === TOTALS.increases
sum(byCoalition[*].reductions) === sum(byPresident[*].reductions) === TOTALS.reductions
sum(byCoalition[*].net) === sum(byPresident[*].net) === TOTALS.net
```

A mismatch throws at **import time**, with both sums in the message. Astro
imports this module while prerendering `AttributionSplit.tsx`, so a drift fails
`npm run build` — it cannot ship. This is the same defence-in-depth shape as
`assertDataset` in `src/data/index.ts:38`.

## `TOTALS`

`{ net: 16.75, increases: 20.731, reductions: -3.981, scoredLaws: 21, excluded: 2 }`
(current data). A consumer should read these rather than re-summing the bucket
arrays, so there is exactly one place the total is computed.

## Consumers

`src/components/islands/AttributionSplit.tsx` is the only consumer. It imports
`byCoalition`, `byPresident` and `TOTALS` and never recomputes a coalition or a
sum itself — the geometry, colour and table are all derived from the `Bucket[]`
shape above.
