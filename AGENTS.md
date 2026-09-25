# Agent instructions — notarify-dpp-assessment

Assessment work for Notarify: a Digital Product Passport application. Read this before changing anything.

## Current status

**Milestone 1 is merged into `main`.** The validated schema, the hardened authentication flow and Product draft CRUD are implemented and verified on `main`.

**The Assets slice is merged into `main`.** Validated binary upload with private retrieval, and product draft attachments as cover and gallery images, typed documents and certification PDFs, are implemented and verified on `main`.

**Stage 4.1 (publication core) is merged into `main`.**

**Stage 4.2 (public passport API, published assets and QR) is merged into `main`.**

**Stage 4.3 (public Passport UI, editor Preview and Publish UX) is merged into `main`.** The anonymous public Passport page, the shared presentation component, the seven-tab editor, the draft Preview and the Publish/Republish interaction exist; the remaining Stage 4 milestones do not.

**Stage 4.4 (back-office Passports and complete version history) is merged into `main`.**

**Stage 4.5 (Passport PDF export) is merged into `main`.**

**Stage 4.6 (full Stage 4 acceptance and regression) is merged into `main`.** The evidence map is [docs/STAGE4-ACCEPTANCE.md](docs/STAGE4-ACCEPTANCE.md): one cross-milestone lifecycle journey plus the existing focused suites prove Stage 4 as one subsystem, while the physical handset scan, Cristian's manual UI walkthrough and human source-code review remain explicitly unvalidated manual items. Stage 4.6 added no production runtime change.

Implemented:
- **Schema and database** — Prisma 7.10.0 schema validated; initial migration `20260921152150_init` applied to PostgreSQL 18.6, including the hand-written CHECK, partial-unique and GIN constraints and the three composite foreign keys. No migration was needed for Assets: the schema already carried `Asset`, `AssetContent`, `ProductImage`, `ProductDocument` and `Certification.pdfAssetId`.
- **`apps/api`** — NestJS 12.0.4 family, Prisma through `@prisma/adapter-pg`.
  - Auth: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`; Argon2id; JWT access tokens carrying **no role claim**; strict refresh rotation; Origin enforcement on cookie mutations; Helmet and request IDs.
  - Catalog: `GET /categories`, `POST /products`, `GET /products` (bounded pagination, category/country/date filters, PostgreSQL full-text search), `GET /products/:id`, `PATCH /products/:id` with atomic `draftRevision` concurrency.
  - Assets: `POST /assets` (one file per request, `multipart/form-data`) and `GET /assets/:id`. Content is identified from its bytes with `file-type` 22.1.1; images are decoded and re-encoded with `sharp` 0.35.4, which strips metadata and bounds decoded pixels. Bytes live in PostgreSQL `AssetContent.bytea`. Retrieval is private and scoped to the caller's company in the query itself.
  - Publication: `POST /products/:id/publish` creates the stable Passport identity, an immutable `PassportVersion`, its retained `PassportVersionAsset` references and the QR artifact in one transaction. QR rendering uses `qrcode` 1.5.4. Publication writes **no** `AuditEvent`; the audit-log bonus is a separate milestone.
  - Public passport (anonymous, no guard): `GET /passport/:uuid` projects the current immutable published version; `GET /passport/:uuid/assets/:assetId` serves bytes retained by that version; `GET /passport/:uuid/qr.png` serves the stored QR artifact; `GET /q/:uuid` resolves a scan with a 302 to the canonical page. The web app bridges `/q/:uuid` to the API with a single-segment rewrite.
  - Passports (authenticated back office): `GET /passports` lists the caller company's active publications with bounded pagination for both roles; Admin-only `GET /passports/:passportId/versions` lists every retained version, `GET /passports/:passportId/versions/:versionNumber` projects one immutable version, and `GET /passports/:passportId/versions/:versionNumber/assets/:assetId` serves an asset retained by exactly that version. Role enforcement is a `RolesGuard` after `AccessTokenGuard`; the historical projection shares the validated snapshot interpretation with the public one.
  - Passport PDF (anonymous, no guard): `GET /passport/:uuid/pdf` streams an A4 document of the current immutable published version, rendered server-side with PDFKit from the shared snapshot projection, embedding the stored QR artifact and the retained current-version images. It shares the public passport's active-visibility resolution and safe 404 contract, and it has no historical variant.
- **`apps/web`** — Next 16.3.5 App Router: login, workspace, account status, product list with filters, pagination, cover images and publication actions, the back-office `/passports` list with current-publication actions for both roles, the Admin-only `/passports/[passportId]` version history, and a draft editor covering General Information, Images, Documents, Materials, Sustainability and Certifications.
- **`prisma/seed.ts`** — deterministic, idempotent fictional categories via `pnpm db:seed`.

Not implemented, and not to be assumed: product delete/withdraw, public historical-version routes, analytics, Redis, dashboard metrics, Users/Settings flows, tenancy onboarding, garbage collection, antivirus or PDF CDR, object storage, Docker/Compose and deployment. The Product table still owes `Total Views` to Stage 5 and Product delete plus a read-only `View` destination to Stage 6; `Total Views` renders an explicit "Available after analytics" placeholder rather than an invented `0`.

### Proven asset invariants — do not weaken

- Declared MIME type, filename and extension are never authoritative. The stored type comes from the bytes, and the bytes are re-checked after normalization so the served `Content-Type` always matches what is stored.
- `file-type` matches magic numbers only, so a PDF also has to carry a cross-reference pointer and an end-of-file marker. A file that is only `%PDF-` is rejected.
- An accepted asset's bytes are immutable. There is no update or delete path; replacing a file creates a new `Asset`.
- The limit bounds what is **stored**, not only what was uploaded. Normalization re-encodes an image and re-encoding is not guaranteed to shrink it, so the persisted bytes are checked against the same limit before anything is hashed or written. An image that would normalize past the bound is rejected with `FILE_TOO_LARGE` and leaves no `Asset` and no `AssetContent`.
- Uploads are validated entirely before the first write, so a rejected upload leaves no `Asset` behind.
- Retrieval scopes by `companyId` inside the query, so another company's asset is indistinguishable from a missing one. A malformed id must not reach the database as a raw value.
- `AssetContent.bytes` is only ever selected in the download path. No product or list response may carry bytes.
- Product attachment validation runs inside the product transaction and **before** the revision is claimed, so an invalid or foreign asset rolls the whole save back without bumping `draftRevision`.
- A product keeps at most one cover image and at most twelve gallery images; documents and certifications are capped at twenty each; an asset may only be attached once per product; an image asset can never become a document or certification PDF, and a PDF can never become a product image.

### Proven publication invariants — do not weaken

- Publishing is the only path that creates a version, and versions are immutable. A republish creates a new version; it never mutates an existing one.
- The public UUID and its QR artifact are allocated on first publication and retained across republishes. A printed QR code must not stop working.
- Publishing a revision that already produced a version returns that version instead of duplicating history, backed by the unique constraint on `(passportId, sourceDraftRevision)`.
- The publish transaction locks the product row `FOR UPDATE`, verifies `expectedDraftRevision`, revalidates every referenced asset, and writes the version, its retained asset references, the QR and the current-version pointer together, so a passport is never observable half-published.
- `PassportVersionAsset` retains a relational reference to every asset a version exposes, so a later draft edit that unlinks an image cannot break a published version.
- The QR target origin comes from validated `PUBLIC_APP_ORIGIN` configuration, never from a client-supplied `Host` header.
- Publication prerequisites never block a draft save, and the company logo is not a prerequisite: the public passport's brand logo is satisfied by a bundled application asset.

### Proven public-surface invariants — do not weaken

- Anonymous reads use the current **immutable** published version only. Live draft rows never contribute content; `Product.deletedAt` participates solely as a visibility filter.
- A draft edit does not change the public projection until an explicit republish. Publishing again moves the projection to the new version.
- A public asset download requires a retained reference from the **current active** version, so an asset only an older version referenced becomes private again after a republish even though its history is retained. Draft-only, unattached and foreign-company assets are never public.
- The retained `PassportVersionAsset` row authorizes retention and download only. It never reconstructs semantic role or ordering: it is keyed `(versionId, assetId)`, so one asset used in two roles has a single row and the snapshot stays the authority.
- Every anonymous failure — malformed UUID, unknown, unpublished, withdrawn, deleted, unauthorized asset — returns one identical 404 body, so the surface cannot be used to learn whether a passport or asset exists.
- QR bytes are generated once and never regenerated, so a printed code keeps working across republishes. A QR download is not a scan and records nothing.
- The `/q/:uuid` redirect target comes from validated `PUBLIC_APP_ORIGIN` plus the stored UUID, never from the request `Host` header.
- Every public response is `no-store`; there is no public caching yet.
- The web `/q/:uuid` bridge is a single-segment rewrite to the configured API origin, so it cannot proxy arbitrary paths or hosts.

### Proven PDF export invariants — do not weaken

- `/passport/:uuid/pdf` exports only the current active immutable published version, through the same active-visibility resolution and the same safe 404 contract as `GET /passport/:uuid`. Malformed, unknown, withdrawn and soft-deleted states are indistinguishable.
- PDF generation never reads mutable Product content, the draft, or the editor state. It consumes the shared `buildPassportContent`/`buildPassportView` projection of the selected version's snapshot.
- The view, the stored QR artifact and the retained image bytes are resolved from one active-version result, so a concurrent republish cannot mix two versions into a single export.
- The PDF embeds the **stored** `Passport.qrPngBytes`; no code path regenerates a QR for an export. A missing or corrupt stored artifact makes the export unavailable (controlled 500) rather than printing a substitute identity.
- Every embedded image must be retained by the current version (`PassportVersionAsset(versionId, assetId)`), still `ACCEPTED` and still have stored content. Draft-only, historical-only, foreign and non-accepted assets are never embedded, and a failed optional image is omitted or shown as a placeholder instead of falling back to a draft file.
- WebP is converted in memory to PNG with `sharp`; JPEG and PNG pass through unchanged when already within bounds. Conversions never mutate stored bytes, create a new `Asset`, or upscale, and they run sequentially with a 1600 px longest-side bound.
- Text is embedded with full Noto Sans regular/bold (`@expo-google-fonts/noto-sans`), not PDF Standard 14 fonts, so mixed European text survives.
- Rendering is server-side and streamed: the document is piped to the response before its content is drawn, no temporary file is written, and a failure after streaming starts aborts the response instead of finishing a truncated download.
- The response carries `application/pdf`, an `attachment` disposition with the deterministic `notarify-passport-{uuid}-v{version}.pdf` filename, `nosniff`, `no-store` (also on preflight failures) and a `cross-origin` resource policy.
- There is no PDF cache and no Redis: a republish changes what the same public URL exports immediately.
- There is no historical PDF route. The public page and Product Passports (both roles) offer the current export; draft Preview and the historical version view do not advertise one.
- The PDF writes no `AnalyticsEvent`, no `AnalyticsDaily` and no `AuditEvent`. A download is neither a scan nor a view.

### Proven back-office passport invariants — do not weaken

- The authenticated passport list describes what is **published**: product name, SKU and serial come from the current immutable version snapshot, while `Product.draftRevision` supplies only the operational `currentDraftRevision` and the derived `hasUnpublishedChanges` (`draftRevision > sourceDraftRevision`). An unpublished draft edit must never appear as the passport identity.
- `hasUnpublishedChanges` is derived, never stored. There is no second writable publication status.
- Both `ADMIN` and `EDITOR` may list passports, open the current public passport and download the passport-level QR. Historical-version inspection is Admin-only, enforced by `RolesGuard` on every history and historical-asset route, and the check runs before any ownership or existence query. An Editor receives a uniform 403 even for a passport that does not exist.
- `RolesGuard` evaluates the role `AccessTokenGuard` read from PostgreSQL on the same request. An access token carries no role claim, so a same-session role change takes effect on the next request.
- Every authenticated passport read is company-scoped through the passport's product ownership. Foreign, malformed and unknown passport ids, version numbers and asset ids all return one identical 404 body, so the surface cannot be probed for existence.
- Version history reads exact immutable `PassportVersion` rows. The draft is never consulted, and a later draft edit or republish cannot change an older version's projection.
- The historical projection is built by the same validated snapshot-interpretation layer as the public projection, so the two cannot drift; only the attached URLs differ.
- The historical projection deliberately omits `publicUrl`, `qrTargetUrl` and `qrDownloadUrl`, because they belong to the passport's current version: `/passport/:uuid` always serves the current version. Back-office chrome states which version the public URL currently shows.
- A historical asset download requires, in order: an authenticated Admin, a passport owned by the actor's company, a version that belongs to that passport, a `PassportVersionAsset` row for that exact `(versionId, assetId)`, the asset still `ACCEPTED` with stored content, and the asset query still scoped to the actor's company. Any failure is the same 404.
- `PassportVersionAsset` authorizes retention and download only. Its `role` column is never read to reconstruct cover/gallery/document/PDF semantics or ordering; the snapshot stays the sole authority for those.
- Historical assets stay private and authenticated on the `same-origin` resource policy. An asset that only an older version retained becomes unreadable on the public route after a republish, and no public historical asset route exists.
- The web app renders historical and draft assets only through authenticated fetch → `blob:` object URL, revoked on replacement, version switch and unmount. Bounded concurrency (four) keeps one slow file from holding up the cover image.
- The QR belongs to the Passport, not to a `PassportVersion`: it is generated once, retained across republishes, and never treated as version-specific. A QR download is not a scan.
- The Product table's publication metadata (`passport` summary and `coverImageAssetId`) is fetched inside the bounded list query, never as one request per row, and a draft cover image is never made public to render it.

### Proven public UI and editor invariants — do not weaken

- The web `/passport/:uuid` page is anonymous and server-rendered from the API's `PassportView`: the published product name and passport metadata are in the returned HTML, not assembled after hydration. It reads no authenticated product or draft endpoint.
- The public page and the editor Preview render **one** presentation component from one display model. A second, visually similar implementation is not acceptable.
- Preview renders the **current editor state**, unsaved changes included, and never the current published version. The shared Passport simulates eventual Published / prototype Verified presentation, while editor-only chrome clearly labels it unpublished. UUID, version and dates remain placeholders where not yet known; Preview never publishes.
- Draft assets stay private: Preview images are fetched through the authenticated `GET /assets/:id` route into `blob:` object URLs, which are always revoked. Public asset URLs always resolve to the published-asset route on the configured API origin, never to `/assets/:id`.
- Publishing requires a clean, saved draft. Unsaved changes, an in-flight upload or an unresolved stale revision block Publish/Republish instead of being published implicitly, and the publish body carries only `expectedDraftRevision`.
- The editor has exactly seven tabs — General Information, Materials, Sustainability, Certifications, Documents, Images, Preview — with roving tabindex and arrow/Home/End navigation. Switching tabs never saves and never loses entered data, and a blocked save reveals the tab that owns the invalid field.
- Dirty state compares the canonical save payload against the last known server baseline, never object identity, and the baseline advances on load, on save and on both stale-conflict resolutions.
- Public binary responses (`/passport/:uuid/assets/:assetId`, `/passport/:uuid/qr.png`) declare `Cross-Origin-Resource-Policy: cross-origin`, because the web origin is not necessarily the API origin. The authenticated `GET /assets/:id` route keeps `same-origin`.
- The public Passport surface neither requires nor restores a session, and an unauthenticated visitor there is never redirected to the login screen.

Verified on 2026-09-23 on `build/public-passport-api`, and re-verified on the merged `main` on 2026-09-24: `pnpm check` passes (80 files linted with no diagnostics, both workspaces typecheck and build, 6 integration suites with 110 of 110 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 10 of 10 against the built stack; `pnpm audit` reports no known vulnerabilities. CI is green on the merge commit `a27a4b13` (run `36017618829`).

Verified on 2026-09-24 on `build/passport-ui`: `pnpm check` passes (89 files linted with no diagnostics, both workspaces typecheck and build, 6 integration suites with 110 of 110 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 24 of 24 against the built stack; `pnpm audit` reports no known vulnerabilities. CI is green on `7550600` (run `36027931967`): 89 files linted, 6 suites / 110 of 110 integration tests against a fresh PostgreSQL 18.6 service, 24 of 24 Playwright tests and no known vulnerabilities.

Stage 4.3 Gate 7 correction locally verified on 2026-09-24: `pnpm check` passes (89 files linted, both workspaces typecheck and build, 6 integration suites / 110 tests); `pnpm test:e2e` passes 25 of 25; `pnpm audit` reports no known vulnerabilities. The accepted branch tip `a728865e` passed CI run `36046019904`; the `--no-ff` merge commit `b925a856` on `main` passed CI run `36049440655`; the documentation-only follow-up `651008e` passed CI run `36050341353`.

Stage 4.4 locally verified on 2026-09-25 on `build/passport-history`: `pnpm check` passes (104 files linted with no diagnostics, both workspaces typecheck and build, 7 integration suites with 128 of 128 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 33 of 33 against the built stack; `pnpm audit` reports no known vulnerabilities. The documentation-only tip `d99b8e4` passed CI run `36140600586`, and the accepted final tip `033680a` passed CI run `36141115620`. The `--no-ff` merge commit is `57ade8315ffb04ed44c0e445eca93619735a55f4`, and the merged `main` passed CI run `36146706397` (lint, typecheck, build, 128 integration tests against a fresh PostgreSQL 18.6 service, 33 Playwright tests and dependency audit).

Stage 4.5 locally verified on 2026-09-25 on `build/passport-pdf`: `pnpm check` passes (110 files linted with no diagnostics, both workspaces typecheck and build, 9 integration suites with 145 of 145 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 38 of 38 against the built stack; `pnpm audit` reports no known vulnerabilities. The accepted branch tip `94d36de` passed CI run `36154972651`. The `--no-ff` merge commit is `1867a670987a873988153b247e07d1e3c7e7f4a9`, and the merged `main` passed CI run `36156162845` (lint, typecheck, build, 145 integration tests against a fresh PostgreSQL 18.6 service, 38 Playwright tests and dependency audit).

Stage 4.6 locally verified on 2026-09-25 on `build/stage4-acceptance`: `pnpm check` passes (112 files linted with no diagnostics, both workspaces typecheck and build, 9 integration suites with 146 of 146 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 49 of 49 against the built stack, including the 11-case Stage 4 acceptance journey; `pnpm audit` reports no known vulnerabilities. The accepted branch tip `8fcf08e` passed CI run `36162682815`. The `--no-ff` merge commit is `b734a5e5e5385da7a25c718107841d437439fabd`, and the merged `main` passed CI run `36163976849` (lint, typecheck, build, 146 integration tests against a fresh PostgreSQL 18.6 service, 49 Playwright tests and dependency audit).

## The specs are authoritative

`docs/specs/` is the single source of truth. Start at [00-ROADMAP.md](docs/specs/00-ROADMAP.md).

| Spec | Owns |
| --- | --- |
| [01-ESPR-SCOPE.md](docs/specs/01-ESPR-SCOPE.md) | Regulatory boundary, mock-data scope, claims |
| [02-ARCHITECTURE.md](docs/specs/02-ARCHITECTURE.md) | Modules, contracts, API outline, dependencies |
| [03-DATA-AND-LIFECYCLE.md](docs/specs/03-DATA-AND-LIFECYCLE.md) | Schema, constraints, publication, deletion |
| [04-AUTH-AND-SECURITY.md](docs/specs/04-AUTH-AND-SECURITY.md) | Sessions, permissions, trust boundaries |
| [05-PRODUCTS-AND-FILES.md](docs/specs/05-PRODUCTS-AND-FILES.md) | CRUD, nested data, uploads, search |
| [06-PASSPORTS-QR-PDF.md](docs/specs/06-PASSPORTS-QR-PDF.md) | Public projection, QR, versioning, PDF |
| [07-ANALYTICS-AND-CACHE.md](docs/specs/07-ANALYTICS-AND-CACHE.md) | Scan/view definitions, dashboards, Redis |
| [08-FRONTEND.md](docs/specs/08-FRONTEND.md) | Routes, forms, state, accessibility |
| [09-TESTING-AND-DELIVERY.md](docs/specs/09-TESTING-AND-DELIVERY.md) | Tests, security review, Compose, VPS |
| [10-AI-AND-DX.md](docs/specs/10-AI-AND-DX.md) | AI workflow, tooling, evidence |

Rules:

- A rule has one owner. Reference the owning spec instead of restating its rules elsewhere.
- A change to a shared contract updates its consumers in the same change.
- You may propose spec changes, but a shared-contract change requires a recorded decision first.

### Unresolved decisions are proposals, not requirements

**Locked:** deployment tenancy (one company per deployment) and product granularity (one serialized item per `Product`). See section B2 of [docs/IMPLEMENTATION-DECISIONS.md](docs/IMPLEMENTATION-DECISIONS.md).

**Recorded and implemented:** publishing is **not** Admin-only. An Editor may publish and republish. `POST /products/:id/publish` is deliberately role-agnostic: it requires an authenticated actor, and no code gates publish to `ADMIN`.

Still open: permission semantics for features that do not exist yet (Users/Settings management beyond its recorded Admin-only cells, raw analytics and audit detail, any future review workflow), analytics definitions and retention, session lifetimes, audit retention. Anything marked *proposed* or *recommended* is a working default, **not** an employer instruction.

Settled and implemented, so do not present them as open: **both roles** may manage current publications — list company passports, open the current public Passport and download its QR — while **Admin alone** may list and inspect historical Passport versions and retrieve historical-version Assets. Backend authorization is authoritative; hiding a UI action is presentation only. Anything marked *proposed* or *recommended* is a working default, **not an employer instruction**.

Settled and recorded, so do not re-open them from a spec: **published-edit visibility** (unsaved and saved edits remain private until explicit republish; stable UUID/QR), **verification badge meaning** is a prototype/application-level indicator on an active published passport, with no review or approval subsystem required (`PassportReview` may stay unused infrastructure), and **historical-version visibility** is back-office only with no public historical route. **File limits** are locked and implemented — see section B5 of `docs/IMPLEMENTATION-DECISIONS.md`.

- Do not implement a proposal as settled fact, and do not silently choose between materially different options.
- Surface the unresolved decision, state the options and trade-offs, and get it recorded before building on it.
- Never edit a spec to make an unresolved decision look decided.

## Module boundaries

- `apps/api` (NestJS) — business rules and database access. Owns authoritative validation. Currently `src/config`, `src/prisma`, `src/common`, `src/auth`, `src/products`, `src/assets`, `src/publication`, `src/public-passport` and `src/passports`; the generated Prisma client lives in `src/generated` and is not committed.
- `apps/web` (Next.js) — UI and rendering. Reflects permissions; never enforces them. Currently the auth flow, the product list, the seven-tab product draft editor with its draft Preview and Publish action, and the anonymous public Passport page.
- `packages/api-client` — reserved for generated API types; **still empty**.
- `prisma` — schema, migrations, `seed.ts` (run with `pnpm db:seed`) and `verification/invariant-checks.sql`.
- `fixtures` — reserved for fictional sample assets; **still empty**. Deterministic seed data currently lives in `prisma/seed.ts`.

Boundaries that are not negotiable:

- Do not expose Prisma models as public response contracts.
- Do not import the Nest runtime or the database client into the browser.
- Do not let controllers orchestrate cross-module Prisma calls; call the owning module.
- Runtime validation stays server-side even when a generated client provides types.

## Commands

Supported today. Runtime is Node 24.21.0 with pnpm 12.5.1 — the pinned versions.

| Command | Does |
| --- | --- |
| `pnpm install` | Install the pinned toolchain from `pnpm-lock.yaml` |
| `pnpm db:validate` | `prisma validate` against `prisma7.config.ts` |
| `pnpm db:generate` | Generate the Prisma client into `apps/api/src/generated/prisma` |
| `pnpm db:migrate` | `prisma migrate dev` against `DATABASE_URL` |
| `pnpm check` | The normal local repository contract: `db:validate`, `lint`, `typecheck`, `build` and the API integration suite |
| `pnpm hooks:install` | Point git at `.githooks` (once per clone) |
| `pnpm lint` / `pnpm lint:fix` | Biome check (and autofix) across the workspace |
| `pnpm typecheck` | `tsc --noEmit` in every workspace that defines it |
| `pnpm build` | Build every workspace |
| `pnpm test` | Run every workspace's tests |
| `pnpm --filter @notarify/api test:integration` | Jest integration tests against the real PostgreSQL at `DATABASE_URL` |
| `pnpm db:seed` | Idempotent seed of fictional categories (`prisma/seed.ts`) |
| `pnpm test:e2e` | Playwright regression for auth **and** product drafts against the built API and web app (starts both) |

`prisma7.config.ts` is deliberately not auto-detected, so every Prisma invocation must pass `--config prisma7.config.ts`. The scripts already do; pass it yourself if you call Prisma directly.

The API has no `dev` script: build it and run `node apps/api/dist/src/main.js`. The frontend has `pnpm --filter @notarify/web dev`.

The API needs `DATABASE_URL`, `JWT_SECRET` and (outside development) `CORS_ORIGIN` and `PUBLIC_APP_ORIGIN`; see `.env.example`. Startup fails fast on missing or unsafe configuration, including an origin that is not an absolute http(s) origin.

`next build` runs with `NODE_ENV=production`, pinned in the `apps/web` build script. The repository's `.env` sets `NODE_ENV=development`, and an ambient `NODE_ENV=development` makes the build fail while prerendering `/_global-error` with `TypeError: Cannot read properties of null (reading 'useContext')`, which does not name the real cause. `e2e/playwright.config.ts` pins the same value for `next start` for the same reason.

**Not supported yet — do not document or invoke them as if they work:** `test:unit`, `openapi:export`, `security:check`, `compose:up`. They remain proposals from the roadmap. There is no Docker or Compose configuration in this repository; the database used for testing is a disposable container.

## Test evidence

- Test suites today: `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/products.e2e-spec.ts`, `apps/api/test/assets.e2e-spec.ts`, `apps/api/test/product-attachments.e2e-spec.ts`, `apps/api/test/publication.e2e-spec.ts`, `apps/api/test/public-passport.e2e-spec.ts`, `apps/api/test/passports.e2e-spec.ts`, `apps/api/test/passport-pdf.e2e-spec.ts` and `apps/api/test/passport-pdf-stream.spec.ts` via `pnpm --filter @notarify/api test:integration` (9 suites, 146 tests, real PostgreSQL); `e2e/auth.spec.ts`, `e2e/products.spec.ts`, `e2e/assets.spec.ts`, `e2e/public-passport.spec.ts`, `e2e/passport-ui.spec.ts`, `e2e/passports.spec.ts`, `e2e/passport-pdf.spec.ts` and `e2e/stage4-acceptance.spec.ts` via `pnpm test:e2e` (49 Playwright tests, built API + web). The Stage 4 evidence map is [docs/STAGE4-ACCEPTANCE.md](docs/STAGE4-ACCEPTANCE.md). Never report a test, scan, or audit as passing unless you ran it and can quote the command and its result.
- Tests must target observable behavior and critical invariants — not trivial getters, and not the implementation the test claims to verify. Never mock away the guard, transaction, or constraint under test.
- Integration tests use a real isolated PostgreSQL database; SQLite or a mocked Prisma client cannot validate PostgreSQL constraints, transactions, or search behavior.
- Record failures that remain unresolved instead of omitting them. A green badge is never worth suppressing a finding.
- Never report "no vulnerabilities" from an unrun or incomplete scan.

## Authentication invariants — do not weaken

These were expensive to get right and are proven by integration tests. Change them only with evidence and a recorded reason.

- Refresh rotation is **one transaction**: a row lock plus a conditional compare-and-set on `usedAt IS NULL AND expiresAt > now()`, with the session's `revokedAt` and absolute `expiresAt` checked. Exactly one concurrent refresh may win; losers get 401.
- A successor's `expiresAt` must never exceed the session's absolute expiry.
- Presenting a consumed refresh token is reuse: reject it **and revoke the whole session family**. Consumed rows are retained, never deleted.
- `GET /auth/me` re-reads the user and session from the database on every call. A valid JWT alone must never be sufficient.
- The access token is kept in browser memory only. Never write it to `localStorage`, `sessionStorage`, IndexedDB or a readable cookie. The refresh cookie is HttpOnly, `SameSite=Lax`, `Path=/auth`.
- CORS uses an exact configured origin with credentials. A wildcard origin is not acceptable.
- Every cookie-authenticated mutation (`/auth/login`, `/auth/refresh`, `/auth/logout`) validates the request `Origin` against the configured application origin and rejects a mismatch with 403. A missing `Origin` is allowed deliberately for non-browser clients and tests. Do not describe CORS as CSRF protection.
- `AccessTokenGuard` alone must be sufficient for a protected endpoint: it establishes the authoritative actor (session existence, subject match, not revoked, not expired, user active, **role and companyId read fresh from PostgreSQL**) and attaches it to the request. Never trust a role from JWT claims, and never require a controller to perform a second session lookup.
- Login failures are generic: unknown email, wrong password and disabled account all return the same 401 `INVALID_CREDENTIALS`. Log the real reason server-side only.
- Logout is idempotent: 204 whether the session is active, already revoked, the token is unknown, or the cookie is absent. It resolves the session only from the presented cookie digest, never from client-supplied ids.
- No separate CSRF token is implemented. That is a recorded decision with reasoning and residual risk (section B3 of the decisions record), not an omission. Revisit it if the API and web app stop being same-site.
- `lint/style/useImportType` stays **off** in `biome.json`. NestJS injects classes at runtime and `emitDecoratorMetadata` needs the runtime value; type-only imports break dependency injection and silently disable `ValidationPipe` DTO validation. Use `import type` only for genuine interfaces and type aliases.

## Draft save contract — clients depend on this

`PATCH /products/:id` requires `expectedDraftRevision` and replaces content with these exact semantics:

- omitted top-level field → unchanged
- explicit `null` → cleared where the domain allows null
- supplied scalar → replaced
- omitted nested section → unchanged
- supplied `materials` or `certifications` array → replaces the whole collection in the same transaction
- supplied `sustainability` object → updates the fields present in the object, preserving omitted inner fields; explicit `null` inner fields clear them
- explicit `null` sustainability → removes the record

The revision is claimed atomically: one transaction performs a conditional `UPDATE ... WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND "draftRevision" = $expected RETURNING "draftRevision"`. Exactly one competing writer may win; the loser gets 409 `PRODUCT_REVISION_CONFLICT` and no nested change is applied. Never replace this with a read-compare-then-write.

Draft saves deliberately do **not** enforce publication completeness, and a material total other than 100 is allowed — those are publication prerequisites.

## Gated execution workflow

Every meaningful pass follows these gates in order. The full version lives in [docs/specs/10-AI-AND-DX.md](docs/specs/10-AI-AND-DX.md).

0. **Repository truth** — read this file, check branch/HEAD/worktree, read the owning specs and recorded decisions, read the worklog, and identify stale present-state documentation. Never implement from stale assumptions.
1. **Scope and decision gate** — state the goal, in-scope and out-of-scope behaviour, contracts touched, unresolved decisions this slice needs, required evidence and exit condition. **Never silently select an unresolved material product/security/architecture decision**: present the options and stop for Cristian unless his prompt already chose one. An earlier AI recommendation is not human approval.
2. **Implementation** — only the approved slice, preserving proven invariants, in small logical commits. Do not modify `main` or create the next milestone branch early.
3. **Focused independent verification** — target the pass's critical invariants (auth → session/replay/authorization; drafts → ownership/concurrency/mass assignment; assets → MIME/signature/immutability/access). A second AI agreeing is not proof; resolve or record findings.
4. **Executable validation** — run the applicable gates. Never report a check as passed unless it ran against the relevant final commit state. Local hooks are feedback only and can be bypassed with `--no-verify`; a pass is not fully validated until applicable local validation passes **and** the final pushed branch HEAD has green CI (`.github/workflows/ci.yml`).
5. **End-of-pass truthfulness reconciliation (mandatory)** — re-read and reconcile this file, README/current-state docs, `docs/IMPLEMENTATION-DECISIONS.md`, `docs/AI-WORKLOG.md` and any owning spec whose behaviour changed. **A pass is not complete while `AGENTS.md` still describes the state from before that pass.** The worklog may be reconciled and normalized for accuracy while a milestone is unmerged, and its completed evidence becomes stable once that milestone is merged; historical prose is not rewritten, and stale present-state claims must not survive.
6. **Completion report and stop** — push, report HEAD, commands, results, decisions, defects, unresolved items, what is unvalidated, and the recommended next slice. Then stop. A successful pass grants permission to report readiness, not to advance the project.
7. **Cristian decision gate** — the next action happens only after Cristian decides. Do not infer approval from silence or from green tests.
8. **Milestone merge** — there is no permanent `develop` branch and **no mandatory pull request**: direct verified merges are the adopted workflow, and no PR was used for Milestone 1. After merging, require CI on the resulting `main` commit to pass before proving reachability and deleting the branch. On Cristian's explicit acceptance, Pi switches to `main`, verifies no divergence, runs `git merge --no-ff <milestone-branch>`, pushes, proves the tip is reachable from `main`, and deletes the completed branch locally and remotely. No squash, no cosmetic rebase, no automatic creation of the next milestone branch; the next milestone starts only on a new instruction with a fresh Gate 0.

### Authority hierarchy

1. Employer assessment requirements, when available and unambiguous.
2. Recorded project decisions approved by Cristian.
3. Current owning specs and contracts.
4. Approved scope for the current pass.
5. AI recommendations.

AI recommendations do not become project decisions merely because they appear in a spec, worklog, completion report or prompt.

### End-of-pass checklist

Verify explicitly; do not mark an item complete by assumption.

- [ ] requested scope only
- [ ] required decisions already recorded
- [ ] critical invariant independently checked
- [ ] applicable executable gates run
- [ ] `docs/AI-WORKLOG.md` appended truthfully
- [ ] `docs/IMPLEMENTATION-DECISIONS.md` updated if a decision changed
- [ ] README/current docs checked
- [ ] `AGENTS.md` re-read and reconciled with the final repository state
- [ ] branch pushed and worktree clean
- [ ] no next milestone started
- [ ] completion report returned for Cristian's gate

## AI contribution records

The project's coding-agent harness is **Pi 0.87.0**, used with its `explore`, `architect`, `research`, `review` and `verify` subagents. Its default implementation model is `opencode-go/deepseek-v4.1-flash` and its architecture and review route is `openai-codex/gpt-5.6-sol`. Pi is development tooling only — the application builds, tests and runs without it.

Every meaningful task updates [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md), which is the canonical evidence record. Use its established per-round structure: scope, AI participation, human review, decisions, work performed, findings and rejected approaches, validation evidence, not-validated items, and result.

**Worklog policy:** while a milestone is active and unmerged, the worklog may be reconciled and normalized for accuracy — corrections are folded into the rounds where they belong. Once a milestone is accepted and merged into `main`, its completed evidence becomes stable, and later material corrections must be explicit and traceable through Git rather than silently rewritten.

- Be truthful. Inventing results, claiming review that did not happen, or asserting precise percentages of AI-written code are all prohibited.
- Report human review in its three separate parts — decision/scope review, manual validation, and source-code review. Never collapse them into one word. Cristian reviews decisions and scope during the build rounds and reviews source code only once the complete project is built, so `none yet` is inaccurate; say which parts happened.
- Record AI used outside this harness (the external ChatGPT review/orchestration layer) as a tool with its real model identity, described qualitatively. It is AI review, not human review, and it did not author repository files or execute local commands.
- When something is unvalidated, name the category: tests not run, human review deferred, deployment not performed, feature not implemented, security testing not performed.
- The planning specs are AI-assisted drafts. Do not retroactively describe their planned tests as passed tests.
- Distinguish clearly between what was completed and what remains proposed.

## Prohibited

- Inventing test results, evidence, or command output.
- Silently changing requirements or rewriting a spec to match the implementation.
- Rewriting migrations that have already been deployed (forward-only after deployment).
- Committing secrets, real credentials, or local environment files. Production seed credentials come from environment configuration.
- Sending secrets or credentials to a model prompt.
- Claiming ESPR compliance, EU certification, or official DPP registration for this prototype, or presenting fictional data as real.
- Committing the assessment PDF or the recruitment email.
