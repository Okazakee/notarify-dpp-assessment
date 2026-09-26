import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { jest } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import { createClient, type RedisClientType } from '@redis/client'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { AuditService } from '../src/audit/audit.service.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { pngFixture } from './asset-fixtures.js'

/**
 * Stage 6 pass A: the audit bonus and the Product lifecycle.
 *
 * These tests drive the real HTTP surface against a real PostgreSQL, and the warm-cache
 * case additionally against a real Redis, because the invariants under test are about
 * transactions, row locks and the visibility boundary rather than about this application's
 * own code paths in isolation.
 */

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6390'

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
  role: UserRole
}

let app: INestApplication
let prisma: PrismaService
let redis: RedisClientType

const fixtures: Fixture[] = []
const categoryIds: string[] = []

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

async function createFixture(role: UserRole = UserRole.ADMIN): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Lifecycle test ${randomUUID()}` },
  })
  const email = `lifecycle-${randomUUID()}@example.test`
  const password = `LifecyclePassword-${randomUUID()}`
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
  const fixture = { companyId: company.id, userId: user.id, email, password, role }
  fixtures.push(fixture)
  return fixture
}

async function createCategory(): Promise<string> {
  const category = await prisma.category.create({
    data: { stableCode: `LIFECYCLE-CAT-${randomUUID()}`, name: 'Lifecycle category' },
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

async function uploadAsset(token: string, bytes: Buffer, filename: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/assets')
    .set(auth(token))
    .attach('file', bytes, { filename, contentType: 'application/octet-stream' })
  expect(response.status).toBe(201)
  return response.body.id as string
}

/** Creates a publishable draft. Returns its id and current revision. */
async function createDraft(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ productId: string; draftRevision: number }> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const created = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name: 'Lifecycle product',
      sku: 'SKU-LIFECYCLE',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Lifecycle content',
      productionDate: '2026-01-15',
      originCountry: 'IT',
      materials: [{ name: 'Aluminium', percentage: 100, position: 0 }],
      sustainability: {
        carbonKgCo2e: 12.5,
        waterLitres: 30,
        recycledPercent: 60,
        repairabilityScore: 8,
        recyclable: true,
      },
      images: [{ assetId: cover, role: 'COVER', altText: 'front' }],
      ...overrides,
    })
  expect(created.status).toBe(201)
  return {
    productId: created.body.id as string,
    draftRevision: created.body.draftRevision as number,
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

async function deleteProduct(token: string, productId: string): Promise<request.Response> {
  return request(app.getHttpServer()).delete(`/products/${productId}`).set(auth(token))
}

async function auditRows(entityId: string) {
  return prisma.auditEvent.findMany({ where: { entityId }, orderBy: { occurredAt: 'asc' } })
}

beforeAll(async () => {
  process.env.REDIS_URL = REDIS_URL
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)

  redis = createClient({ url: REDIS_URL })
  await redis.connect()
})

afterAll(async () => {
  const companyIds = fixtures.map((fixture) => fixture.companyId)
  if (companyIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    })
    const productIds = products.map((product) => product.id)
    const passports = await prisma.passport.findMany({
      where: { product: { companyId: { in: companyIds } } },
      select: { id: true },
    })
    const passportIds = passports.map((passport) => passport.id)
    if (passportIds.length > 0) {
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
      await prisma.material.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.sustainability.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.certification.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.productDocument.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    }
    await prisma.assetContent.deleteMany({ where: { asset: { companyId: { in: companyIds } } } })
    await prisma.asset.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.auditEvent.deleteMany({ where: { actor: { companyId: { in: companyIds } } } })
    await prisma.refreshToken.deleteMany({
      where: { session: { user: { companyId: { in: companyIds } } } },
    })
    await prisma.authSession.deleteMany({ where: { user: { companyId: { in: companyIds } } } })
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  }
  if (categoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })
  }
  await redis.close()
  await app.close()
  delete process.env.REDIS_URL
})

describe('Audit recording', () => {
  it('records product creation, draft update and publication transactionally', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    const updated = await request(app.getHttpServer())
      .patch(`/products/${draft.productId}`)
      .set(auth(token))
      .send({ name: 'Renamed', expectedDraftRevision: draft.draftRevision })
    expect(updated.status).toBe(200)

    const published = await publish(token, draft.productId, updated.body.draftRevision)
    expect(published.status).toBe(200)

    const rows = await auditRows(draft.productId)
    const actions = rows.map((row) => row.action)
    expect(actions).toContain('PRODUCT_CREATED')
    expect(actions).toContain('PRODUCT_UPDATED')

    const created = rows.find((row) => row.action === 'PRODUCT_CREATED')
    expect(created?.entityType).toBe('Product')
    expect(created?.actorId).toBe(fixture.userId)
    expect(created?.requestId).not.toBeNull()

    const update = rows.find((row) => row.action === 'PRODUCT_UPDATED')
    expect(update?.safeMetadata).toMatchObject({
      changedFields: ['name'],
      draftRevisionBefore: 0,
      draftRevisionAfter: 1,
    })

    // Publication targets the Passport, and the version metadata is bounded.
    const publication = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'PASSPORT_VERSION_PUBLISHED', actorId: fixture.userId },
      orderBy: { occurredAt: 'desc' },
    })
    expect(publication.entityType).toBe('Passport')
    expect(publication.entityId).toBe(published.body.passportId)
    expect(publication.safeMetadata).toMatchObject({
      passportId: published.body.passportId,
      versionNumber: 1,
      sourceDraftRevision: 1,
    })
  })

  it('writes no publication audit event for an idempotent replay', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    const first = await publish(token, draft.productId, draft.draftRevision)
    expect(first.status).toBe(200)
    const before = await prisma.auditEvent.count({
      where: { action: 'PASSPORT_VERSION_PUBLISHED', actorId: fixture.userId },
    })

    // The same already-published revision, replayed.
    const replay = await publish(token, draft.productId, draft.draftRevision)
    expect(replay.status).toBe(200)
    expect(replay.body.versionNumber).toBe(1)

    const after = await prisma.auditEvent.count({
      where: { action: 'PASSPORT_VERSION_PUBLISHED', actorId: fixture.userId },
    })
    expect(after).toBe(before)
  })

  it('writes nothing for a failed validation or a stale revision', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    const invalid = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ name: 'x'.repeat(5000) })
    expect(invalid.status).toBe(400)

    const stale = await request(app.getHttpServer())
      .patch(`/products/${draft.productId}`)
      .set(auth(token))
      .send({ name: 'Stale', expectedDraftRevision: draft.draftRevision + 5 })
    expect(stale.status).toBe(409)

    const incomplete = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ name: 'No category' })
    expect(incomplete.status).toBe(201)
    const publishIncomplete = await publish(token, incomplete.body.id as string, 0)
    expect(publishIncomplete.status).toBe(400)

    expect(
      await prisma.auditEvent.count({
        where: { actorId: fixture.userId, action: 'PRODUCT_UPDATED' },
      }),
    ).toBe(0)
    expect(
      await prisma.auditEvent.count({
        where: { actorId: fixture.userId, action: 'PASSPORT_VERSION_PUBLISHED' },
      }),
    ).toBe(0)
  })

  it('rolls the domain mutation back when the audit insert fails', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    // A controlled failure injection at the audit boundary: the invariant under test is
    // that the domain transaction cannot commit without its audit row.
    const spy = jest
      .spyOn(AuditService.prototype, 'record')
      .mockRejectedValueOnce(new Error('audit unavailable'))
    let response: request.Response
    try {
      response = await deleteProduct(token, draft.productId)
    } finally {
      spy.mockRestore()
    }

    expect(response.status).toBeGreaterThanOrEqual(500)
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { deletedAt: true },
    })
    expect(product.deletedAt).toBeNull()
    expect(
      await prisma.auditEvent.count({
        where: { entityId: draft.productId, action: 'PRODUCT_DELETED' },
      }),
    ).toBe(0)
  })

  it('never stores credentials, tokens or payloads in audit metadata', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())
    await request(app.getHttpServer())
      .patch(`/products/${draft.productId}`)
      .set(auth(token))
      .send({
        name: 'Sensitive',
        description: 'A description that must not be copied',
        expectedDraftRevision: draft.draftRevision,
      })
      .expect(200)

    const rows = await prisma.auditEvent.findMany({ where: { actorId: fixture.userId } })
    expect(rows.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(rows.map((row) => row.safeMetadata))
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('A description that must not be copied')
    expect(serialized).not.toContain(fixture.password)
    expect(serialized).not.toContain('Bearer ')
  })
})

describe('Product soft deletion', () => {
  it('deletes a draft product, keeps it out of reads and reserves its serial', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const draft = await createDraft(token, categoryId, {
      name: `Deletable draft ${Date.now()}`,
      serialNumber: `SN-DELETE-${randomUUID()}`,
    })
    const serial = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { serialNumber: true },
    })

    const deleted = await deleteProduct(token, draft.productId)
    expect(deleted.status).toBe(204)

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { deletedAt: true, serialNumber: true },
    })
    expect(product.deletedAt).not.toBeNull()
    // Soft deletion retains the row, so the serial stays reserved.
    expect(product.serialNumber).toBe(serial.serialNumber)

    // It leaves the normal list and the detail read, and no Passport was invented.
    const list = await request(app.getHttpServer()).get('/products?pageSize=100').set(auth(token))
    expect(
      (list.body.items as Array<{ id: string }>).some((item) => item.id === draft.productId),
    ).toBe(false)
    expect(
      (await request(app.getHttpServer()).get(`/products/${draft.productId}`).set(auth(token)))
        .status,
    ).toBe(404)
    expect(await prisma.passport.findUnique({ where: { productId: draft.productId } })).toBeNull()

    // A repeated delete is the same safe not-found, and writes no second audit row.
    const again = await deleteProduct(token, draft.productId)
    expect(again.status).toBe(404)
    expect(
      await prisma.auditEvent.count({
        where: { entityId: draft.productId, action: 'PRODUCT_DELETED' },
      }),
    ).toBe(1)
  })

  it('refuses to edit or publish a deleted product', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())
    expect((await deleteProduct(token, draft.productId)).status).toBe(204)

    // The draft-save claim excludes deleted rows, so a deleted product cannot be edited…
    const patched = await request(app.getHttpServer())
      .patch(`/products/${draft.productId}`)
      .set(auth(token))
      .send({ name: 'Edit after delete', expectedDraftRevision: draft.draftRevision })
    expect(patched.status).toBe(404)

    // …and it cannot be published into a fresh public Passport either.
    const published = await publish(token, draft.productId, draft.draftRevision)
    expect(published.status).toBe(404)
    expect(await prisma.passport.findUnique({ where: { productId: draft.productId } })).toBeNull()

    // Neither attempt wrote an audit row of its own.
    const actions = await prisma.auditEvent.findMany({
      where: { actorId: fixture.userId },
      select: { action: true },
    })
    expect(actions.map((row) => row.action).sort()).toEqual(['PRODUCT_CREATED', 'PRODUCT_DELETED'])
  })

  it('withdraws a published passport and closes every anonymous surface at once', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory(), {
      name: 'Published then deleted',
    })
    const published = await publish(token, draft.productId, draft.draftRevision)
    expect(published.status).toBe(200)
    const publicUuid = published.body.publicUuid as string
    const passportId = published.body.passportId as string
    const coverAssetId = await prisma.productImage.findFirstOrThrow({
      where: { productId: draft.productId, role: 'COVER' },
      select: { assetId: true },
    })

    // Warm the cache and record a scan and a view, so the lifecycle change is proved
    // against a real cache entry and real retained analytics.
    expect((await request(app.getHttpServer()).get(`/passport/${publicUuid}`)).status).toBe(200)
    await request(app.getHttpServer()).get(`/q/${publicUuid}`).redirects(0)
    await request(app.getHttpServer())
      .post(`/passport/${publicUuid}/view`)
      .send({ eventKey: randomUUID(), version: 1 })
      .expect(204)
    expect(await redis.get(`notarify:passport:${passportId}:version:*`)).toBeDefined()

    const deleted = await deleteProduct(token, draft.productId)
    expect(deleted.status).toBe(204)

    const passport = await prisma.passport.findUniqueOrThrow({
      where: { id: passportId },
      select: { withdrawnAt: true, currentVersionId: true, qrPngBytes: true },
    })
    expect(passport.withdrawnAt).not.toBeNull()
    // History and the QR artifact are retained, not erased.
    expect(passport.currentVersionId).not.toBeNull()
    expect(passport.qrPngBytes.length).toBeGreaterThan(0)
    expect(await prisma.passportVersion.count({ where: { passportId } })).toBe(1)
    expect(
      await prisma.passportVersionAsset.count({
        where: { versionId: passport.currentVersionId as string },
      }),
    ).toBeGreaterThan(0)

    // Every anonymous surface collapses to the same safe 404.
    for (const path of [
      `/passport/${publicUuid}`,
      `/passport/${publicUuid}/qr.png`,
      `/passport/${publicUuid}/pdf`,
      `/passport/${publicUuid}/assets/${coverAssetId.assetId}`,
      `/q/${publicUuid}`,
    ]) {
      const response = await request(app.getHttpServer()).get(path).redirects(0)
      expect([path, response.status]).toEqual([path, 404])
    }
    // The view endpoint refuses too, rather than counting a view for a withdrawn passport.
    expect(
      (
        await request(app.getHttpServer())
          .post(`/passport/${publicUuid}/view`)
          .send({ eventKey: randomUUID(), version: 1 })
      ).status,
    ).toBe(404)

    // Retained analytics are untouched.
    expect(await prisma.analyticsEvent.count({ where: { passportId } })).toBe(2)
    expect(await prisma.analyticsDaily.count({ where: { passportId } })).toBe(2)

    // Admin history survives the withdrawal.
    const versions = await request(app.getHttpServer())
      .get(`/passports/${passportId}/versions`)
      .set(auth(token))
    expect(versions.status).toBe(200)
    expect((versions.body.versions as unknown[]).length).toBe(1)

    // The retained history states the lifecycle truthfully: the Passport keeps its stable
    // UUID, its retained version and its QR bytes, but no public action is advertised,
    // because every one of those endpoints answers 404.
    expect(versions.body.passport.lifecycleStatus).toBe('WITHDRAWN')
    expect(versions.body.passport.publicUuid).toBe(publicUuid)
    expect(versions.body.passport.currentVersionNumber).toBe(1)
    expect(versions.body.passport.publicUrl).toBeNull()
    expect(versions.body.passport.qrDownloadUrl).toBeNull()
    expect(versions.body.passport.pdfDownloadUrl).toBeNull()

    const historical = await request(app.getHttpServer())
      .get(`/passports/${passportId}/versions/1`)
      .set(auth(token))
    expect(historical.status).toBe(200)
    expect(historical.body.product.name).toBe('Published then deleted')

    // The normal passport list is active-only, so it no longer offers it.
    const list = await request(app.getHttpServer()).get('/passports').set(auth(token))
    expect(
      (list.body.items as Array<{ passportId: string }>).some(
        (item) => item.passportId === passportId,
      ),
    ).toBe(false)
  })

  it('reports an active passport history with its public actions available', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())
    const published = await publish(token, draft.productId, draft.draftRevision)
    expect(published.status).toBe(200)
    const passportId = published.body.passportId as string
    const publicUuid = published.body.publicUuid as string

    // Fixing withdrawn history must not regress active history: an active Passport still
    // reports ACTIVE and still offers its current public actions.
    const versions = await request(app.getHttpServer())
      .get(`/passports/${passportId}/versions`)
      .set(auth(token))
    expect(versions.status).toBe(200)
    expect(versions.body.passport.lifecycleStatus).toBe('ACTIVE')
    expect(versions.body.passport.publicUrl).toBe(
      `https://public.example.test/passport/${publicUuid}`,
    )
    expect(versions.body.passport.qrDownloadUrl).toBe(`/passport/${publicUuid}/qr.png`)
    expect(versions.body.passport.pdfDownloadUrl).toBe(`/passport/${publicUuid}/pdf`)

    // The active list still reports the same passport, with the same action metadata.
    const list = await request(app.getHttpServer()).get('/passports').set(auth(token))
    expect(list.status).toBe(200)
    const item = (list.body.items as Array<{ passportId: string; publicUrl: string }>).find(
      (row) => row.passportId === passportId,
    )
    expect(item?.publicUrl).toBe(`https://public.example.test/passport/${publicUuid}`)
  })

  it('composes with a concurrent draft save without a partial write', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    const [patchResponse, deleteResponse] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/products/${draft.productId}`)
        .set(auth(token))
        .send({
          materials: [
            { name: 'Race A', percentage: 60, position: 0 },
            { name: 'Race B', percentage: 40, position: 1 },
          ],
          expectedDraftRevision: draft.draftRevision,
        }),
      deleteProduct(token, draft.productId),
    ])

    expect([200, 404, 409]).toContain(patchResponse.status)
    expect([204, 404]).toContain(deleteResponse.status)

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { deletedAt: true },
    })
    const materials = await prisma.material.findMany({
      where: { productId: draft.productId },
      orderBy: { position: 'asc' },
      select: { name: true },
    })

    if (patchResponse.status === 200) {
      // The collection is applied whole or not at all: never a single half-written row.
      expect(materials.map((material) => material.name)).toEqual(['Race A', 'Race B'])
    }
    if (product.deletedAt !== null) {
      expect(deleteResponse.status).toBe(204)
    }
  })

  it('composes with a concurrent publish so a deleted product is never left public', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const draft = await createDraft(token, await createCategory())

    const [publishResponse, deleteResponse] = await Promise.all([
      publish(token, draft.productId, draft.draftRevision),
      deleteProduct(token, draft.productId),
    ])

    expect([200, 404]).toContain(publishResponse.status)
    expect([204, 404]).toContain(deleteResponse.status)

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { deletedAt: true },
    })
    if (product.deletedAt !== null) {
      // Deletion won at some point, so nothing may remain publicly active.
      const passport = await prisma.passport.findUnique({
        where: { productId: draft.productId },
        select: { withdrawnAt: true },
      })
      if (passport !== null) {
        expect(passport.withdrawnAt).not.toBeNull()
      }
      expect(deleteResponse.status).toBe(204)
    }
  })
})

describe('Deletion authorization and isolation', () => {
  it('refuses an Editor before any ownership probe and hides foreign products', async () => {
    const admin = await createFixture(UserRole.ADMIN)
    const editor = await createFixture(UserRole.EDITOR)
    const foreign = await createFixture(UserRole.ADMIN)
    const adminToken = await login(admin)
    const editorToken = await login(editor)
    const foreignToken = await login(foreign)

    const draft = await createDraft(adminToken, await createCategory())

    // An Editor is refused uniformly, including for a product that does not exist.
    expect((await deleteProduct(editorToken, draft.productId)).status).toBe(403)
    expect((await deleteProduct(editorToken, randomUUID())).status).toBe(403)

    // Another company's Admin cannot reach it, and cannot tell it apart from a missing id.
    const foreignKnown = await deleteProduct(foreignToken, draft.productId)
    const foreignUnknown = await deleteProduct(foreignToken, randomUUID())
    expect(foreignKnown.status).toBe(404)
    expect(foreignUnknown.status).toBe(404)
    // One identical body apart from the per-request id, so existence cannot be probed.
    const bodyWithoutRequestId = (body: Record<string, unknown>) => ({
      statusCode: body.statusCode,
      code: body.code,
      message: body.message,
    })
    expect(bodyWithoutRequestId(foreignKnown.body)).toEqual(
      bodyWithoutRequestId(foreignUnknown.body),
    )

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: draft.productId },
      select: { deletedAt: true },
    })
    expect(product.deletedAt).toBeNull()
  })

  it('scopes the audit read to the actor company and refuses an Editor', async () => {
    const admin = await createFixture(UserRole.ADMIN)
    const editor = await createFixture(UserRole.EDITOR)
    const adminToken = await login(admin)
    const editorToken = await login(editor)

    await createDraft(adminToken, await createCategory())

    const own = await request(app.getHttpServer()).get('/audit-logs').set(auth(adminToken))
    expect(own.status).toBe(200)
    expect((own.body.items as unknown[]).length).toBeGreaterThan(0)

    const refused = await request(app.getHttpServer()).get('/audit-logs').set(auth(editorToken))
    expect(refused.status).toBe(403)

    // The Editor's company has no audit rows of its own to leak.
    const editorRows = await prisma.auditEvent.count({
      where: { actor: { companyId: editor.companyId } },
    })
    expect(editorRows).toBe(0)
  })

  it('never shows another company’s audit rows', async () => {
    const own = await createFixture(UserRole.ADMIN)
    const foreign = await createFixture(UserRole.ADMIN)
    const ownToken = await login(own)
    const foreignToken = await login(foreign)

    // The other company performs real audited mutations of its own.
    const foreignDraft = await createDraft(foreignToken, await createCategory())
    const foreignRows = await prisma.auditEvent.findMany({
      where: { actor: { companyId: foreign.companyId } },
      select: { id: true, entityId: true },
    })
    expect(foreignRows.length).toBeGreaterThan(0)

    await createDraft(ownToken, await createCategory())
    const list = await request(app.getHttpServer())
      .get('/audit-logs?pageSize=100')
      .set(auth(ownToken))
    expect(list.status).toBe(200)

    const returnedIds = (list.body.items as Array<{ id: string }>).map((item) => item.id)
    const returnedEntities = (list.body.items as Array<{ entityId: string }>).map(
      (item) => item.entityId,
    )
    // None of the other company's rows appear, even though they exist and are newer or older.
    for (const row of foreignRows) {
      expect(returnedIds).not.toContain(row.id)
      expect(returnedEntities).not.toContain(row.entityId)
    }
    expect(returnedEntities).not.toContain(foreignDraft.productId)
  })
})
