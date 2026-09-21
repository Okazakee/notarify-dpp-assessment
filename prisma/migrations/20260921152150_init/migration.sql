-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "ImageRole" AS ENUM ('COVER', 'GALLERY');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('MANUAL', 'WARRANTY', 'TECHNICAL_DATASHEET');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('ACCEPTED', 'QUARANTINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PassportVersionAssetRole" AS ENUM ('COMPANY_LOGO', 'COVER_IMAGE', 'GALLERY_IMAGE', 'PRODUCT_DOCUMENT', 'CERTIFICATION_PDF');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AnalyticsEventKind" AS ENUM ('QR_HIT', 'VIEW');

-- CreateEnum
CREATE TYPE "CountrySource" AS ENUM ('MOCK', 'NOT_CAPTURED');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "logoAssetId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(512) NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "digest" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "replacedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "stableCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "categoryId" UUID,
    "name" VARCHAR(240),
    "sku" VARCHAR(128),
    "serialNumber" VARCHAR(160),
    "description" TEXT,
    "productionDate" DATE,
    "originCountry" VARCHAR(2),
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "originCountry" VARCHAR(2),
    "recyclable" BOOLEAN,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sustainability" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "carbonKgCo2e" DECIMAL(12,3),
    "waterLitres" DECIMAL(12,3),
    "recycledPercent" DECIMAL(5,2),
    "repairabilityScore" DECIMAL(4,2),
    "recyclable" BOOLEAN,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Sustainability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "pdfAssetId" UUID,
    "name" VARCHAR(240),
    "issuingAuthority" VARCHAR(240),
    "issueDate" DATE,
    "expirationDate" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "detectedMime" VARCHAR(127) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "state" "AssetState" NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetContent" (
    "assetId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "AssetContent_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "role" "ImageRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "altText" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocument" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "title" VARCHAR(240),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passport" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "publicUuid" UUID NOT NULL,
    "currentVersionId" UUID,
    "firstPublishedAt" TIMESTAMPTZ(6) NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(6),
    "qrTargetUrl" VARCHAR(2048) NOT NULL,
    "qrPngBytes" BYTEA NOT NULL,
    "qrGeneratedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Passport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportVersion" (
    "id" UUID NOT NULL,
    "passportId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sourceDraftRevision" INTEGER NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL,
    "publicSnapshot" JSONB NOT NULL,
    "publishedById" UUID NOT NULL,
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportVersionAsset" (
    "versionId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "role" "PassportVersionAssetRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportVersionAsset_pkey" PRIMARY KEY ("versionId","assetId")
);

-- CreateTable
CREATE TABLE "PassportReview" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "scope" VARCHAR(1024) NOT NULL,
    "reviewedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PassportReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" UUID NOT NULL,
    "passportId" UUID NOT NULL,
    "versionId" UUID,
    "kind" "AnalyticsEventKind" NOT NULL,
    "eventKey" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "browser" VARCHAR(128),
    "operatingSystem" VARCHAR(128),
    "language" VARCHAR(35),
    "country" VARCHAR(2),
    "countrySource" "CountrySource" NOT NULL DEFAULT 'NOT_CAPTURED',
    "source" VARCHAR(64),
    "metadata" JSONB,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" UUID NOT NULL,
    "passportId" UUID NOT NULL,
    "dateUtc" DATE NOT NULL,
    "kind" "AnalyticsEventKind" NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "requestId" VARCHAR(128),
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "safeMetadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_logoAssetId_key" ON "Company"("logoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "User_companyId_active_role_idx" ON "User"("companyId", "active", "role");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_digest_key" ON "RefreshToken"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_expiresAt_idx" ON "RefreshToken"("sessionId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_id_sessionId_key" ON "RefreshToken"("id", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_sessionId_key" ON "RefreshToken"("replacedById", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_stableCode_key" ON "Category"("stableCode");

-- CreateIndex
CREATE INDEX "Product_companyId_deletedAt_categoryId_idx" ON "Product"("companyId", "deletedAt", "categoryId");

-- CreateIndex
CREATE INDEX "Product_companyId_deletedAt_productionDate_idx" ON "Product"("companyId", "deletedAt", "productionDate");

-- CreateIndex
CREATE INDEX "Product_companyId_sku_idx" ON "Product"("companyId", "sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_deletedAt_idx" ON "Product"("categoryId", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_serialNumber_key" ON "Product"("companyId", "serialNumber");

-- CreateIndex
CREATE INDEX "Material_productId_idx" ON "Material"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_productId_position_key" ON "Material"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Sustainability_productId_key" ON "Sustainability"("productId");

-- CreateIndex
CREATE INDEX "Certification_productId_idx" ON "Certification"("productId");

-- CreateIndex
CREATE INDEX "Certification_pdfAssetId_idx" ON "Certification"("pdfAssetId");

-- CreateIndex
CREATE INDEX "Asset_companyId_state_createdAt_idx" ON "Asset"("companyId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_companyId_sha256_idx" ON "Asset"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "ProductImage_assetId_idx" ON "ProductImage"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_assetId_key" ON "ProductImage"("productId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_role_position_key" ON "ProductImage"("productId", "role", "position");

-- CreateIndex
CREATE INDEX "ProductDocument_assetId_idx" ON "ProductDocument"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDocument_productId_assetId_key" ON "ProductDocument"("productId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDocument_productId_position_key" ON "ProductDocument"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_productId_key" ON "Passport"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_publicUuid_key" ON "Passport"("publicUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_currentVersionId_key" ON "Passport"("currentVersionId");

-- CreateIndex
CREATE INDEX "Passport_withdrawnAt_idx" ON "Passport"("withdrawnAt");

-- CreateIndex
CREATE INDEX "Passport_productId_withdrawnAt_idx" ON "Passport"("productId", "withdrawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_currentVersionId_id_key" ON "Passport"("currentVersionId", "id");

-- CreateIndex
CREATE INDEX "PassportVersion_passportId_publishedAt_idx" ON "PassportVersion"("passportId", "publishedAt");

-- CreateIndex
CREATE INDEX "PassportVersion_publishedById_publishedAt_idx" ON "PassportVersion"("publishedById", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PassportVersion_passportId_versionNumber_key" ON "PassportVersion"("passportId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PassportVersion_passportId_sourceDraftRevision_key" ON "PassportVersion"("passportId", "sourceDraftRevision");

-- CreateIndex
CREATE UNIQUE INDEX "PassportVersion_id_passportId_key" ON "PassportVersion"("id", "passportId");

-- CreateIndex
CREATE INDEX "PassportVersionAsset_assetId_idx" ON "PassportVersionAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "PassportReview_versionId_key" ON "PassportReview"("versionId");

-- CreateIndex
CREATE INDEX "PassportReview_reviewerId_reviewedAt_idx" ON "PassportReview"("reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_eventKey_key" ON "AnalyticsEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_passportId_occurredAt_idx" ON "AnalyticsEvent"("passportId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_passportId_kind_occurredAt_idx" ON "AnalyticsEvent"("passportId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_kind_occurredAt_idx" ON "AnalyticsEvent"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_dateUtc_kind_synthetic_idx" ON "AnalyticsDaily"("dateUtc", "kind", "synthetic");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_passportId_dateUtc_synthetic_idx" ON "AnalyticsDaily"("passportId", "dateUtc", "synthetic");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_passportId_dateUtc_kind_synthetic_key" ON "AnalyticsDaily"("passportId", "dateUtc", "kind", "synthetic");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_sessionId_fkey" FOREIGN KEY ("replacedById", "sessionId") REFERENCES "RefreshToken"("id", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sustainability" ADD CONSTRAINT "Sustainability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetContent" ADD CONSTRAINT "AssetContent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_currentVersionId_id_fkey" FOREIGN KEY ("currentVersionId", "id") REFERENCES "PassportVersion"("id", "passportId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersionAsset" ADD CONSTRAINT "PassportVersionAsset_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PassportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersionAsset" ADD CONSTRAINT "PassportVersionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportReview" ADD CONSTRAINT "PassportReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PassportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportReview" ADD CONSTRAINT "PassportReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_versionId_passportId_fkey" FOREIGN KEY ("versionId", "passportId") REFERENCES "PassportVersion"("id", "passportId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written constraints assigned to initial migration SQL by the
-- enforcement register in docs/IMPLEMENTATION-DECISIONS.md.
-- Prisma cannot express partial indexes, CHECK ranges or expression GIN indexes.
--
-- The composite cross-table foreign keys requested for this round are NOT here:
-- they are now expressed in schema.prisma and generated by Prisma itself
--   "Passport_currentVersionId_id_fkey"        ("currentVersionId","id") -> PassportVersion("id","passportId")
--   "RefreshToken_replacedById_sessionId_fkey" ("replacedById","sessionId") -> RefreshToken("id","sessionId")
--   "AnalyticsEvent_versionId_passportId_fkey" ("versionId","passportId") -> PassportVersion("id","passportId")
-- Hand-writing them was attempted first and Prisma removed them on the next
-- `migrate dev`, because it reconciles every foreign key it does not model.
-- Expressing them in the schema keeps the invariant and removes that drift.
-- ============================================================================

-- At most one COVER image per product (filtered unique index).
CREATE UNIQUE INDEX "ProductImage_one_cover_per_product_uq"
  ON "ProductImage" ("productId") WHERE "role" = 'COVER';

-- True PostgreSQL full-text search over product prose (multilingual demo).
CREATE INDEX "Product_search_simple_tsv_gin"
  ON "Product" USING GIN (
    to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", ''))
  );

-- Numeric range and non-negative integrity. "Unknown" stays NULL, never a fake zero.
ALTER TABLE "Material" ADD CONSTRAINT "Material_percentage_range_ck"
  CHECK ("percentage" >= 0 AND "percentage" <= 100);
ALTER TABLE "Material" ADD CONSTRAINT "Material_position_nonnegative_ck"
  CHECK ("position" >= 0);
ALTER TABLE "Sustainability" ADD CONSTRAINT "Sustainability_recycled_percent_range_ck"
  CHECK ("recycledPercent" IS NULL OR ("recycledPercent" >= 0 AND "recycledPercent" <= 100));
ALTER TABLE "Sustainability" ADD CONSTRAINT "Sustainability_repairability_range_ck"
  CHECK ("repairabilityScore" IS NULL OR ("repairabilityScore" >= 0 AND "repairabilityScore" <= 10));
ALTER TABLE "Sustainability" ADD CONSTRAINT "Sustainability_carbon_nonnegative_ck"
  CHECK ("carbonKgCo2e" IS NULL OR "carbonKgCo2e" >= 0);
ALTER TABLE "Sustainability" ADD CONSTRAINT "Sustainability_water_nonnegative_ck"
  CHECK ("waterLitres" IS NULL OR "waterLitres" >= 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_size_positive_ck"
  CHECK ("sizeBytes" > 0);
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_position_nonnegative_ck"
  CHECK ("position" >= 0);
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_position_nonnegative_ck"
  CHECK ("position" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_draft_revision_nonnegative_ck"
  CHECK ("draftRevision" >= 0);
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_number_positive_ck"
  CHECK ("versionNumber" > 0);
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_snapshot_schema_version_positive_ck"
  CHECK ("snapshotSchemaVersion" > 0);
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_source_draft_revision_nonnegative_ck"
  CHECK ("sourceDraftRevision" >= 0);
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_count_nonnegative_ck"
  CHECK ("count" >= 0);

-- A completed certification cannot expire before it was issued. Drafts may omit either date.
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_expiration_not_before_issue_ck"
  CHECK ("expirationDate" IS NULL OR "issueDate" IS NULL OR "expirationDate" >= "issueDate");

-- A rendered-page VIEW is retried by the client with a stable key so it is counted
-- once; QR hits are not required to carry one.
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_view_event_key_required_ck"
  CHECK ("kind" <> 'VIEW' OR "eventKey" IS NOT NULL);
