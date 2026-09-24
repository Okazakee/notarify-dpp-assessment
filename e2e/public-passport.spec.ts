import { expect, test } from '@playwright/test'
import { decodeQrPng } from '../apps/api/test/qr-decode.ts'
import { E2E_EMAIL, E2E_PASSWORD } from './global-setup.ts'

/**
 * End-to-end proof that a printed QR code reaches the real public passport page.
 *
 * The QR encodes the **web** origin (`PUBLIC_APP_ORIGIN`), not the API origin, so this
 * exercises the whole chain a phone would follow: decode the artifact the application
 * actually stored, request that exact URL from the Next server, confirm the narrow
 * `/q/:uuid` bridge hands it to Nest, which answers with the canonical page location, and
 * finally follow that redirect to the public passport page Stage 4.3 added.
 *
 * The decoder is imported from the API workspace so it resolves its own dependencies
 * there; it is test-only tooling and never part of the application.
 */

const API = 'http://localhost:3000'
const WEB = 'http://localhost:3001'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
startxref
9
%%EOF
`,
  'latin1',
)

test.describe('published QR reaches the backend resolver', () => {
  test('decodes the stored QR and follows its exact URL through to the public page', async ({
    page,
    request,
  }) => {
    const login = await request.post(`${API}/auth/login`, {
      data: { email: E2E_EMAIL, password: E2E_PASSWORD },
    })
    expect(login.status()).toBe(200)
    const token = (await login.json()).accessToken as string
    const auth = { authorization: `Bearer ${token}` }

    const upload = async (name: string, mimeType: string, buffer: Buffer): Promise<string> => {
      const response = await request.post(`${API}/assets`, {
        headers: auth,
        multipart: { file: { name, mimeType, buffer } },
      })
      expect(response.status()).toBe(201)
      return (await response.json()).id as string
    }

    const cover = await upload('cover.png', 'image/png', PNG_1X1)
    const pdf = await upload('document.pdf', 'application/pdf', MINIMAL_PDF)

    const categories = await request.get(`${API}/categories`, { headers: auth })
    expect(categories.status()).toBe(200)
    const categoryId = (await categories.json())[0].id as string

    const created = await request.post(`${API}/products`, {
      headers: auth,
      data: {
        name: 'E2E QR product',
        sku: `SKU-QR-${Date.now()}`,
        serialNumber: `SN-QR-${Date.now()}`,
        categoryId,
        description: 'Published for the QR bridge test',
        productionDate: '2026-01-15',
        originCountry: 'IT',
        sustainability: {
          carbonKgCo2e: 1,
          waterLitres: 2,
          recycledPercent: 3,
          repairabilityScore: 4,
          recyclable: true,
        },
        materials: [{ name: 'Aluminium', percentage: 100, position: 0 }],
        images: [{ assetId: cover, role: 'COVER', altText: 'front' }],
        documents: [{ assetId: pdf, kind: 'MANUAL', title: 'Manual' }],
      },
    })
    expect(created.status()).toBe(201)
    const product = await created.json()

    const published = await request.post(`${API}/products/${product.id}/publish`, {
      headers: auth,
      data: { expectedDraftRevision: product.draftRevision },
    })
    expect(published.status()).toBe(200)
    const publication = await published.json()
    const publicUuid = publication.publicUuid as string

    // The QR artifact exactly as the API serves it.
    const qr = await request.get(`${API}/passport/${publicUuid}/qr.png`)
    expect(qr.status()).toBe(200)
    expect(qr.headers()['content-type']).toBe('image/png')
    const qrBytes = Buffer.from(await qr.body())

    // Independently decoded, with a different library from the one that encoded it.
    const decoded = await decodeQrPng(qrBytes)
    expect(decoded).toBe(`${WEB}/q/${publicUuid}`)

    // Request that exact decoded URL from the web server, without following redirects.
    const bridged = await request.get(decoded, { maxRedirects: 0 })

    expect(bridged.status()).toBe(302)
    expect(bridged.headers().location).toBe(`${WEB}/passport/${publicUuid}`)
    expect(bridged.headers()['cache-control']).toBe('no-store')

    // Now follow the redirect the way a phone's browser would, and prove the decoded URL
    // really lands on the public passport page for this exact passport.
    await page.goto(decoded)
    await expect(page).toHaveURL(`${WEB}/passport/${publicUuid}`)
    await expect(page.getByTestId('passport-product-name')).toHaveText('E2E QR product')
    await expect(page.getByTestId('passport-uuid')).toHaveText(publicUuid)
    await expect(page.getByTestId('verification-badge')).toHaveText('Verified Product')

    // The public projection is anonymously readable at the API origin too.
    const view = await request.get(`${API}/passport/${publicUuid}`)
    expect(view.status()).toBe(200)
    const body = await view.json()
    expect(body.passport.publicUuid).toBe(publicUuid)
    expect(body.passport.publicUrl).toBe(`${WEB}/passport/${publicUuid}`)
    expect(body.passport.qrTargetUrl).toBe(decoded)
  })
})
