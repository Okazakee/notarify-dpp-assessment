import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { pdfFixture, pngFixture } from './asset-fixtures.js'

/**
 * Stage 6 pass C: company settings.
 *
 * The important proof here is not that a name can be changed — it is that changing it
 * cannot rewrite publication history. A published Passport carries the company name it was
 * published with, so an explicit republish is the only thing that can move it.
 */

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

let app: INestApplication
let prisma: PrismaService

const fixtures: Fixture[] = []
const categoryIds: string[] = []

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

async function createFixture(
  role: UserRole = UserRole.ADMIN,
  displayName = `Settings test ${randomUUID()}`,
): Promise<Fixture> {
  const company = await prisma.company.create({ data: { displayName } })
  const email = `settings-${randomUUID()}@example.test`
  const password = `SettingsPassword-${randomUUID()}`
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
    data: { stableCode: `SETTINGS-CAT-${randomUUID()}`, name: 'Settings category' },
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

/** Creates and publishes one product, returning the passport identity. */
async function publishProduct(token: string, categoryId: string, name: string) {
  const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
  const created = await request(app.getHttpServer())
    .post('/products')
    .set(auth(token))
    .send({
      name,
      sku: 'SKU-SETTINGS',
      serialNumber: `SN-${randomUUID()}`,
      categoryId,
      description: 'Settings content',
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

  const published = await request(app.getHttpServer())
    .post(`/products/${created.body.id}/publish`)
    .set(auth(token))
    .send({ expectedDraftRevision: created.body.draftRevision })
  expect(published.status).toBe(200)

  return {
    productId: created.body.id as string,
    passportId: published.body.passportId as string,
    publicUuid: published.body.publicUuid as string,
    draftRevision: created.body.draftRevision as number,
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
    await prisma.company.updateMany({
      where: { id: { in: companyIds } },
      data: { logoAssetId: null },
    })
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
  await app.close()
})

describe('Company settings', () => {
  it('reads and updates the display name, and records the change', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const initial = await request(app.getHttpServer()).get('/settings').set(auth(token))
    expect(initial.status).toBe(200)
    expect(initial.body.logoAssetId).toBeNull()

    const updated = await request(app.getHttpServer())
      .patch('/settings')
      .set(auth(token))
      .send({ displayName: '  Renamed Company  ' })
    expect(updated.status).toBe(200)
    // The value is trimmed, and the client never supplies a company id.
    expect(updated.body.displayName).toBe('Renamed Company')

    const reloaded = await request(app.getHttpServer()).get('/settings').set(auth(token))
    expect(reloaded.body.displayName).toBe('Renamed Company')

    const audit = await prisma.auditEvent.findMany({
      where: { actorId: fixture.userId, action: 'COMPANY_SETTINGS_UPDATED' },
    })
    expect(audit).toHaveLength(1)
    expect(audit[0]?.entityType).toBe('Company')
    expect(audit[0]?.entityId).toBe(fixture.companyId)
    expect(audit[0]?.safeMetadata).toMatchObject({ changedFields: ['displayName'] })

    // A request that changes nothing is not a mutation, so it records nothing.
    const noop = await request(app.getHttpServer())
      .patch('/settings')
      .set(auth(token))
      .send({ displayName: 'Renamed Company' })
    expect(noop.status).toBe(200)
    expect(
      await prisma.auditEvent.count({
        where: { actorId: fixture.userId, action: 'COMPANY_SETTINGS_UPDATED' },
      }),
    ).toBe(1)
  })

  it('accepts a same-company image logo and clears it explicitly', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const logo = await uploadAsset(token, await pngFixture(32, 32), 'logo.png')

    const set = await request(app.getHttpServer())
      .patch('/settings')
      .set(auth(token))
      .send({ logoAssetId: logo })
    expect(set.status).toBe(200)
    expect(set.body.logoAssetId).toBe(logo)

    const cleared = await request(app.getHttpServer())
      .patch('/settings')
      .set(auth(token))
      .send({ logoAssetId: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.logoAssetId).toBeNull()

    const actions = await prisma.auditEvent.findMany({
      where: { actorId: fixture.userId, action: 'COMPANY_SETTINGS_UPDATED' },
      orderBy: { occurredAt: 'asc' },
    })
    expect(actions).toHaveLength(2)
    expect(actions[1]?.safeMetadata).toMatchObject({ changedFields: ['logoAssetId'] })
  })

  it('refuses a foreign, non-image or unknown logo without leaking existence', async () => {
    const fixture = await createFixture()
    const foreign = await createFixture()
    const token = await login(fixture)
    const foreignToken = await login(foreign)

    const foreignImage = await uploadAsset(foreignToken, await pngFixture(16, 16), 'foreign.png')
    const ownPdf = await uploadAsset(token, pdfFixture(), 'not-an-image.pdf')

    const attempts = [
      { logoAssetId: foreignImage },
      { logoAssetId: ownPdf },
      { logoAssetId: randomUUID() },
    ]
    const bodies: unknown[] = []
    for (const attempt of attempts) {
      const response = await request(app.getHttpServer())
        .patch('/settings')
        .set(auth(token))
        .send(attempt)
      expect(response.status).toBe(400)
      expect(response.body.code).toBe('LOGO_ASSET_UNAVAILABLE')
      bodies.push({
        statusCode: response.body.statusCode,
        code: response.body.code,
        message: response.body.message,
      })
    }

    // One identical refusal for a foreign, a wrong-type and an unknown asset.
    expect(bodies[1]).toEqual(bodies[0])
    expect(bodies[2]).toEqual(bodies[0])

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: fixture.companyId },
      select: { logoAssetId: true },
    })
    expect(company.logoAssetId).toBeNull()
  })

  it('never rewrites a published snapshot when settings change', async () => {
    const fixture = await createFixture(UserRole.ADMIN, 'Old Company')
    const token = await login(fixture)
    const published = await publishProduct(token, await createCategory(), 'Settings product')

    const before = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(before.status).toBe(200)
    expect(before.body.brand.displayName).toBe('Old Company')
    const qrBefore = await prisma.passport.findUniqueOrThrow({
      where: { id: published.passportId },
      select: { qrPngBytes: true, publicUuid: true },
    })

    const renamed = await request(app.getHttpServer())
      .patch('/settings')
      .set(auth(token))
      .send({ displayName: 'New Company' })
    expect(renamed.status).toBe(200)

    // The current published version and its history keep the name they were published
    // with: settings are mutable company state, snapshots are not.
    const after = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(after.status).toBe(200)
    expect(after.body.brand.displayName).toBe('Old Company')
    const historical = await request(app.getHttpServer())
      .get(`/passports/${published.passportId}/versions/1`)
      .set(auth(token))
    expect(historical.status).toBe(200)
    expect(historical.body.brand.displayName).toBe('Old Company')

    // An explicit republish creates a new version carrying the new name, while v1 keeps
    // the old one and the public identity stays stable.
    const updated = await request(app.getHttpServer())
      .patch(`/products/${published.productId}`)
      .set(auth(token))
      .send({ name: 'Settings product v2', expectedDraftRevision: published.draftRevision })
    expect(updated.status).toBe(200)
    const republished = await request(app.getHttpServer())
      .post(`/products/${published.productId}/publish`)
      .set(auth(token))
      .send({ expectedDraftRevision: updated.body.draftRevision })
    expect(republished.status).toBe(200)

    const current = await request(app.getHttpServer()).get(`/passport/${published.publicUuid}`)
    expect(current.body.brand.displayName).toBe('New Company')
    expect(current.body.passport.version).toBe(2)

    const versionOne = await request(app.getHttpServer())
      .get(`/passports/${published.passportId}/versions/1`)
      .set(auth(token))
    expect(versionOne.body.brand.displayName).toBe('Old Company')

    const qrAfter = await prisma.passport.findUniqueOrThrow({
      where: { id: published.passportId },
      select: { qrPngBytes: true, publicUuid: true },
    })
    expect(Buffer.compare(qrAfter.qrPngBytes, qrBefore.qrPngBytes)).toBe(0)
    expect(qrAfter.publicUuid).toBe(qrBefore.publicUuid)
  })
})

describe('Settings authorization and isolation', () => {
  it('refuses an Editor and keeps each company’s settings separate', async () => {
    const admin = await createFixture(UserRole.ADMIN, 'Isolation Company A')
    const editor = await createFixture(UserRole.EDITOR, 'Isolation Company B')
    const adminToken = await login(admin)
    const editorToken = await login(editor)

    expect(
      (await request(app.getHttpServer()).get('/settings').set(auth(editorToken))).status,
    ).toBe(403)
    expect(
      (
        await request(app.getHttpServer())
          .patch('/settings')
          .set(auth(editorToken))
          .send({ displayName: 'Editor rename' })
      ).status,
    ).toBe(403)

    const own = await request(app.getHttpServer()).get('/settings').set(auth(adminToken))
    expect(own.body.displayName).toBe('Isolation Company A')

    const other = await request(app.getHttpServer()).get('/settings').set(auth(editorToken))
    expect(other.status).toBe(403)

    // The Editor's company is untouched by the Admin's attempt.
    const editorCompany = await prisma.company.findUniqueOrThrow({
      where: { id: editor.companyId },
      select: { displayName: true },
    })
    expect(editorCompany.displayName).toBe('Isolation Company B')
  })
})
