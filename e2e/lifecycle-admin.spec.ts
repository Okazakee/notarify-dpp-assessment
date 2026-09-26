import { randomUUID } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { E2E_ADMIN_EMAIL, E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 6 browser proof: the final Product actions, the read-only Product view, user
 * administration, company settings and the six-item Admin navigation.
 *
 * The dedicated company below exists because two of these behaviours depend on company
 * state that the shared E2E company cannot guarantee: the last active administrator must
 * be the only one, and a settings change must not disturb the company whose branding other
 * suites already assert.
 */

const API = 'http://localhost:3000'
const WEB = 'http://localhost:3001'

const ADMIN_COMPANY_ID = '00000000-0000-4000-8000-00000000e101'
const ADMIN_USER_ID = '00000000-0000-4000-8000-00000000e102'
const ADMIN_ONLY_EMAIL = 'e2e-solo-admin@example.test'
const ADMIN_ONLY_PASSWORD = 'SoloAdminPassw0rd!'

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the Stage 6 browser suite')
  }
  const client = new Client({ connectionString })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function tokenFor(request: APIRequestContext, email: string, password = E2E_PASSWORD) {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } })
  expect(response.status()).toBe(200)
  return (await response.json()).accessToken as string
}

async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await expect(page.getByText(email)).toBeVisible()
}

async function upload(request: APIRequestContext, token: string, name: string): Promise<string> {
  const response = await request.post(`${API}/assets`, {
    headers: { authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      },
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function createProduct(
  request: APIRequestContext,
  token: string,
  categoryId: string,
  name: string,
  coverAssetId: string,
): Promise<{ id: string; draftRevision: number }> {
  const response = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name,
      sku: `SKU-S6-${Date.now()}`,
      serialNumber: `SN-S6-${Date.now()}`,
      categoryId,
      description: 'Stage 6 fixture',
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
      images: [{ assetId: coverAssetId, role: 'COVER', altText: 'front' }],
    },
  })
  expect(response.status()).toBe(201)
  const product = await response.json()
  return { id: product.id as string, draftRevision: product.draftRevision as number }
}

async function categoryIdFor(request: APIRequestContext, token: string): Promise<string> {
  const response = await request.get(`${API}/categories`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const categories = (await response.json()) as Array<{ id: string }>
  const id = categories[0]?.id
  if (id === undefined) {
    throw new Error('expected a seeded category')
  }
  return id
}

test.beforeAll(async () => {
  // A company whose branding no other suite depends on, used by the user-administration
  // and settings tests.
  const passwordHash = await hash(ADMIN_ONLY_PASSWORD)
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Company" (id, "displayName", "createdAt", "updatedAt")
       VALUES ($1, 'E2E Solo Admin Company', now(), now())
       ON CONFLICT (id) DO UPDATE SET "displayName" = 'E2E Solo Admin Company'`,
      [ADMIN_COMPANY_ID],
    )
    await client.query(
      `INSERT INTO "User" (id, "companyId", email, "normalizedEmail", "passwordHash", role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $4, 'ADMIN', true, now(), now())
       ON CONFLICT (id) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = 'ADMIN', active = true`,
      [ADMIN_USER_ID, ADMIN_COMPANY_ID, ADMIN_ONLY_EMAIL, passwordHash],
    )
  })
})

test.describe('Final Product table actions', () => {
  test('shows View and Edit to an Editor and hides Delete', async ({ page, request }) => {
    const categoryId = await categoryIdFor(request, await tokenFor(request, E2E_EMAIL))
    const cover = await upload(request, await tokenFor(request, E2E_EMAIL), 's6-editor-cover.png')
    const name = `Stage6 editor row ${Date.now()}`
    await createProduct(request, await tokenFor(request, E2E_EMAIL), categoryId, name, cover)

    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('product-view')).toBeVisible()
    await expect(row.getByTestId('product-edit')).toBeVisible()
    // Deletion is an Admin capability, so an Editor is not offered it.
    await expect(row.getByTestId('product-delete')).toHaveCount(0)
  })

  test('lets an Admin cancel a deletion without changing anything', async ({ page, request }) => {
    const categoryId = await categoryIdFor(request, await tokenFor(request, E2E_ADMIN_EMAIL))
    const cover = await upload(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      's6-admin-cover.png',
    )
    const name = `Stage6 admin row ${Date.now()}`
    const product = await createProduct(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      categoryId,
      name,
      cover,
    )

    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/products')

    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row.getByTestId('product-delete')).toBeVisible()
    await row.getByTestId('product-delete').click()

    const dialog = page.getByTestId('product-delete-dialog')
    await expect(dialog).toBeVisible()
    // The copy describes a withdrawal with retained history, not a hard delete.
    await expect(dialog).toContainText('withdraws its public Passport')
    await expect(dialog).toContainText('no restore action')

    await dialog.getByTestId('product-delete-cancel').click()
    await expect(dialog).toHaveCount(0)
    // Cancelling changes nothing.
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1)

    const stillThere = await request.get(`${API}/products/${product.id}`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_ADMIN_EMAIL)}` },
    })
    expect(stillThere.status()).toBe(200)
  })

  test('deletes a published product and reports what happened', async ({ page, request }) => {
    const categoryId = await categoryIdFor(request, await tokenFor(request, E2E_ADMIN_EMAIL))
    const cover = await upload(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      's6-delete-cover.png',
    )
    const name = `Stage6 deletable ${Date.now()}`
    const product = await createProduct(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      categoryId,
      name,
      cover,
    )

    const published = await request.post(`${API}/products/${product.id}/publish`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_ADMIN_EMAIL)}` },
      data: { expectedDraftRevision: product.draftRevision },
    })
    expect(published.status()).toBe(200)
    const publicUuid = (await published.json()).publicUuid as string
    expect((await request.get(`${WEB}/passport/${publicUuid}`)).status()).toBe(200)

    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/products')

    const row = page.getByRole('row').filter({ hasText: name })
    await row.getByTestId('product-delete').click()
    await page.getByTestId('product-delete-confirm').click()

    await expect(page.getByTestId('product-notice')).toContainText('Deleted')
    // The row is gone from the back office, and the public Passport is withdrawn.
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
    await expect
      .poll(async () => (await request.get(`${WEB}/passport/${publicUuid}`)).status())
      .toBe(404)
  })
})

test.describe('Read-only Product view', () => {
  test('shows the current private draft while the public page still shows the published version', async ({
    page,
    request,
  }) => {
    const categoryId = await categoryIdFor(request, await tokenFor(request, E2E_EMAIL))
    const cover = await upload(request, await tokenFor(request, E2E_EMAIL), 's6-view-cover.png')
    const publishedName = `Stage6 view published ${Date.now()}`
    const draftName = `${publishedName} — draft`
    const product = await createProduct(
      request,
      await tokenFor(request, E2E_EMAIL),
      categoryId,
      publishedName,
      cover,
    )

    const published = await request.post(`${API}/products/${product.id}/publish`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_EMAIL)}` },
      data: { expectedDraftRevision: product.draftRevision },
    })
    expect(published.status()).toBe(200)
    const publicUuid = (await published.json()).publicUuid as string

    // A saved change that has not been republished.
    const saved = await request.patch(`${API}/products/${product.id}`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_EMAIL)}` },
      data: { name: draftName, expectedDraftRevision: product.draftRevision },
    })
    expect(saved.status()).toBe(200)

    await signIn(page, E2E_EMAIL)
    await page.goto(`/products/${product.id}/view`)

    await expect(page.getByRole('heading', { level: 1, name: draftName })).toBeVisible()
    await expect(page.getByTestId('product-view-status')).toHaveText('Published')
    await expect(page.getByTestId('product-view-materials')).toBeVisible()
    await expect(page.getByTestId('product-view-images')).toBeVisible()
    // The page is the private record, so it says so.
    await expect(page.getByText('This is not the published Passport')).toBeVisible()

    // The published Passport still shows the version that was actually published.
    await page.goto(`/passport/${publicUuid}`)
    await expect(page.getByTestId('passport-product-name')).toHaveText(publishedName)

    // Viewing mutates nothing.
    const after = await request.get(`${API}/products/${product.id}`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_EMAIL)}` },
    })
    const afterBody = await after.json()
    expect(afterBody.draftRevision).toBe(product.draftRevision + 1)
    expect(afterBody.name).toBe(draftName)
  })

  test('offers an Edit Product action and works for an Admin too', async ({ page, request }) => {
    const categoryId = await categoryIdFor(request, await tokenFor(request, E2E_ADMIN_EMAIL))
    const cover = await upload(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      's6-view-admin-cover.png',
    )
    const name = `Stage6 view admin ${Date.now()}`
    const product = await createProduct(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      categoryId,
      name,
      cover,
    )

    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto(`/products/${product.id}/view`)
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

    await page.getByTestId('product-view-edit').click()
    await expect(page.locator('#product-name')).toBeVisible()
  })
})

test.describe('Back-office navigation', () => {
  test('exposes six destinations to an Admin and four to an Editor', async ({ page, browser }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/dashboard')
    const adminNav = page.getByRole('navigation', { name: 'Back office' })
    for (const label of [
      'Dashboard',
      'Products',
      'Product Passports',
      'Analytics',
      'Users',
      'Settings',
    ]) {
      await expect(adminNav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }

    // A second role needs its own context: the login page redirects an already
    // authenticated session, so the same page cannot simply sign in again.
    const editorContext = await browser.newContext()
    const editorPage = await editorContext.newPage()
    await signIn(editorPage, E2E_EMAIL)
    await editorPage.goto('/dashboard')
    const editorNav = editorPage.getByRole('navigation', { name: 'Back office' })
    for (const label of ['Dashboard', 'Products', 'Product Passports', 'Analytics']) {
      await expect(editorNav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    await expect(editorNav.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
    await expect(editorNav.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0)
    await editorContext.close()
  })

  test('refuses an Editor who opens an Admin page directly', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/users')
    // The API refuses the read, so the page shows its error state rather than data. The
    // assertion targets the page's own element, because the app router renders a live
    // region with the alert role as well.
    await expect(page.getByTestId('users-load-error')).toBeVisible()
    await expect(page.getByTestId('users-table')).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByTestId('settings-load-error')).toBeVisible()
    await expect(page.getByTestId('audit-table')).toHaveCount(0)
  })
})

test.describe('User administration', () => {
  test('protects the last active administrator', async ({ page }) => {
    // A company created for this run with exactly one active Admin, so the refusal does not
    // depend on what previous runs left behind.
    const run = Date.now()
    const companyId = randomUUID()
    const userId = randomUUID()
    const email = `solo-admin-${run}@example.test`
    const password = `SoloAdminPassw0rd-${run}!`
    const passwordHash = await hash(password)
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO "Company" (id, "displayName", "createdAt", "updatedAt")
         VALUES ($1, $2, now(), now())`,
        [companyId, `Solo admin company ${run}`],
      )
      await client.query(
        `INSERT INTO "User" (id, "companyId", email, "normalizedEmail", "passwordHash", role, active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $3, $4, 'ADMIN', true, now(), now())`,
        [userId, companyId, email, passwordHash],
      )
    })

    await signIn(page, email, password)
    await page.goto('/users')

    const row = page.getByTestId(`user-row-${email}`)
    await expect(row).toHaveCount(1)
    await row.getByTestId(`user-role-${email}`).click()
    await page.getByTestId('user-action-confirm').click()

    await expect(page.getByTestId('users-action-error')).toContainText('last active administrator')
    // The role is unchanged.
    await expect(row).toContainText('Administrator')
  })

  test('creates a user, changes a role, disables and reactivates', async ({ page, request }) => {
    const email = `stage6-user-${Date.now()}@example.test`
    const password = 'InitialPassw0rd!'

    await signIn(page, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASSWORD)
    await page.goto('/users')

    await page.fill('#new-user-email', email)
    await page.selectOption('#new-user-role', 'EDITOR')
    await page.fill('#new-user-password', password)
    await page.getByTestId('user-create-submit').click()
    await expect(page.getByTestId('users-notice')).toContainText('Communicate the initial password')

    const row = page.getByTestId(`user-row-${email}`)
    await expect(row).toHaveCount(1)
    await expect(page.getByTestId(`user-status-${email}`)).toHaveText('Active')

    // The created account can sign in with the initial credential.
    const token = await tokenFor(request, email, password)

    // A role change is confirmed first, then applied.
    await row.getByTestId(`user-role-${email}`).click()
    await page.getByTestId('user-action-confirm').click()
    await expect(page.getByTestId('users-notice')).toContainText('administrator')

    // Disabling revokes the live session, which the API refuses afterwards.
    await page.getByTestId(`user-toggle-${email}`).click()
    await page.getByTestId('user-action-confirm').click()
    await expect(page.getByTestId('users-notice')).toContainText('disabled')
    await expect(page.getByTestId(`user-status-${email}`)).toHaveText('Disabled')
    const afterDisable = await request.get(`${API}/products`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect([401, 403]).toContain(afterDisable.status())

    // Reactivation allows a fresh sign-in but does not restore the revoked session.
    await page.getByTestId(`user-toggle-${email}`).click()
    await page.getByTestId('user-action-confirm').click()
    await expect(page.getByTestId('users-notice')).toContainText('active')
    await expect(page.getByTestId(`user-status-${email}`)).toHaveText('Active')
    await tokenFor(request, email, password)
  })
})

test.describe('Company settings', () => {
  test('updates the display name, manages the logo and shows audit activity', async ({ page }) => {
    const renamed = `E2E Solo Admin Company ${Date.now()}`

    await signIn(page, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASSWORD)
    await page.goto('/settings')

    await page.fill('#company-display-name', renamed)
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-notice')).toContainText('Settings saved')

    // The audit section reflects the change without a reload.
    await expect(page.getByTestId('audit-table')).toBeVisible()
    await expect(page.getByTestId('audit-table')).toContainText('COMPANY_SETTINGS_UPDATED')

    // The change persists across a reload.
    await page.reload()
    await expect(page.locator('#company-display-name')).toHaveValue(renamed)

    // A logo uploaded through the existing asset flow becomes the company logo.
    await page.setInputFiles('#company-logo-upload', {
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(page.getByTestId('settings-logo')).toBeVisible()

    await page.getByTestId('settings-logo-clear').click()
    await expect(page.getByTestId('settings-logo')).toHaveCount(0)
  })

  test('does not change an already-published Passport', async ({ request }) => {
    // A published Passport from the shared E2E company keeps its published brand even
    // after that company's settings change, because snapshots are immutable.
    const categories = await categoryIdFor(request, await tokenFor(request, E2E_ADMIN_EMAIL))
    const cover = await upload(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      's6-brand-cover.png',
    )
    const name = `Stage6 brand ${Date.now()}`
    const product = await createProduct(
      request,
      await tokenFor(request, E2E_ADMIN_EMAIL),
      categories,
      name,
      cover,
    )
    const published = await request.post(`${API}/products/${product.id}/publish`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_ADMIN_EMAIL)}` },
      data: { expectedDraftRevision: product.draftRevision },
    })
    expect(published.status()).toBe(200)
    const publicUuid = (await published.json()).publicUuid as string

    const before = await request.get(`${API}/passport/${publicUuid}`)
    const brandBefore = (await before.json()).brand.displayName as string

    const renamed = `E2E Company ${Date.now()}`
    const patched = await request.patch(`${API}/settings`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_ADMIN_EMAIL)}` },
      data: { displayName: renamed },
    })
    expect(patched.status()).toBe(200)

    const after = await request.get(`${API}/passport/${publicUuid}`)
    expect((await after.json()).brand.displayName).toBe(brandBefore)

    // Restore the shared company's name so other suites keep their expectations.
    const restored = await request.patch(`${API}/settings`, {
      headers: { authorization: `Bearer ${await tokenFor(request, E2E_ADMIN_EMAIL)}` },
      data: { displayName: brandBefore },
    })
    expect(restored.status()).toBe(200)
  })
})
