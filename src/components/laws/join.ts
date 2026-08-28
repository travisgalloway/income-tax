/** The one join from `laws` to `party_splits.json`.
 *
 *  Both consumers of the joined pair go through here: §9's attribution
 *  derivation (`src/components/attribution/aggregate.ts`) and §8's law
 *  explorer (`src/components/islands/LawExplorer.tsx`). Before issue #33 each
 *  built its own `Map` keyed on `public_law` and disagreed about an unmatched
 *  law, one threw, the other silently dropped the row.
 *
 *  **Join key.** The exact `public_law` string on both sides. A law enacted as
 *  a pair carries the composite key verbatim (`"111-148 / 111-152"`) and
 *  matches as one string, never split, never normalised.
 *
 *  **Unmatched law: throw, at prerender.** A law with no matching split, or
 *  with no `public_law` at all, fails the build with the law named. The
 *  alternative, dropping it, removes a row from §8's table and shrinks the
 *  `N laws · $X.XXT scored` totals line with no signal, publishing a wrong
 *  number. Both consumers are evaluated during `astro build` (aggregate.ts at
 *  module import, LawExplorer because Astro server-renders the island even at
 *  `client:load`), so the throw fails the build rather than the browser. A law
 *  with no public-law number has no join key and must be triaged by hand.
 *
 *  **This module imports types only, and that matters.** Importing
 *  `src/data/index.ts` here would pull all fourteen dataset JSONs into
 *  LawExplorer's `client:load` bundle. Callers pass the data in.
 */
import type { Law, PartySplit } from '../../data/types'

export interface Row {
  law: Law
  split: PartySplit
}

/** Join `laws` to `splits` on `public_law`, preserving `laws` order, §9's
 *  president ordering and §8's default date sort both depend on it. */
export function joinLawsToSplits(laws: Law[], splits: PartySplit[]): Row[] {
  const byPublicLaw = new Map<string, PartySplit>()
  for (const split of splits) {
    if (split.public_law != null) byPublicLaw.set(split.public_law, split)
  }

  return laws.map((law) => {
    if (law.public_law == null) {
      throw new Error(
        `joinLawsToSplits: ${law.name} has no public_law and cannot be joined to ` +
          'party_splits.json; it must be triaged by hand, not dropped from a published count.',
      )
    }
    const split = byPublicLaw.get(law.public_law)
    if (!split) {
      throw new Error(
        `joinLawsToSplits: ${law.public_law} (${law.name}) has no counted split in party_splits.json`,
      )
    }
    return { law, split }
  })
}
