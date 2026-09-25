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
import { pdfFixture, pngFixture } from './asset-fixtures.js'
import { decodeQrPng } from './qr-decode.js'

type Fixture = { companyId: string; userId: string; email: string; password: string }

type PublishedFixture = {
  productId: string
  passportId: string
  publicUuid: string
  versionId: string
  coverAssetId: string
  galleryAssetId: string
  documentAssetId: string
  certificationAssetId: string
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
    data: { displayName: `Public test ${randomUUID()}` },
  })
  const email = `public-${randomUUID()}@example.test`
  const password = `PublicPassword-${randomUUID()}`
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
    data: { stableCode: `PUBLIC-CAT-${randomUUID()}`, name: 'Public category' },
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

/** Creates a complete draft and publishes it, returning everything a test needs. */
async function publishProduct(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<PublishedFixture> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const gallery = await uploadAsset(token, await pngFixture(48, 32), 'gallery.png')
  const documentPdf = await uploadAsset(token, pdfFixture(), 'document.pdf')
  const certificationPdf = await uploadAsset(token, pdfFixture(), 'certificate.pdf')

  const created = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name: 'Public product',
      sku: 'SKU-PUBLIC',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Published content',
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
  expect(created.status).toBe(201)
  productIds.push(created.body.id as string)

  const published = await request(app.getHttpServer())
    .post(`/products/${created.body.id}/publish`)
    .set(auth(token))
    .send({ expectedDraftRevision: created.body.draftRevision })
  expect(published.status).toBe(200)

  return {
    productId: created.body.id as string,
    passportId: published.body.passportId as string,
    publicUuid: published.body.publicUuid as string,
    versionId: published.body.versionId as string,
    coverAssetId: cover,
    galleryAssetId: gallery,
    documentAssetId: documentPdf,
    certificationAssetId: certificationPdf,
  }
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
      // Analytics rows reference a version, so they go before the versions themselves.
      await prisma.analyticsEvent.deleteMany({ where: { passportId: { in: passportIds } } })
      await prisma.analyticsDaily.deleteMany({ where: { passportId: { in: passportIds } } })
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

describe('Public passport projection', () => {
  it('is anonymously readable and needs no token or cookie', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)

    expect(response.status).toBe(200)
    expect(response.body.passport.publicUuid).toBe(published.publicUuid)
    expect(response.body.passport.status).toBe('PUBLISHED')
    expect(response.body.passport.verificationStatus).toBe('VERIFIED')
    expect(response.body.passport.version).toBe(1)
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('returns the same safe 404 for malformed and unknown UUIDs', async () => {
    const malformed = await request(app.getHttpServer()).get('/passport/not-a-uuid')
    const unknown = await request(app.getHttpServer()).get(`/passport/${randomUUID()}`)

    for (const response of [malformed, unknown]) {
      expect(response.status).toBe(404)
      expect(response.body.code).toBe('PASSPORT_NOT_FOUND')
      expect(response.body.message).toBe('Passport not found.')
    }
  })

  it('projects the published content and nothing internal', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    const body = response.body

    expect(body.product.name).toBe('Public product')
    expect(body.product.categoryName).toBe('Public category')
    expect(body.product.originCountry).toBe('IT')
    expect(body.materials.map((m: { name: string }) => m.name)).toEqual(['Aluminium', 'Steel'])
    expect(body.materials.map((m: { position: number }) => m.position)).toEqual([0, 1])
    expect(body.sustainability.carbonKgCo2e).toBe(12.5)
    expect(body.certifications[0].name).toBe('ISO 9001')
    expect(body.images.map((i: { role: string }) => i.role).sort()).toEqual(['COVER', 'GALLERY'])
    expect(body.documents[0].kind).toBe('MANUAL')
    expect(body.brand.displayName).toContain('Public test')

    const serialized = JSON.stringify(body)
    // No internal identifiers, no publisher, no raw snapshot wrapper, no binary content.
    expect(serialized).not.toContain(fixture.companyId)
    expect(serialized).not.toContain(fixture.userId)
    expect(serialized).not.toContain('companyId')
    expect(serialized).not.toContain('publishedById')
    expect(serialized).not.toContain('sourceDraftRevision')
    expect(serialized).not.toContain('publicSnapshot')
    expect(serialized).not.toContain('schemaVersion')
    expect(serialized).not.toContain('"bytes"')
    expect(serialized).not.toContain('base64')
  })

  it('exposes only API-relative asset URLs and the canonical page URLs', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    const body = response.body

    expect(body.images[0].url).toBe(
      `/passport/${published.publicUuid}/assets/${body.images[0].assetId}`,
    )
    expect(body.documents[0].downloadUrl).toBe(
      `/passport/${published.publicUuid}/assets/${published.documentAssetId}`,
    )
    expect(body.certifications[0].downloadUrl).toBe(
      `/passport/${published.publicUuid}/assets/${published.certificationAssetId}`,
    )
    expect(body.passport.qrDownloadUrl).toBe(`/passport/${published.publicUuid}/qr.png`)
    expect(body.passport.publicUrl).toBe(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(body.passport.qrTargetUrl).toBe(`${PUBLIC_APP_ORIGIN}/q/${published.publicUuid}`)
  })
})

describe('Public passport snapshot isolation', () => {
  it('serves the published version, not the live draft, until a republish', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const published = await publishProduct(token, categoryId)

    const before = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(before.body.passport.version).toBe(1)
    expect(before.body.product.description).toBe('Published content')

    // Edit the draft without republishing.
    const edited = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, description: 'Unpublished edit', name: 'Unpublished name' })
    expect(edited.status).toBe(200)

    const stillV1 = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(stillV1.body.passport.version).toBe(1)
    expect(stillV1.body.product.description).toBe('Published content')
    expect(stillV1.body.product.name).toBe('Public product')
    expect(JSON.stringify(stillV1.body)).not.toContain('Unpublished edit')

    // Republish and confirm the public projection moves to version 2.
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: edited.body.draftRevision })
    expect(republished.status).toBe(200)

    const nowV2 = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(nowV2.body.passport.version).toBe(2)
    expect(nowV2.body.product.description).toBe('Unpublished edit')
    expect(nowV2.body.passport.publicUuid).toBe(published.publicUuid)
  })

  it('fails safely when the passport is unpublished, withdrawn or deleted', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    // Withdrawn.
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: new Date() },
    })
    const withdrawn = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(withdrawn.status).toBe(404)

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: null },
    })

    // No current version.
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { currentVersionId: null },
    })
    const unpublished = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(unpublished.status).toBe(404)

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { currentVersionId: published.versionId },
    })

    // Soft-deleted product.
    await prisma.product.update({
      where: { id: published.productId },
      data: { deletedAt: new Date() },
    })
    const deleted = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(deleted.status).toBe(404)
    expect(deleted.body.code).toBe('PASSPORT_NOT_FOUND')
  })
})

describe('Public published assets', () => {
  async function download(publicUuid: string, assetId: string) {
    return request(app.getHttpServer())
      .get(`/passport/${publicUuid}/assets/${assetId}`)
      .buffer(true)
      .parse(binaryParser)
  }

  /**
   * Requests an asset without the binary parser, so a JSON error body is parsed and its
   * `code` can be asserted. The binary parser is only appropriate for success cases.
   */
  async function attemptDownload(publicUuid: string, assetId: string) {
    return request(app.getHttpServer()).get(`/passport/${publicUuid}/assets/${assetId}`)
  }

  it('serves every asset the current published version references', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    for (const assetId of [
      published.coverAssetId,
      published.galleryAssetId,
      published.documentAssetId,
      published.certificationAssetId,
    ]) {
      const response = await download(published.publicUuid, assetId)
      expect(response.status).toBe(200)
      expect(Buffer.isBuffer(response.body)).toBe(true)
      expect((response.body as Buffer).length).toBeGreaterThan(0)
    }
  })

  it('uses safe, server-controlled headers for images and PDFs', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const image = await download(published.publicUuid, published.coverAssetId)
    expect(image.headers['content-type']).toBe('image/png')
    expect(image.headers['content-disposition']).toContain('inline')
    expect(image.headers['x-content-type-options']).toBe('nosniff')
    expect(image.headers['cache-control']).toBe('no-store')
    expect(image.headers['content-length']).toBe(String((image.body as Buffer).length))
    // The web origin embeds these bytes and is not necessarily the API origin, so a
    // same-origin CORP would be refused by the browser before the image could render.
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin')

    const pdf = await download(published.publicUuid, published.documentAssetId)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['content-disposition']).toContain('attachment')
    expect(pdf.headers['x-content-type-options']).toBe('nosniff')
    expect(pdf.headers['cache-control']).toBe('no-store')
    expect(pdf.headers['content-length']).toBe(String((pdf.body as Buffer).length))
    expect(pdf.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  it('refuses assets that are not retained by the current published version', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const published = await publishProduct(ownerToken, await createCategory())

    // Accepted and owned by the same company, but never attached to this version.
    const unattached = await uploadAsset(ownerToken, await pngFixture(40, 40), 'unattached.png')

    // Attached to a draft but never published.
    const draftOnly = await uploadAsset(ownerToken, await pngFixture(44, 44), 'draft-only.png')
    const draftProduct = await request(app.getHttpServer())
      .post('/products')
      .set(auth(ownerToken))
      .send({
        name: 'Draft only',
        images: [{ assetId: draftOnly, role: 'COVER' }],
      })
    expect(draftProduct.status).toBe(201)
    productIds.push(draftProduct.body.id as string)

    const stranger = await createFixture()
    const foreign = await uploadAsset(
      await login(stranger),
      await pngFixture(50, 50),
      'foreign.png',
    )

    const cases: Array<[string, string]> = [
      ['unattached accepted asset', unattached],
      ['draft-only asset', draftOnly],
      ['foreign-company asset', foreign],
      ['random asset id', randomUUID()],
      ['malformed asset id', 'not-a-uuid'],
    ]

    for (const [label, assetId] of cases) {
      const response = await attemptDownload(published.publicUuid, assetId)
      expect([label, response.status, response.body?.code]).toEqual([
        label,
        404,
        'PASSPORT_NOT_FOUND',
      ])
    }
  })

  it('keeps an asset private once a republish stops referencing it', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    // Confirm the gallery image is public while v1 is current.
    expect((await download(published.publicUuid, published.galleryAssetId)).status).toBe(200)

    // Replace the images and republish, so v2 no longer references the gallery image.
    const edited = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({
        expectedDraftRevision: 0,
        images: [{ assetId: published.coverAssetId, role: 'COVER', altText: 'front' }],
      })
    expect(edited.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: edited.body.draftRevision })
    expect(republished.status).toBe(200)

    // Version 1 still retains it in the database — history is not deleted ...
    const retained = await prisma.passportVersionAsset.findUnique({
      where: {
        versionId_assetId: { versionId: published.versionId, assetId: published.galleryAssetId },
      },
    })
    expect(retained).not.toBeNull()

    // ... but it is no longer publicly downloadable, while current content still is.
    expect((await download(published.publicUuid, published.galleryAssetId)).status).toBe(404)
    expect((await download(published.publicUuid, published.coverAssetId)).status).toBe(200)
  })

  it('fails safely when a currently retained asset stops being accepted', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    await prisma.asset.update({
      where: { id: published.coverAssetId },
      data: { state: AssetState.QUARANTINED },
    })

    const response = await attemptDownload(published.publicUuid, published.coverAssetId)
    expect(response.status).toBe(404)
    expect(response.body.code).toBe('PASSPORT_NOT_FOUND')
  })
})

describe('Public QR artifact and redirect', () => {
  it('serves the exact stored bytes with safe attachment headers', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const stored = await prisma.passport.findUniqueOrThrow({
      where: { publicUuid: published.publicUuid },
      select: { qrPngBytes: true },
    })

    const response = await request(app.getHttpServer())
      .get(`/passport/${published.publicUuid}/qr.png`)
      .buffer(true)
      .parse(binaryParser)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.headers['content-disposition']).toContain(
      `passport-${published.publicUuid}-qr.png`,
    )
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(response.headers['content-length']).toBe(String((response.body as Buffer).length))
    // Byte-for-byte the stored artifact: the QR is never regenerated on download.
    expect(Buffer.from(response.body as Buffer).equals(Buffer.from(stored.qrPngBytes))).toBe(true)
  })

  it('decodes the real stored QR to the exact configured target', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const stored = await prisma.passport.findUniqueOrThrow({
      where: { publicUuid: published.publicUuid },
      select: { qrPngBytes: true },
    })

    // Decoded with a different library from the one that encoded it.
    const payload = await decodeQrPng(Buffer.from(stored.qrPngBytes))
    expect(payload).toBe(`${PUBLIC_APP_ORIGIN}/q/${published.publicUuid}`)
  })

  it('keeps the QR bytes and target stable across a republish', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    const before = await prisma.passport.findUniqueOrThrow({
      where: { publicUuid: published.publicUuid },
      select: { qrPngBytes: true, qrTargetUrl: true, qrGeneratedAt: true },
    })

    const edited = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, description: 'Edited for republish' })
    expect(edited.status).toBe(200)
    expect(
      (
        await request(app.getHttpServer())
          .post(`/products/${published.productId}/publish`)
          .set(auth(token))
          .send({ expectedDraftRevision: edited.body.draftRevision })
      ).status,
    ).toBe(200)

    const after = await prisma.passport.findUniqueOrThrow({
      where: { publicUuid: published.publicUuid },
      select: { qrPngBytes: true, qrTargetUrl: true, qrGeneratedAt: true },
    })

    expect(Buffer.from(after.qrPngBytes).equals(Buffer.from(before.qrPngBytes))).toBe(true)
    expect(after.qrTargetUrl).toBe(before.qrTargetUrl)
    expect(after.qrGeneratedAt.toISOString()).toBe(before.qrGeneratedAt.toISOString())
  })

  it('resolves an active passport with a 302 to the canonical page and no store', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .redirects(0)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('ignores the request Host header when building the redirect target', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('Host', 'evil.example.test')
      .set('X-Forwarded-Host', 'evil.example.test')
      .redirects(0)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(response.headers.location).not.toContain('evil.example.test')
  })

  it('returns a safe 404 for malformed, unknown and unavailable passports', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const malformed = await request(app.getHttpServer()).get('/q/not-a-uuid').redirects(0)
    const unknown = await request(app.getHttpServer()).get(`/q/${randomUUID()}`).redirects(0)
    expect(malformed.status).toBe(404)
    expect(unknown.status).toBe(404)

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: new Date() },
    })
    const withdrawn = await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .redirects(0)
    expect(withdrawn.status).toBe(404)
  })

  it('records only the QR redirect as a scan, and nothing for other public reads', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const before = await prisma.analyticsEvent.count({
      where: { passportId: published.passportId },
    })
    const beforeDaily = await prisma.analyticsDaily.count({
      where: { passportId: published.passportId },
    })
    const auditBefore = await prisma.auditEvent.count()

    await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    await request(app.getHttpServer()).get(`/passport/${published.publicUuid}/qr.png`)
    await request(app.getHttpServer()).get(
      `/passport/${published.publicUuid}/assets/${published.coverAssetId}`,
    )

    // Stage 4 proved this surface recorded nothing before analytics existed. Stage 5
    // deliberately changes one of these: the QR resolver is a scan. The other public
    // reads stay silent — the JSON projection is not a view, and a QR download is not a
    // scan — so the assertion is now per surface rather than global.
    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      before,
    )
    expect(await prisma.analyticsDaily.count({ where: { passportId: published.passportId } })).toBe(
      beforeDaily,
    )

    await request(app.getHttpServer()).get(`/q/${published.publicUuid}`).redirects(0)

    const events = await prisma.analyticsEvent.findMany({
      where: { passportId: published.passportId },
    })
    expect(events).toHaveLength(before + 1)
    expect(events[0]?.kind).toBe('QR_HIT')
    expect(events[0]?.source).toBe('QR_REDIRECT')
    expect(await prisma.analyticsDaily.count({ where: { passportId: published.passportId } })).toBe(
      beforeDaily + 1,
    )
    // Analytics collection is not the audit-log bonus.
    expect(await prisma.auditEvent.count()).toBe(auditBefore)
  })
})

describe('Public passport snapshot safety', () => {
  it('sets no-store on the JSON projection', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('fails in a controlled way for an unreadable snapshot', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    const original = await prisma.passportVersion.findUniqueOrThrow({
      where: { id: published.versionId },
      select: { publicSnapshot: true },
    })
    const base = original.publicSnapshot as Record<string, unknown>

    const withoutMaterials = { ...base }
    delete withoutMaterials.materials

    const corruptions: Array<[string, Record<string, unknown>]> = [
      ['unsupported schema version', { ...base, schemaVersion: 2 }],
      ['missing materials array', withoutMaterials],
      ['null element inside materials', { ...base, materials: [null] }],
      ['sustainability of the wrong shape', { ...base, sustainability: 'not-an-object' }],
    ]

    for (const [label, snapshot] of corruptions) {
      await prisma.passportVersion.update({
        where: { id: published.versionId },
        data: { publicSnapshot: snapshot as never },
      })

      const response = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)

      expect([label, response.status]).toEqual([label, 500])
      expect(response.body.code).toBe('PASSPORT_UNAVAILABLE')
      // The stored JSON and any database detail must not leak.
      const serialized = JSON.stringify(response.body)
      expect(serialized).not.toContain('schemaVersion')
      expect(serialized).not.toContain('materials')
      expect(serialized).not.toContain('sustainability')
    }
  })

  it('returns a byte-identical 404 body for every unavailable state', async () => {
    const fixture = await createFixture()
    const published = await publishProduct(await login(fixture), await createCategory())

    // Only the per-request id may differ between these responses.
    const shape = (body: Record<string, unknown>): Record<string, unknown> => {
      const { requestId: _requestId, ...rest } = body
      return rest
    }

    const responses: Array<[string, request.Response]> = []
    responses.push([
      'malformed uuid',
      await request(app.getHttpServer()).get('/passport/not-a-uuid'),
    ])
    responses.push([
      'unknown uuid',
      await request(app.getHttpServer()).get(`/passport/${randomUUID()}`),
    ])

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: new Date() },
    })
    responses.push([
      'withdrawn',
      await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`),
    ])
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { withdrawnAt: null },
    })

    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { currentVersionId: null },
    })
    responses.push([
      'no current version',
      await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`),
    ])
    await prisma.passport.update({
      where: { publicUuid: published.publicUuid },
      data: { currentVersionId: published.versionId },
    })

    await prisma.product.update({
      where: { id: published.productId },
      data: { deletedAt: new Date() },
    })
    responses.push([
      'soft-deleted product',
      await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`),
    ])

    for (const [label, response] of responses) {
      expect([label, response.status]).toEqual([label, 404])
      expect([label, shape(response.body)]).toEqual([
        label,
        { statusCode: 404, code: 'PASSPORT_NOT_FOUND', message: 'Passport not found.' },
      ])
    }
  })
})
