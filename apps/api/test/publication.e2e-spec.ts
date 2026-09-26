import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import sharp from 'sharp'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { validateEnvironment } from '../src/config/configuration.js'
import { AssetState, UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { collectPublicationGaps } from '../src/publication/publication.policy.js'
import type { PublishableDraft } from '../src/publication/publication.types.js'
import { pdfFixture, pngFixture } from './asset-fixtures.js'

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
  firstPublishedAt: string
  publishedAt: string
  publicUrl: string
  qrTargetUrl: string
  verificationStatus: string
  replayed: boolean
}

let app: INestApplication
let prisma: PrismaService

/** Deliberately not the development default; set by `test/setup-env.cjs`. */
const PUBLIC_APP_ORIGIN = 'https://public.example.test'
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

/**
 * A draft that satisfies every publication prerequisite.
 *
 * Returns the uploaded asset ids so a test can change an asset's state after it was
 * attached and prove that publication revalidates it rather than trusting the draft.
 */
async function publishableDraft(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<{
  id: string
  draftRevision: number
  coverAssetId: string
  galleryAssetId: string
  documentAssetId: string
  certificationAssetId: string
}> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const gallery = await uploadAsset(token, await pngFixture(48, 32), 'gallery.png')
  const documentPdf = await uploadAsset(token, pdfFixture(), 'document.pdf')
  const certificationPdf = await uploadAsset(token, pdfFixture(), 'certificate.pdf')

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
    id: response.body.id as string,
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
    expect(published.productId).toBe(draft.id)
    expect(published.publicUrl).toBe(`${PUBLIC_APP_ORIGIN}/passport/${published.publicUuid}`)
    expect(published.qrTargetUrl).toBe(`${PUBLIC_APP_ORIGIN}/q/${published.publicUuid}`)
    expect(published.verificationStatus).toBe('VERIFIED')
    expect(Number.isNaN(Date.parse(published.firstPublishedAt))).toBe(false)
    expect(Number.isNaN(Date.parse(published.publishedAt))).toBe(false)
    // The response carries metadata only: never QR bytes or the snapshot.
    expect(JSON.stringify(published)).not.toContain('qrPngBytes')
    expect(JSON.stringify(published)).not.toContain('publicSnapshot')

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
    // Company-logo participation is not part of Stage 4.1.
    expect(roles).not.toContain('COMPANY_LOGO')

    // Every referenced asset is retained, with its role, and nothing extra.
    const retainedSet = (
      await prisma.passportVersionAsset.findMany({
        where: { versionId: published.versionId },
        select: { assetId: true, role: true },
      })
    )
      .map((row) => `${row.role}:${row.assetId}`)
      .sort()
    expect(retainedSet).toEqual(
      [
        `COVER_IMAGE:${draft.coverAssetId}`,
        `GALLERY_IMAGE:${draft.galleryAssetId}`,
        `PRODUCT_DOCUMENT:${draft.documentAssetId}`,
        `CERTIFICATION_PDF:${draft.certificationAssetId}`,
      ].sort(),
    )

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
    // The brand block carries the display name only in Stage 4.1.
    expect(snapshot).not.toContain('logoAssetId')

    // Stage 4.1 asserted that publication started no audit trail, because the audit bonus
    // did not exist yet. Stage 6 deliberately changes that: creating a new immutable version
    // is an audited mutation, so exactly one publication event commits with it. A publish
    // still audits nothing else — no Product row and no version row of its own.
    const publicationAudit = await prisma.auditEvent.findMany({
      where: { actorId: fixture.userId, action: 'PASSPORT_VERSION_PUBLISHED' },
    })
    expect(publicationAudit).toHaveLength(1)
    expect(publicationAudit[0]?.entityType).toBe('Passport')
    expect(publicationAudit[0]?.entityId).toBe(published.passportId)
    // Nothing else was audited by the publish itself. The only other row for this actor is
    // the draft creation the fixture performed.
    const otherActions = await prisma.auditEvent.findMany({
      where: { actorId: fixture.userId, action: { not: 'PASSPORT_VERSION_PUBLISHED' } },
      select: { action: true },
    })
    expect(otherActions.map((row) => row.action)).toEqual(['PRODUCT_CREATED'])
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
    // Replay is indistinguishable from the original call apart from the `replayed` flag,
    // so no Passport-level field can silently disappear from one branch.
    expect({ ...replayBody, replayed: false }).toEqual(firstBody)

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

describe('Publication completeness', () => {
  it('requires every sustainability field, not merely a sustainability row', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const full = {
      carbonKgCo2e: 12.5,
      waterLitres: 340,
      recycledPercent: 45,
      repairabilityScore: 7.5,
      recyclable: true,
    }

    const cases: Array<[string, Record<string, unknown>]> = [
      ['carbon footprint', { ...full, carbonKgCo2e: null }],
      ['water consumption', { ...full, waterLitres: null }],
      ['recycled material percentage', { ...full, recycledPercent: null }],
      ['repairability score', { ...full, repairabilityScore: null }],
      ['recyclable flag', { ...full, recyclable: null }],
    ]

    for (const [label, sustainability] of cases) {
      const draft = await publishableDraft(token, categoryId, { sustainability })
      const attempt = await publish(token, draft.id, draft.draftRevision)
      expect(attempt.status).toBe(400)
      expect(attempt.body.code).toBe('PUBLICATION_INCOMPLETE')
      expect(attempt.body.message).toContain(label)
      // A rejected publication leaves nothing behind.
      expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
    }
  }, 120_000)

  it('requires every certification field, including the expiration date', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const base = {
      name: 'ISO 9001',
      issuingAuthority: 'TUV',
      issueDate: '2025-01-01',
      expirationDate: '2030-01-01',
    }

    const cases: Array<[string, Record<string, unknown>]> = [
      ['name', { ...base, name: null }],
      ['issuing authority', { ...base, issuingAuthority: null }],
      ['issue date', { ...base, issueDate: null }],
      ['expiration date', { ...base, expirationDate: null }],
      ['PDF', { ...base }],
    ]

    for (const [label, certification] of cases) {
      const draft = await publishableDraft(token, categoryId, {
        certifications: [certification],
      })
      const attempt = await publish(token, draft.id, draft.draftRevision)
      expect(attempt.status).toBe(400)
      expect(attempt.body.code).toBe('PUBLICATION_INCOMPLETE')
      expect(attempt.body.message).toContain(label)
      expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
    }
  }, 120_000)

  it('reports a reversed certification date range as a publication gap', () => {
    // This state is unreachable through any write path: the database CHECK constraint
    // `Certification_expiration_not_before_issue_ck` refuses it and draft saves refuse it
    // first. The publication rule is therefore defence in depth, so it is proven directly
    // against the policy rather than by fabricating an impossible row.
    const draft: PublishableDraft = {
      id: randomUUID(),
      name: 'Product',
      sku: 'SKU',
      serialNumber: 'SN',
      categoryId: randomUUID(),
      categoryName: 'Category',
      description: 'Description',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      materials: [],
      sustainability: {
        carbonKgCo2e: 1,
        waterLitres: 2,
        recycledPercent: 3,
        repairabilityScore: 4,
        recyclable: true,
      },
      certifications: [
        {
          name: 'ISO 9001',
          issuingAuthority: 'TUV',
          issueDate: '2025-01-01',
          expirationDate: '2030-01-01',
          pdfAssetId: randomUUID(),
        },
      ],
      images: [{ assetId: randomUUID(), role: 'COVER', position: 0, altText: null }],
      documents: [],
    }

    // The constructed draft is genuinely publishable ...
    expect(collectPublicationGaps(draft)).toEqual([])

    // ... and the ordering rule is what rejects the reversed range.
    const certification = draft.certifications[0]
    if (certification === undefined) {
      throw new Error('the constructed fixture should carry one certification')
    }
    const gaps = collectPublicationGaps({
      ...draft,
      certifications: [{ ...certification, issueDate: '2030-01-01', expirationDate: '2025-01-01' }],
    })
    expect(gaps.join(' | ')).toMatch(/expiration date must not be before its issue date/)
  })

  it('keeps zero certifications publishable', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory(), { certifications: [] })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(200)
    expect((attempt.body as PublicationResult).versionNumber).toBe(1)
  })

  it('rejects a production date in the future using date-only semantics', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    // A clearly future calendar date, so the test does not depend on tomorrow.
    const draft = await publishableDraft(token, await createCategory(), {
      productionDate: '2099-12-31',
    })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_INCOMPLETE')
    expect(attempt.body.message).toMatch(/production date must not be in the future/)
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })
})

describe('Publication asset revalidation', () => {
  /** Flips an attached asset out of the accepted state after it was attached. */
  async function quarantine(assetId: string): Promise<void> {
    await prisma.asset.update({
      where: { id: assetId },
      data: { state: AssetState.QUARANTINED },
    })
  }

  it('rejects a cover image that is no longer accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    await quarantine(draft.coverAssetId)
    const attempt = await publish(token, draft.id, draft.draftRevision)

    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })

  it('rejects a gallery image that is no longer accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    await quarantine(draft.galleryAssetId)
    const attempt = await publish(token, draft.id, draft.draftRevision)

    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')
  })

  it('rejects a document that is no longer accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    await quarantine(draft.documentAssetId)
    const attempt = await publish(token, draft.id, draft.draftRevision)

    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')
  })

  it('rejects a certification PDF that is no longer accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    await quarantine(draft.certificationAssetId)
    const attempt = await publish(token, draft.id, draft.draftRevision)

    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')
  })

  it('leaves the published version untouched when a republish is rejected', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const first = await publish(token, draft.id, draft.draftRevision)
    expect(first.status).toBe(200)
    const firstBody = first.body as PublicationResult

    // Move the draft forward and take the cover out of the accepted state.
    const edited = await request(app.getHttpServer())
      .patch(`/products/${draft.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: draft.draftRevision, description: 'Edited' })
    expect(edited.status).toBe(200)
    await quarantine(draft.coverAssetId)

    const attempt = await publish(token, draft.id, edited.body.draftRevision)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')

    // No new version, and the current pointer still names version 1.
    expect(
      await prisma.passportVersion.count({ where: { passportId: firstBody.passportId } }),
    ).toBe(1)
    const passport = await prisma.passport.findUniqueOrThrow({
      where: { id: firstBody.passportId },
      select: { currentVersionId: true },
    })
    expect(passport.currentVersionId).toBe(firstBody.versionId)
    expect(
      await prisma.passportVersionAsset.count({ where: { versionId: firstBody.versionId } }),
    ).toBeGreaterThan(0)
  })

  it('rejects an asset of the wrong family at publication', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    // The draft API refuses to attach a PDF as an image, so the row is written
    // directly to prove publication validates the family itself.
    await prisma.productImage.create({
      data: {
        productId: draft.id,
        assetId: draft.documentAssetId,
        role: 'GALLERY',
        position: 9,
        altText: null,
      },
    })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_TYPE_INVALID')
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })

  it('rejects a cross-company asset reference without disclosing its existence', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const draft = await publishableDraft(ownerToken, await createCategory())

    const stranger = await createFixture()
    const strangerToken = await login(stranger)
    const foreignAsset = await uploadAsset(strangerToken, await pngFixture(), 'foreign.png')

    // Normal draft APIs correctly prevent this, so the relation is written directly to
    // prove publication refuses it too.
    await prisma.productImage.create({
      data: {
        productId: draft.id,
        assetId: foreignAsset,
        role: 'GALLERY',
        position: 8,
        altText: null,
      },
    })

    const attempt = await publish(ownerToken, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_ASSET_UNAVAILABLE')
    // The message must not reveal that the asset exists elsewhere.
    expect(attempt.body.message).not.toContain('foreign.png')
    expect(JSON.stringify(attempt.body)).not.toMatch(/company|owner|other/i)
  })
})

describe('Publication concurrency under an explicit row lock', () => {
  it('writes nothing while the product row lock is held, then publishes once', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    let releaseHolder!: () => void
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve
    })

    // Hold the product row on a separate connection, so the publish below has to wait.
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${draft.id}::uuid FOR UPDATE`
        await held
      },
      { timeout: 20_000 },
    )

    // Let the holder actually acquire the lock.
    await new Promise((resolve) => setTimeout(resolve, 300))

    const pending = publish(token, draft.id, draft.draftRevision)

    // While the lock is held, publication must not have written anything. If the
    // `FOR UPDATE` were removed this window would contain a finished publication, so the
    // assertion fails deterministically rather than depending on request interleaving.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)

    releaseHolder()
    await holder

    const result = await pending
    expect(result.status).toBe(200)
    const body = result.body as PublicationResult
    expect(await prisma.passportVersion.count({ where: { passportId: body.passportId } })).toBe(1)
  }, 30_000)
})

describe('Retained asset integrity', () => {
  it('retains one row per asset when one PDF is both a document and a certification PDF', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const sharedPdf = await uploadAsset(token, pdfFixture(), 'shared.pdf')

    const draft = await publishableDraft(token, await createCategory(), {
      documents: [{ assetId: sharedPdf, kind: 'MANUAL', title: 'Manual' }],
      certifications: [
        {
          name: 'ISO 9001',
          issuingAuthority: 'TUV',
          issueDate: '2025-01-01',
          expirationDate: '2030-01-01',
          pdfAssetId: sharedPdf,
        },
      ],
    })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(200)
    const body = attempt.body as PublicationResult

    // `PassportVersionAsset` is keyed (versionId, assetId), so one asset yields one row.
    const rows = await prisma.passportVersionAsset.findMany({
      where: { versionId: body.versionId },
      select: { assetId: true },
    })
    expect(rows.filter((row) => row.assetId === sharedPdf)).toHaveLength(1)
  })

  it('keeps version 1 retained references after an image is unlinked in a republish', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await publishableDraft(token, await createCategory())

    const first = await publish(token, draft.id, draft.draftRevision)
    expect(first.status).toBe(200)
    const firstBody = first.body as PublicationResult

    const before = await prisma.passportVersionAsset.findMany({
      where: { versionId: firstBody.versionId },
      select: { assetId: true, role: true },
    })

    // Unlink the gallery image and republish.
    const edited = await request(app.getHttpServer())
      .patch(`/products/${draft.id}`)
      .set(auth(token))
      .send({
        expectedDraftRevision: draft.draftRevision,
        images: [{ assetId: draft.coverAssetId, role: 'COVER', altText: 'front' }],
      })
    expect(edited.status).toBe(200)
    const second = await publish(token, draft.id, edited.body.draftRevision)
    expect(second.status).toBe(200)

    // Version 1 still retains the gallery image it exposed.
    const after = await prisma.passportVersionAsset.findMany({
      where: { versionId: firstBody.versionId },
      select: { assetId: true, role: true },
    })
    expect(after).toEqual(before)
    expect(after.some((row) => row.assetId === draft.galleryAssetId)).toBe(true)
  })
})

describe('Publication completeness edge cases', () => {
  it('rejects a certification whose name or authority is blank rather than null', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const pdf = await uploadAsset(token, pdfFixture(), 'blank.pdf')

    // The DTO accepts empty strings and the save path stores them unchanged, so a bare
    // null check would let an unnamed certification publish.
    const draft = await publishableDraft(token, await createCategory(), {
      certifications: [
        {
          name: '',
          issuingAuthority: '   ',
          issueDate: '2025-01-01',
          expirationDate: '2030-01-01',
          pdfAssetId: pdf,
        },
      ],
    })

    const attempt = await publish(token, draft.id, draft.draftRevision)
    expect(attempt.status).toBe(400)
    expect(attempt.body.code).toBe('PUBLICATION_INCOMPLETE')
    expect(attempt.body.message).toContain('name')
    expect(attempt.body.message).toContain('issuing authority')
    expect(await prisma.passport.count({ where: { productId: draft.id } })).toBe(0)
  })
})

describe('PUBLIC_APP_ORIGIN validation', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'test-secret-value',
    NODE_ENV: 'development',
  }

  it('rejects origins that are empty, relative, not http(s), or carry a path', () => {
    // `///` previously reduced to an empty string after slash-stripping, which would have
    // published QR codes encoding an unscannable relative target.
    for (const bad of [
      '///',
      'https://',
      'not-a-url',
      'ftp://example.test',
      'https://example.test/path',
    ]) {
      expect(() => validateEnvironment({ ...base, PUBLIC_APP_ORIGIN: bad })).toThrow(
        /PUBLIC_APP_ORIGIN/,
      )
    }
  })

  it('accepts an absolute origin and strips a trailing slash', () => {
    expect(
      validateEnvironment({ ...base, PUBLIC_APP_ORIGIN: 'https://ok.example.test/' })
        .PUBLIC_APP_ORIGIN,
    ).toBe('https://ok.example.test')
  })
})
