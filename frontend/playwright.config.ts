import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests: a real browser drives the built frontend, which
// talks to a real API and a real MongoDB — nothing mocked.
//
// The frontend is served with `vite preview` (production build) on :4173 with
// /api proxied to the API on :5000, the same same-origin shape as production.
// The API must be running with CLIENT_URL=http://localhost:4173 and a
// throwaway database; CI does this in .github/workflows/ci.yml. Locally see
// e2e/README.md.
//
// Three projects: desktop Chrome, desktop WebKit (Safari's engine) and an
// iPhone-sized WebKit — Safari/iOS is where cookie handling is strictest.
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
