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
export default defineConfig({
  site: 'https://travisgalloway.com',
  base: '/income-tax/',
  trailingSlash: 'ignore',
  integrations: [react(), mdx()],
  build: { format: 'directory' },
  vite: {
    build: {
      // Data is baked in at build time; keep chunks legible in the network panel.
      assetsInlineLimit: 0,
    },
  },
})
