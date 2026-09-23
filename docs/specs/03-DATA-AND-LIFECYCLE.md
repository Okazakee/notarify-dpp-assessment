# Data model and publication lifecycle

## Scope assumptions

Proposed: one company per deployment, one serialized item per product, multiple users. SKU is indexed but not unique because several serialized items can share it; `(companyId, serialNumber)` is unique and remains reserved after deletion. If the employer means one catalog model per row, resolve that before the first migration.

Plan the whole logical model before implementation, including bonuses. This blueprint is not the final Prisma schema: field types, names and SQL constraints must be finalized in the schema task. Fewer migrations are a benefit of clarity, not a release metric.

## Entity blueprint

| Entity | Core fields / relations |
| --- | --- |
| Company | id, displayName, logoAssetId; single seeded company |
| User | id, companyId, normalizedEmail unique, passwordHash, role ADMIN/EDITOR, active, timestamps |
| AuthSession | id, userId, createdAt, expiresAt, revokedAt; refresh family owner |
| RefreshToken | id, sessionId, tokenHash unique, expiresAt, usedAt, replacedById |
| Category | id, stableCode unique, name; seeded selectable values |
| Product | id, companyId, name, sku, serialNumber, categoryId, description, productionDate, originCountry, draftRevision, deletedAt, timestamps |
| Material | id, productId, name, percentage, originCountry, recyclable, position |
| Sustainability | productId unique, carbonKgCo2e, waterLitres, recycledPercent, repairabilityScore, recyclable |
| Certification | id, productId, name, issuingAuthority, issueDate, expirationDate, pdfAssetId |
| Asset | id, companyId, uploaderId, detectedMime, sizeBytes, sha256, originalName, state, createdAt |
| AssetContent | assetId unique FK, data bytea; Prisma Bytes mapping to verify for pinned version |
| ProductImage | id, productId, assetId, role COVER/GALLERY, position, altText |
| ProductDocument | id, productId, assetId, type MANUAL/WARRANTY/TECHNICAL_DATASHEET, title, position |
| Passport | id, productId unique, uuid unique, firstPublishedAt, currentVersionId, qrTargetUrl, qrPngBytes, qrGeneratedAt, withdrawnAt |
| PassportVersion | id, passportId, versionNumber, sourceDraftRevision, snapshotSchemaVersion, publicSnapshot JSONB, publishedAt, publishedById |
| PassportVersionAsset | versionId, assetId; unique pair retaining file references |
| PassportReview | id, versionId unique, reviewerId, reviewedAt, scope, status; audit review changes |
| AnalyticsEvent | id, passportId, versionId optional, kind QR_HIT/VIEW, occurredAt, eventKey optional unique, IP nullable, browser, OS, language, country, countrySource |
| AnalyticsDaily | passportId, dateUTC, kind, count; composite key |
| AuditEvent | id, actorId nullable, entityType, entityId, action, timestamp, requestId, safe changed-field metadata |

Passport version content is immutable. Public serialization combines the immutable content with current operational status. `PassportReview` stays in the schema as unused infrastructure: no review or approval workflow is required for this assessment, and if one is ever built, review state is a separate record so it can change without pretending the published content changed.

Live editor data is normalized. JSONB is a deliberate immutable historical projection, not the primary mutable product database. `PassportVersionAsset` keeps foreign-key references so a snapshot cannot silently lose its files.

## Constraints and indexes

Use UTC timestamps with timezone for events and publication, and date-only columns for manufacturing/certification dates. Proposed units: kg CO2e, litres, percentages 0–100, repairability 0–10. These are explicit demo conventions, not a mandated ESPR methodology.

Use bounded decimals for percentages and measurements. Distinguish unknown (`null`) from zero. Enforce ranges with SQL checks and service validation; materials totals are cross-row rules checked transactionally. Drafts can be incomplete; publication requires the basic product fields and sustainability data. If materials are present, total percentage must be 100.00 at declared precision; no materials is allowed because the brief says “may contain”. Certifications require their listed metadata and PDF when present.

Require expiration >= issue date, production date not in the future, valid configured country codes, bounded text lengths, and valid file references belonging to this company's product workflow. Allow explicitly documented no-expiration handling if needed instead of a fake date. Enforce at most one cover image with a partial unique index. At publication require a cover image; the public passport's brand logo is satisfied by a bundled application brand asset, so publication does not depend on `Company.logoAssetId`.

Indexes: product status-related queries via passport relation/deletedAt; product category/date; SKU; unique serial; passport UUID; `(passportId, versionNumber)` and `(passportId, sourceDraftRevision)` unique; events `(passportId, occurredAt)` and `(kind, occurredAt)`; audit entity/time; refresh/session expiry; GIN full-text index. Add SQL migration sections for indexes/constraints Prisma cannot express in the selected version.

## Lifecycle rules

1. Creating a product creates a draft; no public UUID is exposed yet.
2. Every accepted editor mutation increments `draftRevision`. Clients supply the revision they edited; stale updates return 409.
3. Publish takes an expected revision. Within a database transaction, lock/conditionally claim that product revision, verify all publish rules, create or reuse its Passport, and create the immutable version plus asset references and audit record.
4. First publication allocates the UUID; it remains stable on republish. Unique revision and version constraints prevent duplicate concurrent publications. Retrying the same published revision returns the existing publication.
5. Generate the small QR PNG using the allocated/reused UUID and persist its bytes and target URL on Passport in the publication transaction. Like the proposed database-backed assets, this keeps publication and QR creation atomic. It can also be regenerated from the stored canonical target. Bound QR payload size and test concurrent first publication.
6. Editing published content changes draft rows only. Public reads remain on the current published version until explicit republish.
7. DELETE soft-deletes the product, withdraws its passport, and records an audit event in one transaction. Keep versions and files. Public content/downloads stop immediately; the stable URL can show a 410 tombstone. This is a demo policy, not a claim of legal retention compliance.

Product status is derived: Published if an active publication exists, Draft otherwise; deleted products are excluded from normal lists. Track “unpublished changes” separately rather than incorrectly flipping a published product back to Draft.

Company branding is copied into each publication snapshot and its logo is retained through PassportVersionAsset. Settings changes affect future publications only. To update an existing passport's branding, explicitly create a new draft revision and republish; do not mutate historical snapshot content.

## Migration and seed policy

Aim for one coherent initial migration, then additive migrations as real discoveries require. Once a migration has run on the VPS or is shared, do not edit/reset it. Apply release migrations with the production migration command selected for the pinned Prisma version; do not use schema push as the deployment strategy.

Use deterministic mocked JSON fixtures, parsed and validated by the Prisma seed script, for company, categories, draft and published examples, multiple versions, valid/expired certificates and synthetic analytics. Generate sample images/PDFs locally; JSON may reference their fixture filenames, or contain base64 decoded once by the seed into binary columns. Seed an Admin and Editor separately with hashed credentials. Use safe fictional data and generated demo files. Production seed credentials come from environment configuration and are not committed. Idempotent seeding must never overwrite a real user's password or production content unexpectedly.
