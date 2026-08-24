import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

/** SOURCES.md is the repository's reference document and lives at the root, where the pipeline
 *  and the brief both point at it. A glob loader renders it in place rather than copying it into
 *  src/, because a second copy is a copy that drifts. */
export const collections = {
  reference: defineCollection({ loader: glob({ pattern: 'SOURCES.md', base: '.' }) }),
}
