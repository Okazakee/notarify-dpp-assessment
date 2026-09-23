import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import sharp from 'sharp'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { pdfFixture, pngFixture } from './asset-fixtures.js'

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

type PublicationResult = {
  passportId: string
  publicUuid: string
  versionId: string
  versionNumber: number
  sourceDraftRevision: number
  publishedAt: string
  qrTargetUrl: string
  replayed: boolean
}

let app: INestApplication
let prisma: PrismaService
const fixtures: Fixture[] = []
const categoryIds: string[] = []
const productIds: string[] = []

async function createFixture(): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Publication test ${randomUUID()}` },
  })
  const email = `publication-${randomUUID()}@example.test`
  const password = `PublicationPassword-${randomUUID()}`
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
    data: { stableCode: `PUB-CAT-${randomUUID()}`, name: 'Publication category' },
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
): Promise<{ id: string; draftRevision: number }> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const pdf = await uploadAsset(token, pdfFixture(), 'document.pdf')

  const response = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name: 'Publishable product',
      sku: 'SKU-PUBLISH',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Ready to publish',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      sustainability: { carbonKgCo2e: 12.5, recyclable: true },
      materials: [
        { name: 'Aluminium', percentage: 60, position: 0 },
        { name: 'Steel', percentage: 40, position: 1 },
      ],
      images: [{ assetId: cover, role: 'COVER', altText: 'front' }],
      documents: [{ assetId: pdf, kind: 'MANUAL', title: 'Manual' }],
      certifications: [
        {
          name: 'ISO 9001',
          issuingAuthority: 'TUV',
          issueDate: '2025-01-01',
          pdfAssetId: pdf,
        },
      ],
      ...overrides,
    })

  expect(response.status).toBe(201)
  productIds.push(response.body.id as string)
  return { id: response.body.id as string, draftRevision: response.body.draftRevision as number }
}

async function publish(
  token: string,
  productId: string,
  expectedDraftRevision: number,
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post(`/products/${productId}/publish`)
    .set(auth(token))
    .send({ expectedDraftRevision })
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
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: fixtures.map((f) => f.userId) } },
    })
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

describe('Publication core', () => {
  it('requires authentication and refuses another company product', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())

    const anonymous = await request(app.getHttpServer())
      .post(`/products/${draft.id}/publish`)
      .send({ expectedDraftRevision: 0 })
    expect(anonymous.status).toBe(401)

    const stranger = await createFixture()
    const strangerToken = await login(stranger)
    const crossCompany = await publish(strangerToken, draft.id, draft.draftRevision)
    expect(crossCompany.status).toBe(404)
    expect(crossCompany.body.code).toBe('PRODUCT_NOT_FOUND')

    // Nothing was published for the stranger's attempt.
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })

  it('refuses to publish an incomplete draft and names the missing fields', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const response = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ name: 'Incomplete' })
    productIds.push(response.body.id as string)

    const attempt = await publish(token, response.body.id as string, 0)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_INCOMPLETE')
    // Field-level terms, so the editor can explain the failure.
    expect(attempt.body.message).toMatch(/sku/)
    expect(attempt.body.message).toMatch(/cover image/)
    expect(attempt.body.message).toMatch(/sustainability/)

    expect(await prisma.passport.count({ where: { productId: response.body.id } })).toBe(0)
  })

  it('refuses a material total that is not 100, and a certification without a PDF', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const badTotal = await publishableDraft(token, categoryId, {
      materials: [{ name: 'Only', percentage: 60, position: 0 }],
    })
    const totalAttempt = await publish(token, badTotal.id, badTotal.draftRevision)
    expect(totalAttempt.status).toBe(400)
    expect(totalAttempt.body.message).toMatch(/total 100/)

    const missingPdf = await publishableDraft(token, categoryId, {
      certifications: [{ name: 'No PDF', issuingAuthority: 'TUV', issueDate: '2025-01-01' }],
    })
    const pdfAttempt = await publish(token, missingPdf.id, missingPdf.draftRevision)
    expect(pdfAttempt.status).toBe(400)
    expect(pdfAttempt.body.message).toMatch(/PDF/)
  })

  it('rejects a stale expected revision without publishing', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const stale = await publish(token, draft.id, draft.draftRevision + 5)
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('PRODUCT_REVISION_CONFLICT')
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })

  it('publishes an immutable version with a stable identity, retained assets and a real QR', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const first = await publish(token, draft.id, draft.draftRevision)
    expect(first.status).toBe(200)
    const published = first.body as PublicationResult
    expect(published.versionNumber).toBe(1)
    expect(published.replayed).toBe(false)
    expect(published.qrTargetUrl).toContain(`/q/${published.publicUuid}`)

    const passport = await prisma.passport.findUniqueOrThrow({
      where: { productId: draft.id },
      select: { publicUuid: true, currentVersionId: true, qrPngBytes: true, qrTargetUrl: true },
    })
    expect(passport.publicUuid).toBe(published.publicUuid)
    expect(passport.currentVersionId).toBe(published.versionId)

    // The QR artifact is a real decodable PNG with a quiet zone, not a placeholder.
    const qr = Buffer.from(passport.qrPngBytes)
    const metadata = await sharp(qr).metadata()
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBeGreaterThanOrEqual(100)
    expect(metadata.width).toBe(metadata.height)

    // Every referenced asset is retained relationally against the version.
    const retained = await prisma.passportVersionAsset.findMany({
      where: { versionId: published.versionId },
      select: { role: true },
    })
    const roles = retained.map((row) => row.role).sort()
    expect(roles).toContain('COVER_IMAGE')
    expect(roles).toContain('PRODUCT_DOCUMENT')

    // The snapshot carries ids and content, never bytes or origin-dependent URLs.
    const version = await prisma.passportVersion.findUniqueOrThrow({
      where: { id: published.versionId },
      select: { publicSnapshot: true, snapshotSchemaVersion: true, sourceDraftRevision: true },
    })
    expect(version.snapshotSchemaVersion).toBe(1)
    expect(version.sourceDraftRevision).toBe(draft.draftRevision)
    const snapshot = JSON.stringify(version.publicSnapshot)
    expect(snapshot).not.toContain('bytes')
    expect(snapshot).not.toContain('base64')
    expect(snapshot).toContain('PROTOTYPE_APPLICATION_LEVEL')

    // A publication writes its audit row in the same transaction.
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: published.versionId, action: 'PUBLICATION_PUBLISHED' },
    })
    expect(audit).not.toBeNull()
  })

  it('returns the existing version when the same revision is published again', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const first = await publish(token, draft.id, draft.draftRevision)
    const replay = await publish(token, draft.id, draft.draftRevision)

    expect(replay.status).toBe(200)
    const firstBody = first.body as PublicationResult
    const replayBody = replay.body as PublicationResult
    expect(replayBody.replayed).toBe(true)
    expect(replayBody.versionId).toBe(firstBody.versionId)
    expect(replayBody.publicUuid).toBe(firstBody.publicUuid)

    // Exactly one version exists, so a retry cannot duplicate history.
    expect(
      await prisma.passportVersion.count({ where: { passportId: firstBody.passportId } }),
    ).toBe(1)
  })

  it('keeps the published version immutable when the draft is edited and republished', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const first = await publish(token, draft.id, draft.draftRevision)
    const firstBody = first.body as PublicationResult

    const before = await prisma.passportVersion.findUniqueOrThrow({
      where: { id: firstBody.versionId },
      select: { publicSnapshot: true },
    })

    const edited = await request(app.getHttpServer())
      .patch(`/products/${draft.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: draft.draftRevision, description: 'Edited after publication' })
    expect(edited.status).toBe(200)

    const second = await publish(token, draft.id, edited.body.draftRevision)
    expect(second.status).toBe(200)
    const secondBody = second.body as PublicationResult
    expect(secondBody.versionNumber).toBe(2)
    // The public identity and its QR target survive a republish.
    expect(secondBody.publicUuid).toBe(firstBody.publicUuid)
    expect(secondBody.qrTargetUrl).toBe(firstBody.qrTargetUrl)
    expect(secondBody.versionId).not.toBe(firstBody.versionId)

    const after = await prisma.passportVersion.findUniqueOrThrow({
      where: { id: firstBody.versionId },
      select: { publicSnapshot: true },
    })
    // Version 1 still holds the pre-edit content.
    expect(after.publicSnapshot).toEqual(before.publicSnapshot)
    expect(JSON.stringify(after.publicSnapshot)).toContain('Ready to publish')
    expect(JSON.stringify(after.publicSnapshot)).not.toContain('Edited after publication')

    // The current pointer moved to the new version.
    const passport = await prisma.passport.findUniqueOrThrow({
      where: { id: firstBody.passportId },
      select: { currentVersionId: true },
    })
    expect(passport.currentVersionId).toBe(secondBody.versionId)
  })

  it('creates exactly one version when two publishes race on the same revision', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const [left, right] = await Promise.all([
      publish(token, draft.id, draft.draftRevision),
      publish(token, draft.id, draft.draftRevision),
    ])

    // The row lock serialises them: the loser observes the version already created for
    // that revision and replays it rather than producing a second one.
    expect(left.status).toBe(200)
    expect(right.status).toBe(200)
    const leftBody = left.body as PublicationResult
    const rightBody = right.body as PublicationResult
    expect(leftBody.versionId).toBe(rightBody.versionId)

    expect(await prisma.passportVersion.count({ where: { passportId: leftBody.passportId } })).toBe(
      1,
    )
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(1)
  })

  it('refuses to publish a soft-deleted product', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    await prisma.product.update({ where: { id: draft.id }, data: { deletedAt: new Date() } })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(404)
    expect(attempt.body.code).toBe('PRODUCT_NOT_FOUND')
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })

  it('rejects a malformed product id and a malformed revision', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const badId = await publish(token, 'not-a-uuid', 0)
    expect(badId.status).toBe(404)
    expect(badId.body.code).toBe('PRODUCT_NOT_FOUND')

    const draft = await publishableDraft(token, await createCategory())
    const badRevision = await publish(token, draft.id, -1)
    expect(badRevision.status).toBe(400)
    expect(badRevision.body.code).toBe('VALIDATION_ERROR')
  })
})
