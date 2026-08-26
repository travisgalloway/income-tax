/** The one build-time read of `pipeline/curated/sources.yaml`'s `registry:` block.
 *
 *  A glossary term's `source` is a list of register KEYS, never prose. The rendered line is
 *  produced here, from the register, so there is exactly one prose copy of every source — the
 *  one in `SOURCES.md` that `check_sources` rule B pins the register to. A vintage bump in
 *  `SOURCES.md` therefore moves the glossary in the same build with no glossary edit, which is
 *  why `content-sources.md` §"No second copy of `SOURCES.md`" is SATISFIED here rather than
 *  excepted (#50).
 *
 *  SERVER-ONLY BY CONSTRUCTION. This module reads the filesystem with `node:fs`, so it must
 *  never become reachable from a React island. It deliberately does NOT live in
 *  `src/data/index.ts`, which islands do import; the only importer is `src/content.config.ts`,
 *  which runs Node-side and resolves each key inside the Zod schema so `glossary.astro` keeps
 *  zero register awareness. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const REGISTER_PATH = fileURLToPath(
  new URL('../../pipeline/curated/sources.yaml', import.meta.url),
)

interface RegistryEntry {
  registered_as: string
}

function loadRegistry(): Record<string, RegistryEntry> {
  const doc = parse(readFileSync(REGISTER_PATH, 'utf8')) as {
    registry?: Record<string, RegistryEntry>
  }
  const registry = doc?.registry
  if (!registry || Object.keys(registry).length === 0) {
    // An unreadable register is unknown, never clean — the #37 rule, applied on the TS side.
    throw new Error(
      `pipeline/curated/sources.yaml has no registry: entries (looked in ${REGISTER_PATH}). ` +
        `Every glossary term cites a register key; refusing to build against an empty register.`,
    )
  }
  // A malformed entry (missing/empty `registered_as`) must fail the build, not render a blank
  // source line — a silently empty citation is worse than a missing one, because it looks green.
  for (const [key, entry] of Object.entries(registry)) {
    if (
      typeof entry?.registered_as !== 'string' ||
      entry.registered_as.trim().length === 0
    ) {
      throw new Error(
        `pipeline/curated/sources.yaml registry entry '${key}' has no non-empty registered_as ` +
          `(looked in ${REGISTER_PATH}). Refusing to build against a register entry that would ` +
          `render a blank source line.`,
      )
    }
  }
  return registry
}

const registry = loadRegistry()

/** Every key a glossary term may cite. The Zod schema turns this into a `z.enum`, which is what
 *  makes an unresolvable key a schema failure naming the term, the key and the valid set — the
 *  raw key has no code path to the page. */
export const REGISTER_KEYS: readonly string[] = Object.keys(registry).sort()

/** The rendered source line: each key's `registered_as`, VERBATIM, joined by "; ". Never a
 *  summary — summarisation is not expressible here, because nothing but the register's own
 *  string is ever printed. */
export function sourceLine(keys: readonly string[]): string {
  return keys
    .map((key) => {
      const entry = registry[key]
      if (!entry) {
        throw new Error(
          `glossary source key '${key}' is in no pipeline/curated/sources.yaml registry entry. ` +
            `A definition is a claim; refusing to ship a term whose citation the reader cannot ` +
            `trace to /sources (#50). Valid keys: ${REGISTER_KEYS.join(', ')}`,
        )
      }
      return entry.registered_as
    })
    .join('; ')
}
