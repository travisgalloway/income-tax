import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/** SOURCES.md is the repository's reference document and lives at the root, where the pipeline
 *  and the brief both point at it. A glob loader renders it in place rather than copying it into
 *  src/, because a second copy is a copy that drifts. */
export const collections = {
  reference: defineCollection({ loader: glob({ pattern: 'SOURCES.md', base: '.' }) }),

  /** The glossary. One file per term; the **filename is the anchor**, so retitling a term is free
   *  and moving an anchor is a deliberate `git mv` — see docs/contracts/interfaces/glossary.md.
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
      /** A plain-text citation, printed verbatim — not a URL, and not validated as one.
       *  Deliberately `z.string()` so source discipline can widen it additively. */
      source: z.string().min(1),
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
