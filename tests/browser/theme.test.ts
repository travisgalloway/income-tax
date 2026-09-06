/** The theme cascade, browser lane. Run by `npm run test:browser` alongside
 *  `smoke`, `keyboard`, `driven`, `scroll`, `touch`, `legend`, `marks`,
 *  `focus`, `clipping` and `geometry`.
 *
 *  WHAT IS UNDER TEST. The site offers three theme states and `system` is the
 *  DEFAULT, written as the ABSENCE of a `data-theme` attribute on `:root`
 *  (`BaseLayout.astro`). A reader on a dark-set operating system who has never
 *  touched the toggle is in that state, and it is the state the site ships in.
 *  This file asserts that each of the four combinations of operating-system
 *  preference and toggle choice resolves the palette it should.
 *
 *  THE DEFECT THIS FILE EXISTS FOR. `tokens.css` opened the media-query block
 *  as `:where(:root:not([data-theme='light']))`. `:where()` forces a selector
 *  to specificity (0,0,0), and the base `:root` block above it scores (0,1,0),
 *  so the base light values won every declaration the media query made. The
 *  dark palette therefore NEVER rendered for a reader on system dark. Measured
 *  before the fix, on all seven routes, with `colorScheme: 'dark'` and no
 *  attribute: `--ground` resolved to `#f6f1e8` and `color-scheme` to `light`.
 *  Only the explicit Dark button worked. The wrapper is gone and the selector
 *  now scores (0,2,0).
 *
 *  WHY THE PYTHON LANE COULD NOT CATCH IT.
 *  `test_accessibility.py::test_the_two_dark_theme_blocks_declare_the_same_hexes`
 *  reads the two dark blocks as text and asserts they DECLARE the same values.
 *  Both blocks declared the right hexes throughout the outage; neither one won
 *  the cascade. Declaring a value and resolving it are different claims, and
 *  only a browser can make the second.
 *
 *  WHY THE EXPECTED VALUES ARE PARSED FROM `tokens.css`. Copying 29 hexes into
 *  this file would create a second place to edit the palette, and a stale copy
 *  here would fail a correct site. The source of truth is parsed instead, so
 *  this spec tests the CASCADE and never the palette's contents. The counts
 *  below are the recorded integers that keep the parse honest: a selector this
 *  file cannot find, or a block that has emptied out, fails before a single
 *  measurement is taken rather than reporting green over nothing.
 *
 *  WHY COLOURS ARE COMPARED THROUGH THE ENGINE. Chromium normalises a custom
 *  property's colour, so `rgba(237, 229, 217, 0.055)` in the stylesheet reads
 *  back as `#ede5d90e`. Both sides are pushed through `color` on a probe
 *  element and compared as the engine's own `rgb()` strings, so the assertion
 *  is about the colour and not about its spelling.
 *
 *  WHY EVERY WAIT IS BOUNDED. `node --test` has no default per-test timeout.
 *  Every `test()` here carries an explicit timeout, and the file mounts no
 *  islands: the theme is settled by the stylesheet and the inline head script,
 *  both of which are done at `load`.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ROUTES, openRoute, withSite, type Route, type Site, type ViewportSize } from './harness.ts'

const TOKENS_CSS = resolve(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css')

/** 28 page loads at one viewport, no island mounting. Generous on purpose:
 *  this bound exists so a hang fails, not so a slow machine does. */
const TEST_TIMEOUT = 300_000

/** One width. The theme cascade is not a function of viewport, and running the
 *  contract's two widths would double the cost for an identical answer. */
const VIEWPORT: ViewportSize = { name: 'wide', width: 1440, height: 900 }

/** The three selectors that decide the palette, in source order. The base block
 *  is (0,1,0); both dark blocks must out-specify it, and the attribute block is
 *  written last so it wins the (0,2,0) tie against the media block. */
const BASE_SELECTOR = ':root {'
const MEDIA_SELECTOR = ":root:not([data-theme='light']) {"
const ATTR_SELECTOR = ":root[data-theme='dark'] {"

/** How many declarations each block carries. Measured against `tokens.css` at
 *  the commit that removed the `:where()` wrapper. These are assertions, not
 *  documentation: a regex that stops matching sweeps an empty set and reports
 *  green, which is the failure this lane is least able to notice on its own.
 *  Re-baseline deliberately when a token is added. */
const BASE_DECLARATIONS = 61
const DARK_DECLARATIONS = 30

interface Palette {
  base: Record<string, string>
  dark: Record<string, string>
}

/** Read one rule's body by brace depth from the first `{` after `marker`.
 *  Depth-counting and not a lazy `[^}]*`, because the media block nests. */
function body(css: string, marker: string): string {
  const at = css.indexOf(marker)
  assert.notEqual(
    at,
    -1,
    `tokens.css declares no rule opening \`${marker}\`. Either the selector was ` +
      `rewritten, or it was wrapped in \`:where()\`/\`:is()\` again — both of which ` +
      `are the defect this file exists for. Fix the stylesheet, or re-baseline this ` +
      `constant deliberately.`,
  )
  const open = css.indexOf('{', at)
  let depth = 0
  let i = open
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) break
  }
  return css.slice(open + 1, i)
}

/** `--name: value;` and `color-scheme: value;` pairs, comments and nesting
 *  ignored. Every declaration in the dark blocks is one or the other. */
function declarations(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/(?:^|;|\n)\s*(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);/gi)) {
    out[m[1]!] = m[2]!.trim().replace(/\s+/g, ' ')
  }
  return out
}

async function readPalette(): Promise<Palette> {
  const css = await readFile(TOKENS_CSS, 'utf8')

  // The `:where()` wrapper, named directly. The runtime assertions below would
  // catch it anyway, but they would report "the ground is the wrong colour"
  // rather than the one line that made it so.
  assert.ok(
    !/:where\(\s*:root/.test(css),
    'tokens.css wraps a `:root` compound in `:where()`. That forces the selector to ' +
      'specificity (0,0,0), which the base `:root` block at (0,1,0) then beats, and the ' +
      'dark palette stops rendering for every reader on system dark.',
  )

  const base = declarations(body(css, BASE_SELECTOR))
  const media = declarations(body(css, MEDIA_SELECTOR))
  const attr = declarations(body(css, ATTR_SELECTOR))

  assert.equal(Object.keys(base).length, BASE_DECLARATIONS, 'declarations in the base `:root` block')
  assert.equal(Object.keys(media).length, DARK_DECLARATIONS, 'declarations in the media-query dark block')
  assert.equal(Object.keys(attr).length, DARK_DECLARATIONS, 'declarations in the `[data-theme=dark]` block')
  assert.deepEqual(media, attr, 'the two dark blocks must declare the same values')

  const missing = Object.keys(media).filter((k) => !(k in base))
  assert.deepEqual(
    missing,
    [],
    'a dark block declares a property the base `:root` block does not, so that property ' +
      'is undefined in light mode',
  )

  // The media block must come BEFORE the attribute block: they tie at (0,2,0)
  // and source order is the only thing that lets an explicit choice win.
  assert.ok(
    css.indexOf(MEDIA_SELECTOR) < css.indexOf(ATTR_SELECTOR),
    'the `[data-theme=dark]` block must be written after the media-query block; the two ' +
      'tie on specificity and source order is what makes an explicit choice win',
  )

  return { base, dark: media }
}

/** What the page resolved, plus the same values pushed through the engine so a
 *  hex and an `rgba()` spelling of one colour compare equal. */
async function resolveIn(
  route: Route,
  colorScheme: 'light' | 'dark',
  choice: 'light' | 'dark' | null,
  names: string[],
): Promise<{ tokens: Record<string, string>; scheme: string; attr: string | null; bodyBg: string; prefersDark: boolean }> {
  const { context, page } = await openRoute(site, route, VIEWPORT, { colorScheme })
  try {
    if (choice !== null) {
      const button = page.locator(`[data-theme-choice="${choice}"]`)
      assert.equal(
        await button.count(),
        1,
        `${route.path}: expected exactly one \`[data-theme-choice="${choice}"]\` control`,
      )
      await button.click()
    }
    return await page.evaluate((props: string[]) => {
      const root = document.documentElement
      const cs = getComputedStyle(root)
      const probe = document.createElement('span')
      root.appendChild(probe)
      const through = (v: string): string => {
        probe.style.color = 'rgb(1, 2, 3)'
        probe.style.color = v
        return getComputedStyle(probe).color
      }
      const tokens: Record<string, string> = {}
      for (const p of props) tokens[p] = through(cs.getPropertyValue(p).trim())
      probe.remove()
      return {
        tokens,
        scheme: cs.colorScheme,
        attr: root.getAttribute('data-theme'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      }
    }, names)
  } finally {
    await context.close()
  }
}

/** Push the stylesheet's own spelling through the same engine, once, so the
 *  comparison is colour against colour. */
async function normalise(values: Record<string, string>): Promise<Record<string, string>> {
  const { context, page } = await openRoute(site, ROUTES[0]!, VIEWPORT)
  try {
    return await page.evaluate((entries: [string, string][]) => {
      const probe = document.createElement('span')
      document.documentElement.appendChild(probe)
      const out: Record<string, string> = {}
      for (const [k, v] of entries) {
        probe.style.color = 'rgb(1, 2, 3)'
        probe.style.color = v
        out[k] = getComputedStyle(probe).color
      }
      probe.remove()
      return out
    }, Object.entries(values))
  } finally {
    await context.close()
  }
}

let site: Site
let palette: Palette
/** The dark block's colour tokens, and the two schemes' expected values, both
 *  already normalised through the engine. */
let tokenNames: string[]
let expectedDark: Record<string, string>
let expectedLight: Record<string, string>

before(async () => {
  site = await withSite(10)
  palette = await readPalette()
  tokenNames = Object.keys(palette.dark).filter((k) => k.startsWith('--'))
  assert.equal(tokenNames.length, DARK_DECLARATIONS - 1, 'colour tokens in the dark block')
  expectedDark = await normalise(Object.fromEntries(tokenNames.map((k) => [k, palette.dark[k]!])))
  expectedLight = await normalise(Object.fromEntries(tokenNames.map((k) => [k, palette.base[k]!])))
})

after(async () => {
  await site?.close()
})

test(
  'T1 — system dark, the shipped default, renders the dark palette on every route',
  { timeout: TEST_TIMEOUT },
  async () => {
    for (const route of ROUTES) {
      const got = await resolveIn(route, 'dark', null, tokenNames)
      assert.equal(got.prefersDark, true, `${route.path}: the context did not report a dark OS preference`)
      assert.equal(
        got.attr,
        null,
        `${route.path}: \`system\` is the ABSENCE of \`data-theme\`, but the attribute is ` +
          `${JSON.stringify(got.attr)}. This test is then measuring an explicit choice.`,
      )
      assert.equal(
        got.scheme,
        'dark',
        `${route.path}: \`color-scheme\` resolved to ${JSON.stringify(got.scheme)} on a dark ` +
          `operating system with the toggle on \`system\`. The media-query block is losing ` +
          `the cascade to the base \`:root\` block.`,
      )
      assert.deepEqual(
        got.tokens,
        expectedDark,
        `${route.path}: system dark resolved at least one token to its light value.`,
      )
      assert.equal(
        got.bodyBg,
        expectedDark['--ground'],
        `${route.path}: the body paints ${got.bodyBg}, not the dark \`--ground\`.`,
      )
    }
  },
)

test(
  'T2 — system light renders the light palette on every route',
  { timeout: TEST_TIMEOUT },
  async () => {
    for (const route of ROUTES) {
      const got = await resolveIn(route, 'light', null, tokenNames)
      assert.equal(got.prefersDark, false, `${route.path}: the context reported a dark OS preference`)
      assert.equal(got.attr, null, `${route.path}: \`system\` must leave \`data-theme\` unset`)
      assert.equal(got.scheme, 'light', `${route.path}: \`color-scheme\` on a light OS`)
      assert.deepEqual(got.tokens, expectedLight, `${route.path}: system light resolved a dark value`)
      assert.equal(got.bodyBg, expectedLight['--ground'], `${route.path}: the body's paint`)
    }
  },
)

test(
  'T3 — an explicit choice beats the operating system in both directions',
  { timeout: TEST_TIMEOUT },
  async () => {
    const route = ROUTES[0]!

    // Light chosen on a dark machine. Both dark blocks exclude an explicit
    // light stamp, so the base block is the only one left standing.
    const lightOnDark = await resolveIn(route, 'dark', 'light', tokenNames)
    assert.equal(lightOnDark.attr, 'light', 'choosing Light must stamp `data-theme="light"`')
    assert.equal(lightOnDark.scheme, 'light', 'choosing Light on a dark OS must resolve `color-scheme: light`')
    assert.deepEqual(lightOnDark.tokens, expectedLight, 'choosing Light on a dark OS must render light')

    // Dark chosen on a light machine. Only the attribute block matches.
    const darkOnLight = await resolveIn(route, 'light', 'dark', tokenNames)
    assert.equal(darkOnLight.attr, 'dark', 'choosing Dark must stamp `data-theme="dark"`')
    assert.equal(darkOnLight.scheme, 'dark', 'choosing Dark on a light OS must resolve `color-scheme: dark`')
    assert.deepEqual(darkOnLight.tokens, expectedDark, 'choosing Dark on a light OS must render dark')

    // Dark chosen on a dark machine: the two dark blocks both match and tie at
    // (0,2,0). Source order settles it, and both carry the same values, so the
    // result must equal system dark exactly.
    const darkOnDark = await resolveIn(route, 'dark', 'dark', tokenNames)
    assert.deepEqual(darkOnDark.tokens, expectedDark, 'choosing Dark on a dark OS must render dark')
  },
)
