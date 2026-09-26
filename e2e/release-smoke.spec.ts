import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Packaged-application reviewer journey.
 *
 * Every step runs against the Compose stack on its published ports: the web app on :3001,
 * the API on :3000, PostgreSQL and Redis private inside the network. The seeded demo data is
 * the fixture, so this suite is the end-to-end proof that a reviewer who only has the
 * repository can clone, build, migrate, seed and exercise the application.
 *
 * It mutates the demo data on purpose — it publishes the seeded draft and withdraws the
 * second product — which is why the README documents the reset:
 *
 *   docker compose down -v && docker compose up --build -d && docker compose run --rm seed
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3000'
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3001'

const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@demo.test'
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'AdminDemoPassw0rd!'

const BOTTLE = 'Demo Reusable Bottle'
const STOOL = 'Demo Oak Stool'

test.describe.configure({ mode: 'serial', timeout: 120_000 })

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible()
}

/** Publishes one product from the editor and returns its public URL. */
async function publishFromEditor(page: Page, productName: string): Promise<string> {
  await page.goto('/products')
  const row = page.getByRole('row').filter({ hasText: productName })
  await expect(row).toHaveCount(1)
  await row.getByTestId('product-edit').click()
  await expect(page.locator('#product-name')).toBeVisible()

  // Walk every editor tab, so the packaged client bundle is exercised end to end.
  for (const tab of [
    'general',
    'materials',
    'sustainability',
    'certifications',
    'documents',
    'images',
    'preview',
  ]) {
    await page.getByTestId(`editor-tab-${tab}`).click()
  }
  await expect(page.getByTestId('preview-panel')).toBeVisible()
  await expect(page.getByTestId('preview-banner')).toBeVisible()

  await page.getByTestId('publish-button').click()
  await expect(page.getByTestId('publish-notice')).toBeVisible({ timeout: 30_000 })
  const href = await page.getByTestId('publish-public-link').getAttribute('href')
  expect(href).toBeTruthy()
  return href as string
}

test('packaged stack serves the reviewer journey end to end', async ({
  page,
  browser,
  request,
}) => {
  // ---- login and dashboard ------------------------------------------------------------
  await signIn(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  for (const id of [
    'dashboard-total-products',
    'dashboard-published-passports',
    'dashboard-generated-qr-codes',
    'dashboard-total-passport-views',
  ]) {
    await expect(page.getByTestId(id)).toHaveText(/^\d+$/)
  }
  expect(
    Number(await page.getByTestId('dashboard-total-products').innerText()),
  ).toBeGreaterThanOrEqual(2)

  // ---- products list, search and filter ------------------------------------------------
  await page.goto('/products')
  await expect(page.getByRole('row').filter({ hasText: BOTTLE })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: STOOL })).toHaveCount(1)
  await page.fill('#product-query', 'Bottle')
  await page.locator('#product-query').press('Enter')
  await expect(page.getByRole('row').filter({ hasText: BOTTLE })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: STOOL })).toHaveCount(0)

  // ---- read-only Product view (the private draft, not the public Passport) -------------
  await page.goto('/products')
  const viewRow = page.getByRole('row').filter({ hasText: BOTTLE })
  await viewRow.getByTestId('product-view').click()
  await expect(page.getByTestId('product-view-status')).toBeVisible()
  await expect(page.getByTestId('product-view-materials')).toBeVisible()
  await expect(page.getByText('This is not the published Passport')).toBeVisible()

  // ---- publish the seeded complete draft ----------------------------------------------
  const bottleUrl = await publishFromEditor(page, BOTTLE)

  // ---- the anonymous public Passport, in a context with no session --------------------
  const anonymous = await browser.newContext()
  const publicPage = await anonymous.newPage()
  await publicPage.goto(bottleUrl)
  await expect(publicPage.getByTestId('passport-product-name')).toHaveText(BOTTLE)
  await expect(publicPage.getByTestId('passport-status')).toHaveText('Published')

  const publicUuid = bottleUrl.split('/').pop() as string

  // Stored QR artifact and PDF export, served by the API on its published port.
  const qr = await request.get(`${API}/passport/${publicUuid}/qr.png`)
  expect(qr.status()).toBe(200)
  expect(qr.headers()['content-type']).toContain('image/png')
  const pdf = await request.get(`${API}/passport/${publicUuid}/pdf`)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')

  // The printed QR target resolves through the web origin to the canonical page.
  const scan = await request.get(`${WEB}/q/${publicUuid}`, { maxRedirects: 0 })
  expect(scan.status()).toBe(302)
  expect(scan.headers().location).toBe(`${WEB}/passport/${publicUuid}`)
  await anonymous.close()

  // ---- view tracking and analytics ------------------------------------------------------
  await page.goto('/analytics')
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
  await expect(page.getByTestId('analytics-scans-today')).toHaveText(/^\d+$/)
  await expect(page.getByTestId('analytics-weekly-scans').locator('tbody tr')).toHaveCount(7)
  await expect
    .poll(async () => Number(await page.getByTestId('analytics-scans-today').innerText()), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(1)

  await page.goto('/dashboard')
  await expect
    .poll(
      async () => Number(await page.getByTestId('dashboard-total-passport-views').innerText()),
      {
        timeout: 15_000,
      },
    )
    .toBeGreaterThanOrEqual(1)

  // ---- back-office Passports and the Admin history view --------------------------------
  await page.goto('/passports')
  await expect(page.getByRole('row').filter({ hasText: BOTTLE })).toHaveCount(1)
  const passportRow = page.getByRole('row').filter({ hasText: BOTTLE })
  const historyHref = await passportRow.getByTestId('version-history').getAttribute('href')
  expect(historyHref).toBeTruthy()
  await passportRow.getByTestId('version-history').click()
  await expect(page.getByRole('heading', { name: 'Passport version history' })).toBeVisible()
  await expect(page.getByTestId('history-current-version')).toContainText('v1')
  await expect(page.getByTestId('history-withdrawn-notice')).toHaveCount(0)

  // ---- Users and Settings with audit activity ------------------------------------------
  await page.goto('/users')
  await expect(page.getByTestId(`user-row-${ADMIN_EMAIL}`)).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: 'editor@demo.test' })).toHaveCount(1)
  await page.goto('/settings')
  await expect(page.locator('#company-display-name')).toHaveValue('Demo Notarify Company')
  await expect(page.getByTestId('audit-table')).toBeVisible()

  // ---- withdraw the published Passport and prove public unavailability ------------------
  // The seeded draft is the complete fixture, so it is the one that can be published and
  // then withdrawn; the second product exists for list and filter demonstration only.
  await page.goto('/products')
  const bottleRow = page.getByRole('row').filter({ hasText: BOTTLE })
  await bottleRow.getByTestId('product-delete').click()
  await expect(page.getByTestId('product-delete-dialog')).toBeVisible()
  await page.getByTestId('product-delete-confirm').click()
  await expect(page.getByTestId('product-notice')).toContainText('Deleted')
  await expect(page.getByRole('row').filter({ hasText: BOTTLE })).toHaveCount(0)

  // Every anonymous surface for the withdrawn Passport is gone…
  for (const path of [
    `/passport/${publicUuid}`,
    `/passport/${publicUuid}/qr.png`,
    `/passport/${publicUuid}/pdf`,
    `/q/${publicUuid}`,
  ]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect([path, response.status()]).toEqual([path, 404])
  }

  // …the active-only list no longer offers it…
  await page.goto('/passports')
  await expect(page.getByRole('row').filter({ hasText: BOTTLE })).toHaveCount(0)

  // …and the retained history survives, stated truthfully.
  await page.goto(historyHref as string)
  await expect(page.getByTestId('history-withdrawn-notice')).toBeVisible()
  await expect(page.getByTestId('history-current-version')).toContainText('v1')
  await expect(page.getByTestId('history-open-current')).toHaveCount(0)
  await expect(page.getByTestId('history-qr-download')).toHaveCount(0)

  // ---- deleting a draft removes it without inventing a Passport -------------------------
  await page.goto('/products')
  const stoolRow = page.getByRole('row').filter({ hasText: STOOL })
  await stoolRow.getByTestId('product-delete').click()
  await page.getByTestId('product-delete-confirm').click()
  await expect(page.getByRole('row').filter({ hasText: STOOL })).toHaveCount(0)
})
