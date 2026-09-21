# Notarify DPP assessment: roadmap

Planning draft v0.2 • 21 September 2026 • Submission deadline: 28 September 2026

This is a proposed implementation plan, not an implementation report. Nothing here means a feature has been built, tested, deployed, or approved by the employer. The assessment PDF and accompanying email are the source of the submission requirements. Decisions marked proposed are working defaults for Cristian to review.

## Goal

Deliver a complete, understandable DPP application, runnable locally with Docker Compose and on Cristian's VPS behind a TLS reverse proxy. Target every required feature and all nine bonuses. Security, tests, documentation, and AI provenance accompany each feature instead of becoming a final cleanup phase.

The demo uses fictional JSON seed fixtures and sample assets. Compliance is contextual documentation, not a certification workstream. Application tests run during development; full Compose testing and VPS validation happen after functional completion. Database binary asset storage is the revised recommendation, pending agreement.

## Read by concern

| Spec | Owns |
| --- | --- |
| [01-ESPR-SCOPE.md](01-ESPR-SCOPE.md) | Regulatory boundary, claims, gaps, privacy questions |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | Modules, shared contracts, SOLID, dependency choices |
| [03-DATA-AND-LIFECYCLE.md](03-DATA-AND-LIFECYCLE.md) | Schema blueprint, constraints, publication and deletion |
| [04-AUTH-AND-SECURITY.md](04-AUTH-AND-SECURITY.md) | JWT sessions, permissions, trust boundaries, validation |
| [05-PRODUCTS-AND-FILES.md](05-PRODUCTS-AND-FILES.md) | CRUD, nested data, uploads, search and filters |
| [06-PASSPORTS-QR-PDF.md](06-PASSPORTS-QR-PDF.md) | Public projection, preview, QR, versioning, PDF |
| [07-ANALYTICS-AND-CACHE.md](07-ANALYTICS-AND-CACHE.md) | Scan/view definitions, dashboards, Redis |
| [08-FRONTEND.md](08-FRONTEND.md) | Routes, forms, daisyUI, Zustand, accessibility |
| [09-TESTING-AND-DELIVERY.md](09-TESTING-AND-DELIVERY.md) | Tests, audits, Docker, VPS, CI and handover |
| [10-AI-AND-DX.md](10-AI-AND-DX.md) | Pi workflow, CLI tools, AI evidence and review |

Specs reference their owning document rather than redefining its rules. Each implementation task names its requirement, affected specs, acceptance checks, and evidence. Changes to shared contracts update their consumers in the same pull request.

## Priority and implementation order

P0 = required functionality plus the security/testing needed to trust it. P1 = bonuses with lifecycle or schema implications, designed immediately and delivered with their owning scope. P2 = remaining bonuses, targeted within the week. Priority is a recovery order, not permission to silently omit features.

| Stage | Scope and junctions | Bonuses included | Exit condition |
| --- | --- | --- | --- |
| 0 | Agree scope, permission matrix, data lifecycle, API conventions and dependency versions | Versioning, soft delete, audit and search planned in schema | No unresolved decision that changes the initial schema |
| 1 | Monorepo, local dev scripts, CI, config validation, base migration and synthetic JSON seed | Test harness | Backend/frontend run locally and application tests execute |
| 2 | Authentication, rotating refresh, authorization, Users and Settings | Audit records for identity changes | Allowed and forbidden cases pass through the real API |
| 3 | Product editor/list, relational data, secure file lifecycle | Soft delete, full-text search, pagination/filtering, drag-and-drop | Complete draft can be saved, reopened and edited |
| 4 | Publish transaction, snapshots, public passport, exact preview, QR, downloads | Passport versioning, PDF export | Phone scan opens public content; edits stay private until republished |
| 5 | Scan/view collection, dashboard, analytics, public-data caching | Redis caching | Counts have tested definitions; cache cannot expose deleted/draft data |
| 6 | Docker/Compose completion and testing, VPS/reverse-proxy validation, final E2E, security audit, restoration, docs | Unit/integration/E2E evidence consolidated | Reviewer can run it and Cristian can explain critical paths |

## Seven-day working schedule

This is ambitious and assumes focused daily availability. Re-estimate after the first working product slice. Reserve 28 September for submission and unexpected delivery issues; do not assume an end-of-day deadline or timezone that the email does not specify.

| Date | Target |
| --- | --- |
| Sep 21 | Resolve architectural assumptions, schema blueprint, repo/local scripts/CI and reproducible mocked JSON seed |
| Sep 22 | Auth, permission checks, user/settings minimum flows, session tests |
| Sep 23 | Complete draft CRUD and all editor tabs, uploads, search/filter/pagination |
| Sep 24 | Publish, stable UUID, public page, preview, QR, versions, public downloads |
| Sep 25 | Analytics and dashboards, PDF export, Redis; all features functionally present |
| Sep 26 | With features complete: Compose testing, VPS deployment, proxy checks, security and regression review |
| Sep 27 | Clean-room install, backup/restore, docs reconciliation, final tag and interview walkthrough |
| Sep 28 | Submission buffer |

Each day ends with a working local revision, updated specs, actual application-test results, and a short AI contribution entry. Compose testing and deployment are deliberately deferred to the completed-product phase. If schedule slips, remove decorative polish first, then reduce advanced-filter breadth and PDF styling. Defer Redis before weakening authorization, upload safety, test evidence, required pages, or documentation. Record any incomplete bonus honestly.

## Required coverage map

| Assessment item | Primary spec / stage |
| --- | --- |
| Email/password, JWT, Administrator and Editor | 04 / 2 |
| Four dashboard counters | 07 / 5 |
| Product CRUD and all eight basic fields | 05 / 3 |
| Materials, sustainability and certification fields | 03 + 05 / 3 |
| Manuals, warranties, datasheets, cover and gallery | 05 / 3 |
| Unique UUID, generated QR image, public URL | 06 / 4 |
| Public header, information, materials, certifications, sustainability, documents and passport metadata | 06 / 4 |
| Scan timestamp, IP, browser, OS, language, mock country | 07 / 5 |
| Today, weekly, most viewed and latest scan analytics | 07 / 5 |
| All six navigation items, list columns/actions and seven editor tabs | 08 / 2–4 |
| Nine named API endpoints | 02 / corresponding feature stage |
| Architecture, SOLID, validation, secure auth, errors and normalized data | 02–05 / throughout |
| Source, backend/frontend, Compose, migrations/seeds, Swagger, README, architecture document | 09 / throughout and 6 |

All nine bonuses have homes: search (05), versioning (06), soft delete (03), audit logs (04), Redis (07), pagination/filtering (05), PDF (06), drag-and-drop (05/08), automated tests (09).

## Decisions before implementation

| Topic | Proposed default | Why it needs to be explicit |
| --- | --- | --- |
| Companies / tenancy | One company per deployment | The brief mentions companies but does not require tenant onboarding or isolation |
| Product granularity | One serialized item per product row; SKU may repeat | SKU identifies a model; serial distinguishes instances |
| Permissions | Both roles edit; Admin publishes, deletes, verifies, manages users/settings | Roles are named but their powers are unspecified |
| Verification | Recorded internal review with clearly qualified badge | Publication is not proof of product authenticity or EU compliance |
| Published edits | Draft changes remain private until explicit republish | Prevent accidental public changes and preserve history |
| Analytics | QR-link hits distinct from rendered passport views | A server cannot prove a camera scan occurred |
| Regulatory goal | Assessment prototype informed by ESPR | Product-specific legal conformity is not an assessment deliverable |

These defaults allow planning to continue; they are not employer instructions. Tenancy and granularity should be settled before schema creation. Permission and badge semantics are good candidates for a short clarification if desired.
