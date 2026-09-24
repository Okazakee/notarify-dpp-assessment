# Notarify DPP assessment: roadmap

Planning draft v0.3 • 21 September 2026, roadmap normalized 23 September 2026 • Submission deadline: 28 September 2026

This is a proposed implementation plan, not an implementation report. Nothing here means a feature has been built, tested, deployed, or approved by the employer. The assessment PDF and accompanying email are the source of the submission requirements. Decisions marked proposed are working defaults for Cristian to review.

The roadmap was revalidated against the original assessment and normalized into smaller gated delivery slices while retaining all required functionality and all nine listed bonuses. Stage 4 is delivered as six independent milestones rather than one slice, so each has a bounded acceptance surface. This document owns the stage sequence; the specs own their subjects and reference it rather than restating it.

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
| 2 | Authentication, rotating refresh, authorization and the trusted actor | Audit records for identity changes | Allowed and forbidden cases pass through the real API |
| 3 | Product editor/list, relational data, secure file lifecycle | Soft delete, full-text search, pagination/filtering, drag-and-drop | Complete draft can be saved, reopened and edited |
| 4 | Publication and Product Passports, delivered as the six milestones below | Passport versioning, PDF export | Phone scan opens public content; edits stay private until republished |
| 5 | Scan/view collection, dashboard, analytics, public-data caching | Redis caching | Counts have tested definitions; cache cannot expose deleted/draft data |
| 6 | Remaining required back-office and lifecycle work: Product DELETE, Users, Settings, and the audit and soft-delete bonuses | Soft delete, audit logs | Every assessment-required route and action exists, is authorized, and is covered |
| 7 | Docker/Compose completion and testing, migrations, seed, Swagger/OpenAPI, README, architecture document, final E2E, security checks, clean-clone validation and final reconciliation | Unit/integration/E2E evidence consolidated | Reviewer can run it and Cristian can explain critical paths |

Stages 0–3 and Stages 4.1–4.3 are complete on `main`. Stage 2 delivered the authentication and authorization foundation; the Users and Settings flows remain required work and are scheduled in Stage 6 rather than assumed complete.

### Stage 4 milestones

| Milestone | Scope | Exit condition |
| --- | --- | --- |
| 4.1 | Publication core: prerequisites, `POST /products/:id/publish`, stable Passport identity, immutable `PassportVersion`, retained `PassportVersionAsset` references, QR artifact generation, republish semantics, publication concurrency and idempotency | A draft publishes to an immutable version with a stable UUID and QR; a repeated or concurrent publish cannot create a duplicate version |
| 4.2 | Public Passport API, published assets and QR: anonymous `GET /passport/:uuid`, current published projection, public access limited to assets retained by the active published version, `/q/:uuid` redirect and the QR download surface | An anonymous request returns exactly the published projection, and only assets retained by the active version are reachable |
| 4.3 | Public Passport UI and editor Preview: anonymous responsive page carrying every required section, one shared presentation contract, the Preview tab and the publish interaction | Public page and editor preview render from the same contract, and preview simulates published presentation from the current unpublished draft under editor-only draft chrome |
| 4.4 | Back-office Passports page and version history: Passports navigation, publication status, public link, QR actions, the required product-list publication actions, and internal historical version browsing | Every published passport and its retained versions are visible and actionable to an authorized user |
| 4.5 | Passport PDF export: the current published passport, QR, required product and passport information, relevant content, safe server-side generation and download UX | A downloaded PDF matches the published version and is produced without a browser process |
| 4.6 | Stage 4 acceptance and regression: first publish, draft edit after publication, republish, stable UUID/QR, old-version retention, public visibility, public file authorization, preview parity, historical version behaviour, PDF, responsive anonymous access and the required back-office actions | The Stage 4 acceptance matrix passes as one suite |

Historical versions are back-office only. No public historical-version route is planned.

## Delivery sequence

Work proceeds as gated milestones rather than calendar days: each milestone has a bounded acceptance surface and a recorded decision gate before the next one starts. Stages 0–3 are complete. Stage 4 runs as the six milestones above, followed by Stage 5 (analytics, dashboard and Redis), Stage 6 (remaining back-office and lifecycle work) and Stage 7 (delivery and submission).

Every required feature and all nine bonuses remain in scope, and sequence is a working order rather than permission to omit. If time is tight, reduce decorative polish first and report any incomplete item honestly; do not quietly drop a required feature or a listed bonus, and do not weaken authorization, upload safety, test evidence, required pages or documentation to gain time.

## Required coverage map

| Assessment item | Primary spec / stage |
| --- | --- |
| Email/password, JWT, Administrator and Editor | 04 / 2 |
| Four dashboard counters | 07 / 5 |
| Product CRUD and all eight basic fields | 05 / 3 |
| Materials, sustainability and certification fields | 03 + 05 / 3 |
| Manuals, warranties, datasheets, cover and gallery | 05 / 3 |
| Unique UUID, generated QR image, public URL | 06 / 4.1–4.3 |
| Public header, information, materials, certifications, sustainability, documents and passport metadata | 06 / 4.3 |
| Scan timestamp, IP, browser, OS, language, mock country | 07 / 5 |
| Today, weekly, most viewed and latest scan analytics | 07 / 5 |
| All six navigation items, list columns/actions and seven editor tabs | 08 / 2–6 |
| Users navigation and flows, Settings navigation and flows | 08 / 6 |
| Product delete, and the soft-delete and audit-log bonuses | 03 + 04 + 05 / 6 |
| Nine named API endpoints | 02 / corresponding feature stage |
| Architecture, SOLID, validation, secure auth, errors and normalized data | 02–05 / throughout |
| Source, backend/frontend, Compose, migrations/seeds, Swagger, README, architecture document | 09 / throughout and 7 |

All nine bonuses have homes: search (05), versioning (06), soft delete (03), audit logs (04), Redis (07), pagination/filtering (05), PDF (06), drag-and-drop (05/08), automated tests (09).

## Decisions before implementation

| Topic | Recorded decision or proposed default | Why it needs to be explicit |
| --- | --- | --- |
| Companies / tenancy | One company per deployment | The brief mentions companies but does not require tenant onboarding or isolation |
| Product granularity | One serialized item per product row; SKU may repeat | SKU identifies a model; serial distinguishes instances |
| Permissions | Both roles edit and either role may publish or republish; Admin deletes/withdraws and manages users and settings | Roles are named but their powers are unspecified |
| Verification | Prototype/application-level verified presentation on an active published passport, clearly qualified | Publication is not proof of product authenticity or EU compliance, and no review subsystem is required to display the badge |
| Published edits | **Settled by Cristian (B10):** unsaved and saved draft changes remain private until explicit republish; UUID and QR stay stable | Prevent accidental public changes and preserve history |
| Analytics | QR-link hits distinct from rendered passport views | A server cannot prove a camera scan occurred |
| Regulatory goal | Assessment prototype informed by ESPR | Product-specific legal conformity is not an assessment deliverable |

The proposed defaults are planning inputs, not employer instructions. Tenancy and granularity were settled before schema creation; publication permission, badge meaning and published-edit visibility are settled project decisions recorded in `docs/IMPLEMENTATION-DECISIONS.md` and `AGENTS.md`. The remaining open items are listed there.
