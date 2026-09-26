import { defineConfig, devices } from '@playwright/test'

/**
 * Release smoke configuration.
 *
 * It drives the **packaged** application — the Compose stack, already running — rather than
 * starting the native development servers the way `e2e/playwright.config.ts` does. That is
 * the point: this suite proves the container images, the migration service, the seed service,
 * the published ports and the container-only internal API origin actually work together.
 *
 *   docker compose up --build -d && docker compose run --rm seed
 *   pnpm test:smoke
 *
 * The full behavioural suite remains `pnpm test:e2e` against the native stack; this one is
 * deliberately small and packaging-focused.
 */
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3001'

export default defineConfig({
  testDir: '.',
  testMatch: 'release-smoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
