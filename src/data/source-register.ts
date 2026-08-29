/** The one build-time read of `pipeline/curated/sources.yaml`'s `registry:` block.
 *
 *  A glossary term's `source` is a list of register KEYS, never prose. The rendered line is
 *  produced here, from the register, so there is exactly one prose copy of every source, the
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
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/** Two candidates, and it must be two. `import.meta.url` is correct while this module sits in
 *  `src/`, the config load, `astro check`, `vitest`. It is WRONG once Rollup has bundled the
 *  module into `dist/.prerender/chunks/`, where the same relative walk lands on
 *  `dist/pipeline/curated/sources.yaml`, which does not exist; that is where `npm run build`
 *  first failed when `figures.ts` began importing this file (#57). `process.cwd()` is the
 *  project root in every lane that runs a build. Try both, and name both if neither is there,
 *  a register that cannot be read is unknown, never clean. */
const REGISTER_CANDIDATES = [
  fileURLToPath(new URL('../../pipeline/curated/sources.yaml', import.meta.url)),
  resolve(process.cwd(), 'pipeline/curated/sources.yaml'),
]

const REGISTER_PATH = REGISTER_CANDIDATES.find((p) => existsSync(p)) ?? REGISTER_CANDIDATES[0]

/** The five-term tier vocabulary (#57). Kept in step with `validate.SOURCE_TIERS` and with the
 *  `_comment:` block in `sources.yaml`; `check_sources` rule F is the gate, and this array is the
 *  build-time echo of it so a tier the site cannot describe cannot reach a page either. */
export const SOURCE_TIERS = [
  'primary',
  'official republication',
  'scholarly republication',
  'compilation',
  'secondary',
] as const

export type SourceTier = (typeof SOURCE_TIERS)[number]

interface RegistryEntry {
  registered_as: string
  cited_as?: string | string[]
  tier: SourceTier
  url?: string
  url_exempt?: string
  justification?: string
  compiled_from?: string[]
}

/** One rendered citation: the register's own prose, what kind of source it is, and where the
 *  reader goes next. `href` is `null` for an entry with a written `url_exempt` reason, a source
 *  with no single truthful URL renders as text, never as a link to somewhere approximate. */
export interface SourceLink {
  key: string
  text: string
  tier: SourceTier
  href: string | null
}

interface RegisterDoc {
  registry?: Record<string, RegistryEntry>
  outputs?: Record<string, { cites?: string[] }>
}

function loadRegister(): RegisterDoc {
  if (!existsSync(REGISTER_PATH)) {
    throw new Error(
      `pipeline/curated/sources.yaml was not found. Looked in ` +
        `${REGISTER_CANDIDATES.join(' and ')}. Every source line on this site resolves through ` +
        `the register; an unreadable register is unknown, never clean (#37).`,
    )
  }
  const doc = parse(readFileSync(REGISTER_PATH, 'utf8')) as RegisterDoc
  const registry = doc?.registry
  if (!registry || Object.keys(registry).length === 0) {
    // An unreadable register is unknown, never clean, the #37 rule, applied on the TS side.
    throw new Error(
      `pipeline/curated/sources.yaml has no registry: entries (looked in ${REGISTER_PATH}). ` +
        `Every glossary term cites a register key; refusing to build against an empty register.`,
    )
  }
  // A malformed entry must fail the build, not render a blank source line, a silently empty
  // citation is worse than a missing one, because it looks green. Since #57 that covers the tier
  // and the URL too: an untiered entry would render a source the reader cannot place, and an
  // entry with neither `url` nor a written `url_exempt` reason would render an unfollowable line,
  // which is the whole defect #57 was filed for. The pipeline's rules F and G say the same thing
  // in the lane that runs unattended; this is the lane a site build runs in.
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
    if (!SOURCE_TIERS.includes(entry.tier)) {
      throw new Error(
        `pipeline/curated/sources.yaml registry entry '${key}' has tier ` +
          `${JSON.stringify(entry.tier)}, which is not one of ${SOURCE_TIERS.join(', ')}. ` +
          `Every source says what KIND of source it is (#57); refusing to render a citation ` +
          `the reader has to guess about.`,
      )
    }
    const followable = typeof entry.url === 'string' && entry.url.startsWith('https://')
    const excused = typeof entry.url_exempt === 'string' && entry.url_exempt.trim().length > 0
    if (!followable && !excused) {
      throw new Error(
        `pipeline/curated/sources.yaml registry entry '${key}' has no https:// url and no ` +
          `written url_exempt reason. Every source line the reader meets must be followable, ` +
          `and an exemption with no reason is how a check turns back into a skip (#57).`,
      )
    }
  }
  return doc
}

const register = loadRegister()
const registry = register.registry as Record<string, RegistryEntry>

/** Every key a glossary term may cite. The Zod schema turns this into a `z.enum`, which is what
 *  makes an unresolvable key a schema failure naming the term, the key and the valid set, the
 *  raw key has no code path to the page. */
export const REGISTER_KEYS: readonly string[] = Object.keys(registry).sort()

/** The rendered source line: each key's `registered_as`, VERBATIM, joined by "; ". Never a
 *  summary, summarisation is not expressible here, because nothing but the register's own
 *  string is ever printed. */
export function sourceLine(keys: readonly string[]): string {
  return keys.map((key) => entryFor(key).registered_as).join('; ')
}

function entryFor(key: string): RegistryEntry {
  const entry = registry[key]
  if (!entry) {
    throw new Error(
      `glossary source key '${key}' is in no pipeline/curated/sources.yaml registry entry. ` +
        `A definition is a claim; refusing to ship a term whose citation the reader cannot ` +
        `trace to /sources (#50). Valid keys: ${REGISTER_KEYS.join(', ')}`,
    )
  }
  return entry
}

/** The same citations as `sourceLine`, resolved into followable links (#57).
 *
 *  This is an ADDITION to the rendered line, never a replacement for it: every call site prints
 *  the verbatim prose first and these beneath, so "nothing but the register's own string is ever
 *  printed" still holds of the line itself. `href` is `null` where the entry carries a written
 *  `url_exempt` reason, a source with no single truthful URL is rendered as text rather than
 *  linked to somewhere approximate. */
export function sourceLinks(keys: readonly string[]): SourceLink[] {
  return keys.map((key) => {
    const entry = entryFor(key)
    return {
      key,
      text: entry.registered_as,
      tier: entry.tier,
      href: typeof entry.url === 'string' && entry.url ? entry.url : null,
    }
  })
}

/** The forms one register entry may be NAMED BY inside an `_meta.source`, the register's
 *  `cited_as`, one string or several. `check_sources` rule A asserts one of them appears in the
 *  output's source line; `figures.ts` asserts the same thing one level down, per figure, so a
 *  figure's declared `cites` cannot drift from the sentence it is captioning. */
export function citationFormsOf(key: string): string[] {
  const raw = entryFor(key).cited_as
  if (typeof raw === 'string') return [raw]
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

/** The register keys one published output's `_meta.source` names, from the register's `outputs:`
 *  block, the same list `check_sources` rules A and D reconcile against that string. A figure
 *  declares the OUTPUTS it draws from and resolves its citations through here, so a figure's
 *  links cannot be a second, hand-kept copy of what its source line already says. */
export function citesOf(output: string): string[] {
  const outputs = register.outputs
  const spec = outputs?.[output]
  const cites = spec?.cites
  if (!Array.isArray(cites) || cites.length === 0) {
    throw new Error(
      `pipeline/curated/sources.yaml has no outputs.${output}.cites. A figure cites the outputs ` +
        `it draws from and resolves their sources through the register; refusing to render a ` +
        `figure whose citations resolve to nothing (#57). Declared outputs: ` +
        `${Object.keys(outputs ?? {}).sort().join(', ')}`,
    )
  }
  return cites
}
