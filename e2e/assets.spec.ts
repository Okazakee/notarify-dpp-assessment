import { expect, test } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

const API = 'http://localhost:3000'

/**
 * Deliberately small, deterministic fixtures held inline.
 *
 * Playwright runs against the built stack and cannot reach the API workspace's image
 * library, so these are literal bytes rather than generated ones. The PNG is a real
 * 1x1 image and the PDF is a minimal document with a cross-reference pointer and an
 * end-of-file marker, which is what the API's structural check requires.
 */
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

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
  'utf8',
)

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', E2E_EMAIL)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page.getByText(E2E_EMAIL)).toBeVisible()
}

async function createDraft(page: import('@playwright/test').Page, name: string): Promise<string> {
  await page.goto('/products')
  await page.getByRole('button', { name: 'Create product' }).click()
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop() as string
  await page.fill('#product-name', name)
  await page.fill('#product-serial', `SN-ASSET-${Date.now()}`)
  return id
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

async function saveDraft(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  id: string,
  token: string,
): Promise<number> {
  const before = await revisionOf(request, token, id)
  await page.getByRole('button', { name: /save draft/i }).click()
  await expect
    .poll(async () => revisionOf(request, token, id), { timeout: 15_000 })
    .toBe(before + 1)
  return before + 1
}

test.describe('product assets', () => {
  test('uploads a cover image, saves, and still previews it after a reload', async ({
    page,
    request,
  }) => {
    await signIn(page)
    const id = await createDraft(page, 'E2E Asset Product')

    await page.getByRole('tab', { name: 'Images', exact: true }).click()
    await page.setInputFiles('#cover-image', {
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })

    // The preview only renders after the authenticated byte fetch succeeds, so a
    // visible blob image proves upload and private retrieval both worked.
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('cover.png')).toBeVisible()
    await page.fill('#image-alt-0', 'Front view')

    const token = await apiToken(request)
    await saveDraft(page, request, id, token)

    await page.reload()
    await page.getByRole('tab', { name: 'Images', exact: true }).click()
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('cover.png')).toBeVisible()
    await expect(page.locator('#image-alt-0')).toHaveValue('Front view')

    // The association is recorded server-side, not just in the browser.
    const detail = await request.get(`${API}/products/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = await detail.json()
    expect(body.images).toHaveLength(1)
    expect(body.images[0].role).toBe('COVER')
    expect(body.images[0].asset.detectedMime).toBe('image/png')
    expect(JSON.stringify(body)).not.toContain('bytes')
  })

  test('attaches a PDF document and a certification PDF that survive a reload', async ({
    page,
    request,
  }) => {
    await signIn(page)
    const id = await createDraft(page, 'E2E Document Product')

    await page.getByRole('tab', { name: 'Documents', exact: true }).click()
    await page.setInputFiles('#document-upload-MANUAL', {
      name: 'handbook.pdf',
      mimeType: 'application/pdf',
      buffer: MINIMAL_PDF,
    })
    await expect(page.getByText('handbook.pdf')).toBeVisible({ timeout: 15_000 })
    await page.fill('#document-title-0', 'Product handbook')

    await page.getByRole('tab', { name: 'Certifications', exact: true }).click()
    await page.getByRole('button', { name: 'Add certification' }).click()
    await page.fill('#certification-name-0', 'E2E Certified')
    await page.setInputFiles('#certification-pdf-0', {
      name: 'certificate.pdf',
      mimeType: 'application/pdf',
      buffer: MINIMAL_PDF,
    })
    await expect(page.getByText('certificate.pdf')).toBeVisible({ timeout: 15_000 })

    const token = await apiToken(request)
    await saveDraft(page, request, id, token)

    await page.reload()
    await page.getByRole('tab', { name: 'Documents', exact: true }).click()
    await expect(page.getByText('handbook.pdf')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#document-title-0')).toHaveValue('Product handbook')
    await page.getByRole('tab', { name: 'Certifications', exact: true }).click()
    await expect(page.getByText('certificate.pdf')).toBeVisible({ timeout: 15_000 })

    const detail = await request.get(`${API}/products/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = await detail.json()
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].kind).toBe('MANUAL')
    expect(body.certifications[0].pdfAssetId).toBeTruthy()
  })

  test('reports an unsupported file and attaches nothing', async ({ page }) => {
    await signIn(page)
    await createDraft(page, 'E2E Invalid Upload Product')

    await page.getByRole('tab', { name: 'Images', exact: true }).click()
    await page.setInputFiles('#cover-image', {
      name: 'diagram.svg',
      mimeType: 'image/svg+xml',
      buffer: SVG,
    })

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/unsupported file type/i).first()).toBeVisible()
    // Nothing was attached, so no preview and no image card appeared.
    await expect(page.locator('img[src^="blob:"]')).toHaveCount(0)
    await expect(page.getByText('No images attached yet.')).toBeVisible()
  })
})
