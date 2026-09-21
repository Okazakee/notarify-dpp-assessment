-- Invariant verification for the initial migration (20260921152150_init).
--
-- Run against a freshly migrated database:
--   docker exec -i notarify-pg-test psql -U notarify -d notarify_test -v ON_ERROR_STOP=0 \
--     -f - < prisma/verification/invariant-checks.sql
--
-- Everything happens inside one transaction that is rolled back at the end, so no
-- fixture rows survive. Each check reports PASS or FAIL explicitly; a check that
-- expects a rejection FAILS if the statement unexpectedly succeeds.
--
-- These are schema-level checks only. No application or service code exists yet.

BEGIN;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO "Company" (id, "displayName", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Demo Company', now(), now());

INSERT INTO "User" (id, "companyId", email, "normalizedEmail", "passwordHash", role, active, "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
        'admin@example.test', 'admin@example.test', 'not-a-real-hash', 'ADMIN', true, now(), now());

INSERT INTO "Category" (id, "stableCode", name, "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000003', 'CAT-1', 'Demo Category', now(), now());

INSERT INTO "Asset" (id, "companyId", "uploaderId", "detectedMime", "sizeBytes", sha256, "originalName", state, "createdAt")
VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
        'image/png', 1024, repeat('a', 64), 'logo.png', 'ACCEPTED', now()),
       ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
        'image/png', 2048, repeat('b', 64), 'cover-a.png', 'ACCEPTED', now()),
       ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
        'image/png', 3072, repeat('c', 64), 'cover-b.png', 'ACCEPTED', now());

INSERT INTO "Product" (id, "companyId", "categoryId", name, sku, "serialNumber", "draftRevision", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003',
        'Product One', 'SKU-1', 'SN-1', 1, now(), now()),
       ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003',
        'Product Two', 'SKU-2', 'SN-2', 1, now(), now());

INSERT INTO "Passport" (id, "productId", "publicUuid", "firstPublishedAt", "qrTargetUrl", "qrPngBytes", "qrGeneratedAt", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000007',
        '00000000-0000-4000-8000-0000000000a1', now(), 'https://example.test/q/1', '\x89504e47'::bytea, now(), now(), now()),
       ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000008',
        '00000000-0000-4000-8000-0000000000a2', now(), 'https://example.test/q/2', '\x89504e47'::bytea, now(), now(), now());

INSERT INTO "PassportVersion" (id, "passportId", "versionNumber", "sourceDraftRevision", "snapshotSchemaVersion", "publicSnapshot", "publishedById", "publishedAt")
VALUES ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000009', 1, 1, 1, '{}'::jsonb, '00000000-0000-4000-8000-000000000002', now()),
       ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000009', 2, 2, 1, '{}'::jsonb, '00000000-0000-4000-8000-000000000002', now()),
       ('00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-00000000000a', 1, 1, 1, '{}'::jsonb, '00000000-0000-4000-8000-000000000002', now());

INSERT INTO "AuthSession" (id, "userId", "createdAt", "expiresAt")
VALUES ('00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000002', now(), now() + interval '7 days'),
       ('00000000-0000-4000-8000-00000000000f', '00000000-0000-4000-8000-000000000002', now(), now() + interval '7 days');

INSERT INTO "RefreshToken" (id, "sessionId", digest, "expiresAt", "createdAt")
VALUES ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-00000000000e', 'digest-a', now() + interval '7 days', now()),
       ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-00000000000e', 'digest-b', now() + interval '7 days', now()),
       ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-00000000000f', 'digest-c', now() + interval '7 days', now());

-- ------------------------------------------------------------- the checks --

-- 1. A passport may point at a version of itself.
DO $$ BEGIN
  BEGIN
    UPDATE "Passport" SET "currentVersionId" = '00000000-0000-4000-8000-00000000000b'
     WHERE id = '00000000-0000-4000-8000-000000000009';
    RAISE NOTICE 'CHECK 1  PASS  passport may reference its own version';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'CHECK 1  FAIL  expected success, got % (%)', SQLERRM, SQLSTATE;
  END;
END $$;

-- 2. A passport may NOT point at another passport's version.
DO $$ BEGIN
  BEGIN
    UPDATE "Passport" SET "currentVersionId" = '00000000-0000-4000-8000-00000000000d'
     WHERE id = '00000000-0000-4000-8000-000000000009';
    RAISE NOTICE 'CHECK 2  FAIL  cross-passport version was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CHECK 2  PASS  cross-passport version rejected (%)', SQLSTATE;
  END;
END $$;

-- 3. A refresh successor in the same session is accepted.
DO $$ BEGIN
  BEGIN
    UPDATE "RefreshToken" SET "replacedById" = '00000000-0000-4000-8000-000000000011'
     WHERE id = '00000000-0000-4000-8000-000000000010';
    RAISE NOTICE 'CHECK 3  PASS  same-session refresh successor accepted';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'CHECK 3  FAIL  expected success, got % (%)', SQLERRM, SQLSTATE;
  END;
END $$;

-- 4. A refresh successor from a different session is rejected.
DO $$ BEGIN
  BEGIN
    UPDATE "RefreshToken" SET "replacedById" = '00000000-0000-4000-8000-000000000012'
     WHERE id = '00000000-0000-4000-8000-000000000010';
    RAISE NOTICE 'CHECK 4  FAIL  cross-session refresh successor was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CHECK 4  PASS  cross-session refresh successor rejected (%)', SQLSTATE;
  END;
END $$;

-- 5. An analytics event may cite a version of its own passport.
DO $$ BEGIN
  BEGIN
    INSERT INTO "AnalyticsEvent" (id, "passportId", "versionId", kind, "occurredAt", "eventKey")
    VALUES ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000009',
            '00000000-0000-4000-8000-00000000000b', 'VIEW', now(), '00000000-0000-4000-8000-0000000000b1');
    RAISE NOTICE 'CHECK 5  PASS  event may cite its own passport version';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'CHECK 5  FAIL  expected success, got % (%)', SQLERRM, SQLSTATE;
  END;
END $$;

-- 6. An analytics event may NOT cite another passport's version.
DO $$ BEGIN
  BEGIN
    INSERT INTO "AnalyticsEvent" (id, "passportId", "versionId", kind, "occurredAt", "eventKey")
    VALUES ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000009',
            '00000000-0000-4000-8000-00000000000d', 'VIEW', now(), '00000000-0000-4000-8000-0000000000b2');
    RAISE NOTICE 'CHECK 6  FAIL  cross-passport version reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'CHECK 6  PASS  cross-passport version reference rejected (%)', SQLSTATE;
  END;
END $$;

-- 7. Only one COVER image per product (filtered unique index).
INSERT INTO "ProductImage" (id, "productId", "assetId", role, position, "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000007',
        '00000000-0000-4000-8000-000000000005', 'COVER', 0, now(), now());
DO $$ BEGIN
  BEGIN
    INSERT INTO "ProductImage" (id, "productId", "assetId", role, position, "createdAt", "updatedAt")
    VALUES ('00000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000007',
            '00000000-0000-4000-8000-000000000006', 'COVER', 1, now(), now());
    RAISE NOTICE 'CHECK 7  FAIL  a second COVER image was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CHECK 7  PASS  second COVER image rejected (%)', SQLSTATE;
  END;
END $$;

-- 8. Range and positivity CHECK constraints reject invalid numbers.
DO $$ BEGIN
  BEGIN
    INSERT INTO "Material" (id, "productId", name, percentage, position, "createdAt", "updatedAt")
    VALUES ('00000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000007', 'Bad Material', 150.00, 0, now(), now());
    RAISE NOTICE 'CHECK 8a FAIL  percentage 150 was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CHECK 8a PASS  percentage above 100 rejected (%)', SQLSTATE;
  END;
END $$;
DO $$ BEGIN
  BEGIN
    UPDATE "Asset" SET "sizeBytes" = 0 WHERE id = '00000000-0000-4000-8000-000000000004';
    RAISE NOTICE 'CHECK 8b FAIL  zero asset size was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CHECK 8b PASS  non-positive asset size rejected (%)', SQLSTATE;
  END;
END $$;

-- 9. Certification expiry cannot precede issue date.
DO $$ BEGIN
  BEGIN
    INSERT INTO "Certification" (id, "productId", name, "issuingAuthority", "issueDate", "expirationDate", "createdAt", "updatedAt")
    VALUES ('00000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000007', 'Bad Cert', 'Authority',
            DATE '2026-01-01', DATE '2025-01-01', now(), now());
    RAISE NOTICE 'CHECK 9  FAIL  expiry before issue date was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CHECK 9  PASS  expiry before issue date rejected (%)', SQLSTATE;
  END;
END $$;

-- 10. Same passport + same source draft revision cannot publish twice.
DO $$ BEGIN
  BEGIN
    INSERT INTO "PassportVersion" (id, "passportId", "versionNumber", "sourceDraftRevision", "snapshotSchemaVersion", "publicSnapshot", "publishedById", "publishedAt")
    VALUES ('00000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000009', 3, 1, 1, '{}'::jsonb,
            '00000000-0000-4000-8000-000000000002', now());
    RAISE NOTICE 'CHECK 10 FAIL  duplicate source draft revision was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'CHECK 10 PASS  duplicate (passportId, sourceDraftRevision) rejected (%)', SQLSTATE;
  END;
END $$;

-- 11. A rendered VIEW requires an idempotency key.
DO $$ BEGIN
  BEGIN
    INSERT INTO "AnalyticsEvent" (id, "passportId", kind, "occurredAt")
    VALUES ('00000000-0000-4000-8000-00000000001a', '00000000-0000-4000-8000-000000000009', 'VIEW', now());
    RAISE NOTICE 'CHECK 11 FAIL  VIEW without an event key was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CHECK 11 PASS  VIEW without an event key rejected (%)', SQLSTATE;
  END;
END $$;

ROLLBACK;
