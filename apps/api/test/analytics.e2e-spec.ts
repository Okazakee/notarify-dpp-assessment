import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { jest } from '@jest/globals'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import request from 'supertest'
import { AnalyticsService } from '../src/analytics/analytics.service.js'
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
  role: UserRole
}

type PublishedProduct = {
  productId: string
  passportId: string
  publicUuid: string
  versionId: string
  versionNumber: number
  coverAssetId: string
  draftRevision: number
}

let app: INestApplication
let prisma: PrismaService

const fixtures: Fixture[] = []
const categoryIds: string[] = []

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

/** A UTC calendar day, `offset` days from today. */
function utcDay(offset: number): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offset * 86_400_000,
  )
}

function utcDayKey(offset: number): string {
  return utcDay(offset).toISOString().slice(0, 10)
}

async function createFixture(role: UserRole = UserRole.EDITOR): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Analytics test ${randomUUID()}` },
  })
  const email = `analytics-${randomUUID()}@example.test`
  const password = `AnalyticsPassword-${randomUUID()}`
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

/** Adds another user to an existing company, so role shaping is tested within one scope. */
async function addUserToCompany(companyId: string, role: UserRole): Promise<Fixture> {
  const email = `analytics-${randomUUID()}@example.test`
  const password = `AnalyticsPassword-${randomUUID()}`
  const user = await prisma.user.create({
    data: {
      companyId,
      email,
      normalizedEmail: email,
      passwordHash: await hash(password, { algorithm: 2 }),
      role,
      active: true,
    },
  })
  return { companyId, userId: user.id, email, password, role }
}

async function createCategory(): Promise<string> {
  const category = await prisma.category.create({
    data: { stableCode: `ANALYTICS-CAT-${randomUUID()}`, name: 'Analytics category' },
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

/** Creates a complete draft and publishes it. */
async function publishProduct(
  token: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<PublishedProduct> {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const documentPdf = await uploadAsset(token, pdfFixture(), 'manual.pdf')

  const created = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name: 'Analytics product',
      sku: 'SKU-ANALYTICS',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Published content',
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
      documents: [{ assetId: documentPdf, kind: 'MANUAL', title: 'Manual' }],
      ...overrides,
    })
  expect(created.status).toBe(201)

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
    versionNumber: published.body.versionNumber as number,
    coverAssetId: cover,
    draftRevision: created.body.draftRevision as number,
  }
}

/** Creates a draft that is never published. */
async function createDraft(token: string, categoryId: string): Promise<string> {
  const created = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({ name: 'Draft product', categoryId, materials: [] })
  expect(created.status).toBe(201)
  return created.body.id as string
}

/** Records one real VIEW through the public endpoint and asserts it was accepted. */
async function recordView(publicUuid: string, version: number, eventKey = randomUUID()) {
  const response = await request(app.getHttpServer())
    .post(`/passport/${publicUuid}/view`)
    .send({ eventKey, version })
  expect(response.status).toBe(204)
  return response
}

/** Inserts a daily aggregate row directly, for deterministic UTC boundary data. */
async function insertDaily(input: {
  passportId: string
  dayOffset: number
  count: number
  kind?: 'QR_HIT' | 'VIEW'
  synthetic?: boolean
}) {
  await prisma.analyticsDaily.create({
    data: {
      passportId: input.passportId,
      dateUtc: utcDay(input.dayOffset),
      kind: input.kind ?? 'QR_HIT',
      synthetic: input.synthetic ?? false,
      count: input.count,
    },
  })
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
      // Draft children are owned by the product, so they go first.
      await prisma.material.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.sustainability.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.certification.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.productDocument.deleteMany({ where: { productId: { in: productIds } } })
      await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    }
    await prisma.assetContent.deleteMany({ where: { asset: { companyId: { in: companyIds } } } })
    await prisma.asset.deleteMany({ where: { companyId: { in: companyIds } } })
    // Refresh tokens belong to sessions, and sessions to users.
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
  await app.close()
})

describe('QR scan ingestion', () => {
  it('records one QR_HIT for a real navigation with server-resolved metadata', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    const response = await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('User-Agent', CHROME_WINDOWS)
      .set('Accept-Language', 'it-IT,it;q=0.9,en;q=0.8')
      .redirects(0)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(
      `https://public.example.test/passport/${published.publicUuid}`,
    )

    const events = await prisma.analyticsEvent.findMany({
      where: { passportId: published.passportId },
    })
    expect(events).toHaveLength(1)
    const event = events[0]
    if (event === undefined) {
      throw new Error('expected one recorded event')
    }

    expect(event.kind).toBe('QR_HIT')
    expect(event.synthetic).toBe(false)
    expect(event.versionId).toBe(published.versionId)
    expect(event.browser).toBe('Chrome')
    expect(event.operatingSystem).toBe('Windows')
    expect(event.language).toBe('it-IT')
    // The country is the configured mock, and it says so.
    expect(event.country).toBe('IT')
    expect(event.countrySource).toBe('MOCK')
    expect(event.source).toBe('QR_REDIRECT')
    // Server-controlled: the event time is the server's, not the caller's.
    expect(Math.abs(event.occurredAt.getTime() - Date.now())).toBeLessThan(60_000)
  })

  it('does not trust a forged forwarding header as the client address', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('X-Forwarded-For', '203.0.113.9')
      .redirects(0)

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { passportId: published.passportId },
    })
    // Proxy trust is not enabled, so the socket address is recorded and the forged
    // header is ignored.
    expect(event.ipAddress).not.toBe('203.0.113.9')
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(event.ipAddress)
  })

  it('records nothing for HEAD or an obvious prefetch', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await request(app.getHttpServer()).head(`/q/${published.publicUuid}`).redirects(0)
    await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('Purpose', 'prefetch')
      .redirects(0)
    await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('Sec-Purpose', 'prefetch;prerender')
      .redirects(0)

    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
    expect(await prisma.analyticsDaily.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
  })

  it('still redirects when analytics recording fails', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    const spy = jest
      .spyOn(AnalyticsService.prototype, 'recordQrHit')
      .mockRejectedValue(new Error('simulated analytics outage'))
    try {
      const response = await request(app.getHttpServer())
        .get(`/q/${published.publicUuid}`)
        .redirects(0)
      expect(response.status).toBe(302)
      expect(response.headers.location).toBe(
        `https://public.example.test/passport/${published.publicUuid}`,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('records nothing for the QR image, the PDF or a published asset download', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await request(app.getHttpServer()).get(`/passport/${published.publicUuid}/qr.png`)
    await request(app.getHttpServer()).get(`/passport/${published.publicUuid}/pdf`)
    await request(app.getHttpServer()).get(
      `/passport/${published.publicUuid}/assets/${published.coverAssetId}`,
    )
    // The public JSON projection is not a view either: only the rendered page reports one.
    await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)

    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
  })
})

describe('VIEW ingestion', () => {
  it('inserts one event and one daily increment, and a retry changes neither', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())
    const eventKey = randomUUID()

    await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .set('User-Agent', CHROME_WINDOWS)
      .set('Accept-Language', 'en-GB')
      .send({ eventKey, version: published.versionNumber })

    const first = await prisma.analyticsEvent.findMany({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(first).toHaveLength(1)
    expect(first[0]?.eventKey).toBe(eventKey)
    expect(first[0]?.versionId).toBe(published.versionId)
    expect(first[0]?.browser).toBe('Chrome')
    expect(first[0]?.language).toBe('en-GB')
    expect(first[0]?.countrySource).toBe('MOCK')
    expect(first[0]?.source).toBe('PUBLIC_PAGE')

    const daily = await prisma.analyticsDaily.findFirstOrThrow({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(daily.count).toBe(1)
    expect(daily.synthetic).toBe(false)
    expect(daily.dateUtc.toISOString().slice(0, 10)).toBe(utcDayKey(0))

    // The same navigation retried reuses its key.
    const retry = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({ eventKey, version: published.versionNumber })
    expect(retry.status).toBe(204)

    expect(
      await prisma.analyticsEvent.count({
        where: { passportId: published.passportId, kind: 'VIEW' },
      }),
    ).toBe(1)
    const afterRetry = await prisma.analyticsDaily.findFirstOrThrow({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(afterRetry.count).toBe(1)
  })

  it('accepts concurrent retries of one key exactly once', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())
    const eventKey = randomUUID()

    // The same navigation retried in parallel — a flaky network, a double tap, two
    // workers. The conflict-safe insert must let exactly one of them count.
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/passport/${published.publicUuid}/view`)
          .send({ eventKey, version: published.versionNumber }),
      ),
    )
    for (const response of responses) {
      expect(response.status).toBe(204)
    }

    expect(
      await prisma.analyticsEvent.count({
        where: { passportId: published.passportId, kind: 'VIEW' },
      }),
    ).toBe(1)
    const daily = await prisma.analyticsDaily.findFirstOrThrow({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(daily.count).toBe(1)
  })

  it('counts a distinct navigation key again', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await recordView(published.publicUuid, published.versionNumber)
    await recordView(published.publicUuid, published.versionNumber)

    expect(
      await prisma.analyticsEvent.count({
        where: { passportId: published.passportId, kind: 'VIEW' },
      }),
    ).toBe(2)
    const daily = await prisma.analyticsDaily.findFirstOrThrow({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(daily.count).toBe(2)
  })

  it('rejects a malformed key and any client-supplied server-authoritative field', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    const malformed = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({ eventKey: 'not-a-uuid', version: published.versionNumber })
    expect(malformed.status).toBe(400)
    expect(malformed.body.code).toBe('VALIDATION_ERROR')

    const unexpected = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({
        eventKey: randomUUID(),
        version: published.versionNumber,
        synthetic: true,
        ipAddress: '203.0.113.9',
        occurredAt: '2020-01-01T00:00:00.000Z',
        passportId: published.passportId,
        versionId: published.versionId,
      })
    expect(unexpected.status).toBe(400)
    expect(unexpected.body.code).toBe('VALIDATION_ERROR')

    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
  })

  it('refuses a version that does not belong to the passport', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    const response = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({ eventKey: randomUUID(), version: published.versionNumber + 99 })

    expect(response.status).toBe(404)
    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
  })

  it('accepts a view for an older retained version that the passport owns', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const published = await publishProduct(token, categoryId)

    // Republish, so the passport now has two versions and the current one is v2.
    const updated = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ name: 'Republished', expectedDraftRevision: published.draftRevision })
    expect(updated.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: updated.body.draftRevision })
    expect(republished.status).toBe(200)

    // A page rendered before the republish reports the version it displayed.
    await recordView(published.publicUuid, published.versionNumber)

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { passportId: published.passportId, kind: 'VIEW' },
    })
    expect(event.versionId).toBe(published.versionId)
  })

  it('does not accept a view for a withdrawn or deleted passport', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await prisma.passport.update({
      where: { id: published.passportId },
      data: { withdrawnAt: new Date() },
    })
    const withdrawn = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({ eventKey: randomUUID(), version: published.versionNumber })
    expect(withdrawn.status).toBe(404)

    await prisma.passport.update({
      where: { id: published.passportId },
      data: { withdrawnAt: null },
    })
    await prisma.product.update({
      where: { id: published.productId },
      data: { deletedAt: new Date() },
    })
    const deleted = await request(app.getHttpServer())
      .post(`/passport/${published.publicUuid}/view`)
      .send({ eventKey: randomUUID(), version: published.versionNumber })
    expect(deleted.status).toBe(404)

    expect(await prisma.analyticsEvent.count({ where: { passportId: published.passportId } })).toBe(
      0,
    )
  })
})

describe('UTC reporting boundaries', () => {
  it('reports today only, seven zero-filled buckets, and excludes the eighth day', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await insertDaily({ passportId: published.passportId, dayOffset: 0, count: 3 })
    await insertDaily({ passportId: published.passportId, dayOffset: -1, count: 5 })
    await insertDaily({ passportId: published.passportId, dayOffset: -6, count: 1 })
    // One day outside the seven-day window: present in the table, absent from the series.
    await insertDaily({ passportId: published.passportId, dayOffset: -7, count: 9 })

    const response = await request(app.getHttpServer()).get('/analytics?range=7').set(auth(token))
    expect(response.status).toBe(200)

    expect(response.body.scansToday).toBe(3)
    const buckets = response.body.weeklyScans as Array<{ dateUtc: string; count: number }>
    expect(buckets).toHaveLength(7)
    expect(buckets.map((bucket) => bucket.dateUtc)).toEqual([
      utcDayKey(-6),
      utcDayKey(-5),
      utcDayKey(-4),
      utcDayKey(-3),
      utcDayKey(-2),
      utcDayKey(-1),
      utcDayKey(0),
    ])
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 0, 0, 0, 0, 5, 3])
    expect(buckets.reduce((total, bucket) => total + bucket.count, 0)).toBe(9)
  })

  it('rejects a range outside the bounded set', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const response = await request(app.getHttpServer()).get('/analytics?range=14').set(auth(token))
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_ERROR')
  })
})

describe('Dashboard counters', () => {
  it('counts each company separately and excludes synthetic, withdrawn and foreign data', async () => {
    const companyA = await createFixture()
    const companyB = await createFixture()
    const tokenA = await login(companyA)
    const tokenB = await login(companyB)
    const categoryId = await createCategory()

    const publishedA = await publishProduct(tokenA, categoryId)
    await createDraft(tokenA, categoryId)
    const withdrawnA = await publishProduct(tokenA, categoryId)
    await prisma.passport.update({
      where: { id: withdrawnA.passportId },
      data: { withdrawnAt: new Date() },
    })

    const publishedB = await publishProduct(tokenB, categoryId)

    await recordView(publishedA.publicUuid, publishedA.versionNumber)
    await recordView(publishedA.publicUuid, publishedA.versionNumber)
    // Synthetic usage must never enter a real total.
    await insertDaily({
      passportId: publishedA.passportId,
      dayOffset: 0,
      count: 50,
      kind: 'VIEW',
      synthetic: true,
    })
    // A QR scan is not a view.
    await request(app.getHttpServer()).get(`/q/${publishedA.publicUuid}`).redirects(0)
    for (let index = 0; index < 5; index += 1) {
      await recordView(publishedB.publicUuid, publishedB.versionNumber)
    }

    const responseA = await request(app.getHttpServer()).get('/dashboard').set(auth(tokenA))
    expect(responseA.status).toBe(200)
    expect(responseA.body).toEqual({
      totalProducts: 3,
      publishedPassports: 1,
      generatedQrCodes: 1,
      totalPassportViews: 2,
    })

    const responseB = await request(app.getHttpServer()).get('/dashboard').set(auth(tokenB))
    expect(responseB.status).toBe(200)
    expect(responseB.body).toEqual({
      totalProducts: 1,
      publishedPassports: 1,
      generatedQrCodes: 1,
      totalPassportViews: 5,
    })
  })

  it('allows both roles and requires authentication', async () => {
    const editor = await createFixture(UserRole.EDITOR)
    const admin = await createFixture(UserRole.ADMIN)
    const editorToken = await login(editor)
    const adminToken = await login(admin)

    expect(
      (await request(app.getHttpServer()).get('/dashboard').set(auth(editorToken))).status,
    ).toBe(200)
    expect(
      (await request(app.getHttpServer()).get('/dashboard').set(auth(adminToken))).status,
    ).toBe(200)
    expect((await request(app.getHttpServer()).get('/dashboard')).status).toBe(401)
    expect((await request(app.getHttpServer()).get('/analytics')).status).toBe(401)
  })
})

describe('Analytics overview', () => {
  it('ranks active published passports by views and follows the bounded range', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()

    const top = await publishProduct(token, categoryId, { name: 'Top product' })
    const middle = await publishProduct(token, categoryId, { name: 'Middle product' })
    const low = await publishProduct(token, categoryId, { name: 'Low product' })

    await insertDaily({ passportId: top.passportId, dayOffset: -1, count: 9, kind: 'VIEW' })
    await insertDaily({ passportId: middle.passportId, dayOffset: -1, count: 4, kind: 'VIEW' })
    await insertDaily({ passportId: low.passportId, dayOffset: -1, count: 1, kind: 'VIEW' })
    // Ten days ago: inside the 30-day window, outside the 7-day one.
    await insertDaily({ passportId: low.passportId, dayOffset: -10, count: 7, kind: 'VIEW' })
    // Forty-five days ago: only the 90-day window sees it.
    await insertDaily({ passportId: middle.passportId, dayOffset: -45, count: 6, kind: 'VIEW' })

    const seven = await request(app.getHttpServer()).get('/analytics?range=7').set(auth(token))
    expect(seven.status).toBe(200)
    expect(
      (seven.body.mostViewed as Array<{ name: string; views: number }>).map((row) => [
        row.name,
        row.views,
      ]),
    ).toEqual([
      ['Top product', 9],
      ['Middle product', 4],
      ['Low product', 1],
    ])

    const thirty = await request(app.getHttpServer()).get('/analytics?range=30').set(auth(token))
    expect(thirty.body.rangeDays).toBe(30)
    expect(
      (thirty.body.mostViewed as Array<{ name: string; views: number }>).map((row) => row.views),
    ).toEqual([9, 8, 4])

    const ninety = await request(app.getHttpServer()).get('/analytics?range=90').set(auth(token))
    expect(
      (ninety.body.mostViewed as Array<{ name: string; views: number }>).map((row) => row.views),
    ).toEqual([10, 9, 8])
  })

  it('excludes a withdrawn passport from the ranking', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())
    await insertDaily({ passportId: published.passportId, dayOffset: 0, count: 12, kind: 'VIEW' })

    const before = await request(app.getHttpServer()).get('/analytics?range=7').set(auth(token))
    expect(before.body.mostViewed).toHaveLength(1)

    await prisma.passport.update({
      where: { id: published.passportId },
      data: { withdrawnAt: new Date() },
    })

    const after = await request(app.getHttpServer()).get('/analytics?range=7').set(auth(token))
    expect(after.body.mostViewed).toHaveLength(0)
  })

  it('returns newest-first scans with the identity the event displayed', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const published = await publishProduct(token, categoryId, { name: 'Scanned name' })

    await request(app.getHttpServer())
      .get(`/q/${published.publicUuid}`)
      .set('User-Agent', CHROME_WINDOWS)
      .set('Accept-Language', 'fr-FR')
      .redirects(0)

    // A draft edit after the scan must not rewrite what the scan showed.
    const updated = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ name: 'Renamed draft', expectedDraftRevision: published.draftRevision })
    expect(updated.status).toBe(200)

    const response = await request(app.getHttpServer()).get('/analytics?range=7').set(auth(token))
    expect(response.status).toBe(200)
    const scans = response.body.latestScans as Array<Record<string, unknown>>
    expect(scans).toHaveLength(1)
    expect(scans[0]?.name).toBe('Scanned name')
    expect(scans[0]?.browser).toBe('Chrome')
    expect(scans[0]?.operatingSystem).toBe('Windows')
    expect(scans[0]?.language).toBe('fr-FR')
    expect(scans[0]?.country).toBe('IT')
    expect(scans[0]?.countrySource).toBe('MOCK')
    expect(response.body.countryIsMocked).toBe(true)
  })

  it('gives the Admin the raw address and omits it entirely for an Editor', async () => {
    // One company, two roles: the Editor's empty projection must not be a company artefact.
    const admin = await createFixture(UserRole.ADMIN)
    const editor = await addUserToCompany(admin.companyId, UserRole.EDITOR)
    const adminToken = await login(admin)
    const editorToken = await login(editor)
    const categoryId = await createCategory()

    const published = await publishProduct(adminToken, categoryId)
    await request(app.getHttpServer()).get(`/q/${published.publicUuid}`).redirects(0)

    const adminView = await request(app.getHttpServer()).get('/analytics').set(auth(adminToken))
    const editorView = await request(app.getHttpServer()).get('/analytics').set(auth(editorToken))

    const adminScan = (adminView.body.latestScans as Array<Record<string, unknown>>)[0]
    const editorScan = (editorView.body.latestScans as Array<Record<string, unknown>>)[0]
    if (adminScan === undefined || editorScan === undefined) {
      throw new Error('expected one recorded scan for each role')
    }

    expect(Object.hasOwn(adminScan, 'ipAddress')).toBe(true)
    expect(adminScan.ipAddress).toMatch(/127\.0\.0\.1|::1/)
    // The Editor's projection has no address property at all — the API never sends one.
    expect(Object.hasOwn(editorScan, 'ipAddress')).toBe(false)
    // The Editor still receives the useful row.
    expect(editorScan.country).toBe('IT')
    expect(editorScan.publicUuid).toBe(published.publicUuid)
  })

  it('keeps the recent-scan list bounded', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory())

    await prisma.analyticsEvent.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        passportId: published.passportId,
        versionId: published.versionId,
        kind: 'QR_HIT' as const,
        occurredAt: new Date(Date.now() - index * 60_000),
        source: 'QR_REDIRECT',
        countrySource: 'MOCK' as const,
        country: 'IT',
        synthetic: false,
      })),
    })

    const response = await request(app.getHttpServer()).get('/analytics').set(auth(token))
    const scans = response.body.latestScans as Array<{ occurredAt: string }>
    expect(scans).toHaveLength(20)
    const times = scans.map((scan) => new Date(scan.occurredAt).getTime())
    expect(times).toEqual([...times].sort((left, right) => right - left))
  })
})

describe('Product list Total Views', () => {
  it('reports real view counts, and only views, for the company page', async () => {
    const fixture = await createFixture()
    const other = await createFixture()
    const token = await login(fixture)
    const otherToken = await login(other)
    const categoryId = await createCategory()

    const viewed = await publishProduct(token, categoryId, { name: 'Viewed product' })
    const untouched = await publishProduct(token, categoryId, { name: 'Unviewed product' })
    const draft = await createDraft(token, categoryId)
    const foreign = await publishProduct(otherToken, categoryId, { name: 'Foreign product' })

    await recordView(viewed.publicUuid, viewed.versionNumber)
    await recordView(viewed.publicUuid, viewed.versionNumber)
    await request(app.getHttpServer()).get(`/q/${viewed.publicUuid}`).redirects(0)
    await insertDaily({
      passportId: viewed.passportId,
      dayOffset: 0,
      count: 40,
      kind: 'VIEW',
      synthetic: true,
    })
    for (let index = 0; index < 3; index += 1) {
      await recordView(foreign.publicUuid, foreign.versionNumber)
    }

    const list = await request(app.getHttpServer()).get('/products?pageSize=50').set(auth(token))
    expect(list.status).toBe(200)

    const byId = new Map(
      (list.body.items as Array<{ id: string; totalViews: number }>).map((item) => [
        item.id,
        item.totalViews,
      ]),
    )
    expect(byId.get(viewed.productId)).toBe(2)
    expect(byId.get(untouched.productId)).toBe(0)
    expect(byId.get(draft)).toBe(0)
    // Another company's views never appear in this company's totals.
    expect(byId.has(foreign.productId)).toBe(false)

    // The detail contract carries the same measured value.
    const detail = await request(app.getHttpServer())
      .get(`/products/${viewed.productId}`)
      .set(auth(token))
    expect(detail.status).toBe(200)
    expect(detail.body.totalViews).toBe(2)
  })

  it('keeps search, filters and pagination working alongside the new column', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const categoryId = await createCategory()
    const published = await publishProduct(token, categoryId, {
      name: 'Searchable widget',
      originCountry: 'IT',
    })
    await recordView(published.publicUuid, published.versionNumber)

    const searched = await request(app.getHttpServer())
      .get('/products?q=Searchable')
      .set(auth(token))
    expect(searched.status).toBe(200)
    expect(searched.body.items).toHaveLength(1)
    expect(searched.body.items[0].totalViews).toBe(1)

    const filtered = await request(app.getHttpServer())
      .get(`/products?categoryId=${categoryId}&originCountry=IT`)
      .set(auth(token))
    expect(filtered.status).toBe(200)
    expect(filtered.body.items.length).toBeGreaterThanOrEqual(1)

    const paged = await request(app.getHttpServer())
      .get('/products?pageSize=1&page=1')
      .set(auth(token))
    expect(paged.status).toBe(200)
    expect(paged.body.items).toHaveLength(1)
    expect(typeof paged.body.items[0].totalViews).toBe('number')
    expect(paged.body.totalPages).toBeGreaterThanOrEqual(1)
  })
})
