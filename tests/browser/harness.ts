/** Harness for the browser lane (`npm run test:browser`).
 *
 *  No assertions live here. This file owns three things and nothing else: the
 *  route/viewport tables the specs iterate, the preview server's lifecycle, and
 *  the island-mount step that every geometric measurement depends on.
 *
 *  WHY `astro preview` AND NOT A HAND-ROLLED STATIC SERVER. `astro.config.mjs`
 *  pins `base: '/income-tax/'`, `build.format: 'directory'` and
 *  `trailingSlash: 'ignore'`. Resolving all three by hand is exactly the edge
 *  case that produces a suite happily measuring 404 pages that returned 200.
 *  `astro preview` reads the same config the build did, and `openRoute()` then
 *  asserts the route's own `<h1>` text, so a 404 body cannot read as a pass.
 *
 *  WHY A TOLERANCE AND NOT A PINNED CONTAINER. `src/styles/tokens.css:4-5`
 *  documents a deliberate system-font stack with no webfont, so macOS and Linux
 *  metrics differ by design and will keep differing. A pinned container makes CI
 *  reproducible at the cost of making the *developer's* local run the divergent
 *  one — the run that has to be trusted while someone is fixing a failure. So:
 *  `TOLERANCE_PX` on containment, and every other assertion is an integer or a
 *  one-sided inequality that font drift can only make stricter.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

/** Slack allowed when asserting that one box is contained by another.
 *  One device pixel: enough to absorb sub-pixel text metrics, far less than any
 *  real clip, which is measured in glyph widths. */
export const TOLERANCE_PX = 1

/** The two viewports the accessibility contract commits to
 *  (`docs/contracts/accessibility.md`). 320px and landscape phones are
 *  explicitly outside it and are deliberately not asserted here. */
export const VIEWPORTS = [
  { name: 'narrow', width: 390, height: 844 },
  { name: 'wide', width: 1440, height: 900 },
] as const

export type Viewport = (typeof VIEWPORTS)[number]

/** Console messages the production build is permitted to emit.
 *
 *  DELIBERATELY EMPTY. If the production build starts emitting something
 *  benign, the entry goes here with a one-line reason and a contract note — the
 *  severity filter in `collectConsole()` is never widened instead. */
export const CONSOLE_ALLOWLIST: readonly string[] = []

/** Every route the site serves, with the counts asserted as equalities.
 *
 *  The zeros are assertions, not skips: `/` carrying zero figures is a fact
 *  about the intro-route split, and a `/` that grows a chart should turn this
 *  red and be re-baselined deliberately.
 *
 *  `ssrSvg` is what the served HTML contains; `hydratedSvg` is what the mounted
 *  page contains. They differ where an island renders more SVG than it shipped
 *  (`BudgetChart`'s legend swatches, the state grid), which is why both are
 *  recorded and the hydrated one is *waited on* rather than sampled. */
export const ROUTES = [
  { path: '/', h1: 'Income & Tax', figures: 0, ssrSvg: 0, hydratedSvg: 0 },
  { path: '/economy', h1: 'The economy', figures: 5, ssrSvg: 7, hydratedSvg: 7 },
  { path: '/households', h1: 'Households', figures: 7, ssrSvg: 14, hydratedSvg: 14 },
  { path: '/government', h1: 'Government', figures: 13, ssrSvg: 14, hydratedSvg: 14 },
  { path: '/sources', h1: 'Sources', figures: 0, ssrSvg: 0, hydratedSvg: 0 },
  { path: '/glossary', h1: 'Glossary', figures: 0, ssrSvg: 0, hydratedSvg: 0 },
  { path: '/contents', h1: 'Contents', figures: 0, ssrSvg: 0, hydratedSvg: 0 },
] as const

export type Route = (typeof ROUTES)[number]

/** The routes that carry charts. Used by the checks that only make sense where
 *  an island mounts — the NARROW-viewBox tell, the interactive-control pass. */
export const CHART_ROUTES = ROUTES.filter((r) => r.figures > 0)

const BASE = '/income-tax'
const PORT = Number(process.env.BROWSER_TEST_PORT ?? 4321)

export interface Site {
  browser: Browser
  baseURL: string
  close(): Promise<void>
}

function urlFor(baseURL: string, path: string): string {
  return path === '/' ? `${baseURL}${BASE}/` : `${baseURL}${BASE}${path}`
}

/** Spawn `astro preview`, wait for it to actually serve, and hand back a
 *  browser pointed at it. Callers must `await site.close()` in a `finally`. */
export async function withSite(portOffset = 0): Promise<Site> {
  const port = PORT + portOffset
  const baseURL = `http://localhost:${port}`
  let stderr = ''
  let stdout = ''

  const child: ChildProcess = spawn(
    'npx',
    ['astro', 'preview', '--port', String(port)],
    // Own process group, so `close()` can take the whole tree down. `astro
    // preview` runs behind an `npx` shim; killing only the shim orphans the
    // server and the next run fails on a busy port.
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
  child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))

  let exited: string | null = null
  child.on('exit', (code, signal) => (exited = `exit code ${code}, signal ${signal}`))

  const kill = () => {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  // Safety net for a hard crash between spawn and `close()`; the `finally` in
  // the spec is the normal path.
  process.once('exit', kill)

  try {
    await waitForServer(baseURL, port, () => ({ exited, stdout, stderr }))
  } catch (err) {
    kill()
    throw err
  }

  const browser = await chromium.launch()
  return {
    browser,
    baseURL,
    async close() {
      try {
        await browser.close()
      } finally {
        kill()
      }
    },
  }
}

async function waitForServer(
  baseURL: string,
  port: number,
  state: () => { exited: string | null; stdout: string; stderr: string },
): Promise<void> {
  const deadline = Date.now() + 20_000
  let lastError = 'never attempted'
  while (Date.now() < deadline) {
    const { exited } = state()
    if (exited !== null) break
    try {
      const res = await fetch(`${baseURL}${BASE}/`)
      if (res.status === 200) return
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  // A harness that cannot see its target reports blind, never healthy — so this
  // carries the child's own output, never a bare timeout.
  const { exited, stdout, stderr } = state()
  throw new Error(
    `astro preview never served ${baseURL}${BASE}/ within 20s.\n` +
      `  last attempt: ${lastError}\n` +
      `  child: ${exited ?? 'still running'}\n` +
      `  stdout: ${stdout.trim() || '(empty)'}\n` +
      `  stderr: ${stderr.trim() || '(empty)'}\n` +
      `  (set BROWSER_TEST_PORT if ${port} is busy)`,
  )
}

/** Open a route in a fresh context at a viewport, and prove the body is the
 *  page we asked for rather than a 200-rendered 404. */
export async function openRoute(
  site: Site,
  route: Route,
  viewport: Viewport,
  opts: { javaScriptEnabled?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await site.browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    javaScriptEnabled: opts.javaScriptEnabled ?? true,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(urlFor(site.baseURL, route.path), { waitUntil: 'load' })
  const h1 = (await page.locator('h1').first().textContent())?.trim() ?? ''
  if (h1 !== route.h1) {
    await context.close()
    throw new Error(
      `${route.path} served a page whose <h1> is ${JSON.stringify(h1)}, expected ` +
        `${JSON.stringify(route.h1)}. The base path (${BASE}) is probably resolving wrong; ` +
        `a 404 body returned with status 200 would look exactly like this.`,
    )
  }
  return { context, page }
}

/** Mount every `client:visible` island, then WAIT for the exact hydrated SVG
 *  count.
 *
 *  `/government` is ~26,000px tall at 390px. A single `scrollTo(bottom)` can
 *  jump clean past an `IntersectionObserver` threshold, which produces a
 *  *passing* run over unmounted islands — the most expensive outcome available
 *  here. So: step-scroll at 0.8x the viewport, then wait on the count. A short
 *  count is a failure, never a smaller passing set. */
export async function mountIslands(page: Page, expected: number): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(1, Math.floor(window.innerHeight * 0.8))
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await frame()
      await frame()
    }
    window.scrollTo(0, document.body.scrollHeight)
    await frame()
    window.scrollTo(0, 0)
    await frame()
  })
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll('svg').length === n,
      expected,
      { timeout: 15_000 },
    )
  } catch {
    const actual = await page.locator('svg').count()
    throw new Error(
      `hydrated <svg> count settled at ${actual}, expected exactly ${expected}. ` +
        `A short count means an island never mounted; measuring it anyway would ` +
        `report a green run over nothing.`,
    )
  }
}

/** Every `<text>` in every `<svg>`, with the boxes needed to prove containment.
 *  Returned as plain data so the failure message can name the offender. */
export async function textBoxes(page: Page): Promise<
  {
    svgIndex: number
    text: string
    svg: { left: number; right: number; top: number; bottom: number }
    box: { left: number; right: number; top: number; bottom: number }
  }[]
> {
  return page.evaluate(() => {
    const out: {
      svgIndex: number
      text: string
      svg: { left: number; right: number; top: number; bottom: number }
      box: { left: number; right: number; top: number; bottom: number }
    }[] = []
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    document.querySelectorAll('svg').forEach((svg, svgIndex) => {
      const svgBox = rect(svg)
      svg.querySelectorAll('text').forEach((t) => {
        const box = rect(t)
        if (box.right - box.left === 0 && box.bottom - box.top === 0) return
        out.push({ svgIndex, text: (t.textContent ?? '').trim(), svg: svgBox, box })
      })
    })
    return out
  })
}

/** Selector for everything the target-size floor applies to. */
export const TARGET_SELECTOR = 'button, summary, input, [role="slider"], [role="option"]'

/** Each control's hit area: the computed `::before` overlay where one exists —
 *  the contract's own method (`docs/contracts/accessibility.md:856-858`) — and
 *  the element box otherwise. The floor itself is read from `--target-min` at
 *  runtime and never hardcoded; its value is #65's decision, not this lane's. */
export async function hitAreas(page: Page, selector: string): Promise<{
  floorPx: number
  areas: {
    label: string
    width: number
    height: number
    left: number
    right: number
    top: number
    bottom: number
  }[]
}> {
  return page.evaluate((sel) => {
    const root = document.documentElement
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--target-min)'
    root.appendChild(probe)
    const floorPx = probe.getBoundingClientRect().width
    probe.remove()

    const areas: {
      label: string
      width: number
      height: number
      left: number
      right: number
      top: number
      bottom: number
    }[] = []
    document.querySelectorAll(sel).forEach((el) => {
      const box = el.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) return
      const before = getComputedStyle(el, '::before')
      const has = before.content !== 'none' && before.content !== ''
      const bw = has ? parseFloat(before.width) : NaN
      const bh = has ? parseFloat(before.height) : NaN
      const width = Number.isFinite(bw) && bw > box.width ? bw : box.width
      const height = Number.isFinite(bh) && bh > box.height ? bh : box.height
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      areas.push({
        label: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0] || '(no class)'}`,
        width,
        height,
        left: cx - width / 2,
        right: cx + width / 2,
        top: cy - height / 2,
        bottom: cy + height / 2,
      })
    })
    return { floorPx, areas }
  }, selector)
}

/** Console `error`/`warning` and uncaught page errors, collected over load and
 *  hydration. Severity is fixed at these two; a benign message earns an entry in
 *  `CONSOLE_ALLOWLIST`, never a wider filter. */
export function collectConsole(page: Page): string[] {
  const messages: string[] = []
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    const text = msg.text()
    if (CONSOLE_ALLOWLIST.some((allowed) => text.includes(allowed))) return
    messages.push(`${type}: ${text}`)
  })
  page.on('pageerror', (err) => messages.push(`pageerror: ${err.message}`))
  return messages
}
