# Interface: the law/vote data (`src/data/budget.json` laws + `src/data/party_splits.json`)

The consumer contract for §8, the law explorer. Two datasets, joined at the client, back it:
`budget.data[].L` (the law list, embedded per fiscal year) and `partySplits` (the counted vote
splits). Read this before adding a column, a filter, or a sort key to `LawExplorer.tsx` — several
fields here have a convention that silently produces a wrong or misleading cell if assumed away.

## The join

`laws` (`src/data/index.ts`) flattens `budget.data[].L` into one array of 23 `Law` rows.
`splitByLaw` (same module) is `Map<public_law, PartySplit>` built from `partySplits.data`. Every
law's `public_law` is a key of this map — all 23 join, 0 unjoined
(`test_every_law_joins_to_a_counted_split`). `LawExplorer` re-derives this join itself from its
`laws`/`splits` props (kept as props, not imports, so the island's data entry point stays
`assertDataset` in `src/data/index.ts`) rather than deriving any vote figure from `Law.vote_character`
or `Law.legacy_comp` — those two fields are the retired classification and back nothing in this UI.

## `d` vs `d_caucus` — the basis a chart MUST state

Each `ChamberVote` carries Democratic votes two ways:

| Field | Basis |
|---|---|
| `d` | Party membership only |
| `d_caucus` | Membership plus independents who caucus with the Democrats |

`d_caucus` is the convention the House Clerk, the Senate roll calls and press coverage all use, and
is this island's default (`basis: 'caucus'`). The two bases differ by two Senate seats through most
of the period (`partySplits._meta.party_vs_caucus`,
`test_senate_caucus_differs_from_party_membership`). A consumer switching bases must restate which
one is active in visible prose, not only in the control — D2 requires this stated in the UI, not
just toggleable.

## `house: null` / `senate: null` — absence, never unanimity

A null chamber means **no roll call exists**, almost always a voice vote — never a unanimous or
zero vote. Only the CARES Act (`116-136`) has a null chamber (`house: null`), and it carries a
`note` explaining why (verbatim, quoted in the table's `‡` footnote). A consumer must never render
a null chamber as `0-0`, `unanimous`, or a blank cell; `LawExplorer`'s `houseCellText` renders
`"no roll call — passed the House by voice vote"` instead
(`test_cares_house_cell_has_no_countable_vote`).

## The cross-party threshold

`partySplits._meta.cross_party_threshold` is a verbatim string defining `character: 'cross-party'`
vs `'party-line'`: at least 10% of a chamber's yes votes from the minority party, on the caucus
basis, in **at least one** chamber. It is a judgement call, and D7 requires the UI render this
string verbatim as visible page text (not a tooltip) so a reader can see and disagree with it.
Never re-type this threshold by hand in a component — pass it through as a prop
(`LawExplorer`'s `threshold`) so the UI text cannot drift from the dataset that defines it.

## The margin definition (D6)

`margin(split)` — in `src/components/laws/derive.ts` — is the **narrowest passage margin across
chambers that have a roll call**: `min` over non-null chambers of `yea - nay` (the chamber-wide
tally, not a per-party one). This is the sort key for the "Margin" column; the derived `character`
field (cross-party/party-line) is never used as a sort key. CARES has no House roll call, so its
margin is its Senate margin (96) — the function is total over all 23 laws
(`test_narrowest_chamber_margin_is_defined_for_every_law`), never `NaN` or excluded from the sort.

## 50-50 Senate ties (E3)

Three laws have a Senate chamber-wide tally where `yea === nay`: JGTRRA (`108-27`), the Inflation
Reduction Act (`117-169`), and the One Big Beautiful Bill Act (`119-21`)
(`test_vp_tiebreak_laws_are_exactly_the_three_named`). A 50-50 Senate vote **passes**, on the Vice
President's tiebreak, which does not appear in the roll call. A consumer must never render this as
a failure or as an ambiguous tie; `senateCellText` appends
`"50-50, passed on the Vice President's tiebreak (not in the roll call)"`.

## `score_t: null` — the two 1997 laws (D4/E2)

`105-33` (Balanced Budget Act) and `105-34` (Taxpayer Relief Act) predate the ten-year scoring
convention and carry `score_t: null`. They:

- Still carry a full, non-null vote in both chambers (`test_the_two_1997_laws_carry_no_score_but_do_carry_votes`).
- Are excluded from every displayed cost total (`totalsOf` in `derive.ts` sums only non-null
  `score_t`).
- Sort **last in both directions** on the "Ten-year score" column — a `nullsLast` comparator
  (`compareNullsLast`), never `?? 0`, which would rank a missing score as if it were free.

## The published totals (D5)

Filtering to `character: 'party-line'` (7 laws) totals `$7.51T`; `'cross-party'` (16 laws, including
the two null-score 1997 laws contributing `0`) totals `$9.24T`. These are the exact `toFixed(2)`
strings the UI prints (`test_filter_totals_render_to_the_published_two_places`), not a tolerance —
`pipeline/curated/laws.yaml`'s `totals.party_line_t: 7.52` is a stale rounding of the true `7.512`
and is not the number this UI or `sections.md` §8 states; see `docs/parked-findings.md`.

## Enactment-date chart markers

`enactmentFy(date)` / `fyPosition(date)` (`derive.ts`) place a law's marker within its fiscal year on
the annual deficit chart: `fyPosition` returns a value in `[fy - 1, fy)`, since the chart plots one
point per fiscal year at its FY number and a date needs to sit *within* the year, not on the tick.
Every law's enactment fiscal year has a non-null `g_de` in `budget.data`
(`test_deficit_share_exists_for_every_enactment_fiscal_year`), so no marker lands on a gap in the
series.
