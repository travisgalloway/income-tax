// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'

// The account's user site (travisgalloway.github.io) claims the apex domain
// travisgalloway.com, so project sites serve as paths beneath it. This repo has
// no CNAME of its own and therefore lives at travisgalloway.com/income-tax/.
//
// `base` must match that path or every asset 404s, which is the single most
// common Astro-on-Pages failure. If this repo is ever given its own subdomain,
// `base` becomes '/' and `site` becomes that host.
const base = '/income-tax/'

/** Redirects the bare base path to its trailing-slash form, in `astro dev` only.
 *
 * Astro's dev base middleware rewrites a request whose path starts with `/income-tax/`, in
 * `astro/dist/vite-plugin-astro-server/base.js`. The bare `/income-tax` fails that prefix test,
 * is not `/`, and asks for HTML, so it reaches the middleware's 404 branch. Every other route
 * answers, because each one carries the slash inside the path.
 *
 * Production never had the defect. GitHub Pages answers `/income-tax` with a 301 to
 * `/income-tax/`, confirmed against the live site, and this gives the dev server the same answer.
 *
 * MEASURED, AND `enforce: 'pre'` IS NOT ENOUGH ON ITS OWN. That option orders this plugin against
 * other plugins, and Astro registers its dev middleware into the connect stack separately. For a
 * request asking for HTML, Astro's middleware still ran first and wrote the 404. The symptom was
 * invisible to curl, which sends a wildcard `Accept` header and took the other branch, and visible in
 * every browser, which sends `Accept: text/html`. So the handler is moved to the FRONT of the
 * stack, which is the only ordering that holds for a navigation request.
 *
 * @type {import('vite').Plugin}
 */
const devBaseRedirect = {
  name: 'income-tax:dev-base-redirect',
  configureServer(server) {
    const bare = base.replace(/\/$/, '')
    /* MEASURED. Astro's dev base middleware answers the bare path with a 404
     * whenever the request accepts HTML, in
     * `astro/dist/vite-plugin-astro-server/base.js`:
     *
     *   if (acceptHeader?.includes("text/html")) return { action: "not-found" }
     *
     * A wildcard `Accept` takes a later branch that falls through, which is why
     * curl reported a 301 while every browser got a 404. Verifying this with
     * curl alone is what let it ship twice.
     *
     * This REWRITES the url rather than answering the request. Astro's own
     * middleware then sees `/income-tax/`, matches its prefix test, and serves
     * the front door normally. Writing a 301 here instead crashed the server:
     * a `request` listener does not consume the event, so Astro's handler ran
     * against a response that was already ended.
     *
     * The listener is prepended so the rewrite lands before any middleware
     * reads the url. It writes no response and calls nothing, so it cannot
     * interfere with any other route.
     */
    server.httpServer?.prependListener('request', (req) => {
      const url = req.url ?? '/'
      const mark = url.indexOf('?')
      const pathname = mark === -1 ? url : url.slice(0, mark)
      if (pathname !== bare) return
      req.url = base + (mark === -1 ? '' : url.slice(mark))
    })
  },
}



export default defineConfig({
  site: 'https://travisgalloway.com',
  base,
  trailingSlash: 'ignore',
  integrations: [react(), mdx()],
  build: { format: 'directory' },
  vite: {
    plugins: [devBaseRedirect],
    /* Every dependency an island imports, pre-bundled at dev-server startup.
     *
     * MEASURED. Vite discovers dependencies by crawling the entry points it can
     * see, and this site's are reached only through islands that hydrate on
     * scroll. So a dependency used by one route was not found until a reader
     * opened that route, at which point Vite re-optimised and invalidated the
     * bundles already in flight. The reader got
     * `504 (Outdated Optimize Dep)` and the island failed with
     * `Error hydrating ... Importing a module script failed`.
     *
     * It happened twice, on `recharts` and then on `@radix-ui/react-slider`,
     * because each new route surfaced a dependency the last one had not needed.
     * Listing them here means the first request already has every bundle.
     *
     * This affects `astro dev` only. A production build bundles everything
     * ahead of time and never re-optimises. Keep this list in step with what
     * `src/components/islands/` imports.
     */
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'recharts',
        'd3-scale',
        'd3-shape',
        '@radix-ui/react-select',
        '@radix-ui/react-slider',
        '@radix-ui/react-tabs',
        '@radix-ui/react-toggle-group',
      ],
    },
    build: {
      // Data is baked in at build time; keep chunks legible in the network panel.
      assetsInlineLimit: 0,
    },
  },
})
