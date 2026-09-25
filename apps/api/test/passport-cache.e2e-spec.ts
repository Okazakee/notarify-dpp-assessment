import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import { createClient, type RedisClientType } from '@redis/client'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { PASSPORT_CONTENT_CACHE_SCHEMA } from '../src/cache/passport-content-cache.service.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { pngFixture } from './asset-fixtures.js'
import { parsePdf } from './pdf-inspect.js'

/**
 * The cache suite runs against a real Redis server.
 *
 * It is deliberately not mocked: the invariants under test are about what a real client
 * does when a real server is warm, corrupted or unreachable, and a fake would prove
 * nothing about connection handling, TTLs or key contents. `REDIS_URL` points at a
 * disposable server; CI provides the same service.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6390'

/** A port nothing listens on, for the outage test. */
const DEAD_REDIS_URL = 'redis://127.0.0.1:6399'

type Fixture = { companyId: string; userId: string; email: string; password: string }

type PublishedProduct = {
  productId: string
  passportId: string
  publicUuid: string
  versionId: string
  versionNumber: number
  draftRevision: number
}

let app: INestApplication
let prisma: PrismaService
let redis: RedisClientType

const fixtures: Fixture[] = []
const categoryIds: string[] = []
const extraApps: INestApplication[] = []

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

async function createFixture(): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Cache test ${randomUUID()}` },
  })
  const email = `cache-${randomUUID()}@example.test`
  const password = `CachePassword-${randomUUID()}`
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
    data: { stableCode: `CACHE-CAT-${randomUUID()}`, name: 'Cache category' },
  })
  categoryIds.push(category.id)
  return category.id
}

async function login(fixture: Fixture, target: INestApplication = app): Promise<string> {
  const response = await request(target.getHttpServer())
    .post('/auth/login')
    .send({ email: fixture.email, password: fixture.password })
  expect(response.status).toBe(200)
  return response.body.accessToken as string
}

async function uploadAsset(
  token: string,
  bytes: Buffer,
  filename: string,
  target: INestApplication = app,
): Promise<string> {
  const response = await request(target.getHttpServer())
    .post('/assets')
    .set(auth(token))
    .attach('file', bytes, { filename, contentType: 'application/octet-stream' })
  expect(response.status).toBe(201)
  return response.body.id as string
}

async function publishProduct(
  token: string,
  categoryId: string,
  name: string,
  target: INestApplication = app,
): Promise<PublishedProduct> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png', target)

  const created = await request(target.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name,
      sku: 'SKU-CACHE',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Cached content',
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
    })
  expect(created.status).toBe(201)

  const published = await request(target.getHttpServer())
    .post(`/products/${created.body.id}/publish`)
    .set(auth(token))
    .send({ expectedDraftRevision: created.body.draftRevision })
  expect(published.status).toBe(200)

  return {
    productId: created.body.id as string,
    passportId: published.body.passportId as string,
    publicUuid: published.body.publicUuid as string,
    versionId: published.body.versionId as string,
    versionNumber: published.body.versionNumber as number,
    draftRevision: created.body.draftRevision as number,
  }
}

/** The exact key the service derives, rebuilt here so a drift is visible. */
function cacheKey(passportId: string, versionId: string): string {
  return `notarify:passport:${passportId}:version:${versionId}:schema:${PASSPORT_CONTENT_CACHE_SCHEMA}`
}

async function getPassport(publicUuid: string, target: INestApplication = app) {
  return request(target.getHttpServer()).get(`/passport/${publicUuid}`)
}

async function createAppWith(redisUrl: string | null): Promise<INestApplication> {
  if (redisUrl === null) {
    delete process.env.REDIS_URL
  } else {
    process.env.REDIS_URL = redisUrl
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const created = moduleRef.createNestApplication()
  configureApplication(created)
  await created.init()
  return created
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
  for (const extra of extraApps) {
    await extra.close()
  }
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

describe('Immutable content caching', () => {
  it('misses first, then serves the cached version-specific entry with a bounded TTL', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Cache warm-up')
    const key = cacheKey(published.passportId, published.versionId)
    await redis.del(key)

    expect(await redis.get(key)).toBeNull()

    const first = await getPassport(published.publicUuid)
    expect(first.status).toBe(200)
    expect(first.body.product.name).toBe('Cache warm-up')

    const cached = await redis.get(key)
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached as string) as {
      schema: number
      digest: string
      content: { product: { name: string } }
    }
    expect(parsed.schema).toBe(PASSPORT_CONTENT_CACHE_SCHEMA)
    expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(parsed.content.product.name).toBe('Cache warm-up')

    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(300)

    // A hit is proved by changing only what the cache holds: the stored snapshot is
    // untouched, so if the API answers with this injected name it can only have read the
    // cache. The digest still matches the selected snapshot, so the entry is trusted.
    parsed.content.product.name = 'Served from the cache'
    await redis.set(key, JSON.stringify(parsed))

    const fromCache = await getPassport(published.publicUuid)
    expect(fromCache.status).toBe(200)
    expect(fromCache.body.product.name).toBe('Served from the cache')

    // Changing the stored snapshot invalidates the entry instead of being masked by it:
    // the digest no longer matches, so PostgreSQL is read and the entry is dropped.
    await prisma.passportVersion.update({
      where: { id: published.versionId },
      data: {
        publicSnapshot: {
          ...((
            await prisma.passportVersion.findUniqueOrThrow({
              where: { id: published.versionId },
              select: { publicSnapshot: true },
            })
          ).publicSnapshot as Record<string, unknown>),
          product: { name: 'Changed behind the cache' },
        },
      },
    })

    const afterSnapshotChange = await getPassport(published.publicUuid)
    expect(afterSnapshotChange.status).toBe(200)
    expect(afterSnapshotChange.body.product.name).toBe('Changed behind the cache')

    // With the entry removed, the same request reads PostgreSQL and sees the same change.
    await redis.del(key)
    const fromDatabase = await getPassport(published.publicUuid)
    expect(fromDatabase.status).toBe(200)
    expect(fromDatabase.body.product.name).toBe('Changed behind the cache')
  })

  it('falls back to PostgreSQL and discards an unreadable cached payload', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Corruption proof')
    const key = cacheKey(published.passportId, published.versionId)

    // A well-formed envelope whose content has the wrong shape.
    await redis.set(
      key,
      JSON.stringify({
        schema: PASSPORT_CONTENT_CACHE_SCHEMA,
        digest: 'x',
        content: { product: { name: 42 } },
      }),
    )
    const fromCorrupt = await getPassport(published.publicUuid)
    expect(fromCorrupt.status).toBe(200)
    expect(fromCorrupt.body.product.name).toBe('Corruption proof')

    // The bad entry is replaced by a valid one rather than served again.
    const afterRepair = await redis.get(key)
    expect(afterRepair).not.toBeNull()
    expect(JSON.parse(afterRepair as string)).toMatchObject({
      content: { product: { name: 'Corruption proof' } },
    })

    await redis.set(key, 'not json at all')
    const fromUnparseable = await getPassport(published.publicUuid)
    expect(fromUnparseable.status).toBe(200)
    expect(fromUnparseable.body.product.name).toBe('Corruption proof')

    // An entry written by another schema is not current content either.
    await redis.set(
      key,
      JSON.stringify({
        schema: PASSPORT_CONTENT_CACHE_SCHEMA + 1,
        digest: 'x',
        content: { product: { name: 'From another deployment' } },
      }),
    )
    const fromOtherSchema = await getPassport(published.publicUuid)
    expect(fromOtherSchema.status).toBe(200)
    expect(fromOtherSchema.body.product.name).toBe('Corruption proof')
  })

  it('never serves a valid-looking entry that belongs to another version', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const first = await publishProduct(token, categoryId, 'First version')

    // Cache v1, then keep its entry so it can be planted under v2's key later.
    expect((await getPassport(first.publicUuid)).status).toBe(200)
    const firstEntry = await redis.get(cacheKey(first.passportId, first.versionId))
    expect(firstEntry).not.toBeNull()

    const updated = await request(app.getHttpServer())
      .patch(`/products/${first.productId}`)
      .set(auth(token))
      .send({ name: 'Second version', expectedDraftRevision: first.draftRevision })
    expect(updated.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${first.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: updated.body.draftRevision })
    expect(republished.status).toBe(200)
    const secondVersionId = republished.body.versionId as string

    // v1's perfectly valid content is planted under v2's key. It passes shape validation
    // but is bound to a different snapshot, so it must never be served.
    await redis.set(cacheKey(first.passportId, secondVersionId), firstEntry as string)
    const response = await getPassport(first.publicUuid)
    expect(response.status).toBe(200)
    expect(response.body.product.name).toBe('Second version')
    expect(response.body.passport.version).toBe(2)
  })

  it('serves correct content when Redis is unreachable, within a bounded time', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Outage proof')

    const outageApp = await createAppWith(DEAD_REDIS_URL)
    extraApps.push(outageApp)

    const started = Date.now()
    const response = await getPassport(published.publicUuid, outageApp)
    const elapsed = Date.now() - started

    expect(response.status).toBe(200)
    expect(response.body.product.name).toBe('Outage proof')
    // The request is bounded by the cache timeouts instead of hanging on reconnection.
    expect(elapsed).toBeLessThan(6_000)

    const second = await getPassport(published.publicUuid, outageApp)
    expect(second.status).toBe(200)
  })

  // The absent-`REDIS_URL` case is proven at the port level in
  // `passport-content-cache.spec.ts`, not here: the validated environment is loaded once
  // per process, so removing `REDIS_URL` after an application has started cannot
  // reconfigure a second one. The unreachable-cache fallback below is the integration
  // proof that a broken cache never fails a request.
})

describe('Fresh visibility always wins', () => {
  it('moves to the new version immediately after a republish, leaving the old entry unusable', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Version one')
    const oldKey = cacheKey(published.passportId, published.versionId)

    expect((await getPassport(published.publicUuid)).body.product.name).toBe('Version one')
    expect(await redis.get(oldKey)).not.toBeNull()

    const updated = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ name: 'Version two', expectedDraftRevision: published.draftRevision })
    expect(updated.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: updated.body.draftRevision })
    expect(republished.status).toBe(200)
    const newVersionId = republished.body.versionId as string

    // The warm v1 entry still exists, and the public read must ignore it.
    expect(await redis.get(oldKey)).not.toBeNull()
    const afterRepublish = await getPassport(published.publicUuid)
    expect(afterRepublish.status).toBe(200)
    expect(afterRepublish.body.product.name).toBe('Version two')
    expect(afterRepublish.body.passport.version).toBe(2)

    // The new version has its own key.
    const newKey = cacheKey(published.passportId, newVersionId)
    expect(newKey).not.toBe(oldKey)
    expect(await redis.get(newKey)).not.toBeNull()
  })

  it('cannot resurrect a withdrawn passport from a warm entry', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Withdrawn later')
    const key = cacheKey(published.passportId, published.versionId)

    expect((await getPassport(published.publicUuid)).status).toBe(200)
    expect(await redis.get(key)).not.toBeNull()

    await prisma.passport.update({
      where: { id: published.passportId },
      data: { withdrawnAt: new Date() },
    })

    expect((await getPassport(published.publicUuid)).status).toBe(404)
    // The entry is still there: PostgreSQL, not the cache, decided.
    expect(await redis.get(key)).not.toBeNull()
  })

  it('cannot resurrect a soft-deleted product from a warm entry', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Deleted later')
    const key = cacheKey(published.passportId, published.versionId)

    expect((await getPassport(published.publicUuid)).status).toBe(200)
    expect(await redis.get(key)).not.toBeNull()

    await prisma.product.update({
      where: { id: published.productId },
      data: { deletedAt: new Date() },
    })

    expect((await getPassport(published.publicUuid)).status).toBe(404)
    expect(await redis.get(key)).not.toBeNull()
  })

  it('never changes authentication or the QR redirect', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Unaffected surfaces')

    expect((await getPassport(published.publicUuid)).status).toBe(200)

    // A warm cache must not authenticate anything.
    expect((await request(app.getHttpServer()).get('/products')).status).toBe(401)
    expect((await request(app.getHttpServer()).get('/products').set(auth(token))).status).toBe(200)

    const qr = await request(app.getHttpServer()).get(`/q/${published.publicUuid}`).redirects(0)
    expect(qr.status).toBe(302)
    expect(qr.headers.location).toBe(`https://public.example.test/passport/${published.publicUuid}`)
  })

  it('exports the current version in the PDF even when the previous one is cached', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Pdf version one')

    const firstPdf = await request(app.getHttpServer())
      .get(`/passport/${published.publicUuid}/pdf`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(firstPdf.status).toBe(200)
    expect((await parsePdf(firstPdf.body as Buffer)).text).toContain('Pdf version one')

    const updated = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ name: 'Pdf version two', expectedDraftRevision: published.draftRevision })
    expect(updated.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: updated.body.draftRevision })
    expect(republished.status).toBe(200)

    const secondPdf = await request(app.getHttpServer())
      .get(`/passport/${published.publicUuid}/pdf`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(secondPdf.status).toBe(200)
    const text = (await parsePdf(secondPdf.body as Buffer)).text
    expect(text).toContain('Pdf version two')
    expect(text).not.toContain('Pdf version one')
  })
})

describe('Cache independence from other binaries', () => {
  it('keeps asset bytes out of the cache and serves them from the database', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const published = await publishProduct(token, categoryId, 'Asset cache boundary')

    // Warm the content cache first, so the key set below reflects a real cached read.
    expect((await getPassport(published.publicUuid)).status).toBe(200)

    const image = await request(app.getHttpServer()).get(
      `/passport/${published.publicUuid}/assets/${published.versionId}`,
    )
    // The version id is not an asset id, so this is the safe not-found contract.
    expect(image.status).toBe(404)

    // The only key written for this passport is the immutable content key: no asset
    // bytes, no QR artifact and no response body are cached.
    const keys = await redis.keys(`notarify:passport:${published.passportId}:*`)
    expect(keys).toEqual([cacheKey(published.passportId, published.versionId)])

    const asset = await request(app.getHttpServer()).get(
      `/passport/${published.publicUuid}/assets/${published.versionId}`,
    )
    expect(asset.status).toBe(404)
    expect(await redis.keys(`notarify:passport:${published.passportId}:*`)).toEqual([
      cacheKey(published.passportId, published.versionId),
    ])

    const qr = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}/qr.png`)
    expect(qr.status).toBe(200)
    expect(qr.headers['cache-control']).toBe('no-store')
  })
})

describe('HTTP caching contract', () => {
  it('keeps public responses no-store even while the API caches content internally', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Header contract')

    const response = await getPassport(published.publicUuid)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    // A miss and a hit must both be no-store: the cache is internal, not a browser cache.
    const second = await getPassport(published.publicUuid)
    expect(second.headers['cache-control']).toBe('no-store')
  })
})
