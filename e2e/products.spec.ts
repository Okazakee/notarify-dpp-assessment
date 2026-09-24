import { expect, test } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

const API = 'http://localhost:3000'

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', E2E_EMAIL)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page.getByText(E2E_EMAIL)).toBeVisible()
}

async function apiToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).accessToken as string
}

async function revisionOf(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  id: string,
): Promise<number> {
  const response = await request.get(`${API}/products/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).draftRevision as number
}

test.describe('product drafts', () => {
  test('creates an incomplete draft, edits every section, and re-saves', async ({
    page,
    request,
  }) => {
    await signIn(page)
    await page.goto('/products')
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop() as string

    const serial = `SN-${Date.now()}`
    await page.fill('#product-name', 'E2E Draft Product')
    await page.fill('#product-sku', 'SKU-E2E-SHARED')
    await page.fill('#product-serial', serial)
    await page.fill('#product-description', 'Created by the Playwright regression.')
    await page.fill('#origin-country', 'IT')
    await page.selectOption('#product-category-select', { index: 1 })

    // The editor is tabbed: a section's controls only become actionable once its tab is
    // selected. Tab order, keyboard operation and state preservation are covered by
    // e2e/passport-ui.spec.ts.
    await page.getByRole('tab', { name: 'Materials', exact: true }).click()
    await page.getByRole('button', { name: 'Add material' }).click()
    await page.fill('#material-name-0', 'Recycled aluminium')
    await page.fill('#material-percentage-0', '60')
    await page.fill('#material-country-0', 'DE')

    await page.getByRole('tab', { name: 'Sustainability', exact: true }).click()
    await page.getByRole('button', { name: /add sustainability details/i }).click()
    await page.fill('#carbon-kg', '12.5')
    await page.fill('#water-litres', '340')

    await page.getByRole('tab', { name: 'Certifications', exact: true }).click()
    await page.getByRole('button', { name: 'Add certification' }).click()
    await page.fill('#certification-name-0', 'E2E Certificate')
    await page.fill('#certification-authority-0', 'E2E Authority')
    await page.fill('#certification-issue-date-0', '2026-01-01')
    await page.fill('#certification-expiration-date-0', '2027-01-01')

    const token = await apiToken(request)

    await page.getByRole('button', { name: /save draft/i }).click()
    // Wait on the revision itself. The page header contains the words "changes
    // are saved explicitly", so matching that text would satisfy immediately and
    // read the API before the save has committed.
    await expect
      .poll(async () => revisionOf(request, token, id), { timeout: 15_000 })
      .toBeGreaterThan(0)

    const firstRevision = await revisionOf(request, token, id)
    expect(firstRevision).toBeGreaterThan(0)

    // Reload and confirm the draft survived.
    await page.reload()
    await expect(page.locator('#product-name')).toHaveValue('E2E Draft Product')
    await expect(page.locator('#material-name-0')).toHaveValue('Recycled aluminium')
    await expect(page.locator('#certification-name-0')).toHaveValue('E2E Certificate')
    await expect(page.locator('#carbon-kg')).toHaveValue('12.5')

    // A second save must advance the revision exactly once.
    await page.fill('#product-description', 'Second save from the Playwright regression.')
    await page.getByRole('button', { name: /save draft/i }).click()
    await expect
      .poll(async () => revisionOf(request, token, id), { timeout: 15_000 })
      .toBe(firstRevision + 1)
  })

  test('surfaces a stale-revision conflict without losing entered data', async ({
    page,
    request,
  }) => {
    await signIn(page)
    await page.goto('/products')
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop() as string

    await page.fill('#product-name', 'E2E Conflict Product')
    await page.fill('#product-serial', `SN-CONFLICT-${Date.now()}`)
    await page.getByRole('button', { name: /save draft/i }).click()

    // Deterministic stale state: another writer (the API) advances the revision
    // behind the editor's back. Wait for the editor's own save to land first.
    const token = await apiToken(request)
    await expect
      .poll(async () => revisionOf(request, token, id), { timeout: 15_000 })
      .toBeGreaterThan(0)
    const current = await revisionOf(request, token, id)
    const bumped = await request.patch(`${API}/products/${id}`, {
      headers: { authorization: `Bearer ${token}` },
      data: { expectedDraftRevision: current, description: 'Changed by another writer.' },
    })
    expect(bumped.status()).toBe(200)
    expect(await revisionOf(request, token, id)).toBe(current + 1)

    // The editor still holds the old revision, so its save must conflict.
    await page.fill('#product-description', 'Local unsaved edit that must not be lost.')
    await page.getByRole('button', { name: /save draft/i }).click()

    await expect(page.getByText(/stale/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#product-description')).toHaveValue(
      'Local unsaved edit that must not be lost.',
    )
    await expect(page.getByRole('button', { name: /save draft/i })).toBeDisabled()
  })
})
