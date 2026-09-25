import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 4.4 browser proof: the back-office Product Passports page, the Product table's
 * publication columns and actions, the Admin-only version history and the exact-version
 * historical assets.
 *
 * The decisive proof is the separation chain: publish A, edit to B and republish, edit to
 * C without publishing. Product Passports and both history entries show B; history v1
 * still shows A with its own retained cover; the editor draft shows C; and the asset that
 * only v1 retained stops being anonymously readable.
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

type Published = { publicUuid: string; versionNumber: number; passportId: string }

type Fixture = {
  productId: string
  publicUuid: string
  passportId: string
  nameA: string
  nameB: string
  nameC: string
  coverA: string
  coverB: string
}

let fixture: Fixture
let editorToken: string
let adminToken: string
let draftOnlyName: string

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

async function categoryIdOf(request: APIRequestContext, token: string): Promise<string> {
  const response = await request.get(`${API}/categories`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return (await response.json())[0].id as string
}

async function createProduct(
  request: APIRequestContext,
  token: string,
  name: string,
  coverAssetId: string,
): Promise<{ id: string; draftRevision: number }> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const manual = await upload(request, token, 'manual.pdf', 'application/pdf', MINIMAL_PDF)
  const created = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name,
      sku: `SKU-${unique}`,
      serialNumber: `SN-${unique}`,
      categoryId: await categoryIdOf(request, token),
      description: 'A fully populated product used by the Stage 4.4 browser proof.',
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
      images: [{ assetId: coverAssetId, role: 'COVER', altText: 'Cover' }],
      documents: [{ assetId: manual, kind: 'MANUAL', title: 'Manual' }],
    },
  })
  expect(created.status()).toBe(201)
  const body = await created.json()
  return { id: body.id as string, draftRevision: body.draftRevision as number }
}

async function publish(
  request: APIRequestContext,
  token: string,
  productId: string,
  expectedDraftRevision: number,
): Promise<Published> {
  const response = await request.post(`${API}/products/${productId}/publish`, {
    headers: { authorization: `Bearer ${token}` },
    data: { expectedDraftRevision },
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  return {
    publicUuid: body.publicUuid as string,
    versionNumber: body.versionNumber as number,
    passportId: body.passportId as string,
  }
}

async function patchProduct(
  request: APIRequestContext,
  token: string,
  productId: string,
  expectedDraftRevision: number,
  data: Record<string, unknown>,
): Promise<number> {
  const response = await request.patch(`${API}/products/${productId}`, {
    headers: { authorization: `Bearer ${token}` },
    data: { expectedDraftRevision, ...data },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).draftRevision as number
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  editorToken = await tokenFor(request, E2E_EMAIL)
  adminToken = await tokenFor(request, E2E_ADMIN_EMAIL)

  const coverA = await upload(request, editorToken, 'cover-a.png', 'image/png', PNG_1X1)
  const coverB = await upload(request, editorToken, 'cover-b.png', 'image/png', PNG_1X1)

  const nameA = `E2E History A ${Date.now()}`
  const nameB = `E2E History B ${Date.now()}`
  const nameC = `E2E History C ${Date.now()}`

  const created = await createProduct(request, editorToken, nameA, coverA)
  const versionOne = await publish(request, editorToken, created.id, created.draftRevision)

  const revisionB = await patchProduct(request, editorToken, created.id, created.draftRevision, {
    name: nameB,
    images: [{ assetId: coverB, role: 'COVER', altText: 'Cover B' }],
  })
  const versionTwo = await publish(request, editorToken, created.id, revisionB)

  // Unpublished draft C.
  await patchProduct(request, editorToken, created.id, revisionB, { name: nameC })

  expect(versionTwo.publicUuid).toBe(versionOne.publicUuid)

  fixture = {
    productId: created.id,
    publicUuid: versionOne.publicUuid,
    passportId: versionOne.passportId,
    nameA,
    nameB,
    nameC,
    coverA,
    coverB,
  }

  // A second, incomplete product, so the table has a genuinely unpublished row.
  draftOnlyName = `E2E Draft Only ${Date.now()}`
  const draftOnlyCover = await upload(request, editorToken, 'draft.png', 'image/png', PNG_1X1)
  const draftOnly = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${editorToken}` },
    data: {
      name: draftOnlyName,
      sku: `SKU-DRAFT-${Date.now()}`,
      serialNumber: `SN-DRAFT-${Date.now()}`,
      categoryId: await categoryIdOf(request, editorToken),
      images: [{ assetId: draftOnlyCover, role: 'COVER', altText: 'Draft cover' }],
    },
  })
  expect(draftOnly.status()).toBe(201)
})

async function passportRow(page: Page): Promise<ReturnType<Page['getByTestId']>> {
  await page.goto('/passports')
  const row = page.getByTestId('passport-row').filter({ hasText: fixture.nameB })
  await expect(row).toHaveCount(1)
  return row
}

test.describe('Product Passports page', () => {
  test('is reachable from the workspace by an editor and describes the published state', async ({
    page,
  }) => {
    await signIn(page, E2E_EMAIL)
    await page.getByRole('link', { name: 'Product Passports' }).click()
    await expect(page).toHaveURL(/\/passports$/)

    const row = await passportRow(page)
    // The published identity is B, never the unpublished draft C.
    await expect(row.getByTestId('passport-row-name')).toHaveText(fixture.nameB)
    await expect(row).toContainText(`v2`)
    await expect(row.getByText('Published', { exact: true })).toBeVisible()
    await expect(row.getByTestId('unpublished-changes')).toBeVisible()
    await expect(row).not.toContainText(fixture.nameC)

    // Current-publication management is available to an Editor...
    await expect(row.getByTestId('open-passport')).toBeVisible()
    await expect(row.getByTestId('download-qr')).toBeVisible()
    // ...but historical inspection is not offered.
    await expect(page.getByTestId('version-history')).toHaveCount(0)
  })

  test('opens the current public passport and downloads the stored QR artifact', async ({
    page,
    request,
  }) => {
    await signIn(page, E2E_EMAIL)
    const row = await passportRow(page)
    const openPassport = row.getByTestId('open-passport')
    await expect(openPassport).toHaveAttribute('href', `${WEB}/passport/${fixture.publicUuid}`)

    const qrHref = await row.getByTestId('download-qr').getAttribute('href')
    expect(qrHref).toBe(`${API}/passport/${fixture.publicUuid}/qr.png`)
    const qr = await request.get(qrHref as string)
    expect(qr.status()).toBe(200)
    expect(qr.headers()['content-type']).toContain('image/png')
    expect(qr.headers()['content-disposition']).toContain('attachment')

    const publicPage = await page.context().newPage()
    await publicPage.goto(`/passport/${fixture.publicUuid}`)
    await expect(publicPage.getByTestId('passport-product-name')).toHaveText(fixture.nameB)
    await publicPage.close()
  })
})

test.describe('Admin version history', () => {
  test('lists every retained version, marks the current one and inspects each snapshot', async ({
    page,
  }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    const row = await passportRow(page)
    await row.getByTestId('version-history').click()
    await expect(page).toHaveURL(new RegExp(`/passports/${fixture.passportId}$`))

    await expect(page.getByTestId('history-public-uuid')).toHaveText(fixture.publicUuid)
    await expect(page.getByTestId('history-current-version')).toHaveText('v2')

    const versionOneRow = page.getByRole('row', { name: /v1/ })
    const versionTwoRow = page.getByRole('row', { name: /v2/ })
    await expect(versionOneRow).toContainText('Retained')
    await expect(versionTwoRow).toContainText('Current')

    // Selecting v1 shows the immutable v1 snapshot, not the current publication.
    await page.getByTestId('select-version-1').click()
    await expect(page.getByTestId('history-chrome')).toContainText('Historical version v1')
    await expect(page.getByTestId('history-chrome')).toContainText(
      'The public URL currently shows v2',
    )
    await expect(page.getByTestId('passport-product-name')).toHaveText(fixture.nameA)
    await expect(page.getByTestId('passport-presentation')).not.toContainText(fixture.nameC)

    // Selecting v2 shows the current snapshot.
    await page.getByTestId('select-version-2').click()
    await expect(page.getByTestId('history-chrome')).toContainText('Historical version v2')
    await expect(page.getByTestId('history-chrome')).toContainText(
      'This is what the public URL serves today',
    )
    await expect(page.getByTestId('passport-product-name')).toHaveText(fixture.nameB)
    await expect(page.getByTestId('passport-presentation')).not.toContainText(fixture.nameC)

    // The historical presentation never exposes the current public URL as if it belonged
    // to the selected version; those actions live in the labelled chrome instead.
    await expect(page.getByTestId('passport-public-link')).toHaveCount(0)
    await expect(page.getByTestId('passport-qr-download')).toHaveCount(0)

    // The anonymous public page is unaffected by any of this inspection.
    const publicPage = await page.context().newPage()
    await publicPage.goto(`/passport/${fixture.publicUuid}`)
    await expect(publicPage.getByTestId('passport-product-name')).toHaveText(fixture.nameB)
    await publicPage.close()
  })

  test('renders a historical cover through an authenticated blob URL only', async ({
    page,
    request,
  }) => {
    await signIn(page, E2E_ADMIN_EMAIL)
    await page.goto(`/passports/${fixture.passportId}`)
    await page.getByTestId('select-version-1').click()

    const cover = page.getByTestId('passport-cover-image')
    await expect(cover).toBeVisible()
    await expect(cover).toHaveAttribute('src', /^blob:/)

    // The cover v1 retained is private again on the anonymous route; the current cover is
    // the only anonymously readable one.
    const retired = await request.get(`/passport/${fixture.publicUuid}/assets/${fixture.coverA}`)
    expect(retired.status()).toBe(404)
    const active = await request.get(`${API}/passport/${fixture.publicUuid}`)
    expect(active.status()).toBe(200)
    expect((await active.json()).images[0].assetId).toBe(fixture.coverB)
  })

  test('refuses an editor, in the UI and at the API', async ({ page, request }) => {
    await signIn(page, E2E_EMAIL)
    await passportRow(page)
    await expect(page.getByTestId('version-history')).toHaveCount(0)

    // The e2e access token is deliberately short-lived, so this test mints its own rather
    // than reusing the one created during fixture setup.
    const freshEditorToken = await tokenFor(request, E2E_EMAIL)
    const direct = await request.get(`${API}/passports/${fixture.passportId}/versions`, {
      headers: { authorization: `Bearer ${freshEditorToken}` },
    })
    expect(direct.status()).toBe(403)
    expect((await direct.json()).code).toBe('INSUFFICIENT_ROLE')

    // Direct navigation is refused too, and says so instead of faking a missing passport.
    await page.goto(`/passports/${fixture.passportId}`)
    await expect(page.getByText('Version history is not available')).toBeVisible()
    await expect(page.getByTestId('passport-presentation')).toHaveCount(0)
  })
})

test.describe('Product table publication columns', () => {
  test('shows the cover, the publication actions and honest placeholders', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    const publishedRow = page.getByRole('row').filter({ hasText: fixture.nameC })
    await expect(publishedRow).toHaveCount(1)

    // Cover image column: a private draft cover rendered from an authenticated blob URL.
    const cover = publishedRow.getByTestId('product-cover')
    await expect(cover).toHaveAttribute('src', /^blob:/)

    // Publication actions exist only for a published row.
    await expect(publishedRow.getByTestId('product-open-passport')).toHaveAttribute(
      'href',
      `${WEB}/passport/${fixture.publicUuid}`,
    )
    await expect(publishedRow.getByTestId('product-download-qr')).toHaveAttribute(
      'href',
      `${API}/passport/${fixture.publicUuid}/qr.png`,
    )
    await expect(publishedRow.getByTestId('product-qr-download')).toBeVisible()
    await expect(publishedRow.getByTestId('product-unpublished-changes')).toBeVisible()

    // Total views is unavailable until analytics exists; it must not display an invented 0.
    const totalViews = publishedRow.getByTestId('product-total-views')
    await expect(totalViews).not.toContainText('0')
    await expect(totalViews).toContainText('—')
    await expect(totalViews).toContainText('Available after analytics')

    // An unpublished row offers no broken public action.
    const draftRow = page.getByRole('row').filter({ hasText: draftOnlyName })
    await expect(draftRow).toHaveCount(1)
    await expect(draftRow.getByTestId('product-open-passport')).toHaveCount(0)
    await expect(draftRow.getByTestId('product-download-qr')).toHaveCount(0)
    await expect(draftRow.getByTestId('product-qr-download')).toHaveCount(0)
    await expect(draftRow.getByTestId('product-not-published')).toContainText(
      'Publish to enable passport actions',
    )
    await expect(draftRow.getByTestId('product-total-views')).toContainText('—')
  })

  test('keeps search, filtering and pagination working after the column change', async ({
    page,
  }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    const publishedRow = page.getByRole('row').filter({ hasText: fixture.nameC })
    const sku = (await publishedRow.locator('td').nth(1).innerText()).trim()

    await page.fill('#product-query', sku)
    await page.getByRole('button', { name: 'Apply filters' }).click()

    await expect(page.getByRole('row').filter({ hasText: fixture.nameC })).toHaveCount(1)
    await expect(page.getByRole('row').filter({ hasText: draftOnlyName })).toHaveCount(0)

    // Pagination controls are intact; this page still renders a bounded result set.
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /rows per page/i })).toBeVisible()
  })

  test('keeps row keyboard navigation separate from the action controls', async ({ page }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    const publishedRow = page.getByRole('row').filter({ hasText: fixture.nameC })
    await publishedRow.locator('a[data-testid="product-open-passport"]').focus()
    await page.keyboard.press('Enter')

    // The link opens the public passport; the row's own navigation must not fire.
    await expect(page).toHaveURL(/\/products$/)
  })
})
