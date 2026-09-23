import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import sharp from 'sharp'
import type { Response } from 'supertest'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import {
  elfFixture,
  executableFixture,
  fakePdfFixture,
  htmlFixture,
  jpegFixture,
  jpegWithExifFixture,
  oversizedDimensionPngFixture,
  oversizedPdfFixture,
  oversizedPngFixture,
  pdfFixture,
  pngFixture,
  svgFixture,
  truncated,
  webpFixture,
  zipFixture,
} from './asset-fixtures.js'

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

type AssetResponse = {
  id: string
  originalName: string
  detectedMime: string
  sizeBytes: number
  createdAt: string
}

let app: INestApplication
let prisma: PrismaService
const fixtures: Fixture[] = []
const assetIds: string[] = []
const productIds: string[] = []

/** Collects a binary body so headers and bytes can be asserted together. */
function binaryParser(response: Response, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = []
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
}

async function createFixture(role: UserRole = UserRole.EDITOR): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Asset test ${randomUUID()}` },
  })
  const email = `asset-${randomUUID()}@example.test`
  const password = `AssetPassword-${randomUUID()}`
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
  return response.body.accessToken as string
}

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

function expectError(response: Response, statusCode: number, code: string): void {
  expect(response.status).toBe(statusCode)
  expect(response.body).toMatchObject({ statusCode, code })
  // Errors must never leak storage or driver detail.
  expect(JSON.stringify(response.body)).not.toMatch(/Prisma|PostgreSQL|bytea|SELECT/i)
}

async function upload(
  token: string,
  bytes: Buffer,
  options: { filename?: string; contentType?: string } = {},
): Promise<Response> {
  const pending = request(app.getHttpServer())
    .post('/assets')
    .set(auth(token))
    .attach('file', bytes, {
      filename: options.filename ?? 'upload.bin',
      contentType: options.contentType ?? 'application/octet-stream',
    })
  const response = await pending
  if (response.status === 201) {
    assetIds.push((response.body as AssetResponse).id)
  }
  return response
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
    // Assets are referenced with `onDelete: Restrict`, so dependants go first.
    await prisma.certification.updateMany({
      where: { product: { companyId: { in: companyIds } } },
      data: { pdfAssetId: null },
    })
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

describe('Asset upload and private retrieval', () => {
  it('accepts each allowlisted content type and reports stored metadata', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const cases = [
      { bytes: await jpegFixture(), mime: 'image/jpeg', name: 'photo.jpg' },
      { bytes: await pngFixture(), mime: 'image/png', name: 'photo.png' },
      { bytes: await webpFixture(), mime: 'image/webp', name: 'photo.webp' },
      { bytes: pdfFixture(), mime: 'application/pdf', name: 'document.pdf' },
    ]

    for (const testCase of cases) {
      const response = await upload(token, testCase.bytes, {
        filename: testCase.name,
        contentType: testCase.mime,
      })
      expect(response.status).toBe(201)
      const asset = response.body as AssetResponse
      expect(asset.detectedMime).toBe(testCase.mime)
      expect(asset.originalName).toBe(testCase.name)
      expect(asset.sizeBytes).toBeGreaterThan(0)
      expect(asset).not.toHaveProperty('bytes')
      expect(asset).not.toHaveProperty('sha256')
    }
  })

  it('ignores the declared MIME type and filename, trusting only the bytes', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const png = await pngFixture()

    const disguisedAsPdf = await upload(token, png, {
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
    })
    expect(disguisedAsPdf.status).toBe(201)
    expect((disguisedAsPdf.body as AssetResponse).detectedMime).toBe('image/png')

    const disguisedAsBinary = await upload(token, png, {
      filename: 'no-extension',
      contentType: 'application/octet-stream',
    })
    expect(disguisedAsBinary.status).toBe(201)
    expect((disguisedAsBinary.body as AssetResponse).detectedMime).toBe('image/png')

    const pdf = pdfFixture()
    const pdfAsImage = await upload(token, pdf, {
      filename: 'photo.png',
      contentType: 'image/png',
    })
    expect(pdfAsImage.status).toBe(201)
    expect((pdfAsImage.body as AssetResponse).detectedMime).toBe('application/pdf')
  })

  it('rejects a PDF that carries only the magic number', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const response = await upload(token, fakePdfFixture(), {
      filename: 'fake.pdf',
      contentType: 'application/pdf',
    })
    expectError(response, 400, 'INVALID_FILE_CONTENT')
  })

  it('rejects active and text-based document formats', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    expectError(
      await upload(token, svgFixture(), { filename: 'x.svg', contentType: 'image/svg+xml' }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    )
    expectError(
      await upload(token, htmlFixture(), { filename: 'x.html', contentType: 'text/html' }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    )
  })

  it('rejects archives and executable content', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    expectError(
      await upload(token, zipFixture(), { filename: 'a.zip', contentType: 'application/zip' }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    )
    expectError(
      await upload(token, elfFixture(), {
        filename: 'a.bin',
        contentType: 'application/octet-stream',
      }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    )
    expectError(
      await upload(token, executableFixture(), {
        filename: 'a.exe',
        contentType: 'application/x-msdownload',
      }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    )
  })

  it('rejects malformed and truncated images that pass signature detection', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const jpeg = await jpegFixture()
    const png = await pngFixture()

    expectError(
      await upload(token, truncated(jpeg, 0.6), {
        filename: 'broken.jpg',
        contentType: 'image/jpeg',
      }),
      400,
      'INVALID_FILE_CONTENT',
    )
    expectError(
      await upload(token, truncated(png, 0.5), {
        filename: 'broken.png',
        contentType: 'image/png',
      }),
      400,
      'INVALID_FILE_CONTENT',
    )
    expectError(
      await upload(token, Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(64)]), {
        filename: 'header-only.jpg',
        contentType: 'image/jpeg',
      }),
      400,
      'INVALID_FILE_CONTENT',
    )
  })

  it('rejects images beyond the pixel or dimension bound', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const oversized = await oversizedDimensionPngFixture()
    const response = await upload(token, oversized, {
      filename: 'huge.png',
      contentType: 'image/png',
    })
    expect(response.status).toBe(400)
    expect(['INVALID_FILE_CONTENT', 'IMAGE_DIMENSIONS_TOO_LARGE']).toContain(response.body.code)
  }, 60_000)

  it('enforces the per-type byte limits', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const bigImage = await oversizedPngFixture()
    expect(bigImage.length).toBeGreaterThan(5 * 1024 * 1024)
    expect(bigImage.length).toBeLessThan(10 * 1024 * 1024)
    expectError(
      await upload(token, bigImage, { filename: 'big.png', contentType: 'image/png' }),
      413,
      'FILE_TOO_LARGE',
    )

    const bigPdf = oversizedPdfFixture()
    expect(bigPdf.length).toBeGreaterThan(10 * 1024 * 1024)
    expectError(
      await upload(token, bigPdf, { filename: 'big.pdf', contentType: 'application/pdf' }),
      413,
      'FILE_TOO_LARGE',
    )
  }, 120_000)

  it('stores normalized image bytes that are decodable and free of metadata', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const { bytes, hadExif } = await jpegWithExifFixture()
    expect(hadExif).toBe(true)

    const uploaded = await upload(token, bytes, {
      filename: 'with-exif.jpg',
      contentType: 'image/jpeg',
    })
    expect(uploaded.status).toBe(201)
    const asset = uploaded.body as AssetResponse

    const downloaded = await request(app.getHttpServer())
      .get(`/assets/${asset.id}`)
      .set(auth(token))
      .buffer(true)
      .parse(binaryParser)
    expect(downloaded.status).toBe(200)
    const stored = downloaded.body as Buffer
    expect(Buffer.isBuffer(stored)).toBe(true)

    const metadata = await sharp(stored).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    // The stored size is the normalized size, not the uploaded size.
    expect(asset.sizeBytes).toBe(stored.length)

    // Normalization is deterministic for the same input.
    const again = await upload(token, bytes, {
      filename: 'with-exif.jpg',
      contentType: 'image/jpeg',
    })
    expect((again.body as AssetResponse).sizeBytes).toBe(asset.sizeBytes)
  })

  it('rejects a malformed asset id without disclosing anything', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    // A non-UUID path segment must not reach the database as a raw query value: it has
    // to be indistinguishable from an asset that does not exist.
    for (const malformed of ['not-a-uuid', '123', '00000000-0000-4000-8000']) {
      const response = await request(app.getHttpServer())
        .get(`/assets/${malformed}`)
        .set(auth(token))
      expectError(response, 404, 'ASSET_NOT_FOUND')
    }
  })

  it('includes a request id in upload error envelopes', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)

    const response = await upload(token, oversizedPdfFixture(), {
      filename: 'huge.pdf',
      contentType: 'application/pdf',
    })
    expect(response.status).toBe(413)
    expect(response.body.code).toBe('FILE_TOO_LARGE')
    // Every other error in this API carries a request id; upload failures must too.
    expect(typeof response.body.requestId).toBe('string')
    expect((response.body.requestId as string).length).toBeGreaterThan(0)
  }, 60_000)

  it('requires authentication and returns safe errors for unknown assets', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const uploaded = await upload(token, await pngFixture(), {
      filename: 'auth.png',
      contentType: 'image/png',
    })
    const asset = uploaded.body as AssetResponse

    const anonymous = await request(app.getHttpServer()).get(`/assets/${asset.id}`)
    expect(anonymous.status).toBe(401)

    const anonymousUpload = await request(app.getHttpServer())
      .post('/assets')
      .attach('file', await pngFixture(), { filename: 'x.png', contentType: 'image/png' })
    expect(anonymousUpload.status).toBe(401)

    expectError(
      await request(app.getHttpServer()).get(`/assets/${randomUUID()}`).set(auth(token)),
      404,
      'ASSET_NOT_FOUND',
    )
  })

  it('serves bytes with server-controlled type and hardening headers', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const uploaded = await upload(token, await pngFixture(), {
      filename: 'served.png',
      contentType: 'image/png',
    })
    const asset = uploaded.body as AssetResponse

    const downloaded = await request(app.getHttpServer())
      .get(`/assets/${asset.id}`)
      .set(auth(token))
      .buffer(true)
      .parse(binaryParser)

    expect(downloaded.status).toBe(200)
    expect(downloaded.headers['content-type']).toBe('image/png')
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
    expect(downloaded.headers['content-length']).toBe(String((downloaded.body as Buffer).length))
    expect(downloaded.headers['content-disposition']).toContain('inline')

    const pdfUpload = await upload(token, pdfFixture(), {
      filename: 'served.pdf',
      contentType: 'application/pdf',
    })
    const pdfDownload = await request(app.getHttpServer())
      .get(`/assets/${(pdfUpload.body as AssetResponse).id}`)
      .set(auth(token))
      .buffer(true)
      .parse(binaryParser)
    expect(pdfDownload.headers['content-type']).toBe('application/pdf')
    expect(pdfDownload.headers['content-disposition']).toContain('attachment')
  })

  it('does not disclose the existence of another company asset', async () => {
    const owner = await createFixture()
    const ownerToken = await login(owner)
    const uploaded = await upload(ownerToken, await pngFixture(), {
      filename: 'private.png',
      contentType: 'image/png',
    })
    const asset = uploaded.body as AssetResponse

    const stranger = await createFixture()
    const strangerToken = await login(stranger)

    const crossCompany = await request(app.getHttpServer())
      .get(`/assets/${asset.id}`)
      .set(auth(strangerToken))
    expectError(crossCompany, 404, 'ASSET_NOT_FOUND')

    const missing = await request(app.getHttpServer())
      .get(`/assets/${randomUUID()}`)
      .set(auth(strangerToken))
    // An asset that exists elsewhere and one that does not exist are indistinguishable.
    expect(missing.status).toBe(crossCompany.status)
    expect(missing.body.code).toBe(crossCompany.body.code)
  })

  it('never returns asset bytes inside product JSON', async () => {
    const fixture = await createFixture()
    const token = await login(fixture)
    const image = await upload(token, await pngFixture(), {
      filename: 'inline.png',
      contentType: 'image/png',
    })
    const asset = image.body as AssetResponse

    const created = await request(app.getHttpServer())
      .post('/products')
      .set(auth(token))
      .send({
        name: 'JSON boundary',
        images: [{ assetId: asset.id, role: 'COVER', altText: 'front' }],
      })
    expect(created.status).toBe(201)
    productIds.push(created.body.id as string)

    const serialized = JSON.stringify(created.body)
    expect(serialized).not.toContain('bytes')
    expect(serialized).not.toContain('"data"')
    expect(created.body.images[0].asset).toEqual({
      originalName: 'inline.png',
      detectedMime: 'image/png',
      sizeBytes: asset.sizeBytes,
    })

    const fetched = await request(app.getHttpServer())
      .get(`/products/${created.body.id}`)
      .set(auth(token))
    expect(JSON.stringify(fetched.body)).not.toContain('bytes')
  })
})
