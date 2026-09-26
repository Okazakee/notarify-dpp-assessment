import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../apps/api/src/generated/prisma/client.ts'

/**
 * The reviewer/demo seed.
 *
 * This is trusted setup code, not a public route, so it writes rows directly. It still
 * obeys the same database invariants the application relies on: every Asset belongs to the
 * seeded company, is `ACCEPTED`, carries its real detected MIME type and its bytes in
 * `AssetContent`, and is attached to its product through the normal relation tables.
 *
 * Two properties matter for a reviewer:
 *
 * 1. **It is idempotent.** Every row is keyed by a fixed id or stable code, so running it
 *    twice changes nothing and creates no duplicates. Re-running restores the *seeded*
 *    fixtures' own nested content to this deterministic state and leaves every other
 *    product, user and asset — including anything the reviewer created — untouched.
 * 2. **It is immediately usable.** The reviewer can log in with the printed demo
 *    credentials, open a complete draft, Preview it and publish it.
 *
 * Passwords come from `DEMO_ADMIN_PASSWORD` / `DEMO_EDITOR_PASSWORD` with documented local
 * defaults. They are public demo values, never production credentials, and they are hashed
 * with the same Argon2id settings the login path verifies with.
 */

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'AdminDemoPassw0rd!'
const EDITOR_PASSWORD = process.env.DEMO_EDITOR_PASSWORD ?? 'EditorDemoPassw0rd!'

/** Argon2id, matching the authentication path's verification settings. */
const ARGON2_ALGORITHM = 2

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_USER_ID = '22222222-2222-4222-8222-222222222222'
const EDITOR_USER_ID = '33333333-3333-4333-8333-333333333333'
const COMPLETE_PRODUCT_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_PRODUCT_ID = '55555555-5555-4555-8555-555555555555'
const COVER_ASSET_ID = '66666666-6666-4666-8666-666666666666'
const GALLERY_ASSET_ID = '77777777-7777-4777-8777-777777777777'
const MANUAL_ASSET_ID = '88888888-8888-4888-8888-888888888888'
const CERTIFICATE_ASSET_ID = '99999999-9999-4999-8999-999999999999'

const ADMIN_EMAIL = 'admin@demo.test'
const EDITOR_EMAIL = 'editor@demo.test'

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/demo')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

const categories = [
  { stableCode: 'DEMO-ELECTRONICS', name: 'Demo Electronics' },
  { stableCode: 'DEMO-FURNITURE', name: 'Demo Furniture' },
  { stableCode: 'DEMO-TEXTILES', name: 'Demo Textiles' },
]

/** One tracked fixture file, with the MIME type its bytes actually are. */
type Fixture = { file: string; mime: string; originalName: string }

const fixtures: Record<string, Fixture> = {
  cover: { file: 'cover.png', mime: 'image/png', originalName: 'demo-cover.png' },
  gallery: { file: 'gallery.png', mime: 'image/png', originalName: 'demo-gallery.png' },
  manual: { file: 'manual.pdf', mime: 'application/pdf', originalName: 'demo-manual.pdf' },
  certificate: {
    file: 'certificate.pdf',
    mime: 'application/pdf',
    originalName: 'demo-certificate.pdf',
  },
}

function fixtureBytes(key: keyof typeof fixtures): Buffer {
  return readFileSync(resolve(FIXTURE_DIR, fixtures[key].file))
}

async function upsertAsset(
  id: string,
  key: keyof typeof fixtures,
  uploaderId: string,
): Promise<void> {
  const bytes = fixtureBytes(key)
  const fixture = fixtures[key]
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  await prisma.asset.upsert({
    where: { id },
    update: {
      companyId: COMPANY_ID,
      uploaderId,
      detectedMime: fixture.mime,
      sizeBytes: BigInt(bytes.byteLength),
      sha256,
      originalName: fixture.originalName,
      state: 'ACCEPTED',
    },
    create: {
      id,
      companyId: COMPANY_ID,
      uploaderId,
      detectedMime: fixture.mime,
      sizeBytes: BigInt(bytes.byteLength),
      sha256,
      originalName: fixture.originalName,
      state: 'ACCEPTED',
    },
  })

  // The bytes are the durable content; the row above is only its metadata.
  await prisma.assetContent.upsert({
    where: { assetId: id },
    update: { bytes: new Uint8Array(bytes) },
    create: { assetId: id, bytes: new Uint8Array(bytes) },
  })
}

try {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { stableCode: category.stableCode },
      update: { name: category.name },
      create: category,
    })
  }

  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: { displayName: 'Demo Notarify Company' },
    create: { id: COMPANY_ID, displayName: 'Demo Notarify Company' },
  })

  const [adminHash, editorHash] = await Promise.all([
    hash(ADMIN_PASSWORD, { algorithm: ARGON2_ALGORITHM }),
    hash(EDITOR_PASSWORD, { algorithm: ARGON2_ALGORITHM }),
  ])

  for (const user of [
    { id: ADMIN_USER_ID, email: ADMIN_EMAIL, passwordHash: adminHash, role: 'ADMIN' as const },
    { id: EDITOR_USER_ID, email: EDITOR_EMAIL, passwordHash: editorHash, role: 'EDITOR' as const },
  ]) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        companyId: COMPANY_ID,
        email: user.email,
        normalizedEmail: user.email.toLowerCase(),
        passwordHash: user.passwordHash,
        role: user.role,
        active: true,
      },
      create: {
        id: user.id,
        companyId: COMPANY_ID,
        email: user.email,
        normalizedEmail: user.email.toLowerCase(),
        passwordHash: user.passwordHash,
        role: user.role,
        active: true,
      },
    })
  }

  await upsertAsset(COVER_ASSET_ID, 'cover', ADMIN_USER_ID)
  await upsertAsset(GALLERY_ASSET_ID, 'gallery', ADMIN_USER_ID)
  await upsertAsset(MANUAL_ASSET_ID, 'manual', ADMIN_USER_ID)
  await upsertAsset(CERTIFICATE_ASSET_ID, 'certificate', ADMIN_USER_ID)

  const electronics = await prisma.category.findUniqueOrThrow({
    where: { stableCode: 'DEMO-ELECTRONICS' },
    select: { id: true },
  })
  const furniture = await prisma.category.findUniqueOrThrow({
    where: { stableCode: 'DEMO-FURNITURE' },
    select: { id: true },
  })

  /**
   * The complete draft.
   *
   * Every publication prerequisite is satisfied — identity fields, category, description,
   * a past production date, a 100% material split, all five sustainability values and a
   * cover image — so the reviewer can open Preview and click Publish immediately.
   */
  await prisma.product.upsert({
    where: { id: COMPLETE_PRODUCT_ID },
    update: {
      companyId: COMPANY_ID,
      name: 'Demo Reusable Bottle',
      sku: 'DEMO-BOTTLE-001',
      serialNumber: 'DEMO-SN-0001',
      categoryId: electronics.id,
      description:
        'A fictional stainless-steel drinking bottle used to demonstrate a complete Digital Product Passport.',
      productionDate: new Date(Date.UTC(2026, 0, 15)),
      originCountry: 'IT',
      deletedAt: null,
    },
    create: {
      id: COMPLETE_PRODUCT_ID,
      companyId: COMPANY_ID,
      name: 'Demo Reusable Bottle',
      sku: 'DEMO-BOTTLE-001',
      serialNumber: 'DEMO-SN-0001',
      categoryId: electronics.id,
      description:
        'A fictional stainless-steel drinking bottle used to demonstrate a complete Digital Product Passport.',
      productionDate: new Date(Date.UTC(2026, 0, 15)),
      originCountry: 'IT',
    },
  })

  /** A second, simpler product so list, search and filtering have something to show. */
  await prisma.product.upsert({
    where: { id: SECOND_PRODUCT_ID },
    update: {
      companyId: COMPANY_ID,
      name: 'Demo Oak Stool',
      sku: 'DEMO-STOOL-002',
      serialNumber: 'DEMO-SN-0002',
      categoryId: furniture.id,
      description: 'A fictional oak stool used to demonstrate list search and filtering.',
      productionDate: new Date(Date.UTC(2026, 1, 2)),
      originCountry: 'IT',
      deletedAt: null,
    },
    create: {
      id: SECOND_PRODUCT_ID,
      companyId: COMPANY_ID,
      name: 'Demo Oak Stool',
      sku: 'DEMO-STOOL-002',
      serialNumber: 'DEMO-SN-0002',
      categoryId: furniture.id,
      description: 'A fictional oak stool used to demonstrate list search and filtering.',
      productionDate: new Date(Date.UTC(2026, 1, 2)),
      originCountry: 'IT',
    },
  })

  // Nested content belongs to the seeded products only, so replacing it keeps the seed
  // deterministic without touching anything the reviewer created.
  await prisma.material.deleteMany({ where: { productId: COMPLETE_PRODUCT_ID } })
  await prisma.material.createMany({
    data: [
      {
        productId: COMPLETE_PRODUCT_ID,
        name: 'Stainless steel',
        percentage: '70',
        originCountry: 'IT',
        recyclable: true,
        position: 0,
      },
      {
        productId: COMPLETE_PRODUCT_ID,
        name: 'Silicone',
        percentage: '30',
        originCountry: 'DE',
        recyclable: false,
        position: 1,
      },
    ],
  })

  await prisma.sustainability.upsert({
    where: { productId: COMPLETE_PRODUCT_ID },
    update: {
      carbonKgCo2e: '4.20',
      waterLitres: '18.50',
      recycledPercent: '65',
      repairabilityScore: '8.0',
      recyclable: true,
    },
    create: {
      productId: COMPLETE_PRODUCT_ID,
      carbonKgCo2e: '4.20',
      waterLitres: '18.50',
      recycledPercent: '65',
      repairabilityScore: '8.0',
      recyclable: true,
    },
  })

  await prisma.certification.deleteMany({ where: { productId: COMPLETE_PRODUCT_ID } })
  await prisma.certification.create({
    data: {
      productId: COMPLETE_PRODUCT_ID,
      name: 'Demo Food-Contact Certificate',
      issuingAuthority: 'Demo Certification Body',
      issueDate: new Date(Date.UTC(2025, 0, 10)),
      expirationDate: new Date(Date.UTC(2030, 0, 10)),
      pdfAssetId: CERTIFICATE_ASSET_ID,
    },
  })

  await prisma.productDocument.deleteMany({ where: { productId: COMPLETE_PRODUCT_ID } })
  await prisma.productDocument.create({
    data: {
      productId: COMPLETE_PRODUCT_ID,
      assetId: MANUAL_ASSET_ID,
      kind: 'MANUAL',
      title: 'Demo Care Manual',
      position: 0,
    },
  })

  await prisma.productImage.deleteMany({ where: { productId: COMPLETE_PRODUCT_ID } })
  await prisma.productImage.createMany({
    data: [
      {
        productId: COMPLETE_PRODUCT_ID,
        assetId: COVER_ASSET_ID,
        role: 'COVER',
        altText: 'Demo bottle, front view',
        position: 0,
      },
      {
        productId: COMPLETE_PRODUCT_ID,
        assetId: GALLERY_ASSET_ID,
        role: 'GALLERY',
        altText: 'Demo bottle, side view',
        position: 0,
      },
    ],
  })

  console.info('Seeded the reviewer demo data.')
  console.info('  Company: Demo Notarify Company')
  console.info(`  Admin:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.info(`  Editor:  ${EDITOR_EMAIL} / ${EDITOR_PASSWORD}`)
  console.info('  These are public demo credentials for local review only, never production.')
} finally {
  await prisma.$disconnect()
}
