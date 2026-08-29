import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { REGISTER_KEYS, sourceLine, sourceLinks } from './data/source-register'

/** SOURCES.md is the repository's reference document and lives at the root, where the pipeline
 *  and the brief both point at it. A glob loader renders it in place rather than copying it into
 *  src/, because a second copy is a copy that drifts. */
export const collections = {
  reference: defineCollection({ loader: glob({ pattern: 'SOURCES.md', base: '.' }) }),

  /** The glossary. One file per term; the **filename is the anchor**, so retitling a term is free
   *  and moving an anchor is a deliberate `git mv`, see docs/contracts/interfaces/glossary.md.
   *
   *  Every rule below is Zod, which means a violation is a build failure rather than a render.
   *  `long` is a frontmatter field, not the Markdown body: nothing calls `render()` on these
   *  entries, which keeps the entry shape flat and machine-readable for the downstream index and
   *  popover, makes "zero external hyperlinks" structurally true, and avoids the `.md`-import
   *  class of rolldown failure recorded in content-sources.md. The body must be empty; the page
   *  throws if it is not. */
  glossary: defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/glossary' }),
    schema: z.object({
      /** Display text. Free to be recased or reworded without moving an anchor. */
      term: z.string().min(1),
      /** One sentence. The floor rejects a stub; the cap is popover-sized, so a definition that
       *  will not fit in place is a schema failure now rather than a design problem later. */
      short: z.string().min(20).max(180),
      /** The full entry, plain text. */
      long: z.string().min(80),
      /** A reference into `pipeline/curated/sources.yaml`'s `registry:`, never prose (#50).
       *  `z.enum` over the register's keys is what makes an unresolvable key a schema failure
       *  naming the term, the key and the valid set, so the raw key has no code path to the
       *  page. `.min(1)` covers an empty list; a missing `source` is Zod's own required-field
       *  failure. The `.transform` keeps this the ONLY module that touches the register, so
       *  `glossary.astro` stays register-unaware and no island can pull `node:fs` into a
       *  bundle. `text` is the register's `registered_as` verbatim, joined by "; ", the one
       *  prose copy of a source stays in `SOURCES.md`. `links` carries the same citations
       *  followable, with each source's tier (#57): an addition beside `text`, never a
       *  replacement for it, so the verbatim line is still the line. */
      source: z
        .array(
          z.enum(REGISTER_KEYS as [string, ...string[]], {
            // Zod's own wording lists the valid set but not the value it rejected, and the
            // rejected value is the whole diagnosis. Name it, name the rule, refuse.
            error: (issue) =>
              `source key ${JSON.stringify(issue.input)} is in no ` +
              `pipeline/curated/sources.yaml registry entry. A definition is a claim; refusing ` +
              `to ship a term whose citation the reader cannot trace to /sources (#50). ` +
              `Valid keys: ${REGISTER_KEYS.join(', ')}`,
          }),
        )
        .min(1, {
          error:
            'source is missing or empty. A definition is a claim; refusing to ship a term ' +
            'whose citation the reader cannot trace to /sources (#50). source is a list of ' +
            'pipeline/curated/sources.yaml registry keys.',
        })
        .transform((keys) => ({ keys, text: sourceLine(keys), links: sourceLinks(keys) })),
      /** The short forms a reader meets **in place of** `term`, an acronym (`CBO`), an
       *  initialism written with a suffix (`CPI-U`), a clipped noun (`intragovernmental`).
       *  Never a synonym and never a related word: this list is what makes "defined at first
       *  use" mechanical, because `pipeline/tests/test_prose.py`'s Criterion 4 checker searches
       *  the served prose for `term` **plus every `abbr`**, and a marker that sits after any of
       *  them is a violation. Adding a value here can therefore turn a green page red, which is
       *  the field working: it means a reader was meeting the term earlier than the marker.
       *
       *  It is also the acronym half of `REGISTERED_INITIALISMS`. Every all-caps surface form in
       *  this collection is derived out of the glossary rather than named again in the test, and
       *  the test asserts the derived half and the hand-named half are disjoint, so an acronym
       *  that gains an entry has to leave the hand-named list in the same commit (#59).
       *
       *  Default `[]`: a term a reader only ever meets spelled out declares nothing. */
      abbr: z.array(z.string().min(1)).default([]),
      /** Sibling term ids. Zod cannot see sibling entries, so a dangling value is caught by a
       *  build-time throw on the page, not here. */
      see_also: z.array(z.string()).default([]),
      /** Where a reader first meets the term. The enum is the three routes that carry a contents
       *  list; the anchor's existence is checked against `routeSections` at build time. */
      first_used: z.object({
        route: z.enum(['/economy', '/households', '/government']),
        anchor: z.string().min(1),
      }),
    }),
  }),
}
