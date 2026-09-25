import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 4.5 browser proof: the public and back-office Download PDF actions.
 *
 * The PDF itself is verified independently by the integration suite; these tests prove
 * the browser surfaces point at the real API route, that both roles can download the
 * current passport export, and that neither the draft Preview nor a historical version
 * advertises an export it does not have.
 */

const API = 'http://localhost:3000'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
startxref
9
%%EOF
`,
  'latin1',
)

type Fixture = {
  productId: string
  passportId: string
  publicUuid: string
  name: string
}

let fixture: Fixture

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

async function upload(
  request: APIRequestContext,
  token: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const response = await request.post(`${API}/assets`, {
    headers: { authorization: `Bearer ${token}` },
    multipart: { file: { name, mimeType, buffer } },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

test.beforeAll(async ({ request }) => {
  const token = await tokenFor(request, E2E_EMAIL)
  const cover = await upload(request, token, 'pdf-cover.png', 'image/png', PNG_1X1)
  const manual = await upload(request, token, 'pdf-manual.pdf', 'application/pdf', MINIMAL_PDF)

  const categories = await request.get(`${API}/categories`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(categories.status()).toBe(200)
  const categoryId = (await categories.json())[0].id as string

  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const name = `E2E PDF Product ${unique}`
  const created = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name,
      sku: `SKU-PDF-${unique}`,
      serialNumber: `SN-PDF-${unique}`,
      categoryId,
      description: 'A fully populated product used by the Stage 4.5 browser proof.',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 30,
        recycledPercent: 40,
        repairabilityScore: 7.5,
        recyclable: true,
      },
      materials: [{ name: 'Aluminium', percentage: 100, originCountry: 'IT', position: 0 }],
      images: [{ assetId: cover, role: 'COVER', altText: 'Cover' }],
      documents: [{ assetId: manual, kind: 'MANUAL', title: 'Manual' }],
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

  fixture = {
    productId: product.id as string,
    passportId: publication.passportId as string,
    publicUuid: publication.publicUuid as string,
    name,
  }
})

/** Asserts a response really is the streamed PDF attachment. */
async function expectPdfResponse(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(response.headers()['content-disposition']).toContain('attachment')
  expect(response.headers()['content-disposition']).toContain(
    `notarify-passport-${fixture.publicUuid}-v1.pdf`,
  )
  const body = await response.body()
  expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
}

test.describe('public passport PDF', () => {
  test('offers a Download PDF action that returns the real attachment', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`/passport/${fixture.publicUuid}`)

    const link = page.getByTestId('passport-pdf-download')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', `${API}/passport/${fixture.publicUuid}/pdf`)

    await expectPdfResponse(await request.get(`${API}/passport/${fixture.publicUuid}/pdf`))
    await context.close()
  })
})

test.describe('back-office PDF downloads', () => {
  test('lets an editor download the current passport PDF', async ({ page, request }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/passports')

    const row = page.getByTestId('passport-row').filter({ hasText: fixture.name })
    await expect(row).toHaveCount(1)
    const link = row.getByTestId('download-pdf')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', `${API}/passport/${fixture.publicUuid}/pdf`)
    await expect(row.getByTestId('version-history')).toHaveCount(0)

    await expectPdfResponse(await request.get(`${API}/passport/${fixture.publicUuid}/pdf`))
  })

  test('lets an admin download the current passport PDF and keeps history admin-only', async ({
    page,
    request,
  }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto('/passports')

    const row = page.getByTestId('passport-row').filter({ hasText: fixture.name })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('download-pdf')).toBeVisible()
    await expect(row.getByTestId('version-history')).toBeVisible()

    await expectPdfResponse(await request.get(`${API}/passport/${fixture.publicUuid}/pdf`))
  })
})

test.describe('no fake PDF surfaces', () => {
  test('draft Preview does not advertise a PDF export', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto(`/products/${fixture.productId}`)
    await page.getByRole('tab', { name: 'Preview', exact: true }).click()

    await expect(page.getByTestId('passport-presentation')).toBeVisible()
    await expect(page.getByTestId('passport-pdf-download')).toHaveCount(0)
  })

  test('a historical version does not advertise a historical PDF export', async ({ page }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto(`/passports/${fixture.passportId}`)
    await page.getByTestId('select-version-1').click()

    await expect(page.getByTestId('history-chrome')).toBeVisible()
    await expect(page.getByTestId('passport-presentation')).toBeVisible()
    await expect(page.getByTestId('passport-pdf-download')).toHaveCount(0)
  })
})
