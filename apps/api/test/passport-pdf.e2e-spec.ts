import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { AssetState, UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { pdfFixture, pngFixture, solidPng, solidWebp } from './asset-fixtures.js'
import { countColour, parsePdf } from './pdf-inspect.js'

/**
 * Stage 4.5 — Passport PDF export.
 *
 * The generated document is inspected with an independent parser (`pdfjs-dist`), never
 * with PDFKit itself, so "it parses and contains the published content" is real evidence
 * rather than a restatement of what the renderer believed it wrote.
 *
 * The decisive proof is the versioning isolation chain: the PDF of a published version
 * never contains a draft edit, and only an explicit republish changes what it exports.
 */

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

type DraftFixture = {
  productId: string
  draftRevision: number
  coverAssetId: string
  galleryAssetId: string
  documentAssetId: string
  certificationAssetId: string
}

type PublicationResult = {
  passportId: string
  publicUuid: string
  versionId: string
  versionNumber: number
}

let app: INestApplication
let prisma: PrismaService

const fixtures: Fixture[] = []
const categoryIds: string[] = []
const productIds: string[] = []

/** Set by `test/setup-env.cjs`; deliberately not the development default. */
const PUBLIC_APP_ORIGIN = 'https://public.example.test'

function binaryParser(
  response: request.Response,
  callback: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = []
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
}

async function createFixture(): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `PDF test ${randomUUID()}` },
  })
  const email = `pdf-${randomUUID()}@example.test`
  const password = `PdfPassword-${randomUUID()}`
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email,
      normalizedEmail: email,
      passwordHash: await hash(password, { algorithm: 2 }),
      role: UserRole.EDITOR,
      active: true,
    },
  })
  const fixture = { companyId: company.id, userId: user.id, email, password }
  fixtures.push(fixture)
  return fixture
}

async function createCategory(): Promise<string> {
  const category = await prisma.category.create({
    data: { stableCode: `PDF-CAT-${randomUUID()}`, name: 'PDF category' },
  })
  categoryIds.push(category.id)
  return category.id
}

async function login(fixture: Fixture): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: fixture.email, password: fixture.password })
  expect(response.status).toBe(200)
  return response.body.accessToken as string
}

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

async function uploadAsset(token: string, bytes: Buffer, filename: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/assets')
    .set(auth(token))
    .attach('file', bytes, { filename, contentType: 'application/octet-stream' })
  expect(response.status).toBe(201)
  return response.body.id as string
}

/** A draft that satisfies every publication prerequisite. */
async function publishableDraft(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<DraftFixture> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const gallery = await uploadAsset(token, await pngFixture(48, 32), 'gallery.png')
  const documentPdf = await uploadAsset(token, pdfFixture(), 'document.pdf')
  const certificationPdf = await uploadAsset(token, pdfFixture(), 'certificate.pdf')

  const response = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name: 'PDF product',
      sku: 'SKU-PDF',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'PDF description',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 340,
        recycledPercent: 45,
        repairabilityScore: 7.5,
        recyclable: true,
      },
      materials: [
        { name: 'Aluminium', percentage: 60, position: 0 },
        { name: 'Steel', percentage: 40, position: 1 },
      ],
      images: [
        { assetId: cover, role: 'COVER', altText: 'front' },
        { assetId: gallery, role: 'GALLERY', altText: 'side' },
      ],
      documents: [{ assetId: documentPdf, kind: 'MANUAL', title: 'Manual' }],
      certifications: [
        {
          name: 'ISO 9001',
          issuingAuthority: 'TUV',
          issueDate: '2025-01-01',
          expirationDate: '2030-01-01',
          pdfAssetId: certificationPdf,
        },
      ],
      ...overrides,
    })
  expect(response.status).toBe(201)
  productIds.push(response.body.id as string)
  return {
    productId: response.body.id as string,
    draftRevision: response.body.draftRevision as number,
    coverAssetId: cover,
    galleryAssetId: gallery,
    documentAssetId: documentPdf,
    certificationAssetId: certificationPdf,
  }
}

async function publish(
  token: string,
  productId: string,
  expectedDraftRevision: number,
): Promise<PublicationResult> {
  const response = await request(app.getHttpServer())
    .post(`/products/${productId}/publish`)
    .set(auth(token))
    .send({ expectedDraftRevision })
  expect(response.status).toBe(200)
  return response.body as PublicationResult
}

async function patchDraft(
  token: string,
  productId: string,
  expectedDraftRevision: number,
  body: Record<string, unknown>,
): Promise<number> {
  const response = await request(app.getHttpServer())
    .patch(`/products/${productId}`)
    .set(auth(token))
    .send({ expectedDraftRevision, ...body })
  expect(response.status).toBe(200)
  return response.body.draftRevision as number
}

/** Downloads a PDF with a binary body parser. */
async function downloadPdf(publicUuid: string): Promise<request.Response> {
  return request(app.getHttpServer())
    .get(`/passport/${publicUuid}/pdf`)
    .buffer(true)
    .parse(binaryParser)
}

/** Requests a PDF without the binary parser, so a JSON error body stays parseable. */
async function attemptPdf(publicUuid: string): Promise<request.Response> {
  return request(app.getHttpServer()).get(`/passport/${publicUuid}/pdf`)
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)
})

afterAll(async () => {
  const companyIds = fixtures.map((fixture) => fixture.companyId)
  if (companyIds.length > 0) {
    const passports = await prisma.passport.findMany({
      where: { product: { companyId: { in: companyIds } } },
      select: { id: true },
    })
    const passportIds = passports.map((passport) => passport.id)
    if (passportIds.length > 0) {
      const versions = await prisma.passportVersion.findMany({
        where: { passportId: { in: passportIds } },
        select: { id: true },
      })
      await prisma.passportVersionAsset.deleteMany({
        where: { versionId: { in: versions.map((version) => version.id) } },
      })
      await prisma.passport.updateMany({
        where: { id: { in: passportIds } },
        data: { currentVersionId: null },
      })
      await prisma.passportVersion.deleteMany({ where: { passportId: { in: passportIds } } })
      await prisma.passport.deleteMany({ where: { id: { in: passportIds } } })
    }
    if (productIds.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.productDocument.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.certification.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.material.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.sustainability.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    }
    await prisma.assetContent.deleteMany({ where: { asset: { companyId: { in: companyIds } } } })
    await prisma.asset.deleteMany({ where: { companyId: { in: companyIds } } })
  }
  if (categoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })
  }
  const userIds = fixtures.map((fixture) => fixture.userId)
  if (userIds.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { session: { userId: { in: userIds } } } })
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  }
  await app.close()
})

describe('Public passport PDF response', () => {
  it('is anonymously downloadable as an attachment with safe headers', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await downloadPdf(published.publicUuid)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.headers['content-disposition']).toContain(
      `notarify-passport-${published.publicUuid}-v1.pdf`,
    )
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')

    const bytes = response.body as Buffer
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    const parsed = await parsePdf(bytes)
    expect(parsed.pages).toBeGreaterThanOrEqual(1)
  })

  it('advertises the API-relative PDF URL in the public projection', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)

    expect(response.status).toBe(200)
    expect(response.body.passport.pdfDownloadUrl).toBe(`/passport/${published.publicUuid}/pdf`)
  })

  it('returns the same safe 404 for malformed, unknown, withdrawn and deleted passports', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const responses: Array<[string, request.Response]> = [
      ['malformed uuid', await attemptPdf('not-a-uuid')],
      ['unknown uuid', await attemptPdf(randomUUID())],
    ]

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: new Date() },
    })
    responses.push(['withdrawn', await attemptPdf(published.publicUuid)])
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: null },
    })

    await prisma.product.update({
      where: { id: draft.productId },
      data: { deletedAt: new Date() },
    })
    responses.push(['soft-deleted product', await attemptPdf(published.publicUuid)])

    for (const [label, response] of responses) {
      expect([label, response.status]).toEqual([label, 404])
      expect([label, response.headers['content-type']]).toEqual([
        label,
        expect.stringContaining('application/json'),
      ])
      // The route-level `no-store` must also cover a preflight failure.
      expect([label, response.headers['cache-control']]).toEqual([
        label,
        expect.stringContaining('no-store'),
      ])
      expect([label, response.body.code]).toEqual([label, 'PASSPORT_NOT_FOUND'])
    }
  })

  it('refuses to export when the stored QR artifact is corrupt', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { qrPngBytes: new Uint8Array(Buffer.from('this is not a png artifact')) },
    })

    const response = await attemptPdf(published.publicUuid)

    // A broken identity artifact makes the export unavailable; it must never produce a
    // successful PDF with a silently substituted QR code.
    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body.code).toBe('PASSPORT_UNAVAILABLE')
    expect(JSON.stringify(response.body)).not.toContain('%PDF-')
  })
})

describe('PDF content', () => {
  it('carries the published content and not the raw snapshot', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory(), {
      name: 'Caffè Torino · München · Łódź',
      sku: 'SKU-PDF-CONTENT',
      description: 'A description with an em dash — and an accent: crème brûlée.',
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await downloadPdf(published.publicUuid)
    expect(response.status).toBe(200)
    const parsed = await parsePdf(response.body as Buffer)

    // Unicode survives the embedded font path.
    expect(parsed.text).toContain('Caffè Torino · München · Łódź')
    expect(parsed.text).toContain('crème brûlée')

    // Identity, materials, sustainability, certification and document sections.
    expect(parsed.text).toContain('SKU-PDF-CONTENT')
    expect(parsed.text).toContain('Aluminium')
    expect(parsed.text).toContain('Steel')
    expect(parsed.text).toContain('60%')
    expect(parsed.text).toContain('CARBON FOOTPRINT')
    expect(parsed.text).toContain('12.5 kg CO2e')
    expect(parsed.text).toContain('ISO 9001')
    expect(parsed.text).toContain('TUV')
    expect(parsed.text).toContain('1 January 2025')
    expect(parsed.text).toContain('Manual')

    // Every section heading survives the layout in full; a drifted flow position used to
    // clip headings at the page edge.
    expect(parsed.text).toContain('PRODUCT INFORMATION')
    expect(parsed.text).toContain('MATERIALS')
    expect(parsed.text).toContain('SUSTAINABILITY')
    expect(parsed.text).toContain('CERTIFICATIONS')
    expect(parsed.text).toContain('DOCUMENTS')
    expect(parsed.text).toContain('GALLERY')
    expect(parsed.text).toContain('PASSPORT INFORMATION')

    // Passport metadata and the canonical public URL.
    expect(parsed.text).toContain(published.publicUuid)
    expect(parsed.text).toContain('v1')
    expect(parsed.text).toContain('Verified')
    expect(parsed.text).toContain(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(parsed.text).toContain('prototype/application-level indicator')

    // The canonical URL is a real clickable link, and the certification and document
    // entries link to it as well, so a reviewer can reach the supporting files.
    const canonical = `${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`
    expect(parsed.links).toContain(canonical)
    expect(parsed.links.filter((url) => url === canonical).length).toBeGreaterThanOrEqual(2)

    // No raw snapshot wrapper or internal identifier.
    expect(parsed.text).not.toContain('publicSnapshot')
    expect(parsed.text).not.toContain('schemaVersion')
    expect(parsed.text).not.toContain(fixture.companyId)
    expect(parsed.text).not.toContain(fixture.userId)
  })

  it('embeds the cover, the gallery and a WebP converted for PDF use', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const red = await uploadAsset(token, await solidPng('#ff0000'), 'red.png')
    const blueWebp = await uploadAsset(token, await solidWebp('#0000ff'), 'blue.webp')
    const green = await uploadAsset(token, await solidPng('#00ff00', 48), 'green.png')

    const draft = await publishableDraft(token, categoryId, {
      images: [
        { assetId: red, role: 'COVER', altText: 'red cover' },
        { assetId: blueWebp, role: 'GALLERY', altText: 'blue gallery' },
        { assetId: green, role: 'GALLERY', altText: 'green gallery' },
      ],
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await downloadPdf(published.publicUuid)
    expect(response.status).toBe(200)
    const parsed = await parsePdf(response.body as Buffer)

    // Red cover, converted WebP gallery image and PNG gallery image are all painted.
    expect(countColour(parsed.images, [255, 0, 0])).toBeGreaterThan(0)
    expect(countColour(parsed.images, [0, 0, 255])).toBeGreaterThan(0)
    expect(countColour(parsed.images, [0, 255, 0])).toBeGreaterThan(0)
  })

  it('keeps a long gallery caption in full on one row with its image', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const cover = await uploadAsset(token, await solidPng('#ff0000'), 'cover.png')
    const first = await uploadAsset(token, await solidPng('#00ff00', 48), 'first.png')
    const second = await uploadAsset(token, await solidPng('#0000ff', 48), 'second.png')
    const longCaption =
      'A long gallery caption that must wrap across several lines instead of being truncated at the column edge of the layout'

    const draft = await publishableDraft(token, categoryId, {
      images: [
        { assetId: cover, role: 'COVER', altText: 'cover' },
        { assetId: first, role: 'GALLERY', altText: longCaption },
        { assetId: second, role: 'GALLERY', altText: 'short caption' },
      ],
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const parsed = await parsePdf((await downloadPdf(published.publicUuid)).body as Buffer)

    // The caption is published content and is never truncated to keep a row short.
    expect(parsed.text).toContain(longCaption)
    // Both gallery images still rendered.
    expect(countColour(parsed.images, [0, 255, 0])).toBeGreaterThan(0)
    expect(countColour(parsed.images, [0, 0, 255])).toBeGreaterThan(0)
  })

  it('survives a long passport across pages with a repeated material header', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const materials = Array.from({ length: 50 }, (_, index) => ({
      name: `Material ${index + 1} with a deliberately long descriptive name`,
      percentage: 2,
      originCountry: 'IT',
      position: index,
    }))

    const draft = await publishableDraft(token, categoryId, {
      name: 'Long passport',
      description: 'A long published description. '.repeat(40),
      materials,
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await downloadPdf(published.publicUuid)
    expect(response.status).toBe(200)
    const parsed = await parsePdf(response.body as Buffer)

    expect(parsed.pages).toBeGreaterThan(1)
    // A late material row and the final passport section both survived pagination.
    expect(parsed.text).toContain('Material 50')
    expect(parsed.text).toContain(published.publicUuid)
    // The table header is repeated on the continuation page.
    expect((parsed.text.match(/\bMATERIAL\b/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders a controlled cover placeholder when the published cover is unreadable', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    await prisma.asset.update({
      where: { id: draft.coverAssetId },
      data: { state: AssetState.QUARANTINED },
    })
    try {
      const response = await downloadPdf(published.publicUuid)
      expect(response.status).toBe(200)
      const parsed = await parsePdf(response.body as Buffer)
      expect(parsed.text).toContain('Cover image unavailable')
      expect(parsed.text).toContain('PDF product')
    } finally {
      await prisma.asset.update({
        where: { id: draft.coverAssetId },
        data: { state: AssetState.ACCEPTED },
      })
    }
  })

  it('omits an optional gallery image that is no longer accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    await prisma.asset.update({
      where: { id: draft.galleryAssetId },
      data: { state: AssetState.QUARANTINED },
    })
    try {
      const response = await downloadPdf(published.publicUuid)
      expect(response.status).toBe(200)
      const parsed = await parsePdf(response.body as Buffer)
      expect(parsed.text).toContain('No gallery images')
      expect(parsed.text).toContain('PDF product')
    } finally {
      await prisma.asset.update({
        where: { id: draft.galleryAssetId },
        data: { state: AssetState.ACCEPTED },
      })
    }
  })
})

describe('PDF asset privacy', () => {
  it('embeds only the current version image and never the draft replacement', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const red = await uploadAsset(token, await solidPng('#ff0000'), 'red.png')
    const green = await uploadAsset(token, await solidPng('#00ff00'), 'green.png')
    const blue = await uploadAsset(token, await solidPng('#0000ff'), 'blue.png')

    const draft = await publishableDraft(token, categoryId, {
      images: [{ assetId: red, role: 'COVER', altText: 'red' }],
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const firstPdf = await parsePdf((await downloadPdf(published.publicUuid)).body as Buffer)
    expect(countColour(firstPdf.images, [255, 0, 0])).toBeGreaterThan(0)
    expect(countColour(firstPdf.images, [0, 255, 0])).toBe(0)

    // Draft edit to a green cover and a blue draft-only replacement, no republish.
    await patchDraft(token, draft.productId, draft.draftRevision, {
      images: [
        { assetId: green, role: 'COVER', altText: 'green' },
        { assetId: blue, role: 'GALLERY', altText: 'blue draft only' },
      ],
    })

    const draftTimePdf = await parsePdf((await downloadPdf(published.publicUuid)).body as Buffer)
    expect(countColour(draftTimePdf.images, [255, 0, 0])).toBeGreaterThan(0)
    expect(countColour(draftTimePdf.images, [0, 255, 0])).toBe(0)
    expect(countColour(draftTimePdf.images, [0, 0, 255])).toBe(0)
  })
})

describe('PDF versioning isolation proof', () => {
  it('exports the current immutable version only, and moves only on republish', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const red = await uploadAsset(token, await solidPng('#ff0000'), 'red.png')
    const green = await uploadAsset(token, await solidPng('#00ff00'), 'green.png')

    const draft = await publishableDraft(token, categoryId, {
      name: 'Isolation A',
      images: [{ assetId: red, role: 'COVER', altText: 'red' }],
    })
    const versionOne = await publish(token, draft.productId, draft.draftRevision)

    const qrAfterV1 = await request(app.getHttpServer())
      .get(`/passport/${versionOne.publicUuid}/qr.png`)
      .buffer(true)
      .parse(binaryParser)
    expect(qrAfterV1.status).toBe(200)

    const pdfV1 = await parsePdf((await downloadPdf(versionOne.publicUuid)).body as Buffer)
    expect(pdfV1.text).toContain('Isolation A')
    expect(pdfV1.text).toContain('v1')
    expect(countColour(pdfV1.images, [255, 0, 0])).toBeGreaterThan(0)

    // Edit to B without republishing.
    const editedRevision = await patchDraft(token, draft.productId, draft.draftRevision, {
      name: 'Isolation B',
      images: [{ assetId: green, role: 'COVER', altText: 'green' }],
    })

    const pdfBeforeRepublish = await parsePdf(
      (await downloadPdf(versionOne.publicUuid)).body as Buffer,
    )
    expect(pdfBeforeRepublish.text).toContain('Isolation A')
    expect(pdfBeforeRepublish.text).not.toContain('Isolation B')
    expect(pdfBeforeRepublish.text).toContain('v1')
    expect(countColour(pdfBeforeRepublish.images, [255, 0, 0])).toBeGreaterThan(0)
    expect(countColour(pdfBeforeRepublish.images, [0, 255, 0])).toBe(0)

    // Explicit republish moves the PDF to v2 on the same public UUID.
    const versionTwo = await publish(token, draft.productId, editedRevision)
    expect(versionTwo.publicUuid).toBe(versionOne.publicUuid)
    expect(versionTwo.versionNumber).toBe(2)

    const pdfV2 = await parsePdf((await downloadPdf(versionOne.publicUuid)).body as Buffer)
    expect(pdfV2.text).toContain('Isolation B')
    expect(pdfV2.text).not.toContain('Isolation A')
    expect(pdfV2.text).toContain('v2')
    expect(countColour(pdfV2.images, [0, 255, 0])).toBeGreaterThan(0)
    expect(countColour(pdfV2.images, [255, 0, 0])).toBe(0)

    // The QR artifact is unchanged across the republish, so a printed code still works.
    const qrAfterV2 = await request(app.getHttpServer())
      .get(`/passport/${versionOne.publicUuid}/qr.png`)
      .buffer(true)
      .parse(binaryParser)
    expect(qrAfterV2.status).toBe(200)
    expect(Buffer.compare(qrAfterV1.body as Buffer, qrAfterV2.body as Buffer)).toBe(0)

    // A further draft edit to C must not reach the current PDF either.
    const blue = await uploadAsset(token, await solidPng('#0000ff'), 'blue.png')
    await patchDraft(token, draft.productId, editedRevision, {
      name: 'Isolation C',
      images: [{ assetId: blue, role: 'COVER', altText: 'blue' }],
    })
    const pdfAfterC = await parsePdf((await downloadPdf(versionOne.publicUuid)).body as Buffer)
    expect(pdfAfterC.text).toContain('Isolation B')
    expect(pdfAfterC.text).not.toContain('Isolation C')
    expect(pdfAfterC.text).toContain('v2')
    expect(countColour(pdfAfterC.images, [0, 255, 0])).toBeGreaterThan(0)
    expect(countColour(pdfAfterC.images, [0, 0, 255])).toBe(0)
  })
})

describe('PDF and public projection parity', () => {
  it('agrees with the public projection on the stable published fields', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory(), {
      name: 'Parity Product',
      sku: 'SKU-PARITY',
      serialNumber: 'SN-PARITY-1',
      description: 'Parity description',
    })
    const published = await publish(token, draft.productId, draft.draftRevision)

    const view = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(view.status).toBe(200)
    const parsed = await parsePdf((await downloadPdf(published.publicUuid)).body as Buffer)

    // Identity and passport metadata must agree between the API projection and the PDF.
    expect(parsed.text).toContain(view.body.product.name)
    expect(parsed.text).toContain(view.body.product.sku)
    expect(parsed.text).toContain(view.body.product.serialNumber)
    expect(parsed.text).toContain(view.body.passport.publicUuid)
    expect(parsed.text).toContain(`v${view.body.passport.version}`)

    // Published content sections, using the fixture's declared values. The section sizes
    // are asserted first so an omitted section cannot pass these loops vacuously.
    expect(view.body.materials.length).toBeGreaterThan(0)
    expect(view.body.certifications.length).toBeGreaterThan(0)
    expect(view.body.documents.length).toBeGreaterThan(0)
    for (const material of view.body.materials) {
      expect(parsed.text).toContain(material.name)
    }
    expect(parsed.text).toContain('60%')
    expect(parsed.text).toContain('40%')
    expect(parsed.text).toContain('12.5 kg CO2e')
    expect(parsed.text).toContain('340 L')
    expect(parsed.text).toContain('45%')
    expect(parsed.text).toContain('7.5 / 10')
    for (const certification of view.body.certifications) {
      expect(parsed.text).toContain(certification.name)
      expect(parsed.text).toContain(certification.issuingAuthority)
    }
    for (const document of view.body.documents) {
      expect(parsed.text).toContain(document.title)
    }

    // The canonical public URL is clickable in both surfaces.
    expect(parsed.links).toContain(view.body.passport.publicUrl)
  })
})

describe('Stored QR artifact', () => {
  it('embeds the stored Passport.qrPngBytes instead of generating a new code', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    // Replace the stored artifact with an unmistakable sentinel. If PDF generation
    // regenerated a QR from the target URL, this colour could never appear.
    const sentinel = await solidPng('#ff00ff', 8)
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { qrPngBytes: new Uint8Array(sentinel) },
    })

    const qr = await request(app.getHttpServer())
      .get(`/passport/${published.publicUuid}/qr.png`)
      .buffer(true)
      .parse(binaryParser)
    expect(qr.status).toBe(200)
    expect(Buffer.compare(qr.body as Buffer, sentinel)).toBe(0)

    const parsed = await parsePdf((await downloadPdf(published.publicUuid)).body as Buffer)
    expect(countColour(parsed.images, [255, 0, 255])).toBeGreaterThan(0)
  })
})

describe('PDF side effects', () => {
  it('writes no analytics row and no audit event', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const analyticsBefore = await prisma.analyticsEvent.count({
      where: { passportId: published.passportId },
    })
    const dailyBefore = await prisma.analyticsDaily.count({
      where: { passportId: published.passportId },
    })
    const auditBefore = await prisma.auditEvent.count()

    const response = await downloadPdf(published.publicUuid)
    expect(response.status).toBe(200)

    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      analyticsBefore,
    )
    expect(await prisma.analyticsDaily.count({ where: { passportId: published.passportId } })).toBe(
      dailyBefore,
    )
    expect(await prisma.auditEvent.count()).toBe(auditBefore)
  })
})
