import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 4.3 browser proof: the anonymous public passport page, the seven-tab editor, the
 * draft Preview and the Publish/Republish interaction.
 *
 * The decisive proof is the isolation chain: a published passport keeps showing v1 while a
 * draft is edited, while Preview shows the edited draft, through a save and until an
 * explicit republish moves the public projection to v2 on the same public UUID.
 *
 * The API is driven directly with a real access token for fixture setup, because the point
 * of these tests is the browser behaviour, not the API contracts already covered by the
 * integration suites.
 */

const API = 'http://localhost:3000'
const WEB = 'http://localhost:3001'

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
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
  'utf8',
)

type CreatedProduct = {
  id: string
  draftRevision: number
  coverAssetId: string
}

async function apiToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).accessToken as string
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', E2E_EMAIL)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page.getByText(E2E_EMAIL)).toBeVisible()
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

async function revisionOf(request: APIRequestContext, token: string, id: string): Promise<number> {
  const response = await request.get(`${API}/products/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).draftRevision as number
}

/** Creates a draft that satisfies every publication prerequisite. */
async function createCompleteProduct(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<CreatedProduct> {
  const auth = { authorization: `Bearer ${token}` }
  const cover = await upload(request, token, 'cover.png', 'image/png', PNG_1X1)
  const gallery = await upload(request, token, 'gallery.png', 'image/png', PNG_1X1)
  const manual = await upload(request, token, 'manual.pdf', 'application/pdf', MINIMAL_PDF)
  const warranty = await upload(request, token, 'warranty.pdf', 'application/pdf', MINIMAL_PDF)
  const datasheet = await upload(request, token, 'datasheet.pdf', 'application/pdf', MINIMAL_PDF)
  const certificate = await upload(
    request,
    token,
    'certificate.pdf',
    'application/pdf',
    MINIMAL_PDF,
  )

  const categories = await request.get(`${API}/categories`, { headers: auth })
  expect(categories.status()).toBe(200)
  const categoryId = (await categories.json())[0].id as string

  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const created = await request.post(`${API}/products`, {
    headers: auth,
    data: {
      name,
      sku: `SKU-${unique}`,
      serialNumber: `SN-${unique}`,
      categoryId,
      description: 'A fully populated product used by the Stage 4.3 browser proof.',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 30,
        recycledPercent: 40,
        repairabilityScore: 7.5,
        recyclable: true,
      },
      materials: [
        { name: 'Aluminium', percentage: 60, originCountry: 'IT', recyclable: true, position: 0 },
        {
          name: 'Recycled PET',
          percentage: 40,
          originCountry: 'DE',
          recyclable: false,
          position: 1,
        },
      ],
      certifications: [
        {
          name: 'ISO 14001',
          issuingAuthority: 'Demo Authority',
          issueDate: '2025-01-01',
          expirationDate: '2028-01-01',
          pdfAssetId: certificate,
        },
      ],
      images: [
        { assetId: cover, role: 'COVER', altText: 'Front cover' },
        { assetId: gallery, role: 'GALLERY', altText: 'Gallery shot' },
      ],
      documents: [
        { assetId: manual, kind: 'MANUAL', title: 'User manual' },
        { assetId: warranty, kind: 'WARRANTY', title: 'Warranty terms' },
        { assetId: datasheet, kind: 'TECHNICAL_DATASHEET', title: 'Technical datasheet' },
      ],
    },
  })
  expect(created.status()).toBe(201)
  const product = await created.json()
  return {
    id: product.id as string,
    draftRevision: product.draftRevision as number,
    coverAssetId: cover,
  }
}

async function publish(
  request: APIRequestContext,
  token: string,
  id: string,
  expectedDraftRevision: number,
): Promise<{ publicUuid: string; versionNumber: number }> {
  const response = await request.post(`${API}/products/${id}/publish`, {
    headers: { authorization: `Bearer ${token}` },
    data: { expectedDraftRevision },
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  return { publicUuid: body.publicUuid as string, versionNumber: body.versionNumber as number }
}

async function saveDraft(
  page: Page,
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<number> {
  const before = await revisionOf(request, token, id)
  await page.getByRole('button', { name: /save draft/i }).click()
  await expect
    .poll(async () => revisionOf(request, token, id), { timeout: 15_000 })
    .toBe(before + 1)
  return before + 1
}

/** The public page exactly as a browser with no JavaScript would receive it. */
async function publicHtml(request: APIRequestContext, uuid: string): Promise<string> {
  const response = await request.get(`${WEB}/passport/${uuid}`)
  expect(response.status()).toBe(200)
  return response.text()
}

test.describe('public passport page', () => {
  test('renders every required section anonymously, without a login redirect', async ({
    browser,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Public Passport Product')
    const { publicUuid } = await publish(request, token, created.id, created.draftRevision)

    // A fresh context with no cookies and no storage: the page must not need a session.
    const context = await browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(`/passport/${publicUuid}`)

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`/passport/${publicUuid}$`))

    // Header: bundled brand mark, company name, product identity and a qualified badge.
    await expect(page.locator('svg[data-brand-mark="notarify"]')).toBeVisible()
    await expect(page.getByTestId('brand-name')).toBeVisible()
    await expect(page.getByTestId('passport-product-name')).toHaveText(
      'E2E Public Passport Product',
    )
    await expect(page.getByTestId('verification-badge')).toHaveText('Verified Product')
    await expect(page.getByTestId('passport-status')).toHaveText('Published')
    await expect(
      page.getByText('not a legal certification, proof of authenticity', { exact: false }),
    ).toBeVisible()

    // The cover image is really fetched from the public published-asset route.
    const cover = page.getByTestId('passport-cover-image')
    await expect(cover).toBeVisible()
    await expect
      .poll(async () => cover.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0)
    await expect(cover).toHaveAttribute('src', new RegExp(`/passport/${publicUuid}/assets/`))

    // Product information.
    await expect(page.locator('[data-passport-section="product-information"]')).toContainText('IT')
    await expect(page.locator('[data-passport-section="product-information"]')).toContainText(
      '15 January 2026',
    )

    // Materials.
    const materials = page.locator('[data-passport-section="materials"]')
    await expect(materials).toContainText('Aluminium')
    await expect(materials).toContainText('60%')
    await expect(materials).toContainText('Recycled PET')

    // Certifications, with a working download link on the published-asset route.
    const certifications = page.locator('[data-passport-section="certifications"]')
    await expect(certifications).toContainText('ISO 14001')
    await expect(certifications).toContainText('Demo Authority')
    await expect(certifications).toContainText('1 January 2025')
    await expect(certifications).toContainText('1 January 2028')
    await expect(certifications.getByTestId('certification-download')).toHaveAttribute(
      'href',
      new RegExp(`/passport/${publicUuid}/assets/`),
    )

    // Sustainability.
    const sustainability = page.locator('[data-passport-section="sustainability"]')
    await expect(sustainability).toContainText('12.5 kg CO₂e')
    await expect(sustainability).toContainText('30 L')
    await expect(sustainability).toContainText('40%')
    await expect(sustainability).toContainText('7.5 / 10')

    // Documents, with human-readable kind labels.
    const documents = page.locator('[data-passport-section="documents"]')
    await expect(documents.getByTestId('document-download')).toHaveCount(3)
    await expect(documents).toContainText('Manual')
    await expect(documents).toContainText('Warranty')
    await expect(documents).toContainText('Technical datasheet')

    // Images: the cover appears in the grid alongside the gallery image, so the section
    // holds both regardless of which one the header already shows.
    const images = page.locator('[data-passport-section="images"]')
    await expect(images.getByTestId('passport-gallery-image')).toHaveCount(2)
    await expect(images.getByRole('img', { name: 'Front cover' })).toBeVisible()
    await expect(images.getByRole('img', { name: 'Gallery shot' })).toBeVisible()

    // Passport information.
    const info = page.locator('[data-passport-section="passport-information"]')
    await expect(info.getByTestId('passport-uuid')).toHaveText(publicUuid)
    await expect(info).toContainText('v1')
    await expect(info.getByTestId('passport-qr-download')).toBeVisible()

    await context.close()
  })

  test('server-renders the published content without running client JavaScript', async ({
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Server Rendered Product')
    const { publicUuid } = await publish(request, token, created.id, created.draftRevision)

    // Playwright's APIRequestContext never executes JavaScript.
    const html = await publicHtml(request, publicUuid)

    expect(html).toContain('E2E Server Rendered Product')
    expect(html).toContain(publicUuid)
    expect(html).toContain('Verified Product')
    expect(html).toContain('Materials')
    expect(html).toContain('Sustainability')
    expect(html).toContain('ISO 14001')
    expect(html).toContain('Aluminium')
  })

  test('answers one indistinguishable not-found state for an unknown uuid', async ({ page }) => {
    const response = await page.goto('/passport/00000000-0000-4000-8000-000000000000')

    expect(response?.status()).toBe(404)
    await expect(page.getByTestId('passport-not-found')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Passport not found' })).toBeVisible()

    // It must not reveal which of malformed / unknown / withdrawn / unpublished applies.
    const text = await page.getByTestId('passport-not-found').innerText()
    for (const leak of ['withdrawn', 'deleted', 'unpublished', 'malformed', 'draft']) {
      expect(text.toLowerCase()).not.toContain(leak)
    }
  })
})

test.describe('draft preview and publishing', () => {
  test('simulates eventual public presentation before publication without creating a passport', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Unpublished Preview')
    await signIn(page)
    await page.goto(`/products/${created.id}`)
    await page.getByTestId('editor-tab-preview').click()

    const preview = page.getByTestId('preview-panel')
    await expect(page.getByTestId('preview-banner')).toContainText('unpublished editor state')
    await expect(preview.getByTestId('passport-product-name')).toHaveText('E2E Unpublished Preview')
    await expect(preview.getByTestId('passport-status')).toHaveText('Published')
    await expect(preview.getByTestId('verification-badge')).toHaveText('Verified Product')
    await expect(
      preview.getByText('Prototype/application-level indicator only.', { exact: false }),
    ).toBeVisible()
    await expect(preview.getByText('Assigned on first publication')).toBeVisible()
    await expect(preview.getByText('Set on first publication')).toHaveCount(2)
    await expect(preview.getByText('Not published yet')).toBeVisible()
    await expect(preview.getByTestId('passport-uuid')).toHaveCount(0)
    await expect(preview.getByTestId('passport-public-link')).toHaveCount(0)
    await expect(preview.getByTestId('passport-qr-download')).toHaveCount(0)

    const productResponse = await request.get(`${API}/products/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(productResponse.status()).toBe(200)
    const product = await productResponse.json()
    expect(product.status).toBe('DRAFT')
    expect(product.draftRevision).toBe(created.draftRevision)

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required for the no-publication proof')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const { rows } = await client.query<{ passports: number; versions: number }>(
        `SELECT count(p.id)::int AS passports, count(v.id)::int AS versions
         FROM "Product" product
         LEFT JOIN "Passport" p ON p."productId" = product.id
         LEFT JOIN "PassportVersion" v ON v."passportId" = p.id
         WHERE product.id = $1`,
        [created.id],
      )
      expect(rows).toEqual([{ passports: 0, versions: 0 }])
    } finally {
      await client.end()
    }
  })

  test('keeps the public passport on v1 while Preview shows the unsaved draft, until republish', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Isolation v1')
    const { publicUuid, versionNumber } = await publish(
      request,
      token,
      created.id,
      created.draftRevision,
    )
    expect(versionNumber).toBe(1)

    await signIn(page)
    await page.goto(`/products/${created.id}`)
    await expect(page.locator('#product-name')).toHaveValue('E2E Isolation v1')

    // v1 is public before anything is touched.
    expect(await publicHtml(request, publicUuid)).toContain('E2E Isolation v1')

    // An unsaved edit.
    await page.fill('#product-name', 'E2E Isolation v2')
    await page.getByTestId('editor-tab-preview').click()

    // Preview shows the unsaved draft through the shared presentation component.
    await expect(page.getByTestId('preview-banner')).toContainText('unpublished editor state')
    await expect(page.getByTestId('preview-panel').getByTestId('passport-product-name')).toHaveText(
      'E2E Isolation v2',
    )
    // Editor chrome identifies the candidate as unpublished; the shared Passport simulates
    // the eventual public presentation while the current public page still shows v1.
    await expect(page.getByTestId('preview-panel').getByTestId('passport-status')).toHaveText(
      'Published',
    )
    await expect(page.getByTestId('preview-panel').getByTestId('verification-badge')).toHaveText(
      'Verified Product',
    )
    await expect(
      page
        .getByTestId('preview-panel')
        .getByText('Prototype/application-level indicator only.', { exact: false }),
    ).toBeVisible()

    // The public page is untouched by an unsaved edit.
    const afterUnsavedEdit = await publicHtml(request, publicUuid)
    expect(afterUnsavedEdit).toContain('E2E Isolation v1')
    expect(afterUnsavedEdit).not.toContain('E2E Isolation v2')

    // Save without republishing.
    await saveDraft(page, request, token, created.id)

    const afterSave = await publicHtml(request, publicUuid)
    expect(afterSave).toContain('E2E Isolation v1')
    expect(afterSave).not.toContain('E2E Isolation v2')

    // Republish.
    const publishButton = page.getByTestId('publish-button')
    await expect(publishButton).toHaveText('Republish')
    await expect(publishButton).toBeEnabled()
    await publishButton.click()
    await expect(page.getByTestId('publish-notice')).toContainText('Published as v2')

    // The public projection moves to v2 on the same public UUID.
    const afterRepublish = await publicHtml(request, publicUuid)
    expect(afterRepublish).toContain('E2E Isolation v2')
    expect(afterRepublish).toContain(publicUuid)

    const view = await request.get(`${API}/passport/${publicUuid}`)
    expect(view.status()).toBe(200)
    const body = await view.json()
    expect(body.passport.publicUuid).toBe(publicUuid)
    expect(body.passport.version).toBe(2)
    expect(body.product.name).toBe('E2E Isolation v2')
  })

  test('exposes the seven required tabs, preserves entered data and supports keyboard navigation', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Tabs Product')
    await signIn(page)
    await page.goto(`/products/${created.id}`)

    const tablist = page.getByRole('tablist', { name: 'Product editor sections' })
    await expect(tablist.getByRole('tab')).toHaveCount(7)

    const expected: Array<[string, string]> = [
      ['general', 'General Information'],
      ['materials', 'Materials'],
      ['sustainability', 'Sustainability'],
      ['certifications', 'Certifications'],
      ['documents', 'Documents'],
      ['images', 'Images'],
      ['preview', 'Preview'],
    ]
    for (const [id, label] of expected) {
      await expect(tablist.getByRole('tab', { name: label, exact: true })).toHaveAttribute(
        'id',
        `tab-${id}`,
      )
    }

    // Exactly one tab is selected, and it controls a matching panel.
    await expect(page.getByTestId('editor-tab-general')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('editor-tab-materials')).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator('#panel-general')).toBeVisible()
    await expect(page.locator('#panel-materials')).toBeHidden()

    // Entered data survives a tab round trip.
    await page.fill('#product-name', 'E2E Tabs Edited')
    await page.getByTestId('editor-tab-materials').click()
    await expect(page.locator('#panel-materials')).toBeVisible()
    await expect(page.locator('#panel-general')).toBeHidden()
    await page.getByTestId('editor-tab-general').click()
    await expect(page.locator('#product-name')).toHaveValue('E2E Tabs Edited')

    // Switching tabs is not a save.
    expect(await revisionOf(request, token, created.id)).toBe(created.draftRevision)

    // Keyboard operation with automatic activation: arrows, Home and End.
    await page.getByTestId('editor-tab-general').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('editor-tab-materials')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('editor-tab-materials')).toBeFocused()

    await page.keyboard.press('End')
    await expect(page.getByTestId('editor-tab-preview')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('editor-tab-preview')).toBeFocused()

    await page.keyboard.press('Home')
    await expect(page.getByTestId('editor-tab-general')).toHaveAttribute('aria-selected', 'true')

    // Wraps backwards from the first tab to the last.
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('editor-tab-preview')).toHaveAttribute('aria-selected', 'true')

    // The other direction wraps forwards too.
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('editor-tab-general')).toHaveAttribute('aria-selected', 'true')
  })

  test('blocks publishing an unsaved draft and publishes a clean one with a public link', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Publish Safety')
    await signIn(page)
    await page.goto(`/products/${created.id}`)

    const publishButton = page.getByTestId('publish-button')
    await expect(publishButton).toHaveText('Publish')
    // A freshly loaded, fully populated draft has nothing unsaved.
    await expect(page.getByTestId('dirty-state')).toContainText('No unsaved changes')
    await expect(publishButton).toBeEnabled()

    // An unsaved change must block publishing rather than be published implicitly.
    await page.fill('#product-name', 'E2E Publish Safety edited')
    await expect(page.getByTestId('dirty-state')).toContainText('Unsaved changes')
    await expect(publishButton).toBeDisabled()

    await saveDraft(page, request, token, created.id)
    await expect(page.getByTestId('dirty-state')).toContainText('No unsaved changes')
    await expect(publishButton).toBeEnabled()

    await publishButton.click()
    await expect(page.getByTestId('publish-notice')).toContainText('Published as v1')

    const publicLink = page.getByTestId('publish-public-link')
    await expect(publicLink).toBeVisible()
    await expect(publicLink).toHaveAttribute('href', /\/passport\/[0-9a-f-]{36}$/)

    // The editor now presents the product as published: Preview carries the real public
    // identity that the publish response returned.
    await expect(publishButton).toHaveText('Republish')
    await page.getByTestId('editor-tab-preview').click()
    const previewInfo = page
      .getByTestId('preview-panel')
      .locator('[data-passport-section="passport-information"]')
    await expect(previewInfo.getByTestId('passport-uuid')).toHaveText(/[0-9a-f-]{36}/)
    await expect(previewInfo).toContainText('v1')
  })

  test('shows the publication gap, switches to the owning tab and keeps the draft', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    await signIn(page)

    await page.goto('/products')
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/)
    const id = (page.url().split('/').pop() ?? '') as string

    await page.fill('#product-name', 'E2E Incomplete Product')
    await saveDraft(page, request, token, id)

    await page.getByTestId('publish-button').click()

    const publishError = page.getByTestId('publish-error')
    await expect(publishError).toBeVisible()
    await expect(publishError).toContainText('not ready to publish')

    // The gap is mapped back onto the tab that owns it, and the draft is intact.
    await expect(page.getByTestId('editor-tab-general')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#product-name')).toHaveValue('E2E Incomplete Product')

    // Nothing was published.
    const detail = await request.get(`${API}/products/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect((await detail.json()).status).toBe('DRAFT')
  })

  test('refuses to publish a stale revision and publishes nothing', async ({ page, request }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Stale Publish')
    await signIn(page)
    await page.goto(`/products/${created.id}`)
    await expect(page.locator('#product-name')).toHaveValue('E2E Stale Publish')

    // Another writer moves the draft on while this editor still holds the older revision.
    const bumped = await request.patch(`${API}/products/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        description: 'Changed elsewhere while the editor was open.',
        expectedDraftRevision: created.draftRevision,
      },
    })
    expect(bumped.status()).toBe(200)

    await page.getByTestId('publish-button').click()

    // The same stale-revision contract as a save: the operator decides, nothing is published.
    await expect(page.getByRole('heading', { name: 'Stale draft revision' })).toBeVisible()
    await expect(page.getByTestId('publish-notice')).toHaveCount(0)
    await expect(page.locator('#product-name')).toHaveValue('E2E Stale Publish')

    const detail = await request.get(`${API}/products/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect((await detail.json()).status).toBe('DRAFT')
  })

  test('previews a draft through private asset retrieval without exposing it publicly', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Preview Privacy')
    const { publicUuid } = await publish(request, token, created.id, created.draftRevision)

    // Attach a new draft-only gallery image after v1 without republishing it.
    const unpublishedAsset = await upload(request, token, 'private.png', 'image/png', PNG_1X1)
    const detail = await request.get(`${API}/products/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(detail.status()).toBe(200)
    const product = await detail.json()
    const saved = await request.patch(`${API}/products/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        expectedDraftRevision: created.draftRevision,
        images: [
          ...product.images.map(
            (image: { assetId: string; role: string; altText: string | null }) => ({
              assetId: image.assetId,
              role: image.role,
              altText: image.altText,
            }),
          ),
          { assetId: unpublishedAsset, role: 'GALLERY', altText: 'Unpublished gallery' },
        ],
      },
    })
    expect(saved.status()).toBe(200)
    const draftRevision = (await saved.json()).draftRevision as number

    await signIn(page)
    await page.goto(`/products/${created.id}`)
    await page.getByTestId('editor-tab-preview').click()
    await expect(page.getByTestId('preview-banner')).toContainText('Draft preview')

    // Preview images come from authenticated blob object URLs, never from a public route.
    const previewCover = page.getByTestId('preview-panel').getByTestId('passport-cover-image')
    await expect(previewCover).toBeVisible()
    await expect.poll(async () => previewCover.getAttribute('src')).toMatch(/^blob:/)

    const draftGallery = page.getByTestId('preview-panel').getByAltText('Unpublished gallery')
    await expect(draftGallery).toBeVisible()
    await expect.poll(async () => draftGallery.getAttribute('src')).toMatch(/^blob:/)

    // The private asset route still requires authentication.
    const anonymous = await request.get(`${API}/assets/${unpublishedAsset}`)
    expect(anonymous.status()).toBe(401)

    // A draft-only asset is not reachable through the public published-asset route.
    const publicAttempt = await request.get(
      `${API}/passport/${publicUuid}/assets/${unpublishedAsset}`,
    )
    expect(publicAttempt.status()).toBe(404)

    // Preview reads the draft; it never writes to it.
    expect(await revisionOf(request, token, created.id)).toBe(draftRevision)
  })

  test('renders the public passport on a phone viewport without horizontal overflow', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(
      request,
      token,
      'E2E Responsive Passport With A Deliberately Very Long Product Name That Must Wrap Safely',
    )
    const { publicUuid } = await publish(request, token, created.id, created.draftRevision)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/passport/${publicUuid}`)

    await expect(page.getByTestId('passport-product-name')).toBeVisible()
    await expect(page.getByTestId('passport-uuid')).toBeVisible()
    await expect(page.locator('[data-passport-section="materials"]')).toBeVisible()
    await expect(page.getByTestId('verification-badge')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe('editor safety', () => {
  test('does not attempt a session restore for an anonymous public passport view', async ({
    browser,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Anonymous No Restore')
    const { publicUuid } = await publish(request, token, created.id, created.draftRevision)

    const context = await browser.newContext()
    const page = await context.newPage()
    const refreshCalls: string[] = []
    page.on('request', (outgoing) => {
      if (outgoing.url().includes('/auth/refresh')) {
        refreshCalls.push(outgoing.url())
      }
    })

    await page.goto(`/passport/${publicUuid}`)
    await expect(page.getByTestId('passport-product-name')).toBeVisible()
    // Give any deferred restore a chance to fire before concluding there was none: a
    // refresh here would rotate the browser-wide cookie on a page that never reads it.
    await page.waitForTimeout(750)

    expect(refreshCalls).toEqual([])
    await context.close()
  })

  test('reveals the tab that owns an invalid field instead of failing silently', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Validation Tab')
    await signIn(page)
    await page.goto(`/products/${created.id}`)

    // Make the General panel invalid, then move away from it so the field is hidden when
    // the save is attempted.
    await page.fill('#origin-country', 'U')
    await page.getByTestId('editor-tab-materials').click()
    await expect(page.locator('#panel-general')).toBeHidden()

    await page.getByRole('button', { name: /save draft/i }).click()

    await expect(page.getByText('origin country must be a two-letter country code.')).toBeVisible()
    await expect(page.getByTestId('editor-tab-general')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#origin-country')).toBeFocused()

    // A blocked save must not have reached the API.
    expect(await revisionOf(request, token, created.id)).toBe(created.draftRevision)
  })

  test('shows an upload failure from the tab that started it', async ({ page, request }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Upload Error Tab')
    await signIn(page)
    await page.goto(`/products/${created.id}`)

    // Documents is not the tab that owns the upload-error markup, so this proves the alert
    // is no longer trapped inside the Images panel.
    await page.getByTestId('editor-tab-documents').click()
    await page.setInputFiles('#document-upload-MANUAL', {
      name: 'diagram.svg',
      mimeType: 'image/svg+xml',
      buffer: SVG,
    })

    const uploadError = page.getByTestId('upload-error')
    await expect(uploadError).toBeVisible({ timeout: 15_000 })
    await expect(uploadError).toContainText(/unsupported file type/i)
  })

  test('blocks publishing while an upload is still in flight', async ({ page, request }) => {
    const token = await apiToken(request)
    const created = await createCompleteProduct(request, token, 'E2E Upload Publish Guard')
    await signIn(page)
    await page.goto(`/products/${created.id}`)
    await expect(page.getByTestId('publish-button')).toBeEnabled()

    // Hold the upload open so the guard can be observed while it is genuinely in flight.
    await page.route('**/assets', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      await route.continue()
    })

    await page.getByTestId('editor-tab-images').click()
    await page.setInputFiles('#gallery-image', {
      name: 'gallery.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })

    await expect(page.getByTestId('dirty-state')).toContainText('Upload in progress')
    await expect(page.getByTestId('publish-button')).toBeDisabled()

    // Once the upload lands it is the unsaved change, not the upload, that blocks publishing.
    await expect(page.getByTestId('dirty-state')).toContainText('Unsaved changes', {
      timeout: 20_000,
    })
  })
})
