import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import type { Response } from 'supertest'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
  token?: string
}

type ProductResponse = {
  id: string
  draftRevision: number
  materials: Array<{ id: string; name: string; position: number }>
  sustainability: Record<string, unknown> | null
  [key: string]: unknown
}

let app: INestApplication
let prisma: PrismaService
const fixtures: Fixture[] = []
const productIds: string[] = []

async function createFixture(role: UserRole = UserRole.EDITOR): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Product test ${randomUUID()}` },
  })
  const email = `product-${randomUUID()}@example.test`
  const password = `ProductPassword-${randomUUID()}`
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

async function login(fixture: Fixture): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: fixture.email, password: fixture.password })
  expect(response.status).toBe(200)
  fixture.token = response.body.accessToken as string
  return fixture.token
}

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

function rememberProduct(body: ProductResponse): ProductResponse {
  productIds.push(body.id)
  return body
}

function expectError(response: Response, statusCode: number, code: string): void {
  expect(response.status).toBe(statusCode)
  expect(response.body).toMatchObject({ statusCode, code })
  expect(typeof response.body.message).toBe('string')
  expect(typeof response.body.requestId).toBe('string')
  expect(response.headers['x-request-id']).toBe(response.body.requestId)
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)
})

afterAll(async () => {
  const ids = productIds.length
    ? productIds
    : (
        await prisma.product.findMany({
          where: { companyId: { in: fixtures.map((fixture) => fixture.companyId) } },
          select: { id: true },
        })
      ).map((product) => product.id)
  if (ids.length > 0) {
    await prisma.material.deleteMany({ where: { productId: { in: ids } } })
    await prisma.sustainability.deleteMany({ where: { productId: { in: ids } } })
    await prisma.certification.deleteMany({ where: { productId: { in: ids } } })
    await prisma.product.deleteMany({ where: { id: { in: ids } } })
  }
  const userIds = fixtures.map((fixture) => fixture.userId)
  if (userIds.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { session: { userId: { in: userIds } } } })
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.company.deleteMany({
      where: { id: { in: fixtures.map((fixture) => fixture.companyId) } },
    })
  }
  await app.close()
})

describe('Product draft HTTP API', () => {
  it('requires authentication and accepts incomplete drafts for editors and admins', async () => {
    const anonymous = await request(app.getHttpServer()).post('/products').send({})
    expectError(anonymous, 401, 'INVALID_ACCESS_TOKEN')

    const editor = await createFixture(UserRole.EDITOR)
    const editorProduct = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(await login(editor)))
          .send({ description: 'Incomplete is valid' })
      ).body as ProductResponse,
    )
    expect(editorProduct.draftRevision).toBe(0)
    expect(editorProduct.name).toBeNull()

    const admin = await createFixture(UserRole.ADMIN)
    const adminProduct = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(await login(admin)))
          .send({ name: 'Admin draft' })
      ).body as ProductResponse,
    )
    expect(adminProduct.draftRevision).toBe(0)
  })

  it('rejects client-owned fields and returns a request id with the stable validation error', async () => {
    const fixture = await createFixture()
    const response = await request(app.getHttpServer())
      .post('/products')
      .set(auth(await login(fixture)))
      .send({
        companyId: fixture.companyId,
        draftRevision: 99,
        deletedAt: null,
        internalState: 'x',
      })
    expectError(response, 400, 'VALIDATION_ERROR')
    expect(response.body.message).not.toMatch(/Prisma|PostgreSQL|database/i)
  })

  it('enforces company ownership for reads and writes', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const product = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(ownerToken))
          .send({ name: 'Owner only' })
      ).body as ProductResponse,
    )
    const other = await createFixture()
    const otherToken = await login(other)

    expectError(
      await request(app.getHttpServer()).get(`/products/${product.id}`).set(auth(otherToken)),
      404,
      'PRODUCT_NOT_FOUND',
    )
    expectError(
      await request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .set(auth(otherToken))
        .send({ expectedDraftRevision: 0, name: 'Must not edit' }),
      404,
      'PRODUCT_NOT_FOUND',
    )
    const ownList = await request(app.getHttpServer()).get('/products').set(auth(otherToken))
    expect(ownList.status).toBe(200)
    expect(ownList.body.items.some((item: ProductResponse) => item.id === product.id)).toBe(false)
  })

  it('claims each patch revision once and rejects stale revisions', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({ name: 'Revision one' })
      ).body,
    )
    const first = await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, name: 'Revision two' })
    expect(first.status).toBe(200)
    expect(first.body.draftRevision).toBe(1)

    const stale = await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, name: 'Stale' })
    expectError(stale, 409, 'PRODUCT_REVISION_CONFLICT')
    const current = await request(app.getHttpServer())
      .get(`/products/${product.id}`)
      .set(auth(token))
    expect(current.body.draftRevision).toBe(1)
    expect(current.body.name).toBe('Revision two')
  })

  it('keeps omitted fields and nested sections unchanged while honoring explicit nulls', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({
            name: 'Keep this description',
            description: 'Retained until explicitly cleared',
            sustainability: { recycledPercent: 40, repairabilityScore: 5 },
          })
      ).body as ProductResponse,
    )
    const partial = await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, name: 'Updated name only' })
    expect(partial.status).toBe(200)
    expect(partial.body.description).toBe('Retained until explicitly cleared')
    expect(partial.body.sustainability.recycledPercent).toBe(40)
    expect(partial.body.draftRevision).toBe(1)

    const cleared = await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 1, description: null, sustainability: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.description).toBeNull()
    expect(cleared.body.sustainability).toBeNull()
    expect(cleared.body.draftRevision).toBe(2)
  })

  it('allows only one concurrent writer and leaves the loser nested change unapplied', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({ materials: [{ name: 'Base', percentage: 20, position: 0 }] })
      ).body as ProductResponse,
    )
    const [left, right] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .set(auth(token))
        .send({
          expectedDraftRevision: 0,
          materials: [{ name: 'Left winner', percentage: 30, position: 0 }],
        }),
      request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .set(auth(token))
        .send({
          expectedDraftRevision: 0,
          materials: [{ name: 'Right loser', percentage: 40, position: 0 }],
        }),
    ])
    expect([left.status, right.status].sort()).toEqual([200, 409])
    const winner = left.status === 200 ? left : right
    const loser = left.status === 200 ? right : left
    expect(winner.body.draftRevision).toBe(1)
    expectError(loser, 409, 'PRODUCT_REVISION_CONFLICT')
    const current = await request(app.getHttpServer())
      .get(`/products/${product.id}`)
      .set(auth(token))
    expect(current.body.draftRevision).toBe(1)
    expect(['Left winner', 'Right loser']).toContain(current.body.materials[0].name)
    expect(current.body.materials[0].name).not.toBe(loser.body.materials?.[0]?.name)
  })

  it('replaces materials atomically, validates positions, and prevents reparenting ids', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const original = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({ materials: [{ name: 'Original', percentage: 20, position: 0 }] })
      ).body as ProductResponse,
    )
    const invalid = await request(app.getHttpServer())
      .patch(`/products/${original.id}`)
      .set(auth(token))
      .send({
        expectedDraftRevision: 0,
        materials: [
          { name: 'First', percentage: 10, position: 0 },
          { name: 'Duplicate position', percentage: 10, position: 0 },
        ],
      })
    expectError(invalid, 400, 'VALIDATION_ERROR')
    const unchanged = await request(app.getHttpServer())
      .get(`/products/${original.id}`)
      .set(auth(token))
    expect(unchanged.body.draftRevision).toBe(0)
    expect(unchanged.body.materials[0].name).toBe('Original')

    const other = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({ materials: [{ name: 'Other', percentage: 20, position: 0 }] })
      ).body as ProductResponse,
    )
    const reparent = await request(app.getHttpServer())
      .patch(`/products/${original.id}`)
      .set(auth(token))
      .send({ expectedDraftRevision: 0, materials: [{ ...other.materials[0], name: 'Reparent' }] })
    expectError(reparent, 400, 'VALIDATION_ERROR')
    expect(other.materials[0].id).not.toBe(original.materials[0].id)
  })

  it('maps serial conflicts safely while allowing SKU reuse', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const first = rememberProduct(
      (
        await request(app.getHttpServer())
          .post('/products')
          .set(auth(token))
          .send({ serialNumber: 'SERIAL-ONE', sku: 'SHARED-SKU' })
      ).body as ProductResponse,
    )
    const duplicate = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ serialNumber: 'SERIAL-ONE', sku: 'SHARED-SKU' })
    expectError(duplicate, 409, 'PRODUCT_SERIAL_CONFLICT')
    const second = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ serialNumber: 'SERIAL-TWO', sku: 'SHARED-SKU' })
    expect(second.status).toBe(201)
    rememberProduct(second.body as ProductResponse)
    expect(first.sku).toBe('SHARED-SKU')
  })

  it('enforces numeric and certification boundaries without requiring material totals', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const badSustainability = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ sustainability: { recycledPercent: 101, repairabilityScore: 11, carbonKgCo2e: -1 } })
    expectError(badSustainability, 400, 'VALIDATION_ERROR')

    const badCertification = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({
        certifications: [{ name: 'Bad', issueDate: '2026-04-01', expirationDate: '2026-03-01' }],
      })
    expectError(badCertification, 400, 'VALIDATION_ERROR')

    const incompleteTotal = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({ materials: [{ name: 'Partial', percentage: 40, position: 0 }] })
    expect(incompleteTotal.status).toBe(201)
    rememberProduct(incompleteTotal.body as ProductResponse)
  })

  it('excludes soft-deleted products from reads and lists', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const deleted = await prisma.product.create({
      data: { companyId: fixture.companyId, name: 'Soft deleted', deletedAt: new Date() },
    })
    productIds.push(deleted.id)
    expectError(
      await request(app.getHttpServer()).get(`/products/${deleted.id}`).set(auth(token)),
      404,
      'PRODUCT_NOT_FOUND',
    )
    expectError(
      await request(app.getHttpServer())
        .patch(`/products/${deleted.id}`)
        .set(auth(token))
        .send({ expectedDraftRevision: 0, name: 'No edit' }),
      404,
      'PRODUCT_NOT_FOUND',
    )
    const list = await request(app.getHttpServer()).get('/products').set(auth(token))
    expect(list.body.items.some((item: ProductResponse) => item.id === deleted.id)).toBe(false)
  })

  it('bounds pagination and supports full-text, identifier, category, country, and date filters', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const category = await prisma.category.findFirstOrThrow()
    const text = rememberProduct(
      (
        await request(app.getHttpServer()).post('/products').set(auth(token)).send({
          name: 'Quantum Lamp',
          description: 'A resilient material search phrase',
          sku: 'SEARCH-SKU',
          serialNumber: 'SEARCH-SERIAL',
          categoryId: category.id,
          originCountry: 'DE',
          productionDate: '2026-05-10',
        })
      ).body as ProductResponse,
    )
    const other = await request(app.getHttpServer()).post('/products').set(auth(token)).send({
      name: 'Ordinary',
      sku: 'OTHER-SKU',
      serialNumber: 'OTHER-SERIAL',
      productionDate: '2025-01-01',
    })
    expect(other.status).toBe(201)
    rememberProduct(other.body as ProductResponse)

    const bounded = await request(app.getHttpServer())
      .get('/products?page=1&pageSize=101')
      .set(auth(token))
    expectError(bounded, 400, 'VALIDATION_ERROR')
    const fullText = await request(app.getHttpServer())
      .get('/products?q=resilient')
      .set(auth(token))
    expect(fullText.body.items.some((item: ProductResponse) => item.id === text.id)).toBe(true)
    const identifier = await request(app.getHttpServer())
      .get('/products?q=SEARCH-SK')
      .set(auth(token))
    expect(identifier.body.items.some((item: ProductResponse) => item.id === text.id)).toBe(true)
    const serial = await request(app.getHttpServer()).get('/products?q=SEARCH-SER').set(auth(token))
    expect(serial.body.items.some((item: ProductResponse) => item.id === text.id)).toBe(true)
    const filtered = await request(app.getHttpServer())
      .get(
        `/products?categoryId=${category.id}&originCountry=DE&productionFrom=2026-01-01&productionTo=2026-12-31`,
      )
      .set(auth(token))
    expect(filtered.body.items.map((item: ProductResponse) => item.id)).toContain(text.id)
    expect(filtered.body.items.map((item: ProductResponse) => item.id)).not.toContain(other.body.id)
    expect(filtered.body.pageSize).toBe(20)
  })
})
