// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'

// `base` must match the repo name or every asset 404s on GitHub Pages.
// This is the single most common Vite/Astro-on-Pages failure; see BRIEF.md.
export default defineConfig({
  site: 'https://travisgalloway.github.io',
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
