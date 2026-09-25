import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { E2E_ADMIN_EMAIL, E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 5 browser proof: the real dashboard, the analytics page, the public view
 * tracker, the QR scan path and the Product list's measured Total Views column.
 *
 * Redis correctness is deliberately *not* tested here — it belongs to the API
 * integration suite, which drives a real server. This file proves the surfaces a
 * reviewer actually clicks.
 */

const API = 'http://localhost:3000'
const WEB = 'http://localhost:3001'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Fixture = {
  productId: string
  publicUuid: string
  passportId: string
  name: string
}

let editorToken: string
let adminToken: string
let fixture: Fixture
let adminFixture: Fixture

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the analytics browser suite')
  }
  const client = new Client({ connectionString })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function tokenFor(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: { email, password: E2E_PASSWORD },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).accessToken as string
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page.getByText(email)).toBeVisible()
}

async function upload(request: APIRequestContext, token: string, name: string): Promise<string> {
  const response = await request.post(`${API}/assets`, {
    headers: { authorization: `Bearer ${token}` },
    multipart: {
      file: { name, mimeType: 'image/png', buffer: PNG_1X1 },
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function analyticsCounts(passportId: string): Promise<{ qrHits: number; views: number }> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ qrHits: number; views: number }>(
      `SELECT (SELECT count(*)::int FROM "AnalyticsEvent"
               WHERE "passportId" = $1 AND "kind" = 'QR_HIT') AS "qrHits",
              (SELECT count(*)::int FROM "AnalyticsEvent"
               WHERE "passportId" = $1 AND "kind" = 'VIEW') AS views`,
      [passportId],
    )
    return rows[0] as { qrHits: number; views: number }
  })
}

test.beforeAll(async ({ request }) => {
  editorToken = await tokenFor(request, E2E_EMAIL)
  adminToken = await tokenFor(request, E2E_ADMIN_EMAIL)

  // A category is a publication prerequisite; the seed provides deterministic ones.
  const categories = await request.get(`${API}/categories`, {
    headers: { authorization: `Bearer ${editorToken}` },
  })
  expect(categories.status()).toBe(200)
  const categoryId = ((await categories.json()) as Array<{ id: string }>)[0]?.id
  expect(categoryId).toBeTruthy()

  fixture = await publishFixture(request, editorToken, categoryId as string, 'editor')
  // The Admin belongs to a different company, which is exactly why the Admin projection
  // needs its own scanned passport to prove the raw address is visible there.
  adminFixture = await publishFixture(request, adminToken, categoryId as string, 'admin')
})

async function publishFixture(
  request: APIRequestContext,
  token: string,
  categoryId: string,
  owner: string,
): Promise<Fixture> {
  const cover = await upload(request, token, `analytics-cover-${owner}.png`)
  const name = `Analytics browser product (${owner}) ${Date.now()}`

  const created = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name,
      sku: `SKU-ANALYTICS-${owner}-${Date.now()}`,
      serialNumber: `SN-ANALYTICS-${owner}-${Date.now()}`,
      categoryId,
      description: 'Analytics browser fixture',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      materials: [{ name: 'Aluminium', percentage: 100, position: 0 }],
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 30,
        recycledPercent: 60,
        repairabilityScore: 8,
        recyclable: true,
      },
      images: [{ assetId: cover, role: 'COVER', altText: 'front' }],
    },
  })
  expect(created.status()).toBe(201)
  const product = await created.json()

  const published = await request.post(`${API}/products/${product.id}/publish`, {
    headers: { authorization: `Bearer ${token}` },
    data: { expectedDraftRevision: product.draftRevision },
  })
  expect(published.status()).toBe(200)
  const publication = await published.json()

  return {
    productId: product.id as string,
    publicUuid: publication.publicUuid as string,
    passportId: publication.passportId as string,
    name,
  }
}

test.describe('Dashboard', () => {
  test('shows the four assessment counters to an Editor', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/dashboard')

    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    for (const testId of [
      'dashboard-total-products',
      'dashboard-published-passports',
      'dashboard-generated-qr-codes',
      'dashboard-total-passport-views',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible()
      await expect(page.getByTestId(testId)).toHaveText(/^\d+$/)
    }

    // The counters are real numbers, and the published count includes our fixture.
    const published = Number(await page.getByTestId('dashboard-published-passports').innerText())
    expect(published).toBeGreaterThanOrEqual(1)
    const products = Number(await page.getByTestId('dashboard-total-products').innerText())
    expect(products).toBeGreaterThanOrEqual(published)
  })

  test('shows the same counters to an Admin', async ({ page }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/dashboard')

    await expect(page.getByTestId('dashboard-total-products')).toHaveText(/^\d+$/)
    await expect(page.getByTestId('dashboard-published-passports')).toHaveText(/^\d+$/)
    await expect(page.getByTestId('dashboard-generated-qr-codes')).toHaveText(/^\d+$/)
    await expect(page.getByTestId('dashboard-total-passport-views')).toHaveText(/^\d+$/)
  })
})

test.describe('Analytics page', () => {
  test('renders every section for an Editor without any raw address', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/analytics')

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Scans Today' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Weekly Scans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Most Viewed Products' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Latest Scans' })).toBeVisible()

    await expect(page.getByTestId('analytics-scans-today')).toHaveText(/^\d+$/)

    // The seven UTC buckets are always present, oldest first.
    const weekly = page.getByTestId('analytics-weekly-scans')
    await expect(weekly.locator('tbody tr')).toHaveCount(7)

    // The mocked country is labelled as mocked wherever it appears.
    await expect(page.getByText(/mocked for this assessment/i)).toBeVisible()

    // An Editor never receives the raw address, so the column does not exist.
    await expect(page.getByRole('columnheader', { name: 'IP address' })).toHaveCount(0)
  })

  test('gives an Admin the raw address column', async ({ page, request }) => {
    // The Admin's company is separate, so its own passport must be scanned first.
    const scan = await request.get(`${WEB}/q/${adminFixture.publicUuid}`, { maxRedirects: 0 })
    expect(scan.status()).toBe(302)

    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/analytics')

    await expect(page.getByTestId('analytics-scans-today')).toHaveText(/^\d+$/)
    // The Admin projection carries the address column and the mocked country.
    const scans = page.getByTestId('analytics-latest-scans')
    await expect(scans).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'IP address' })).toBeVisible()
    await expect(scans.getByRole('cell', { name: /127\.0\.0\.1|::1/ }).first()).toBeVisible()
    await expect(scans.getByRole('cell', { name: /IT \(mock\)/ }).first()).toBeVisible()
  })

  test('changes the Most Viewed range through the bounded selector', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/analytics')

    const group = page.getByTestId('analytics-range')
    const seven = group.getByRole('button', { name: 'Last 7 days' })
    const thirty = group.getByRole('button', { name: 'Last 30 days' })
    await expect(seven).toHaveAttribute('aria-pressed', 'true')

    // Selecting a range issues the request for that window and marks it selected.
    const request30 = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/analytics?range=30') && candidate.method() === 'GET',
    )
    await thirty.click()
    await request30
    await expect(thirty).toHaveAttribute('aria-pressed', 'true')
    await expect(seven).toHaveAttribute('aria-pressed', 'false')

    const request90 = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/analytics?range=90') && candidate.method() === 'GET',
    )
    await group.getByRole('button', { name: 'Last 90 days' }).click()
    await request90
    await expect(group.getByRole('button', { name: 'Last 90 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

test.describe('Public view tracking', () => {
  test('records exactly one view for a visible public navigation', async ({ page }) => {
    const before = await analyticsCounts(fixture.passportId)

    await page.goto(`/passport/${fixture.publicUuid}`)
    await expect(page.getByTestId('passport-product-name')).toHaveText(fixture.name)

    await expect
      .poll(async () => (await analyticsCounts(fixture.passportId)).views, { timeout: 15_000 })
      .toBe(before.views + 1)
  })

  test('does not double-count a retry that reuses the same event key', async ({ request }) => {
    const before = await analyticsCounts(fixture.passportId)
    const eventKey = crypto.randomUUID()

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request.post(`${API}/passport/${fixture.publicUuid}/view`, {
        data: { eventKey, version: 1 },
      })
      expect(response.status()).toBe(204)
    }

    const after = await analyticsCounts(fixture.passportId)
    expect(after.views).toBe(before.views + 1)
  })

  test('does not record a view from the editor Preview', async ({ page }) => {
    const before = await analyticsCounts(fixture.passportId)

    await signIn(page, E2E_EMAIL)
    await page.goto(`/products/${fixture.productId}`)
    await page.getByRole('tab', { name: 'Preview', exact: true }).click()
    await expect(page.getByTestId('preview-panel')).toBeVisible()
    await expect(page.getByTestId('passport-product-name')).toBeVisible()

    // Give a hypothetical tracker time to fire before asserting it did not.
    await page.waitForTimeout(1_500)
    const after = await analyticsCounts(fixture.passportId)
    expect(after.views).toBe(before.views)
  })
})

test.describe('QR scans and the Product list', () => {
  test('records one scan while still redirecting to the public page', async ({ request }) => {
    const before = await analyticsCounts(fixture.passportId)

    const response = await request.get(`${WEB}/q/${fixture.publicUuid}`, { maxRedirects: 0 })
    expect(response.status()).toBe(302)
    expect(response.headers().location).toBe(`${WEB}/passport/${fixture.publicUuid}`)

    await expect
      .poll(async () => (await analyticsCounts(fixture.passportId)).qrHits, { timeout: 15_000 })
      .toBe(before.qrHits + 1)
  })

  test('shows the measured Total Views in the Product list', async ({ page }) => {
    const expected = await analyticsCounts(fixture.passportId)

    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    const row = page.getByRole('row').filter({ hasText: fixture.name })
    await expect(row).toHaveCount(1)
    // The column is the real count, and the placeholder is gone for good.
    await expect(row.getByTestId('product-total-views')).toHaveText(String(expected.views))
    await expect(row.getByTestId('product-total-views')).not.toHaveText('—')
  })
})
