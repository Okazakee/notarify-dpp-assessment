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

/**
 * Stage 4.4 — back-office passport management and complete version history.
 *
 * These tests run against the real API and a real PostgreSQL database. The central
 * proof is `keeps v1, v2, the public projection and the draft apart`: publish A, edit to
 * B and republish, edit to C without publishing, then assert that history v1 shows A,
 * history v2 shows B, the anonymous route shows B and the draft shows C — from immutable
 * stored versions, never from mutable product state.
 */

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

type PublicationResult = {
  passportId: string
  productId: string
  publicUuid: string
  versionId: string
  versionNumber: number
  sourceDraftRevision: number
}

type DraftFixture = {
  productId: string
  draftRevision: number
  coverAssetId: string
  galleryAssetId: string
  documentAssetId: string
  certificationAssetId: string
}

let app: INestApplication
let prisma: PrismaService

/** Deliberately not the development default; set by `test/setup-env.cjs`. */
const PUBLIC_APP_ORIGIN = 'https://public.example.test'
const fixtures: Fixture[] = []
const categoryIds: string[] = []
const productIds: string[] = []

async function createFixture(role: UserRole = UserRole.EDITOR): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Passports test ${randomUUID()}` },
  })
  const email = `passports-${randomUUID()}@example.test`
  const password = `PassportsPassword-${randomUUID()}`
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email,
      normalizedEmail: email,
      passwordHash: await hash(password, { algorithm: 2 }),
      role,
      active: true,
    },
  })
  const fixture = { companyId: company.id, userId: user.id, email, password }
  fixtures.push(fixture)
  return fixture
}

async function createCategory(): Promise<string> {
  const category = await prisma.category.create({
    data: { stableCode: `PASS-CAT-${randomUUID()}`, name: 'Passports category' },
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
      name: 'Publishable product',
      sku: `SKU-${randomUUID().slice(0, 8)}`,
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Ready to publish',
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

describe('Back-office passport list', () => {
  it('lists published passports for an admin with the full row contract', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await request(app.getHttpServer()).get('/passports').set(auth(token))

    expect(response.status).toBe(200)
    expect(response.body.page).toBe(1)
    expect(response.body.pageSize).toBe(20)
    expect(response.body.total).toBe(1)
    expect(response.body.totalPages).toBe(1)

    const row = response.body.items[0]
    expect(row.passportId).toBe(published.passportId)
    expect(row.productId).toBe(draft.productId)
    expect(row.publicUuid).toBe(published.publicUuid)
    expect(row.status).toBe('PUBLISHED')
    expect(row.currentVersionNumber).toBe(1)
    expect(row.sourceDraftRevision).toBe(draft.draftRevision)
    expect(row.currentDraftRevision).toBe(draft.draftRevision)
    expect(row.hasUnpublishedChanges).toBe(false)
    expect(row.publicUrl).toBe(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(row.qrDownloadUrl).toBe(`/passport/${published.publicUuid}/qr.png`)
    expect(new Date(row.firstPublishedAt).toString()).not.toBe('Invalid Date')
    expect(new Date(row.currentPublishedAt).toString()).not.toBe('Invalid Date')

    // The row carries no bytes, no internal ids and no raw snapshot.
    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain(fixture.companyId)
    expect(serialized).not.toContain('publicSnapshot')
    expect(serialized).not.toContain('schemaVersion')
    expect(serialized).not.toContain('"bytes"')
  })

  it('lists published passports for an editor', async () => {
    const fixture = await createFixture(UserRole.EDITOR)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    await publish(token, draft.productId, draft.draftRevision)

    const response = await request(app.getHttpServer()).get('/passports').set(auth(token))

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
    expect(response.body.items[0].publicUuid).toBeTruthy()
  })

  it('rejects an unauthenticated list request', async () => {
    const response = await request(app.getHttpServer()).get('/passports')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('INVALID_ACCESS_TOKEN')
  })

  it('returns only the actor company passports', async () => {
    const owner = await createFixture(UserRole.ADMIN)
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())
    const published = await publish(ownerToken, draft.productId, draft.draftRevision)

    const stranger = await createFixture(UserRole.ADMIN)
    const strangerToken = await login(stranger)
    const strangerDraft = await publishableDraft(strangerToken, await createCategory())
    const strangerPublished = await publish(
      strangerToken,
      strangerDraft.productId,
      strangerDraft.draftRevision,
    )

    const response = await request(app.getHttpServer()).get('/passports').set(auth(strangerToken))

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
    expect(response.body.items[0].publicUuid).toBe(strangerPublished.publicUuid)
    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain(published.passportId)
    expect(serialized).not.toContain(published.publicUuid)
  })

  it('describes the published snapshot identity, not unpublished draft edits', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory(), {
      name: 'Published name',
      sku: 'SKU-PUBLISHED',
    })
    await publish(token, draft.productId, draft.draftRevision)

    const editedRevision = await patchDraft(token, draft.productId, draft.draftRevision, {
      name: 'Draft name',
      sku: 'SKU-DRAFT',
    })

    const response = await request(app.getHttpServer()).get('/passports').set(auth(token))
    const row = response.body.items[0]

    // The published identity is what the passport list must describe.
    expect(row.product.name).toBe('Published name')
    expect(row.product.sku).toBe('SKU-PUBLISHED')
    expect(row.currentDraftRevision).toBe(editedRevision)
    expect(row.sourceDraftRevision).toBe(draft.draftRevision)
    expect(row.hasUnpublishedChanges).toBe(true)
    expect(row.currentVersionNumber).toBe(1)
  })

  it('paginates deterministically and bounds page size', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const categoryId = await createCategory()
    const first = await publishableDraft(token, categoryId)
    await publish(token, first.productId, first.draftRevision)
    const second = await publishableDraft(token, categoryId)
    await publish(token, second.productId, second.draftRevision)

    const pageOne = await request(app.getHttpServer())
      .get('/passports?page=1&pageSize=1')
      .set(auth(token))
    const pageTwo = await request(app.getHttpServer())
      .get('/passports?page=2&pageSize=1')
      .set(auth(token))

    expect(pageOne.status).toBe(200)
    expect(pageOne.body.total).toBe(2)
    expect(pageOne.body.totalPages).toBe(2)
    expect(pageOne.body.items).toHaveLength(1)
    expect(pageTwo.body.items).toHaveLength(1)
    expect(pageOne.body.items[0].passportId).not.toBe(pageTwo.body.items[0].passportId)

    const tooLarge = await request(app.getHttpServer())
      .get('/passports?pageSize=101')
      .set(auth(token))
    expect(tooLarge.status).toBe(400)
    expect(tooLarge.body.code).toBe('VALIDATION_ERROR')

    const notANumber = await request(app.getHttpServer())
      .get('/passports?page=abc')
      .set(auth(token))
    expect(notANumber.status).toBe(400)
    expect(notANumber.body.code).toBe('VALIDATION_ERROR')
  })
})

describe('Passport version history authorization', () => {
  it('lets an admin list every retained version, newest first, with the current marker', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const first = await publish(token, draft.productId, draft.draftRevision)

    const edited = await patchDraft(token, draft.productId, draft.draftRevision, {
      description: 'Second revision',
    })
    const second = await publish(token, draft.productId, edited)

    const response = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions`)
      .set(auth(token))

    expect(response.status).toBe(200)
    expect(response.body.passport.passportId).toBe(first.passportId)
    expect(response.body.passport.currentVersionNumber).toBe(2)
    expect(response.body.passport.publicUuid).toBe(first.publicUuid)
    expect(
      response.body.versions.map((version: { versionNumber: number }) => version.versionNumber),
    ).toEqual([2, 1])
    expect(response.body.versions[0]).toMatchObject({ versionNumber: 2, isCurrent: true })
    expect(response.body.versions[1]).toMatchObject({
      versionNumber: 1,
      isCurrent: false,
      sourceDraftRevision: draft.draftRevision,
    })
    expect(new Date(response.body.versions[0].publishedAt).toString()).not.toBe('Invalid Date')
    expect(second.versionNumber).toBe(2)

    // No raw snapshot or internal identifier reaches the client.
    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('publicSnapshot')
    expect(serialized).not.toContain('schemaVersion')
    expect(serialized).not.toContain(first.versionId)
    expect(serialized).not.toContain(second.versionId)
  })

  it('forbids an editor from every historical-version route', async () => {
    const owner = await createFixture(UserRole.ADMIN)
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())
    const published = await publish(ownerToken, draft.productId, draft.draftRevision)

    const editor = await createFixture(UserRole.EDITOR)
    const editorToken = await login(editor)

    const responses = [
      await request(app.getHttpServer())
        .get(`/passports/${published.passportId}/versions`)
        .set(auth(editorToken)),
      await request(app.getHttpServer())
        .get(`/passports/${published.passportId}/versions/1`)
        .set(auth(editorToken)),
      await request(app.getHttpServer())
        .get(`/passports/${published.passportId}/versions/1/assets/${draft.coverAssetId}`)
        .set(auth(editorToken)),
    ]

    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(response.body.code).toBe('INSUFFICIENT_ROLE')
    }

    // The same editor can still read current-publication management.
    const list = await request(app.getHttpServer()).get('/passports').set(auth(editorToken))
    expect(list.status).toBe(200)
  })

  it('rejects unauthenticated history requests', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const list = await request(app.getHttpServer()).get(
      `/passports/${published.passportId}/versions`,
    )
    const detail = await request(app.getHttpServer()).get(
      `/passports/${published.passportId}/versions/1`,
    )

    expect(list.status).toBe(401)
    expect(detail.status).toBe(401)
  })

  it('returns the same safe 404 for foreign, malformed and unknown passports', async () => {
    const owner = await createFixture(UserRole.ADMIN)
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())
    const published = await publish(ownerToken, draft.productId, draft.draftRevision)

    const stranger = await createFixture(UserRole.ADMIN)
    const strangerToken = await login(stranger)

    const responses: Array<[string, request.Response]> = [
      [
        'foreign passport',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions`)
          .set(auth(strangerToken)),
      ],
      [
        'malformed passport id',
        await request(app.getHttpServer())
          .get('/passports/not-a-uuid/versions')
          .set(auth(ownerToken)),
      ],
      [
        'unknown passport id',
        await request(app.getHttpServer())
          .get(`/passports/${randomUUID()}/versions`)
          .set(auth(ownerToken)),
      ],
      [
        'foreign version detail',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions/1`)
          .set(auth(strangerToken)),
      ],
      [
        'malformed version number',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions/not-a-number`)
          .set(auth(ownerToken)),
      ],
      [
        'zero version number',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions/0`)
          .set(auth(ownerToken)),
      ],
      [
        'unknown version number',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions/99`)
          .set(auth(ownerToken)),
      ],
    ]

    for (const [label, response] of responses) {
      expect([label, response.status]).toEqual([label, 404])
      expect([label, response.body.code]).toEqual([label, 'PASSPORT_NOT_FOUND'])
    }

    // Every failure body is identical apart from the per-request id, so the response
    // cannot be used to separate "foreign", "malformed" and "unknown".
    const shape = (body: Record<string, unknown>): Record<string, unknown> => {
      const { requestId: _requestId, ...rest } = body
      return rest
    }
    for (const [label, response] of responses) {
      expect([label, shape(response.body)]).toEqual([
        label,
        { statusCode: 404, code: 'PASSPORT_NOT_FOUND', message: 'Passport not found.' },
      ])
    }
  })

  it('re-reads the role from the database on every request, never from the token', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)
    const base = `/passports/${published.passportId}/versions`

    const allowed = await request(app.getHttpServer()).get(base).set(auth(token))
    expect(allowed.status).toBe(200)

    // The access token carries no role claim, so a same-session downgrade must take
    // effect immediately for history while current-publication management stays open.
    await prisma.user.update({ where: { id: fixture.userId }, data: { role: UserRole.EDITOR } })
    try {
      const denied = [
        await request(app.getHttpServer()).get(base).set(auth(token)),
        await request(app.getHttpServer()).get(`${base}/1`).set(auth(token)),
        await request(app.getHttpServer())
          .get(`${base}/1/assets/${draft.coverAssetId}`)
          .set(auth(token)),
      ]
      for (const response of denied) {
        expect(response.status).toBe(403)
        expect(response.body.code).toBe('INSUFFICIENT_ROLE')
      }

      const list = await request(app.getHttpServer()).get('/passports').set(auth(token))
      expect(list.status).toBe(200)
    } finally {
      await prisma.user.update({ where: { id: fixture.userId }, data: { role: UserRole.ADMIN } })
    }
  })
})

describe('Historical version detail', () => {
  it('returns each immutable stored version and never the mutable draft', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory(), {
      name: 'Version A',
    })
    const first = await publish(token, draft.productId, draft.draftRevision)

    const afterEdit = await patchDraft(token, draft.productId, draft.draftRevision, {
      name: 'Version B',
    })
    const second = await publish(token, draft.productId, afterEdit)

    // Unpublished edit C.
    await patchDraft(token, draft.productId, afterEdit, { name: 'Version C' })

    const versionOne = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/1`)
      .set(auth(token))
    const versionTwo = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/2`)
      .set(auth(token))

    expect(versionOne.status).toBe(200)
    expect(versionOne.body.product.name).toBe('Version A')
    expect(versionOne.body.passport.version).toBe(1)
    expect(versionOne.body.passport.isCurrent).toBe(false)
    expect(versionOne.body.passport.currentVersionNumber).toBe(2)
    expect(versionOne.body.passport.status).toBe('PUBLISHED')
    expect(versionOne.body.passport.verificationStatus).toBe('VERIFIED')

    expect(versionTwo.status).toBe(200)
    expect(versionTwo.body.product.name).toBe('Version B')
    expect(versionTwo.body.passport.version).toBe(2)
    expect(versionTwo.body.passport.isCurrent).toBe(true)

    // Version 1 is still A after the later edits and republish.
    const reread = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/1`)
      .set(auth(token))
    expect(reread.body.product.name).toBe('Version A')
    expect(second.versionNumber).toBe(2)
  })

  it('exposes no raw snapshot, internal identifiers or current-public URLs', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)

    const response = await request(app.getHttpServer())
      .get(`/passports/${published.passportId}/versions/1`)
      .set(auth(token))
    const body = response.body

    expect(body.images[0].url).toBe(
      `/passports/${published.passportId}/versions/1/assets/${body.images[0].assetId}`,
    )
    expect(body.documents[0].downloadUrl).toBe(
      `/passports/${published.passportId}/versions/1/assets/${draft.documentAssetId}`,
    )
    expect(body.documents[0].originalName).toBe('document.pdf')
    expect(body.certifications[0].downloadUrl).toBe(
      `/passports/${published.passportId}/versions/1/assets/${draft.certificationAssetId}`,
    )
    expect(body.certifications[0].originalName).toBe('certificate.pdf')

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('publicSnapshot')
    expect(serialized).not.toContain('schemaVersion')
    expect(serialized).not.toContain(fixture.companyId)
    expect(serialized).not.toContain(fixture.userId)
    expect(serialized).not.toContain('companyId')
    expect(serialized).not.toContain('publishedById')
    expect(serialized).not.toContain('"bytes"')
    expect(serialized).not.toContain('base64')
    // A historical version must not present the current public URL or QR as its own.
    expect(serialized).not.toContain('publicUrl')
    expect(serialized).not.toContain('qrDownloadUrl')
    expect(serialized).not.toContain('qrTargetUrl')
    expect(serialized).not.toContain('/passport/')
  })
})

describe('Historical retained assets', () => {
  it('serves a retained image and a retained PDF with safe headers', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)
    const base = `/passports/${published.passportId}/versions/1/assets`

    const image = await request(app.getHttpServer())
      .get(`${base}/${draft.coverAssetId}`)
      .set(auth(token))
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toContain('image/png')
    expect(image.headers['content-disposition']).toContain('inline')
    expect(image.headers['x-content-type-options']).toBe('nosniff')
    expect(image.headers['content-length']).toBe(String(image.body.length))
    expect(image.headers['cross-origin-resource-policy']).toBe('same-origin')

    const pdf = await request(app.getHttpServer())
      .get(`${base}/${draft.documentAssetId}`)
      .set(auth(token))
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toContain('application/pdf')
    expect(pdf.headers['content-disposition']).toContain('attachment')
    expect(pdf.headers['x-content-type-options']).toBe('nosniff')
  })

  it('requires retention by the exact requested version', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const categoryId = await createCategory()
    const draft = await publishableDraft(token, categoryId)
    const first = await publish(token, draft.productId, draft.draftRevision)

    const replacementCover = await uploadAsset(token, await pngFixture(96, 72), 'replacement.png')
    const edited = await patchDraft(token, draft.productId, draft.draftRevision, {
      images: [{ assetId: replacementCover, role: 'COVER', altText: 'replacement' }],
    })
    await publish(token, draft.productId, edited)

    const versionOneCover = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/1/assets/${draft.coverAssetId}`)
      .set(auth(token))
    const versionTwoNewCover = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/2/assets/${replacementCover}`)
      .set(auth(token))
    // The replacement is retained by version 2 only.
    const versionOneReplacement = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/1/assets/${replacementCover}`)
      .set(auth(token))
    // The original asset is still retained by version 1 after it left the draft.
    const versionTwoOriginal = await request(app.getHttpServer())
      .get(`/passports/${first.passportId}/versions/2/assets/${draft.coverAssetId}`)
      .set(auth(token))

    expect(versionOneCover.status).toBe(200)
    expect(versionTwoNewCover.status).toBe(200)
    expect(versionOneReplacement.status).toBe(404)
    expect(versionOneReplacement.body.code).toBe('PASSPORT_NOT_FOUND')
    expect(versionTwoOriginal.status).toBe(404)

    // The asset that ceased to be current is private again on the anonymous route.
    const anonymous = await request(app.getHttpServer()).get(
      `/passport/${first.publicUuid}/assets/${draft.coverAssetId}`,
    )
    expect(anonymous.status).toBe(404)
    // The current version's cover is anonymously readable.
    const anonymousCurrent = await request(app.getHttpServer()).get(
      `/passport/${first.publicUuid}/assets/${replacementCover}`,
    )
    expect(anonymousCurrent.status).toBe(200)
  })

  it('fails safely for unrelated, foreign, non-accepted and malformed assets', async () => {
    const owner = await createFixture(UserRole.ADMIN)
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())
    const published = await publish(ownerToken, draft.productId, draft.draftRevision)

    const unrelated = await uploadAsset(ownerToken, await pngFixture(80, 60), 'unrelated.png')

    const stranger = await createFixture(UserRole.ADMIN)
    const strangerToken = await login(stranger)
    const strangerAsset = await uploadAsset(strangerToken, await pngFixture(72, 54), 'foreign.png')

    const base = `/passports/${published.passportId}/versions/1/assets`
    const responses: Array<[string, request.Response]> = [
      [
        'unrelated asset',
        await request(app.getHttpServer()).get(`${base}/${unrelated}`).set(auth(ownerToken)),
      ],
      [
        'foreign company asset',
        await request(app.getHttpServer()).get(`${base}/${strangerAsset}`).set(auth(ownerToken)),
      ],
      [
        'malformed asset id',
        await request(app.getHttpServer()).get(`${base}/not-a-uuid`).set(auth(ownerToken)),
      ],
      [
        'foreign company passport',
        await request(app.getHttpServer())
          .get(`/passports/${published.passportId}/versions/1/assets/${draft.coverAssetId}`)
          .set(auth(strangerToken)),
      ],
    ]

    await prisma.asset.update({
      where: { id: draft.coverAssetId },
      data: { state: AssetState.QUARANTINED },
    })
    responses.push([
      'non-accepted asset',
      await request(app.getHttpServer()).get(`${base}/${draft.coverAssetId}`).set(auth(ownerToken)),
    ])
    await prisma.asset.update({
      where: { id: draft.coverAssetId },
      data: { state: AssetState.ACCEPTED },
    })

    for (const [label, response] of responses) {
      expect([label, response.status]).toEqual([label, 404])
      expect([label, response.body.code]).toEqual([label, 'PASSPORT_NOT_FOUND'])
    }

    // Restoring the state makes the same asset readable again, proving the failure was
    // the acceptance check and not the retention check.
    const restored = await request(app.getHttpServer())
      .get(`${base}/${draft.coverAssetId}`)
      .set(auth(ownerToken))
    expect(restored.status).toBe(200)
  })
})

describe('Versioning bonus acceptance proof', () => {
  it('keeps v1, v2, the public projection and the draft apart', async () => {
    const fixture = await createFixture(UserRole.ADMIN)
    const token = await login(fixture)
    const categoryId = await createCategory()

    const coverA = await uploadAsset(token, await pngFixture(64, 48), 'cover-a.png')
    const coverB = await uploadAsset(token, await pngFixture(128, 96), 'cover-b.png')

    const created = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({
        name: 'Proof product A',
        sku: `SKU-${randomUUID().slice(0, 8)}`,
        serialNumber: `SN-${randomUUID()}`,
        categoryId,
        description: 'Proof description A',
        productionDate: '2026-02-01',
        originCountry: 'IT',
        sustainability: {
          carbonKgCo2e: 12.5,
          waterLitres: 340,
          recycledPercent: 45,
          repairabilityScore: 7.5,
          recyclable: true,
        },
        materials: [{ name: 'Aluminium', percentage: 100, position: 0 }],
        images: [{ assetId: coverA, role: 'COVER', altText: 'cover A' }],
      })
    expect(created.status).toBe(201)
    const productId = created.body.id as string
    productIds.push(productId)

    const versionOne = await publish(token, productId, created.body.draftRevision)
    const qrAfterV1 = await request(app.getHttpServer()).get(
      `/passport/${versionOne.publicUuid}/qr.png`,
    )
    expect(qrAfterV1.status).toBe(200)

    const editedToB = await patchDraft(token, productId, created.body.draftRevision, {
      name: 'Proof product B',
      description: 'Proof description B',
      images: [{ assetId: coverB, role: 'COVER', altText: 'cover B' }],
    })
    const versionTwo = await publish(token, productId, editedToB)

    const editedToC = await patchDraft(token, productId, editedToB, {
      name: 'Proof product C',
      description: 'Proof description C',
    })

    // Stable identity across versions.
    expect(versionTwo.publicUuid).toBe(versionOne.publicUuid)
    expect(versionTwo.passportId).toBe(versionOne.passportId)
    expect(versionTwo.versionNumber).toBe(2)

    // Stable QR: the same stored artifact, not regenerated per version.
    const qrAfterV2 = await request(app.getHttpServer()).get(
      `/passport/${versionOne.publicUuid}/qr.png`,
    )
    expect(qrAfterV2.status).toBe(200)
    expect(Buffer.compare(qrAfterV1.body as Buffer, qrAfterV2.body as Buffer)).toBe(0)

    // History shows A and B.
    const history = await request(app.getHttpServer())
      .get(`/passports/${versionOne.passportId}/versions`)
      .set(auth(token))
    expect(history.status).toBe(200)
    expect(
      history.body.versions.map((version: { versionNumber: number }) => version.versionNumber),
    ).toEqual([2, 1])

    const historicalOne = await request(app.getHttpServer())
      .get(`/passports/${versionOne.passportId}/versions/1`)
      .set(auth(token))
    const historicalTwo = await request(app.getHttpServer())
      .get(`/passports/${versionOne.passportId}/versions/2`)
      .set(auth(token))

    expect(historicalOne.body.product.name).toBe('Proof product A')
    expect(historicalOne.body.product.description).toBe('Proof description A')
    expect(historicalOne.body.images).toEqual([
      expect.objectContaining({ assetId: coverA, role: 'COVER' }),
    ])
    expect(historicalTwo.body.product.name).toBe('Proof product B')
    expect(historicalTwo.body.product.description).toBe('Proof description B')
    expect(historicalTwo.body.images).toEqual([
      expect.objectContaining({ assetId: coverB, role: 'COVER' }),
    ])

    // Both historical covers render through the historical route.
    const historicalCoverA = await request(app.getHttpServer())
      .get(`/passports/${versionOne.passportId}/versions/1/assets/${coverA}`)
      .set(auth(token))
    const historicalCoverB = await request(app.getHttpServer())
      .get(`/passports/${versionOne.passportId}/versions/2/assets/${coverB}`)
      .set(auth(token))
    expect(historicalCoverA.status).toBe(200)
    expect(historicalCoverB.status).toBe(200)

    // The anonymous public projection is B, never the draft C.
    const anonymous = await request(app.getHttpServer()).get(`/passport/${versionOne.publicUuid}`)
    expect(anonymous.status).toBe(200)
    expect(anonymous.body.product.name).toBe('Proof product B')
    expect(anonymous.body.images[0].assetId).toBe(coverB)

    // The draft editor still shows C and knows it is unpublished.
    const draft = await request(app.getHttpServer()).get(`/products/${productId}`).set(auth(token))
    expect(draft.status).toBe(200)
    expect(draft.body.name).toBe('Proof product C')
    expect(draft.body.draftRevision).toBe(editedToC)

    // The passport list reports the published identity B plus unpublished changes.
    const passportList = await request(app.getHttpServer()).get('/passports').set(auth(token))
    const row = passportList.body.items.find(
      (item: { passportId: string }) => item.passportId === versionOne.passportId,
    )
    expect(row.product.name).toBe('Proof product B')
    expect(row.hasUnpublishedChanges).toBe(true)
    expect(row.currentVersionNumber).toBe(2)
  })
})

describe('Product list publication metadata', () => {
  it('carries the passport block for a published row and null for a draft row', async () => {
    const fixture = await createFixture(UserRole.EDITOR)
    const token = await login(fixture)
    const categoryId = await createCategory()
    const draft = await publishableDraft(token, categoryId)
    const published = await publish(token, draft.productId, draft.draftRevision)

    const unpublished = await publishableDraft(token, categoryId)

    const response = await request(app.getHttpServer())
      .get(`/products?pageSize=100`)
      .set(auth(token))

    expect(response.status).toBe(200)
    const publishedRow = response.body.items.find(
      (item: { id: string }) => item.id === draft.productId,
    )
    const draftRow = response.body.items.find(
      (item: { id: string }) => item.id === unpublished.productId,
    )

    expect(publishedRow.passport).toEqual({
      publicUuid: published.publicUuid,
      publicUrl: `${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`,
      qrDownloadUrl: `/passport/${published.publicUuid}/qr.png`,
      currentVersionNumber: 1,
      sourceDraftRevision: draft.draftRevision,
      hasUnpublishedChanges: false,
      currentPublishedAt: published.publishedAt,
    })
    expect(draftRow.passport).toBeNull()
    expect(draftRow.status).toBe('DRAFT')
    expect(publishedRow.coverImageAssetId).toBe(draft.coverAssetId)
    expect(draftRow.coverImageAssetId).toBe(unpublished.coverAssetId)

    // Editing the draft flips the unpublished-changes flag without moving the version.
    const edited = await patchDraft(token, draft.productId, draft.draftRevision, {
      description: 'Unpublished edit',
    })
    const afterEdit = await request(app.getHttpServer())
      .get(`/products?pageSize=100`)
      .set(auth(token))
    const editedRow = afterEdit.body.items.find(
      (item: { id: string }) => item.id === draft.productId,
    )
    expect(editedRow.passport.hasUnpublishedChanges).toBe(true)
    expect(editedRow.passport.currentVersionNumber).toBe(1)
    expect(editedRow.draftRevision).toBe(edited)
  })
})
