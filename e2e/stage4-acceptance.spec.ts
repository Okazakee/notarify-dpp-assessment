import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { solidPng } from '../apps/api/test/asset-fixtures.ts'
import { countColour, parsePdf } from '../apps/api/test/pdf-inspect.ts'
import { decodeQrPng } from '../apps/api/test/qr-decode.ts'
import { E2E_ADMIN_EMAIL, E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * Stage 4.6 — full Stage 4 acceptance and regression.
 *
 * One deterministic lifecycle proves that Stages 4.1–4.5 compose as one subsystem:
 *
 *   complete draft A → Preview A → publish v1 → public/QR/PDF/history = A,v1
 *   → unsaved draft B (Preview only) → save B (still A everywhere public)
 *   → republish v2 → public/PDF/back office = B,v2, same UUID and QR
 *   → further draft C stays private, v1/v2 stay immutable
 *
 * Evidence is layered on purpose: browser behaviour from Playwright, lifecycle facts
 * from PostgreSQL, and generated-document content from the independent pdfjs parser.
 * Cross-milestone invariants that only the API can prove (concurrency, company
 * isolation, role downgrade) stay in the API integration suites and are mapped in
 * `docs/STAGE4-ACCEPTANCE.md`.
 */

const API = 'http://localhost:3000'
const WEB = 'http://localhost:3001'

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

// Names are unique per run: the disposable e2e database accumulates fixtures across runs,
// so a fixed name would match rows from earlier journeys.
const RUN = Date.now()
const NAME_A = `Acceptance Product A ${RUN}`
const NAME_B = `Acceptance Product B ${RUN}`
const NAME_C = `Acceptance Product C ${RUN}`
const DESCRIPTION_A = 'Acceptance Description A'
const DESCRIPTION_B = 'Acceptance Description B'

type Rgb = [number, number, number]

const RED: Rgb = [255, 0, 0]
const BLUE: Rgb = [0, 0, 255]
const YELLOW: Rgb = [255, 255, 0]

type Journey = {
  productId: string
  initialRevision: number
  coverA: string
  galleryA: string
  coverB: string
  coverC: string
  manualA: string
  certA: string
  serialNumber: string
  passportId: string
  publicUuid: string
  versionOneId: string
  versionOneRevision: number
  qrBytes: Buffer
  snapshotA: unknown
  savedRevision: number
  versionTwoId: string
  versionTwoRevision: number
  snapshotB: unknown
  auditBaseline: number
}

let journey: Journey

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

async function createCompleteDraft(
  request: APIRequestContext,
  token: string,
  input: {
    name: string
    description: string
    serialNumber: string
    coverAssetId: string
    galleryAssetIds: string[]
    documentAssetId: string
    certificationAssetId: string
    materials?: Array<{ name: string; percentage: number; position: number }>
    certificationName?: string
    certificationAuthority?: string
    documentTitle?: string
  },
): Promise<{ id: string; draftRevision: number }> {
  const response = await request.post(`${API}/products`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: input.name,
      sku: `SKU-ACCEPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      serialNumber: input.serialNumber,
      categoryId: await categoryIdOf(request, token),
      description: input.description,
      productionDate: '2026-01-15',
      originCountry: 'IT',
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 340,
        recycledPercent: 45,
        repairabilityScore: 7.5,
        recyclable: true,
      },
      materials: input.materials ?? [
        { name: 'Aluminium', percentage: 60, originCountry: 'IT', position: 0 },
        { name: 'Steel', percentage: 40, originCountry: 'DE', position: 1 },
      ],
      certifications: [
        {
          name: input.certificationName ?? 'ISO 9001',
          issuingAuthority: input.certificationAuthority ?? 'TUV',
          issueDate: '2025-01-01',
          expirationDate: '2030-01-01',
          pdfAssetId: input.certificationAssetId,
        },
      ],
      images: [
        { assetId: input.coverAssetId, role: 'COVER', altText: 'Acceptance cover' },
        ...input.galleryAssetIds.map((assetId, index) => ({
          assetId,
          role: 'GALLERY' as const,
          altText: `Acceptance gallery ${index + 1}`,
        })),
      ],
      documents: [
        {
          assetId: input.documentAssetId,
          kind: 'MANUAL',
          title: input.documentTitle ?? 'Acceptance manual',
        },
      ],
    },
  })
  expect(response.status()).toBe(201)
  const body = await response.json()
  return { id: body.id as string, draftRevision: body.draftRevision as number }
}

async function publishViaApi(
  request: APIRequestContext,
  token: string,
  productId: string,
  expectedDraftRevision: number,
): Promise<{ passportId: string; publicUuid: string; versionId: string; versionNumber: number }> {
  const response = await request.post(`${API}/products/${productId}/publish`, {
    headers: { authorization: `Bearer ${token}` },
    data: { expectedDraftRevision },
  })
  expect(response.status()).toBe(200)
  return await response.json()
}

async function patchDraft(
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

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the Stage 4 acceptance journey')
  }
  const client = new Client({ connectionString })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function passportState(productId: string): Promise<{
  passports: number
  versions: number
  passportId: string | null
  publicUuid: string | null
  currentVersionId: string | null
  qrBytes: Buffer | null
}> {
  return withDb(async (client) => {
    const { rows } = await client.query<{
      passports: number
      versions: number
      passportId: string | null
      publicUuid: string | null
      currentVersionId: string | null
      qrBytes: Buffer | null
    }>(
      // A passport is unique per product, so scalar subqueries keep the counts available
      // even before the first publication (aggregates over uuid/bytea do not exist).
      `SELECT
         (SELECT count(*)::int FROM "Passport" p WHERE p."productId" = product.id) AS passports,
         (SELECT count(*)::int
            FROM "PassportVersion" v
            JOIN "Passport" p2 ON v."passportId" = p2.id
           WHERE p2."productId" = product.id) AS versions,
         (SELECT p.id::text FROM "Passport" p WHERE p."productId" = product.id LIMIT 1) AS "passportId",
         (SELECT p."publicUuid"::text FROM "Passport" p WHERE p."productId" = product.id LIMIT 1) AS "publicUuid",
         (SELECT p."currentVersionId"::text FROM "Passport" p WHERE p."productId" = product.id LIMIT 1) AS "currentVersionId",
         (SELECT p."qrPngBytes" FROM "Passport" p WHERE p."productId" = product.id LIMIT 1) AS "qrBytes"
       FROM "Product" product WHERE product.id = $1`,
      [productId],
    )
    return rows[0] as {
      passports: number
      versions: number
      passportId: string | null
      publicUuid: string | null
      currentVersionId: string | null
      qrBytes: Buffer | null
    }
  })
}

async function versionRows(passportId: string): Promise<
  Array<{
    id: string
    versionNumber: number
    sourceDraftRevision: number
    publicSnapshot: unknown
  }>
> {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT id::text AS id, "versionNumber", "sourceDraftRevision", "publicSnapshot"
       FROM "PassportVersion" WHERE "passportId" = $1 ORDER BY "versionNumber"`,
      [passportId],
    )
    return rows as Array<{
      id: string
      versionNumber: number
      sourceDraftRevision: number
      publicSnapshot: unknown
    }>
  })
}

async function productState(productId: string): Promise<{
  name: string | null
  draftRevision: number
  coverAssetId: string | null
}> {
  return withDb(async (client) => {
    const { rows } = await client.query<{
      name: string | null
      draftRevision: number
      coverAssetId: string | null
    }>(
      `SELECT product.name,
              product."draftRevision",
              (SELECT image."assetId"::text FROM "ProductImage" image
               WHERE image."productId" = product.id AND image.role = 'COVER' LIMIT 1) AS "coverAssetId"
       FROM "Product" product WHERE product.id = $1`,
      [productId],
    )
    return rows[0] as { name: string | null; draftRevision: number; coverAssetId: string | null }
  })
}

async function tableCounts(): Promise<{ analytics: number; daily: number; audit: number }> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ analytics: number; daily: number; audit: number }>(
      `SELECT (SELECT count(*)::int FROM "AnalyticsEvent") AS analytics,
              (SELECT count(*)::int FROM "AnalyticsDaily") AS daily,
              (SELECT count(*)::int FROM "AuditEvent") AS audit`,
    )
    return rows[0] as { analytics: number; daily: number; audit: number }
  })
}

async function pdfBytes(request: APIRequestContext, publicUuid: string): Promise<Buffer> {
  const response = await request.get(`${API}/passport/${publicUuid}/pdf`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  return await response.body()
}

async function openEditor(page: Page, productId: string): Promise<void> {
  await signIn(page, E2E_EMAIL)
  await page.goto(`/products/${productId}`)
  await expect(page.locator('#product-name')).toBeVisible()
}

async function showPreview(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect(page.getByTestId('preview-panel')).toBeVisible()
}

async function expectPublicName(page: Page, name: string): Promise<void> {
  await page.goto(`/passport/${journey.publicUuid}`)
  await expect(page.getByTestId('passport-product-name')).toHaveText(name)
  await expect(page.getByTestId('passport-status')).toHaveText('Published')
  await expect(page.getByTestId('verification-badge')).toHaveText('Verified Product')
}

// The journey is deliberately heavy (editor, database, PDF parsing and public surfaces in
// one ordered chain), so each acceptance case gets a longer budget than the default.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

test.beforeAll(async ({ request }) => {
  const token = await tokenFor(request, E2E_EMAIL)
  const serialNumber = `SN-ACCEPT-${Date.now()}`
  const coverA = await upload(
    request,
    token,
    'accept-cover-a.png',
    'image/png',
    await solidPng('#ff0000'),
  )
  const galleryA = await upload(
    request,
    token,
    'accept-gallery-a.png',
    'image/png',
    await solidPng('#00ff00', 48),
  )
  const coverC = await upload(
    request,
    token,
    'accept-cover-c.png',
    'image/png',
    await solidPng('#ffff00'),
  )
  const manualA = await upload(request, token, 'accept-manual.pdf', 'application/pdf', MINIMAL_PDF)
  const certA = await upload(request, token, 'accept-cert.pdf', 'application/pdf', MINIMAL_PDF)

  const created = await createCompleteDraft(request, token, {
    name: NAME_A,
    description: DESCRIPTION_A,
    serialNumber,
    coverAssetId: coverA,
    galleryAssetIds: [galleryA],
    documentAssetId: manualA,
    certificationAssetId: certA,
  })

  const counts = await tableCounts()
  journey = {
    productId: created.id,
    initialRevision: created.draftRevision,
    coverA,
    galleryA,
    // Assigned when the editor uploads the replacement cover in the save step.
    coverB: '',
    coverC,
    manualA,
    certA,
    serialNumber,
    passportId: '',
    publicUuid: '',
    versionOneId: '',
    versionOneRevision: 0,
    qrBytes: Buffer.alloc(0),
    snapshotA: null,
    savedRevision: 0,
    versionTwoId: '',
    versionTwoRevision: 0,
    snapshotB: null,
    auditBaseline: counts.audit,
  }
})

test.describe('Stage 4 acceptance lifecycle', () => {
  test('publishes v1 from the editor and proves the first-publication facts', async ({
    page,
    request,
  }) => {
    await openEditor(page, journey.productId)

    // Preview shows the current draft before publication, under editor-only chrome.
    await showPreview(page)
    await expect(page.getByTestId('preview-banner')).toContainText('unpublished')
    await expect(page.getByTestId('preview-panel').getByTestId('passport-product-name')).toHaveText(
      NAME_A,
    )
    await expect(page.getByTestId('preview-panel')).toContainText(DESCRIPTION_A)

    // Preview must not create publication state.
    const beforePublish = await passportState(journey.productId)
    expect(beforePublish.passports).toBe(0)
    expect(beforePublish.versions).toBe(0)

    // Publish through the real editor action.
    await page.getByTestId('publish-button').click()
    await expect(page.getByTestId('publish-notice')).toContainText('Published as v1')
    const publicHref = await page.getByTestId('publish-public-link').getAttribute('href')
    expect(publicHref).toBeTruthy()

    // Database facts: exactly one Passport and one version, current pointer at v1.
    const published = await passportState(journey.productId)
    expect(published.passports).toBe(1)
    expect(published.versions).toBe(1)
    expect(published.passportId).toBeTruthy()
    expect(published.publicUuid).toBeTruthy()
    expect(published.qrBytes).not.toBeNull()

    const versions = await versionRows(published.passportId as string)
    expect(versions).toHaveLength(1)
    expect(versions[0]?.versionNumber).toBe(1)
    expect(versions[0]?.sourceDraftRevision).toBe(journey.initialRevision)
    expect(published.currentVersionId).toBe(versions[0]?.id)
    expect(publicHref).toBe(`${WEB}/passport/${published.publicUuid}`)

    journey.passportId = published.passportId as string
    journey.publicUuid = published.publicUuid as string
    journey.versionOneId = versions[0]?.id as string
    journey.versionOneRevision = versions[0]?.sourceDraftRevision as number
    journey.qrBytes = published.qrBytes as Buffer
    journey.snapshotA = versions[0]?.publicSnapshot

    // The back-office list describes the published snapshot identity.
    const editorToken = await tokenFor(request, E2E_EMAIL)
    const list = await request.get(`${API}/passports`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(list.status()).toBe(200)
    const row = (await list.json()).items.find(
      (item: { passportId: string }) => item.passportId === journey.passportId,
    )
    expect(row.product.name).toBe(NAME_A)
    expect(row.currentVersionNumber).toBe(1)
    expect(row.hasUnpublishedChanges).toBe(false)

    // Anonymous public projection and its actions.
    await expectPublicName(page, NAME_A)
    await expect(page.getByTestId('passport-pdf-download')).toHaveAttribute(
      'href',
      `${API}/passport/${journey.publicUuid}/pdf`,
    )
    await expect(page.getByTestId('passport-qr-download')).toHaveAttribute(
      'href',
      `${API}/passport/${journey.publicUuid}/qr.png`,
    )

    // PDF content from the independent parser.
    const pdf = await parsePdf(await pdfBytes(request, journey.publicUuid))
    expect(pdf.text).toContain(NAME_A)
    expect(pdf.text).toContain('v1')
    expect(pdf.text).toContain(journey.publicUuid)
    expect(pdf.text).toContain(`${WEB}/passport/${journey.publicUuid}`)
    expect(countColour(pdf.images, RED)).toBeGreaterThan(0)

    // Public published files: image inline, PDFs as attachments.
    const image = await request.get(
      `${API}/passport/${journey.publicUuid}/assets/${journey.coverA}`,
    )
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toContain('image/png')
    expect(image.headers()['content-disposition']).toContain('inline')
    for (const assetId of [journey.manualA, journey.certA]) {
      const file = await request.get(`${API}/passport/${journey.publicUuid}/assets/${assetId}`)
      expect(file.status()).toBe(200)
      expect(file.headers()['content-type']).toContain('application/pdf')
      expect(file.headers()['content-disposition']).toContain('attachment')
    }

    // Republishing the same source revision replays instead of duplicating history.
    const replay = await publishViaApi(
      request,
      editorToken,
      journey.productId,
      journey.initialRevision,
    )
    expect(replay.versionNumber).toBe(1)
    expect(replay.versionId).toBe(journey.versionOneId)
    expect((await passportState(journey.productId)).versions).toBe(1)
  })

  test('keeps v1 public while an unsaved edit shows only in Preview', async ({ page, request }) => {
    await openEditor(page, journey.productId)
    await page.locator('#product-name').fill(NAME_B)
    await page.locator('#product-description').fill(DESCRIPTION_B)
    await expect(page.getByTestId('dirty-state')).toContainText('Unsaved changes')

    await showPreview(page)
    await expect(page.getByTestId('preview-panel').getByTestId('passport-product-name')).toHaveText(
      NAME_B,
    )
    await expect(page.getByTestId('preview-panel')).toContainText(DESCRIPTION_B)

    // The unsaved browser state was never persisted, and no publication happened.
    const draft = await productState(journey.productId)
    expect(draft.name).toBe(NAME_A)
    expect(draft.draftRevision).toBe(journey.initialRevision)
    expect((await passportState(journey.productId)).versions).toBe(1)

    // Every public surface still serves v1.
    await expectPublicName(page, NAME_A)
    const pdf = await parsePdf(await pdfBytes(request, journey.publicUuid))
    expect(pdf.text).toContain(NAME_A)
    expect(pdf.text).not.toContain(NAME_B)
    expect(pdf.text).toContain('v1')
    expect(countColour(pdf.images, RED)).toBeGreaterThan(0)
    expect(countColour(pdf.images, BLUE)).toBe(0)

    const versions = await versionRows(journey.passportId)
    expect(versions[0]?.publicSnapshot).toEqual(journey.snapshotA)
  })

  test('saves B without republishing and keeps every public surface on A', async ({
    page,
    request,
  }) => {
    await openEditor(page, journey.productId)
    await page.locator('#product-name').fill(NAME_B)
    await page.locator('#product-description').fill(DESCRIPTION_B)

    // Replace the cover through the editor's own upload control.
    await page.getByRole('tab', { name: 'Images', exact: true }).click()
    await page.setInputFiles('#cover-image', {
      name: 'accept-cover-b.png',
      mimeType: 'image/png',
      buffer: await solidPng('#0000ff'),
    })
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /save draft/i }).click()
    await expect
      .poll(async () => (await productState(journey.productId)).draftRevision, { timeout: 15_000 })
      .toBeGreaterThan(journey.initialRevision)

    const draft = await productState(journey.productId)
    expect(draft.name).toBe(NAME_B)
    // The editor uploaded a new immutable asset; replacing a file never overwrites one.
    expect(draft.coverAssetId).not.toBeNull()
    expect(draft.coverAssetId).not.toBe(journey.coverA)
    journey.coverB = draft.coverAssetId as string
    journey.savedRevision = draft.draftRevision

    // Saved is not published: the passport list still reports the v1 identity.
    const editorToken = await tokenFor(request, E2E_EMAIL)
    const list = await request.get(`${API}/passports`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    const row = (await list.json()).items.find(
      (item: { passportId: string }) => item.passportId === journey.passportId,
    )
    expect(row.product.name).toBe(NAME_A)
    expect(row.hasUnpublishedChanges).toBe(true)
    expect(row.currentVersionNumber).toBe(1)

    // Public page, PDF, history and stored identity are unchanged.
    await expectPublicName(page, NAME_A)
    const pdf = await parsePdf(await pdfBytes(request, journey.publicUuid))
    expect(pdf.text).toContain(NAME_A)
    expect(pdf.text).not.toContain(NAME_B)
    expect(countColour(pdf.images, RED)).toBeGreaterThan(0)
    expect(countColour(pdf.images, BLUE)).toBe(0)

    const state = await passportState(journey.productId)
    expect(state.passportId).toBe(journey.passportId)
    expect(state.publicUuid).toBe(journey.publicUuid)
    expect(Buffer.compare(state.qrBytes as Buffer, journey.qrBytes)).toBe(0)
    const versions = await versionRows(journey.passportId)
    expect(versions).toHaveLength(1)
    expect(versions[0]?.publicSnapshot).toEqual(journey.snapshotA)

    // The back-office page shows the published identity plus the unpublished indicator.
    // The editor session from `openEditor` is already active in this context, so this is
    // a direct navigation rather than a second sign-in.
    await page.goto('/passports')
    const uiRow = page.getByTestId('passport-row').filter({ hasText: journey.publicUuid })
    await expect(uiRow).toHaveCount(1)
    await expect(uiRow.getByTestId('passport-row-name')).toHaveText(NAME_A)
    await expect(uiRow.getByTestId('unpublished-changes')).toBeVisible()
  })

  test('republishes v2 and converges every surface on B', async ({ page, browser, request }) => {
    await openEditor(page, journey.productId)
    await page.getByTestId('publish-button').click()
    await expect(page.getByTestId('publish-notice')).toContainText('Published as v2')

    // Database facts: v2 exists, is current, and the stable identity is untouched.
    const state = await passportState(journey.productId)
    expect(state.passports).toBe(1)
    expect(state.versions).toBe(2)
    expect(state.passportId).toBe(journey.passportId)
    expect(state.publicUuid).toBe(journey.publicUuid)
    expect(Buffer.compare(state.qrBytes as Buffer, journey.qrBytes)).toBe(0)

    const versions = await versionRows(journey.passportId)
    const versionOne = versions.find((version) => version.versionNumber === 1)
    const versionTwo = versions.find((version) => version.versionNumber === 2)
    expect(versionOne?.publicSnapshot).toEqual(journey.snapshotA)
    expect(versionTwo?.sourceDraftRevision).toBe(journey.savedRevision)
    expect(state.currentVersionId).toBe(versionTwo?.id)
    journey.versionTwoId = versionTwo?.id as string
    journey.versionTwoRevision = versionTwo?.sourceDraftRevision as number
    journey.snapshotB = versionTwo?.publicSnapshot

    // Public page, PDF and back-office list now describe B/v2.
    await expectPublicName(page, NAME_B)
    const pdf = await parsePdf(await pdfBytes(request, journey.publicUuid))
    expect(pdf.text).toContain(NAME_B)
    expect(pdf.text).not.toContain(NAME_A)
    expect(pdf.text).toContain('v2')
    expect(countColour(pdf.images, BLUE)).toBeGreaterThan(0)
    expect(countColour(pdf.images, RED)).toBe(0)

    const editorToken = await tokenFor(request, E2E_EMAIL)
    const list = await request.get(`${API}/passports`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    const row = (await list.json()).items.find(
      (item: { passportId: string }) => item.passportId === journey.passportId,
    )
    expect(row.product.name).toBe(NAME_B)
    expect(row.hasUnpublishedChanges).toBe(false)
    expect(row.currentVersionNumber).toBe(2)

    // Current-version asset authorization: B is public, A became private again.
    const currentCover = await request.get(
      `${API}/passport/${journey.publicUuid}/assets/${journey.coverB}`,
    )
    expect(currentCover.status()).toBe(200)
    const retiredCover = await request.get(
      `${API}/passport/${journey.publicUuid}/assets/${journey.coverA}`,
    )
    expect(retiredCover.status()).toBe(404)

    // Admin history keeps both versions, with v1's own retained cover still inspectable.
    // A separate context is used because this one is already signed in as the editor and
    // the login page redirects an authenticated session away.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await signIn(adminPage, E2E_ADMIN_EMAIL)
    await adminPage.goto(`/passports/${journey.passportId}`)
    await expect(adminPage.getByTestId('history-current-version')).toHaveText('v2')
    await adminPage.getByTestId('select-version-1').click()
    await expect(adminPage.getByTestId('history-chrome')).toContainText('Historical version v1')
    await expect(adminPage.getByTestId('passport-product-name')).toHaveText(NAME_A)
    await adminPage.getByTestId('select-version-2').click()
    await expect(adminPage.getByTestId('history-chrome')).toContainText('Historical version v2')
    await expect(adminPage.getByTestId('passport-product-name')).toHaveText(NAME_B)
    await adminContext.close()

    const adminToken = await tokenFor(request, E2E_ADMIN_EMAIL)
    const v1Cover = await request.get(
      `${API}/passports/${journey.passportId}/versions/1/assets/${journey.coverA}`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    )
    expect(v1Cover.status()).toBe(200)
    const v2Cover = await request.get(
      `${API}/passports/${journey.passportId}/versions/2/assets/${journey.coverB}`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    )
    expect(v2Cover.status()).toBe(200)
    const wrongVersionOne = await request.get(
      `${API}/passports/${journey.passportId}/versions/1/assets/${journey.coverB}`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    )
    expect(wrongVersionOne.status()).toBe(404)
    const wrongVersionTwo = await request.get(
      `${API}/passports/${journey.passportId}/versions/2/assets/${journey.coverA}`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    )
    expect(wrongVersionTwo.status()).toBe(404)

    // History stays an Admin capability, and the role is re-read from the database.
    const editorHistory = await request.get(`${API}/passports/${journey.passportId}/versions`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(editorHistory.status()).toBe(403)

    // Replaying the saved revision does not create a third version.
    const replay = await publishViaApi(
      request,
      editorToken,
      journey.productId,
      journey.savedRevision,
    )
    expect(replay.versionNumber).toBe(2)
    expect(replay.versionId).toBe(journey.versionTwoId)
    expect((await passportState(journey.productId)).versions).toBe(2)
  })

  test('keeps both historical versions immutable while a further draft edit stays private', async ({
    page,
    request,
  }) => {
    const editorToken = await tokenFor(request, E2E_EMAIL)
    const revisionC = await patchDraft(
      request,
      editorToken,
      journey.productId,
      journey.savedRevision,
      {
        name: NAME_C,
        description: 'Acceptance Description C',
        images: [{ assetId: journey.coverC, role: 'COVER', altText: 'Draft C cover' }],
      },
    )
    expect(revisionC).toBeGreaterThan(journey.savedRevision)

    const draft = await productState(journey.productId)
    expect(draft.name).toBe(NAME_C)
    expect(draft.coverAssetId).toBe(journey.coverC)

    // History is unchanged by the later draft edit.
    const versions = await versionRows(journey.passportId)
    expect(versions.find((version) => version.versionNumber === 1)?.publicSnapshot).toEqual(
      journey.snapshotA,
    )
    expect(versions.find((version) => version.versionNumber === 2)?.publicSnapshot).toEqual(
      journey.snapshotB,
    )

    // Public page and PDF stay on B/v2 and never mention C or its asset.
    await expectPublicName(page, NAME_B)
    const pdf = await parsePdf(await pdfBytes(request, journey.publicUuid))
    expect(pdf.text).toContain(NAME_B)
    expect(pdf.text).not.toContain(NAME_C)
    expect(pdf.text).toContain('v2')
    expect(countColour(pdf.images, YELLOW)).toBe(0)

    // The draft-only asset is private: readable with a session, never anonymously.
    const privateAsset = await request.get(`${API}/assets/${journey.coverC}`, {
      headers: { authorization: `Bearer ${editorToken}` },
    })
    expect(privateAsset.status()).toBe(200)
    const anonymousDraftAsset = await request.get(
      `${API}/passport/${journey.publicUuid}/assets/${journey.coverC}`,
    )
    expect(anonymousDraftAsset.status()).toBe(404)
    const adminToken = await tokenFor(request, E2E_ADMIN_EMAIL)
    for (const versionNumber of [1, 2]) {
      const historicalDraftAsset = await request.get(
        `${API}/passports/${journey.passportId}/versions/${versionNumber}/assets/${journey.coverC}`,
        { headers: { authorization: `Bearer ${adminToken}` } },
      )
      expect(historicalDraftAsset.status()).toBe(404)
    }

    // The back office reports the published identity B with unpublished changes.
    await signIn(page, E2E_EMAIL)
    await page.goto('/passports')
    const uiRow = page.getByTestId('passport-row').filter({ hasText: journey.publicUuid })
    await expect(uiRow).toHaveCount(1)
    await expect(uiRow.getByTestId('passport-row-name')).toHaveText(NAME_B)
    await expect(uiRow.getByTestId('unpublished-changes')).toBeVisible()
  })

  test('proves the automated QR chain and the stable public identity', async ({ request }) => {
    const state = await passportState(journey.productId)
    expect(Buffer.compare(state.qrBytes as Buffer, journey.qrBytes)).toBe(0)

    const decoded = await decodeQrPng(state.qrBytes as Buffer)
    expect(decoded).toBe(`${WEB}/q/${journey.publicUuid}`)

    // The decoded target resolves through the web bridge to the canonical public page.
    const bridged = await request.get(decoded, { maxRedirects: 0 })
    expect(bridged.status()).toBe(302)
    expect(bridged.headers().location).toBe(`${WEB}/passport/${journey.publicUuid}`)

    const page = await request.get(`${WEB}/passport/${journey.publicUuid}`)
    expect(page.status()).toBe(200)
    expect(await page.text()).toContain(NAME_B)

    // Downloading the QR serves the stored artifact unchanged and records nothing.
    const qrDownload = await request.get(`${API}/passport/${journey.publicUuid}/qr.png`)
    expect(qrDownload.status()).toBe(200)
    expect(Buffer.compare(await qrDownload.body(), journey.qrBytes)).toBe(0)

    const counts = await tableCounts()
    expect(counts.analytics).toBe(0)
    expect(counts.daily).toBe(0)
    expect(counts.audit).toBe(journey.auditBaseline)
  })

  test('renders the public passport server-side for an anonymous visitor', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    const response = await page.goto(`/passport/${journey.publicUuid}`)

    expect(response?.status()).toBe(200)
    const html = await page.content()
    expect(html).toContain(NAME_B)
    expect(html).toContain('SKU-ACCEPT-')
    expect(html).toContain(journey.serialNumber)
    expect(html).toContain(journey.publicUuid)
    expect(html).toContain('v2')
    expect(html).toContain('Verified Product')
    expect(html).toContain('prototype/application-level indicator')
    expect(await context.cookies()).toHaveLength(0)
    await context.close()
  })

  test('keeps the public page responsive and accessible at phone and desktop widths', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/passport/${journey.publicUuid}`)
    await expect(page.getByTestId('passport-product-name')).toBeVisible()
    await expect(page.getByTestId('passport-cover-image')).toBeVisible()
    const phoneOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(phoneOverflow).toBeLessThanOrEqual(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId('passport-product-name')).toBeVisible()

    // Targeted accessibility regression: heading structure, named actions, table headers,
    // image alternatives and the wrapped UUID.
    await expect(page.getByRole('heading', { level: 1, name: NAME_B })).toBeVisible()
    const sectionHeadings = page.locator('h2')
    expect(await sectionHeadings.count()).toBeGreaterThanOrEqual(6)
    await expect(page.getByTestId('passport-pdf-download')).toHaveAccessibleName(/pdf/i)
    await expect(page.getByTestId('passport-qr-download')).toHaveAccessibleName(/qr/i)
    expect(await page.locator('[data-passport-section="materials"] th').count()).toBeGreaterThan(0)
    const cover = page.getByTestId('passport-cover-image')
    expect(await cover.getAttribute('alt')).toBeTruthy()
    await expect(page.getByTestId('passport-uuid')).toBeVisible()

    // Long published content still renders and wraps on a phone viewport.
    const editorToken = await tokenFor(request, E2E_EMAIL)
    const longCover = await upload(
      request,
      editorToken,
      'long-cover.png',
      'image/png',
      await solidPng('#00ffff'),
    )
    const longGallery = await upload(
      request,
      editorToken,
      'long-gallery.png',
      'image/png',
      await solidPng('#ff00ff', 48),
    )
    const longManual = await upload(
      request,
      editorToken,
      'long-manual.pdf',
      'application/pdf',
      MINIMAL_PDF,
    )
    const longCert = await upload(
      request,
      editorToken,
      'long-cert.pdf',
      'application/pdf',
      MINIMAL_PDF,
    )
    const longMaterialName =
      'Recycled anodised aluminium alloy with a deliberately long descriptive name'
    const longDescription = 'A long published description. '.repeat(40)
    const longDraft = await createCompleteDraft(request, editorToken, {
      name: `Acceptance Long Product ${Date.now()}`,
      description: longDescription,
      serialNumber: `SN-LONG-${Date.now()}`,
      coverAssetId: longCover,
      galleryAssetIds: [longGallery],
      documentAssetId: longManual,
      certificationAssetId: longCert,
      materials: [{ name: longMaterialName, percentage: 100, position: 0 }],
      certificationName: 'A certification with a deliberately long published name',
      certificationAuthority: 'An authority with a deliberately long published name',
      documentTitle: 'A document with a deliberately long published title',
    })
    const publishedLong = await publishViaApi(
      request,
      editorToken,
      longDraft.id,
      longDraft.draftRevision,
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/passport/${publishedLong.publicUuid}`)
    await expect(page.locator('[data-passport-section="materials"]')).toContainText(
      longMaterialName,
    )
    await expect(page.locator('[data-passport-section="product-information"]')).toContainText(
      'A long published description.',
    )
    const longOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(longOverflow).toBeLessThanOrEqual(1)
  })

  test('leaves analytics and audit tables unchanged across the whole journey', async ({
    request,
  }) => {
    // Touch every public surface once more, then prove nothing recorded it.
    await request.get(`${API}/passport/${journey.publicUuid}`)
    await request.get(`${API}/passport/${journey.publicUuid}/pdf`)
    await request.get(`${API}/passport/${journey.publicUuid}/qr.png`)
    await request.get(`${WEB}/q/${journey.publicUuid}`, { maxRedirects: 0 })

    const counts = await tableCounts()
    expect(counts.analytics).toBe(0)
    expect(counts.daily).toBe(0)
    expect(counts.audit).toBe(journey.auditBaseline)

    const perPassport = await withDb(async (client) => {
      const { rows } = await client.query<{ events: number; daily: number }>(
        `SELECT (SELECT count(*)::int FROM "AnalyticsEvent" WHERE "passportId" = $1) AS events,
                (SELECT count(*)::int FROM "AnalyticsDaily" WHERE "passportId" = $1) AS daily`,
        [journey.passportId],
      )
      return rows[0] as { events: number; daily: number }
    })
    expect(perPassport.events).toBe(0)
    expect(perPassport.daily).toBe(0)
  })

  test('keeps the Stage 4 Product-list publication behavior for the accepted product', async ({
    page,
  }) => {
    await signIn(page, E2E_EMAIL)
    await page.goto('/products')

    // The list shows the live draft identity (C) but the publication actions resolve to
    // the current published passport (B/v2).
    const row = page.getByRole('row').filter({ hasText: NAME_C })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('product-cover')).toHaveAttribute('src', /^blob:/)
    await expect(row.getByTestId('product-open-passport')).toHaveAttribute(
      'href',
      `${WEB}/passport/${journey.publicUuid}`,
    )
    await expect(row.getByTestId('product-qr-download')).toHaveAttribute(
      'href',
      `${API}/passport/${journey.publicUuid}/qr.png`,
    )
    await expect(row.getByTestId('product-unpublished-changes')).toBeVisible()
    const totalViews = row.getByTestId('product-total-views')
    await expect(totalViews).not.toContainText('0')
    await expect(totalViews).toContainText('—')
    await expect(totalViews).toContainText('Available after analytics')
  })
})
