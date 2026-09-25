import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

// These match the defaults baked into the Next build (NEXT_PUBLIC_API_URL
// defaults to :3000 at build time), so the e2e run does not need a special
// frontend rebuild.
const API_PORT = 3000
const WEB_PORT = 3001

/**
 * Auth regression against the real stack: built Nest API + built Next app +
 * PostgreSQL. The access-token lifetime is deliberately tiny (3s) so the
 * runtime-refresh path can be exercised without waiting ten minutes; that is a
 * controlled test configuration, not a production value.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/src/main.js',
      cwd: '../apps/api',
      url: `http://localhost:${API_PORT}/auth/me`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ACCESS_TOKEN_TTL_SECONDS: '3',
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        PORT: String(API_PORT),
        JWT_SECRET: 'e2e-only-secret-value-not-for-production',
        NODE_ENV: 'development',
        // The disposable cache is optional by design: if no Redis is listening the API
        // falls back to PostgreSQL, so the browser suite stays runnable either way.
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6390',
      },
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      cwd: '../apps/web',
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      // `next start` is a production server; dotenv loads NODE_ENV=development
      // into this process, so pin it back for the frontend.
      env: { NODE_ENV: 'production' },
    },
  ],
})
