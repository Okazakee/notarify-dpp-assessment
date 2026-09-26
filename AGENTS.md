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

**Stage 5 (analytics, dashboard, Total Views and the Redis cache bonus) is merged into `main`.**

**Stage 6 (remaining back-office and lifecycle work) is merged into `main`.** It adds the audit-log bonus, `DELETE /products/:id` as an Admin-only soft delete that withdraws the published Passport in one transaction, proportional Users administration with last-active-Admin protection, company Settings, a read-only Product view and the six-item Admin navigation. No Prisma schema change and no migration were needed: `Product.deletedAt`, `Passport.withdrawnAt`, `User.role`/`active`, `Company.displayName`/`logoAssetId` and `AuditEvent` already existed.

**Stage 5 (analytics, dashboard, Total Views and the Redis cache bonus) is merged into `main`.** The stable QR resolver records `QR_HIT`, the visible public page records one idempotent `VIEW`, `GET /dashboard` and `GET /analytics` report company-scoped numbers to both roles, the Product list shows a measured `Total Views`, and Redis caches only immutable published content after a fresh PostgreSQL visibility and current-version check. No Prisma schema change and no migration were needed: `AnalyticsEvent` and `AnalyticsDaily` already existed.

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
  - Analytics: `GET /q/:uuid` records a `QR_HIT` best-effort without ever gating its 302, and the anonymous `POST /passport/:uuid/view` records one `VIEW` per visible page navigation, idempotent on a client-supplied `eventKey`. Each accepted event and its `AnalyticsDaily` UTC bucket are written in one transaction. `GET /dashboard` returns the four assessment counters and `GET /analytics` returns scans today, seven zero-filled UTC buckets, the most viewed passports for a bounded 7/30/90 range and the latest scans; both are company-scoped and open to both roles, and only the Admin projection carries the raw address. The country is a configured mock recorded with `countrySource = MOCK`.
  - Cache: `Redis` holds only the interpreted content of an already-selected immutable published version, keyed by passport, version and content schema, covered by an integrity checksum over **both** the snapshot PostgreSQL selected and the cached content itself, and bounded by a TTL. `REDIS_URL` is optional; an absent, unreachable, corrupt or mismatched cache falls back to PostgreSQL.
- **`apps/web`** — Next 16.3.5 App Router: login, workspace, the four-counter dashboard, the analytics page with a range selector, product list with filters, pagination, cover images, a measured Total Views column and publication actions, the back-office `/passports` list with current-publication actions for both roles, the Admin-only `/passports/[passportId]` version history, a draft editor covering General Information, Images, Documents, Materials, Sustainability and Certifications, and the anonymous public Passport page with a client view tracker.
- **`prisma/seed.ts`** — deterministic, idempotent fictional categories via `pnpm db:seed`.

Not implemented, and not to be assumed: public historical-version routes, a public `410 Gone` tombstone, restore/undelete, a Trash view, password reset or invitation email, the unused `PassportReview` workflow, tenancy onboarding, garbage collection, antivirus or PDF CDR, object storage, Docker/Compose and deployment. Analytics has **no** automatic raw-retention or purge job in this assessment: accepted events stay in `AnalyticsEvent`, and production retention is future hardening. Every application feature the assessment asks for now exists; what remains is Stage 7 delivery, packaging and submission rather than missing functionality.

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
- Every public response is `no-store`; there is no public HTTP caching. Stage 5 added a **server-side** cache of immutable snapshot content, which is a different layer: the response headers still forbid caching, and every read resolves existence, visibility and the current version from PostgreSQL before any cache is consulted.
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
- There is no PDF cache: a republish changes what the same public URL exports immediately. The shared content cache cannot make an export stale, because the current version is always resolved from PostgreSQL before cached content is considered.
- There is no historical PDF route. The public page and Product Passports (both roles) offer the current export; draft Preview and the historical version view do not advertise one.
- The PDF writes no `AnalyticsEvent`, no `AnalyticsDaily` and no `AuditEvent`. A download is neither a scan nor a view.

### Proven analytics and cache invariants — do not weaken

- `QR_HIT` and `VIEW` are distinct facts and are never summed into one number. A `QR_HIT` is an accepted request to the stable resolver `/q/:uuid`; a `VIEW` is one visible public Passport page navigation. Neither proves a unique human, a unique device or a physical camera scan.
- A `VIEW` is recorded exactly once per navigation. The client sends a UUID `eventKey` that it reuses on every retry, and the unique constraint plus a conflict-safe insert make a duplicate a no-op. The daily bucket only moves in the transaction that actually inserted the raw row, so an accepted event and its aggregate can never drift.
- Analytics fields are server-authoritative. The `VIEW` body carries only `eventKey` and the public version number, unknown properties are rejected, and time, address, browser, operating system, language, country, `source` and `synthetic` are all resolved by the server.
- Real reporting excludes `synthetic = true` everywhere: dashboard counters, scans today, weekly buckets, rankings, latest scans and Product `totalViews`. Runtime ingestion always writes `synthetic = false`, and a client cannot set it.
- Only the Admin projection carries the raw IP address; the Editor response omits the property entirely rather than sending a null. Shaping happens in the API response DTO, never in the browser.
- Analytics reporting is UTC: `scansToday` is the current UTC calendar day and the weekly series is exactly seven zero-filled UTC buckets, oldest first.
- The country is a configured mock recorded with `countrySource = MOCK`, and the UI labels it as mocked. Country is never inferred from IP, language or locale, and the stored IP is never called anonymized.
- QR ingestion never gates a valid scan: `HEAD` and obvious prefetch requests are not counted, the record write is bounded rather than awaited indefinitely, and any analytics failure still returns the same 302. A QR download, a PDF download, an asset download, the JSON projection, the editor Preview and the historical version view all record nothing.
- Redis caches **only** the interpreted content of an immutable published version, keyed by passport, version and content schema, and bounded by a TTL. Nothing else is cached: not visibility, not the current-version pointer, not sessions, analytics, QR redirects, asset bytes or generated PDF bytes.
- A cached entry is served only when its integrity checksum matches **both** the exact snapshot PostgreSQL selected for that version **and** the exact content being returned. Checking only the snapshot would leave the content itself unverified, so a shape-valid but modified payload could silently replace published content; checking both makes that impossible. The checksum is an unkeyed SHA-256 over a domain separator plus the two serialized values: it detects corruption, inconsistency and a transplanted payload, and it is **not** authentication against an actor who controls Redis and can recompute it — that is out of scope, because the cache lives inside the trusted deployment.
- An entry that is unreadable, oversized, written by another schema, whose content no longer matches its checksum, or which does not belong to the snapshot PostgreSQL just selected is discarded and never served; the stored snapshot is interpreted instead and the entry is best-effort repopulated. The checksum binds content to the selected snapshot but does not encode the key it was stored under, so an entry transplanted to another version's key passes only when that version's snapshot **and** content are byte-identical — in which case the content served is the same, so nothing incorrect is exposed.
- Every current public read resolves existence, `withdrawnAt`, `Product.deletedAt` and the current version from PostgreSQL **before** any cache is consulted, so a warm entry can never resurrect a withdrawn or soft-deleted passport or mask a republish.
- A cache miss, a disabled cache, an unreachable cache, an oversized entry, a corrupt entry and an entry bound to a different snapshot all fall back to PostgreSQL. A cache failure never fails a request, never hangs one, and never queues work for a reconnection.
- Public HTTP responses remain `Cache-Control: no-store` whether the content came from Redis or PostgreSQL. The internal content cache and the browser-facing cache policy are different layers.
- Product `totalViews` counts non-synthetic `VIEW` events for the product's currently active Passport. A QR scan does not contribute, an unpublished product reports a measured `0`, and the value is read in one bounded aggregate per page rather than one query per row.

### Proven Stage 6 lifecycle, audit and administration invariants — do not weaken

- `DELETE /products/:id` is a **soft delete**: it sets `Product.deletedAt` and, when a Passport exists, `Passport.withdrawnAt` to the same timestamp, in one transaction that also appends the `PRODUCT_DELETED` audit row. Nothing is physically deleted — not the product, its nested draft rows, the Passport, any immutable version, its retained asset references, its Assets or its analytics.
- The delete transaction locks the product row `FOR UPDATE` before deciding, the same discipline publication uses, so a delete composes with a concurrent draft save or publish instead of interleaving with one. An already-deleted product is indistinguishable from a missing one and is never mutated again.
- A deleted product cannot be edited or published: the draft-save claim requires `deletedAt IS NULL`, and publication locks the row and rejects a deleted product before writing anything.
- Public behaviour after deletion stays the **uniform safe 404** on every anonymous surface — JSON, page, QR resolver, QR image, PDF and published asset — and a warm Redis entry cannot resurrect any of them. There is deliberately no `410 Gone` tombstone, no withdrawal reason and no public restore status.
- The normal Product list and `GET /products/:id` exclude deleted products. Admin **exact** historical inspection of a withdrawn or soft-deleted Passport is still allowed, scoped by company ownership and retained Passport rather than by active status; nothing about that becomes public, and no public historical route exists.
- Immutable publication history and current public availability are represented as separate facts. The history response carries an explicit `lifecycleStatus` derived from `Passport.withdrawnAt` and `Product.deletedAt`, and its public action URLs are null while withdrawn rather than mechanically constructed, because every one of those endpoints returns the uniform 404. The history UI states the withdrawal and omits the public actions instead of offering dead links, and it calls the retained pointer the last published version rather than a publicly served one. A withdrawn Passport keeps its UUID, versions, QR bytes and current-version pointer; withdrawal is operational state, never a rewrite of an immutable version.
- Analytics rows are retained on deletion. Active-only surfaces — Dashboard, Analytics, Product `totalViews` and the passport list — simply stop treating the withdrawn Passport as active.
- Every audited mutation appends its `AuditEvent` **inside the mutation's own transaction**, so a failed audit insert rolls the mutation back rather than leaving it unrecorded. Audited actions are Product create/update/delete, new Passport version publication, user create/role change/activation/deactivation, and company settings update.
- An idempotent publish replay writes **no** publication audit row, because no new immutable version was created; a failed, stale or incomplete publish writes none either.
- Audit metadata is a closed, bounded vocabulary — changed field names, revision movement, version numbers, ids, role/active before-and-after, revoked-session count. It never contains a password, a hash, a token, a cookie, an Authorization header, a request body, file bytes or an arbitrary payload.
- `GET /audit-logs` is Admin-only through the guard chain and company-scoped in the query itself. Audit reads are append-only: the application only creates and reads them, and that is **not** described as cryptographic tamper-proofing.
- User authorization state is server-owned: role and activation live in PostgreSQL and are re-read on every protected request, so a role change is observed by the target's next request without a new token, and no role claim is added to the JWT.
- Deactivating a user revokes that user's still-active sessions in the same transaction, so a disable cannot be waited out. Reactivation does not restore a revoked session; the user signs in again.
- The last active administrator cannot be removed or disabled, and the rule is concurrency-safe: administrative writes lock the company's user rows before deciding, so two removals that would together leave zero serialize and exactly one commits.
- Settings change mutable company state only. A published Passport snapshot is immutable, so a display-name change never rewrites an already-published version; the new name reaches a version only through an explicit republish.
- The company logo must be a same-company, accepted image asset with stored content, and it is never made public: the public Passport renders the bundled application brand mark.
- The read-only Product view shows the **current private draft**, not the published snapshot, and mutates nothing.

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
Stage 5 locally verified on 2026-09-25 on `build/analytics-dashboard-redis`: `pnpm check` passes (131 files linted with no diagnostics, both workspaces typecheck and build, 12 suites with 185 of 185 tests against PostgreSQL 18.6, including the cache suite against a real Redis 8.10.2); `pnpm test:e2e` passes 59 of 59 against the built stack; `pnpm audit` reports no known vulnerabilities. The accepted branch tip `fa653ef` passed CI run `36181242962`. The `--no-ff` merge commit is `fbfeabb8cc62ea59375525893fb39b56cc177420`, and the merged `main` passed CI run `36184373192` (lint, typecheck, build, 185 tests against a fresh PostgreSQL 18.6 service with the real Redis 8.10.2 service, 59 Playwright tests and dependency audit).

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
| `pnpm test:e2e` | Playwright regression for auth, product drafts, publication, the public Passport and analytics against the built API and web app (starts both) |

`prisma7.config.ts` is deliberately not auto-detected, so every Prisma invocation must pass `--config prisma7.config.ts`. The scripts already do; pass it yourself if you call Prisma directly.

The API has no `dev` script: build it and run `node apps/api/dist/src/main.js`. The frontend has `pnpm --filter @notarify/web dev`.

The API needs `DATABASE_URL`, `JWT_SECRET` and (outside development) `CORS_ORIGIN` and `PUBLIC_APP_ORIGIN`; see `.env.example`. Startup fails fast on missing or unsafe configuration, including an origin that is not an absolute http(s) origin. `REDIS_URL` is **optional** and only enables the disposable content cache; `REDIS_CACHE_TTL_SECONDS` defaults to 300 and `ANALYTICS_MOCK_COUNTRY` defaults to `IT`.

`next build` runs with `NODE_ENV=production`, pinned in the `apps/web` build script. The repository's `.env` sets `NODE_ENV=development`, and an ambient `NODE_ENV=development` makes the build fail while prerendering `/_global-error` with `TypeError: Cannot read properties of null (reading 'useContext')`, which does not name the real cause. `e2e/playwright.config.ts` pins the same value for `next start` for the same reason.

**Not supported yet — do not document or invoke them as if they work:** `test:unit`, `openapi:export`, `security:check`, `compose:up`. They remain proposals from the roadmap. There is no Docker or Compose configuration in this repository; the database used for testing is a disposable container.

## Test evidence

- Test suites today: `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/products.e2e-spec.ts`, `apps/api/test/assets.e2e-spec.ts`, `apps/api/test/product-attachments.e2e-spec.ts`, `apps/api/test/publication.e2e-spec.ts`, `apps/api/test/public-passport.e2e-spec.ts`, `apps/api/test/passports.e2e-spec.ts`, `apps/api/test/passport-pdf.e2e-spec.ts`, `apps/api/test/passport-pdf-stream.spec.ts`, `apps/api/test/analytics.e2e-spec.ts`, `apps/api/test/passport-cache.e2e-spec.ts` and `apps/api/test/passport-content-cache.spec.ts` via `pnpm --filter @notarify/api test:integration` (15 suites, 212 tests: fourteen integration suites against a real PostgreSQL plus the database-less cache-port spec; the cache suite additionally needs a real Redis, and `REDIS_URL` selects it); `e2e/auth.spec.ts`, `e2e/products.spec.ts`, `e2e/assets.spec.ts`, `e2e/public-passport.spec.ts`, `e2e/passport-ui.spec.ts`, `e2e/passports.spec.ts`, `e2e/passport-pdf.spec.ts`, `e2e/analytics.spec.ts` and `e2e/stage4-acceptance.spec.ts` via `pnpm test:e2e` (70 Playwright tests, built API + web). The Stage 4 evidence map is [docs/STAGE4-ACCEPTANCE.md](docs/STAGE4-ACCEPTANCE.md). Never report a test, scan, or audit as passing unless you ran it and can quote the command and its result.
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
8. **Milestone merge** — there is no permanent `develop` branch and **no mandatory pull request**: direct verified merges are the adopted workflow, and no PR was used for Milestone 1. On Cristian's explicit acceptance, and with the accepted branch already green on its exact HEAD, Pi performs the merge and the documentation reconciliation **locally and pushes once**: it switches to `main`, verifies no divergence, runs `git merge --no-ff <milestone-branch>`, commits the mandatory merged-state reconciliation as a **separate** commit, and then pushes `main` a single time carrying both commits. The merge commit is never pushed on its own. One CI run is required on the exact final `main` HEAD, and that run validates the integrated runtime together with the reconciled repository state; only after it passes does Pi prove the milestone tip is reachable from `main` and delete the completed branch locally and remotely. Non-trivial runtime conflicts are resolved locally, with appropriate local validation, before that single push. No `paths-ignore`, `[skip ci]`, docs-only CI exception or weaker validation rule is permitted. No squash, no cosmetic rebase, no automatic creation of the next milestone branch; the next milestone starts only on a new instruction with a fresh Gate 0.

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
