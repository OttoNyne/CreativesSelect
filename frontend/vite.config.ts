/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  // `vite preview` serves the production build. Proxying /api to the API
  // reproduces production's same-origin setup (Vercel rewrites /api/* to the
  // API), which is what the browser end-to-end tests run against.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: process.env.E2E_API_URL ?? 'http://localhost:5000' },
      // what Vercel does with these two (see vercel.json): the server makes the link preview and the sitemap
      // (a key starting with ^ is a pattern; a plain '/p' would also catch /posts, /profile and every other address starting with p)
      '^/p/[^/]+$': { target: process.env.E2E_API_URL ?? 'http://localhost:5000', rewrite: (path) => `/api/preview/profile${path.slice(2)}` },
      // the cards other websites embed (an iframe of /embed/piece/<id> or /embed/profile/<name>), made by the server
      '^/embed/(piece|profile)/[^/]+$': { target: process.env.E2E_API_URL ?? 'http://localhost:5000', rewrite: (path) => `/api${path}` },
      '/sitemap.xml': { target: process.env.E2E_API_URL ?? 'http://localhost:5000', rewrite: () => '/api/preview/sitemap.xml' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // The browser tests in e2e/ are run by Playwright, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
