import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Shtus
 *
 * Runs tests against a local Next.js + PartyKit development environment.
 * Both servers are started automatically when tests run.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start both Next.js and PartyKit servers before running tests
  // Note: PartyKit WebSocket server returns 404 on HTTP requests, so we check
  // if the port is already in use to detect if it's running.
  webServer: [
    {
      command: "npm run party",
      port: 1999,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
