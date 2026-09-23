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
import { jpegFixture, pdfFixture, pngFixture } from './asset-fixtures.js'

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

type ProductDetail = {
  id: string
  draftRevision: number
  images: Array<{ assetId: string; role: string; position: number; altText: string | null }>
  documents: Array<{ assetId: string; kind: string; title: string | null; position: number }>
  certifications: Array<{ name: string | null; pdfAssetId: string | null }>
}

let app: INestApplication
let prisma: PrismaService
const fixtures: Fixture[] = []
const productIds: string[] = []

async function createFixture(): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Attachment test ${randomUUID()}` },
  })
  const email = `attachment-${randomUUID()}@example.test`
  const password = `AttachmentPassword-${randomUUID()}`
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

async function createProduct(token: string, body: Record<string, unknown>): Promise<ProductDetail> {
  const response = await request(app.getHttpServer()).post('/products').set(auth(token)).send(body)
  expect(response.status).toBe(201)
  productIds.push(response.body.id as string)
  return response.body as ProductDetail
}

async function patchProduct(
  token: string,
  productId: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app.getHttpServer()).patch(`/products/${productId}`).set(auth(token)).send(body)
}

async function fetchProduct(token: string, productId: string): Promise<ProductDetail> {
  const response = await request(app.getHttpServer()).get(`/products/${productId}`).set(auth(token))
  expect(response.status).toBe(200)
  return response.body as ProductDetail
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)
})

afterAll(async () => {
  if (productIds.length > 0) {
    await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.productDocument.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.certification.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  }
  const companyIds = fixtures.map((fixture) => fixture.companyId)
  if (companyIds.length > 0) {
    await prisma.assetContent.deleteMany({ where: { asset: { companyId: { in: companyIds } } } })
    await prisma.asset.deleteMany({ where: { companyId: { in: companyIds } } })
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

describe('Product attachment associations', () => {
  it('associates a cover and gallery images with deterministic ordering', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const cover = await uploadAsset(token, await pngFixture(), 'cover.png')
    const first = await uploadAsset(token, await jpegFixture(), 'one.jpg')
    const second = await uploadAsset(token, await jpegFixture(80, 60), 'two.jpg')

    const product = await createProduct(token, {
      name: 'Gallery product',
      images: [
        { assetId: first, role: 'GALLERY', altText: 'first' },
        { assetId: cover, role: 'COVER', altText: 'front' },
        { assetId: second, role: 'GALLERY', altText: 'second' },
      ],
    })

    // Cover sorts first, then gallery by position; positions are assigned per role.
    expect(product.images.map((image) => image.role)).toEqual(['COVER', 'GALLERY', 'GALLERY'])
    expect(product.images.map((image) => image.position)).toEqual([0, 0, 1])
    expect(product.images.map((image) => image.assetId)).toEqual([cover, first, second])
  })

  it('replaces the whole image collection when images are supplied', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const first = await uploadAsset(token, await pngFixture(), 'a.png')
    const second = await uploadAsset(token, await pngFixture(70, 50), 'b.png')

    const product = await createProduct(token, {
      name: 'Replace product',
      images: [{ assetId: first, role: 'COVER' }],
    })

    const updated = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: second, role: 'COVER' }],
    })
    expect(updated.status).toBe(200)
    expect((updated.body as ProductDetail).images.map((image) => image.assetId)).toEqual([second])

    // Omitting `images` leaves the collection untouched.
    const omitted = await patchProduct(token, product.id, {
      expectedDraftRevision: (updated.body as ProductDetail).draftRevision,
      name: 'Renamed only',
    })
    expect(omitted.status).toBe(200)
    expect((omitted.body as ProductDetail).images.map((image) => image.assetId)).toEqual([second])
  })

  it('rejects a second cover image', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const first = await uploadAsset(token, await pngFixture(), 'c1.png')
    const second = await uploadAsset(token, await pngFixture(70, 50), 'c2.png')

    const product = await createProduct(token, { name: 'Cover bound' })
    const response = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [
        { assetId: first, role: 'COVER' },
        { assetId: second, role: 'COVER' },
      ],
    })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_ERROR')
    expect(response.body.message).toMatch(/one cover/i)
  })

  it('enforces the gallery image bound', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = await createProduct(token, { name: 'Gallery bound' })

    const assetIds: string[] = []
    for (let index = 0; index < 13; index += 1) {
      assetIds.push(await uploadAsset(token, await pngFixture(40 + index, 30), `g${index}.png`))
    }

    const tooMany = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: assetIds.map((assetId) => ({ assetId, role: 'GALLERY' })),
    })
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.message).toMatch(/gallery/i)

    const allowed = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: assetIds.slice(0, 12).map((assetId) => ({ assetId, role: 'GALLERY' })),
    })
    expect(allowed.status).toBe(200)
    expect((allowed.body as ProductDetail).images).toHaveLength(12)
  }, 60_000)

  it('associates documents with kinds, titles and order', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const manual = await uploadAsset(token, pdfFixture(), 'manual.pdf')
    const warranty = await uploadAsset(token, pdfFixture(), 'warranty.pdf')

    const product = await createProduct(token, {
      name: 'Documents',
      documents: [
        { assetId: manual, kind: 'MANUAL', title: 'User manual' },
        { assetId: warranty, kind: 'WARRANTY', title: 'Two year warranty' },
      ],
    })

    expect(product.documents.map((document) => document.kind)).toEqual(['MANUAL', 'WARRANTY'])
    expect(product.documents.map((document) => document.position)).toEqual([0, 1])
    expect(product.documents[0]?.title).toBe('User manual')
  })

  it('associates an optional certification PDF', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const pdf = await uploadAsset(token, pdfFixture(), 'cert.pdf')

    const product = await createProduct(token, {
      name: 'Certifications',
      certifications: [{ name: 'ISO 9001', pdfAssetId: pdf }, { name: 'No PDF attached' }],
    })

    expect(product.certifications).toHaveLength(2)
    // Certifications are ordered by id, which is a random UUID, so assert by identity
    // rather than by position.
    const withPdf = product.certifications.find(
      (certification) => certification.name === 'ISO 9001',
    )
    const withoutPdf = product.certifications.find(
      (certification) => certification.name === 'No PDF attached',
    )
    expect(withPdf?.pdfAssetId).toBe(pdf)
    // A certification without a PDF is still valid for a draft.
    expect(withoutPdf?.pdfAssetId).toBeNull()
  })

  it('keeps asset families apart', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const pdf = await uploadAsset(token, pdfFixture(), 'doc.pdf')
    const image = await uploadAsset(token, await pngFixture(), 'img.png')

    const product = await createProduct(token, { name: 'Families' })

    const pdfAsImage = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: pdf, role: 'COVER' }],
    })
    expect(pdfAsImage.status).toBe(400)
    expect(pdfAsImage.body.message).toMatch(/incompatible file type/i)

    const imageAsDocument = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      documents: [{ assetId: image, kind: 'MANUAL' }],
    })
    expect(imageAsDocument.status).toBe(400)
    expect(imageAsDocument.body.message).toMatch(/incompatible file type/i)

    const imageAsCertificationPdf = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      certifications: [{ name: 'X', pdfAssetId: image }],
    })
    expect(imageAsCertificationPdf.status).toBe(400)
    expect(imageAsCertificationPdf.body.message).toMatch(/incompatible file type/i)
  })

  it('rejects assets that belong to another company', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const foreignAsset = await uploadAsset(ownerToken, await pngFixture(), 'foreign.png')

    const stranger = await createFixture()
    const strangerToken = await login(stranger)
    const product = await createProduct(strangerToken, { name: 'Foreign asset' })

    const response = await patchProduct(strangerToken, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: foreignAsset, role: 'COVER' }],
    })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(response.body)).not.toMatch(/foreign\.png/)
  })

  it('rejects assets that are not accepted', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = await createProduct(token, { name: 'Non accepted' })

    const quarantined = await prisma.asset.create({
      data: {
        companyId: fixture.companyId,
        uploaderId: fixture.userId,
        detectedMime: 'image/png',
        sizeBytes: BigInt(10),
        sha256: 'f'.repeat(64),
        originalName: 'quarantined.png',
        state: AssetState.QUARANTINED,
      },
    })

    const response = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: quarantined.id, role: 'COVER' }],
    })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_ERROR')
  })

  it('rolls back the entire save when one referenced asset is invalid', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const valid = await uploadAsset(token, await pngFixture(), 'valid.png')

    const product = await createProduct(token, {
      name: 'Rollback',
      images: [{ assetId: valid, role: 'COVER', altText: 'original' }],
    })
    const revisionBefore = product.draftRevision

    const response = await patchProduct(token, product.id, {
      expectedDraftRevision: revisionBefore,
      name: 'Should not persist',
      images: [
        { assetId: valid, role: 'COVER', altText: 'changed' },
        { assetId: randomUUID(), role: 'GALLERY', altText: 'invalid' },
      ],
      documents: [{ assetId: randomUUID(), kind: 'MANUAL' }],
    })

    expect(response.status).toBe(400)

    const after = await fetchProduct(token, product.id)
    // No attachment row, no scalar field and no revision change survived.
    expect(after.draftRevision).toBe(revisionBefore)
    expect(after.name).toBe('Rollback')
    expect(after.images).toHaveLength(1)
    expect(after.images[0]?.altText).toBe('original')
    expect(after.documents).toHaveLength(0)
  })

  it('increments draftRevision exactly once per successful attachment save', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const cover = await uploadAsset(token, await pngFixture(), 'rev.png')
    const doc = await uploadAsset(token, pdfFixture(), 'rev.pdf')

    const product = await createProduct(token, { name: 'Revision' })
    expect(product.draftRevision).toBe(0)

    const first = await patchProduct(token, product.id, {
      expectedDraftRevision: 0,
      images: [{ assetId: cover, role: 'COVER' }],
      documents: [{ assetId: doc, kind: 'MANUAL' }],
      certifications: [{ name: 'One', pdfAssetId: doc }],
    })
    expect(first.status).toBe(200)
    expect((first.body as ProductDetail).draftRevision).toBe(1)

    const second = await patchProduct(token, product.id, {
      expectedDraftRevision: 1,
      images: [{ assetId: cover, role: 'COVER', altText: 'updated' }],
    })
    expect(second.status).toBe(200)
    expect((second.body as ProductDetail).draftRevision).toBe(2)
  })

  it('lets a stale attachment save change nothing', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const cover = await uploadAsset(token, await pngFixture(), 'stale.png')
    const other = await uploadAsset(token, await jpegFixture(), 'other.jpg')

    const product = await createProduct(token, {
      name: 'Stale',
      images: [{ assetId: cover, role: 'COVER', altText: 'kept' }],
    })

    // Advance the draft first, so the revision captured above becomes genuinely stale.
    const advanced = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      name: 'Advanced',
    })
    expect(advanced.status).toBe(200)
    const currentRevision = (advanced.body as ProductDetail).draftRevision
    expect(currentRevision).toBeGreaterThan(product.draftRevision)

    const stale = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: other, role: 'COVER', altText: 'should not apply' }],
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('PRODUCT_REVISION_CONFLICT')

    const after = await fetchProduct(token, product.id)
    expect(after.draftRevision).toBe(currentRevision)
    expect(after.images).toHaveLength(1)
    expect(after.images[0]?.assetId).toBe(cover)
    expect(after.images[0]?.altText).toBe('kept')
  })

  it('allows exactly one of two competing attachment writers to win', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const firstAsset = await uploadAsset(token, await pngFixture(), 'race-a.png')
    const secondAsset = await uploadAsset(token, await jpegFixture(), 'race-b.png')

    const product = await createProduct(token, {
      name: 'Race',
      images: [{ assetId: firstAsset, role: 'COVER' }],
    })

    const revision = product.draftRevision
    const [left, right] = await Promise.all([
      patchProduct(token, product.id, {
        expectedDraftRevision: revision,
        images: [{ assetId: firstAsset, role: 'COVER', altText: 'left' }],
      }),
      patchProduct(token, product.id, {
        expectedDraftRevision: revision,
        images: [{ assetId: secondAsset, role: 'COVER', altText: 'right' }],
      }),
    ])

    const statuses = [left.status, right.status].sort()
    expect(statuses).toEqual([200, 409])

    const after = await fetchProduct(token, product.id)
    expect(after.draftRevision).toBe(revision + 1)
    expect(after.images).toHaveLength(1)

    const winner = left.status === 200 ? left.body : right.body
    expect(after.images[0]?.assetId).toBe((winner as ProductDetail).images[0]?.assetId)
    expect(after.images[0]?.altText).toBe((winner as ProductDetail).images[0]?.altText)
  })

  it('rejects an image asset reused twice in one product', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const asset = await uploadAsset(token, await pngFixture(), 'dupe.png')
    const product = await createProduct(token, { name: 'Duplicates' })

    const response = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [
        { assetId: asset, role: 'COVER' },
        { assetId: asset, role: 'GALLERY' },
      ],
    })
    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/once per product/i)
  })

  it('rejects an out-of-range position instead of failing internally', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const image = await uploadAsset(token, await pngFixture(), 'position.png')
    const document = await uploadAsset(token, pdfFixture(), 'position.pdf')
    const product = await createProduct(token, { name: 'Positions' })

    // A value beyond the integer range must be a validation error, never a 5xx.
    const oversizedImagePosition = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: image, role: 'COVER', position: 2_147_483_648 }],
    })
    expect(oversizedImagePosition.status).toBe(400)
    expect(oversizedImagePosition.body.code).toBe('VALIDATION_ERROR')

    const oversizedDocumentPosition = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      documents: [{ assetId: document, kind: 'MANUAL', position: 2_147_483_648 }],
    })
    expect(oversizedDocumentPosition.status).toBe(400)
    expect(oversizedDocumentPosition.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects malformed attachment payloads', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const product = await createProduct(token, { name: 'Malformed' })

    const badRole = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: [{ assetId: randomUUID(), role: 'THUMBNAIL' }],
    })
    expect(badRole.status).toBe(400)
    expect(badRole.body.code).toBe('VALIDATION_ERROR')

    const badKind = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      documents: [{ assetId: randomUUID(), kind: 'RECEIPT' }],
    })
    expect(badKind.status).toBe(400)

    const nullImages = await patchProduct(token, product.id, {
      expectedDraftRevision: product.draftRevision,
      images: null,
    })
    expect(nullImages.status).toBe(400)
  })
})
