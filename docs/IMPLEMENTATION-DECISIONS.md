# Implementation decisions — schema review

**Date:** 2026-09-21  
**Status:** the schema was validated and migrated to PostgreSQL 18.6, and the application has since moved well past this record — authentication and Product draft CRUD are implemented. Read the decision and enforcement sections as live contracts, and the schema-validation section as the state at that round. The project-wide, current state lives in [AGENTS.md](../AGENTS.md).  
**Scope reviewed:** `AGENTS.md` and `docs/specs/00-ROADMAP.md` through `10-AI-AND-DX.md`, reconciled with the supplied task prompt. The original assessment PDF and recruitment email are absent from this repository, so this record **cannot independently compare this draft against either source document**. It checks only the supplied repository specs and task prompt for internal consistency.

This document records an implementation-ready *provisional* model. It makes no ESPR-compliance, certification, authenticity, legal, or real-world verification claim.

## Decision categories

### A. User-approved direction in this round

Only the following direction is treated as user-approved for this round:

| Direction | Consequence in this draft |
| --- | --- |
| Synthetic seed data | The later seed must use clearly synthetic records/events; no seed is created now. |
| PostgreSQL-backed binary file storage; no bucket or upload volume | `AssetContent` retains accepted bytes in PostgreSQL; no object-storage or volume table/configuration is introduced. |
| NestJS + Prisma backend | The schema targets Prisma ORM 7.10.0 and later Nest modules own authoritative business rules. |
| Next.js + daisyUI + Zustand frontend | The dependency baseline pins the compatible frontend set; Zustand is limited to small client UI state. |
| Application tests throughout feature development | Critical transaction and authorization behavior must receive real PostgreSQL/API tests when the scaffold exists. |
| Full Compose testing only after functional completion | Compose is intentionally absent now and remains a later delivery gate. |

### B. Straightforward technical choices (not user approvals)

These are low-product-impact engineering choices made for this draft. They remain reviewable, but do not require a product decision before the initial migration once the unresolved items below are settled.

| Choice | Reason |
| --- | --- |
| Modular monolith | Fits a short assessment: one Nest application owns business rules and PostgreSQL is authoritative. |
| PostgreSQL as source of truth; Redis only a future disposable cache | Security, publication visibility, sessions, and analytics accounting cannot depend on cache state. |
| Normalized mutable drafts plus immutable JSONB publication snapshots | Draft editing remains relational; published history is stable and reproducible. |
| Derived product visibility, not a writable status | `deletedAt`, passport withdrawal/current publication, and draft-versus-current revision determine Draft/Published/deleted visibility. |
| UUID identifiers and UTC `timestamptz` events | Stable public identifiers and unambiguous server time boundaries; date-only domain dates use PostgreSQL `date`. |
| Explicit foreign keys with restrictive retention for historical data | A hard delete cannot silently erase a version, retained asset, audit, or analytics record. |
| Narrow module ownership and proportional SOLID | Named use cases/services and small ports are sufficient; no inheritance hierarchy or generic repository layer. |
| PostgreSQL `simple` full-text configuration for product prose | It is appropriate for multilingual demo text; SKU/serial matching remains a separate identifier query. |

### B2. Decisions locked in the build/schema-validation round

These were unresolved drafts and are now settled. They carried a migration-blocking deadline, and the initial migration encodes them.

| Decision | Adopted | Consequence now fixed in the schema |
| --- | --- | --- |
| Deployment tenancy | One company per deployment. `companyId` ownership columns and ownership checks are retained. No tenant onboarding, membership infrastructure, tenant routing or generalized multi-tenant architecture is built. | `User.normalizedEmail` stays globally unique. Company filters remain plain ownership comparisons, not a permission boundary. |
| Product granularity | One serialized physical item per `Product`. SKU may repeat. `(companyId, serialNumber)` is unique. Soft-deleted serial numbers stay reserved. | `Product_companyId_serialNumber_key` is a real unique index; `Product.sku` is indexed but deliberately not unique. Reversing this later is a migration, not a config change. |
| Publish authorization | Editors may publish and republish; publishing is not Admin-only. Admin additionally deletes/withdraws, reviews versions, reads raw analytics and audits, and manages users and settings. | Supersedes the earlier Admin-only proposal. The brief requires neither behaviour, so this is a project choice, and it **is** recorded — it is not pending. What is pending is the code: publication does not exist yet, so no publish authorization is implemented, and nothing may gate publish to ADMIN when it arrives. |

Every other entry in section C remains unresolved and must not be treated as approved.

### B3. CSRF decision for cookie-authenticated mutations (recorded, not deferred)

Spec 04 requires an explicit CSRF token on refresh/logout plus equivalent login-CSRF protection. **No separate CSRF token is implemented.** That is a deliberate technical decision, recorded here rather than silently skipped, because the cookie and topology design already removes the attack the token defends against:

| Control | What it does here |
| --- | --- |
| `SameSite=Lax` on the refresh cookie | Browsers never attach it to a cross-site POST, which is the only vector that matters for `/auth/refresh` and `/auth/logout`. `/auth/login` carries no prior credential, so there is nothing for a forged request to ride on. |
| Server-side `Origin` allowlisting | Every cookie-authenticated mutation validates `Origin` against the exact configured application origin and rejects anything else. This does not depend on browser behaviour. |
| `Path=/auth`, HttpOnly, Secure in production | Narrows exposure of the cookie itself. |

Residual risk accepted, stated precisely:

- **Requests with no `Origin` header are allowed**, deliberately, so non-browser clients and tests work. A legacy or non-browser context that omits `Origin` while still sending the cookie would not be covered by the allowlist. This is the main accepted gap and is the reason `Origin` checking is not claimed to be complete CSRF protection on its own.
- **Compromise of the actually allowed origin** defeats any origin-based control, as it would defeat a token minted by that origin.

A sibling subdomain does **not** satisfy an exact `Origin` allowlist, so it is not a residual risk of this design. A CSRF token would not defend against a stolen cookie either. Browsers without `SameSite` support are out of scope.

**Revisit this decision if** the API is ever served from a different registrable domain than the web application, if a cross-site embedding requirement appears, or if the refresh cookie stops being `SameSite=Lax`. Until then, adding a token would add client complexity without closing a reachable gap.

### B4. Draft save contract (recorded — clients depend on it)

`PATCH /products/:id` carries `expectedDraftRevision` as a concurrency precondition, never as a client-settable value. Semantics, implemented and tested:

| Input | Effect |
| --- | --- |
| omitted top-level field | unchanged |
| explicit `null` | cleared where the domain allows null |
| supplied scalar | replaced |
| omitted nested section | unchanged |
| supplied `materials` / `certifications` array | replaces the whole collection in the same transaction |
| supplied `sustainability` object | updates fields present in the object; omitted inner fields preserved, explicit inner `null` clears |
| explicit `null` sustainability | removes the record |

The revision is claimed in one transaction with a conditional `UPDATE ... WHERE id/companyId/deletedAt/draftRevision` guard and `RETURNING`. A zero-row result is resolved into 404 (missing, foreign-company or soft-deleted — deliberately indistinguishable) or 409 `PRODUCT_REVISION_CONFLICT`. The loser of a concurrent save applies no nested change.

Deliberately **not** enforced at draft save: publication completeness, and the rule that material percentages total 100. Those remain publication prerequisites. A duplicate `(companyId, serialNumber)` maps to 409 `PRODUCT_SERIAL_CONFLICT`; SKU may repeat.

### B5. Assets decisions locked in the build/assets round

Approved by Cristian in the milestone prompt for the Assets slice, and implemented on `build/assets`. Recorded here rather than by rewriting the planning text in the specs, which stays as it was written.

| Decision | Value |
| --- | --- |
| Binary storage | PostgreSQL `AssetContent.bytea`, now **implemented**. `Asset` holds metadata only. No object storage, no local upload volume, no presigned URLs. |
| Accepted upload types | Images: JPEG, PNG, WebP. Documents and certification PDFs: PDF. SVG, HTML, XML-based active formats, archives and executables are rejected. Server-generated artifacts (for example a future QR PNG) are not user uploads and are outside this policy. |
| Limits | 5 MiB per image, 10 MiB per PDF, 12 gallery images, 20 documents, 20 certifications per product. The multipart reader is capped at the largest per-type limit; the tighter per-type limit is applied once the content is identified. No global storage quota and no dedicated upload rate limiter in this milestone. |
| Content detection | `file-type` 22.1.1 (MIT). Detection is from bytes only; the declared MIME type, filename and extension are never authoritative. `file-type` matches magic numbers alone, so PDF additionally requires a bounded structural check (header, cross-reference pointer, end-of-file marker). |
| Image processing | `sharp` 0.35.4 (Apache-2.0; the bundled libvips prebuild is LGPL-3.0-or-later, dynamically linked and separately distributed). Node 24 supported, prebuilt binaries via optional dependencies, no install script. |
| Normalization strategy | One strategy: decode, bound the decode with `limitInputPixels`, reject dimensions beyond 8192 in either axis or 40 megapixels total, bake EXIF orientation into the pixels, then re-encode **in the input's own format** at quality 90 for JPEG/WebP. Re-encoding proves decodability and drops all metadata. No thumbnails, no resized variants, no format conversion. |
| Asset visibility | Private to the owning company for this milestone. `GET /assets/:id` requires a current authenticated actor and scopes by `companyId` in the query, so a foreign asset is indistinguishable from a missing one. There is no public asset route and no public download. |
| Immutability | An accepted asset's bytes are never overwritten. Replacing a file creates a new `Asset`. Garbage collection of unreferenced uploads is deferred. |
| Linking model | Upload first, then link accepted `assetId` values during a product save. Uploading does not touch `draftRevision`; linking does. Unlinked accepted assets may exist temporarily. |

The stored representation is bounded as well as the upload. Normalization re-encodes an image, and re-encoding is not guaranteed to shrink a file, so the persisted bytes are checked against the same 5 MiB image limit before anything is hashed or written. An image that would normalize beyond that bound is rejected with the same 413 `FILE_TOO_LARGE` contract and leaves no `Asset` and no `AssetContent`. PDFs are stored as received and are already bounded by their own input limit.

One characteristic of the PDF strategy is recorded rather than treated as a defect: the structural check rejects a legitimate PDF carrying more than roughly 4 KB of trailing data after `%%EOF`. It is bounded and not a security boundary. PDF malware scanning and CDR remain absent, as the spec already states.

### C. Unresolved product and policy assumptions

The recommendations below make the schema draft coherent. They are not approvals and must be recorded by a human by the stated gate.

| Assumption | Recommended simple default | Credible alternative | Consequence of default | Latest decision deadline |
| --- | --- | --- | --- | --- |
| Admin/Editor permission matrix | Project decision (2026-09-21): an Editor reads private product data and previews, creates and edits product drafts with their child data and assets, **publishes and republishes**, and reads aggregate dashboard analytics. An Admin does all of that plus delete/withdraw, version review, raw analytics and audit access, user and role management, and company settings. | Different publish/review/analytics powers | Publication is **not** Admin-only; the earlier Admin-only proposal is superseded. The brief does not define permissions, so every cell remains a project choice, not a Notarify requirement. | **Publication is out of scope**, so publish authorization is not implemented anywhere yet; when it is, it must allow EDITOR and ADMIN |
| Internal “verification” meaning and wording | A version-scoped, qualified internal review (`APPROVED`/`REJECTED`); no review means unreviewed. | Omit badge/review, or use another explicitly qualified workflow. | It cannot imply authenticity, certification, ESPR compliance, or official registration. | **Before public API/UI and review endpoint**. |
| Published-edit visibility | Editing live draft data leaves the current public snapshot unchanged until explicit republish. | Immediate public edits. | A stale-looking public page is intentional; editors must understand explicit republish. | **Before publish/public UI implementation**. |
| Analytics semantics | `QR_HIT` = QR-link URL request; `VIEW` = rendered public page event; never call either a unique person/scan. | Different labels/collection contract. | Dashboard labels and retention query boundaries derive from these definitions. | **Before analytics API/UI implementation**. |
| Analytics retention | Proposed 7 days raw detail, 90 days daily counts; raw metadata is Admin-only. | Different period, no raw IP, or no retained analytics. | This is a privacy policy default, not a legal conclusion; scheduled retention/backup scope changes with it. | **Before analytics persistence and production-like data collection**. |
| Access/refresh lifetimes and concurrent refresh policy | 10-minute access JWT; 7-day absolute session; strict reuse revokes the whole family; client coordinates refresh. | A carefully designed grace window or different durations. | Concurrent tabs can cause the losing retry to revoke the family and require sign-in again. | **Before auth API/client implementation**. |
| File/count/size limits | **Locked and implemented** in the Assets round: 10 MiB PDF, 5 MiB image, 12 gallery images, 20 documents/certifications per product. Materials remain at the schema-permitted 1000 rather than the proposed 200, which is an unresolved narrowing. | Capacity-tested different limits or object storage later. | These are product limits applied in the API, not schema constants; they are enforced in the DTOs and the asset pipeline rather than by database constraints. | Locked — see section B5. Materials still open. |
| Historical-version visibility | Back-office-only; public route exposes current version only. | Public version browsing. | Asset authorization and public DTO scope stay smaller; URLs do not select historical content. | **Before public passport/version-history UI implementation**. |
| Minimum Users and Settings behavior | Admin list/create/role/disable users; company display name/logo settings; last-active-Admin protection. | Smaller read-only scope or richer account/settings flows. | No registration, password reset, social auth, membership, or billing is implied. | **Before Users/Settings API and UI implementation**. |
| Redis client and limiter backing store | Defer selection until cache/rate-limit implementation demonstrates need. | Select an official JavaScript Redis client and adapter after a focused compatibility/security review. | Redis server pin alone creates no application dependency or persistence authority. | **Before Redis or multi-replica limiter implementation**. |
| Audit metadata minimization and retention boundary | Field allowlist for AuditEvent.safeMetadata; documented retention plus backup-expiry policy covering audit rows, raw analytics and backups | Longer or looser retention, or storing no audit metadata detail at all | Backups inherit the deletion boundary, so an unset policy silently extends the lifetime of IP-bearing analytics and audit detail beyond the raw-event window | **Before production-like data collection or any backup rehearsal** |
| Asset admission state after publication | Re-check ACCEPTED on every public serve and deny or detach an asset downgraded to QUARANTINED or REJECTED | Make admission state immutable after publication and require a replacement or withdrawal workflow | The first keeps post-publication scanning responsive but can make a live passport lose a file without a republish; the second keeps snapshots self-consistent but cannot respond to a file discovered to be malicious | **Before public asset serving** |

## Inconsistency and gap review

| Finding type | Finding | Owning spec section(s) | Recommended resolution / status |
| --- | --- | --- | --- |
| Contradiction | The brief-facing product “status” field conflicts with lifecycle-derived state. | 03 §Lifecycle rules; 05 §Product editing contract; 08 §Routes | No client-writable `Product.status` column. Derive Draft/Published/deleted list visibility from `deletedAt`, non-withdrawn passport/current version, and whether `draftRevision` exceeds the current version source revision. |
| Contract collision | Nest JSON and Next HTML are both described as `/passport/{uuid}`. | 02 §API outline; 06 §QR decision; 09 §Packaging | External routing is `/api/passport/{uuid}` to Nest after proxy-prefix handling, `/passport/{uuid}` to Next HTML, and `/q/{uuid}` to Nest for a non-cacheable redirect. OpenAPI must document the proxy prefix. |
| Superseded proposal | Several specs call database binary storage “proposed” although it is approved in this round. | 00 §Goal; 02 §Proposed shape; 05 §Revised storage proposal | Record approval only here; do not rewrite historical planning text. Use `Asset` + one-to-one `AssetContent` PostgreSQL bytes. |
| Missing lifecycle boundary | Draft save is allowed before every publication field is complete. | 03 §Constraints and lifecycle; 05 §Product editing contract | Keep draft product/sustainability/certification fields nullable where incomplete entry is meaningful. Publish performs stronger transactional completeness, ranges, date, ownership, cover, logo, and material-total checks. |
| Scope mismatch | Runtime is one company, while the model has company foreign keys. | 00 §Decisions; 02 §Company module; 03 §Scope assumptions | Preserve ownership FKs for later safety, but do not build tenant onboarding, member tables, tenant routing, or generalized isolation. Decision remains migration-blocking. |
| Migration risk | Item-level serialization is only a recommendation. | 00 §Decisions; 03 §Scope assumptions | Provisional draft uses non-unique SKU and company-scoped serial uniqueness that survives soft deletion. Decide catalog-model versus serialized-item before migration. |
| Data-boundary gap | Uploaded files and generated QR bytes have different lifecycles. | 03 §Entity blueprint/lifecycle; 05 §Storage; 06 §QR decision | User images/PDFs use immutable `Asset`/`AssetContent`; server-generated small QR PNG stays Passport-owned to make first publication atomic and reproducible. Neither is embedded in JSONB. |
| Semantics gap | “Verification” could be mistaken for product authenticity. | 01 §Mock verification; 04 §Access model; 06 §Publication and review | A review belongs to exactly one version; absence means unreviewed, new versions never inherit review, and changes are audited. Public wording must remain qualified/internal pending product decision. |
| Terminology risk | “Scan” overstates what a server can know. | 00 §Decisions; 06 §QR decision; 07 §Collection | `QR_HIT` means a request to `/q/{uuid}`, not a camera scan or unique person. `VIEW` is a separate rendered-page event; they are never summed as visitors. |
| Retention/authorization gap | Soft deletion can be confused with erasure. | 03 §Lifecycle rules; 05 §File access; 06 §Acceptance | Deletion withdraws public access but retains versions, referenced assets, audits, and analytics until their independent retention policy permits cleanup. |
| Reporting mismatch | Active-only dashboard counters coexist with retained analytics rows. | 07 §Definitions/retention | Rows may remain; active-only counters filter to the documented active passport set. Reports must not treat retained inactive data as active-counter input. |
| ORM boundary | Prisma cannot express all intended partial, check, full-text, cross-row, or composite-ownership constraints. | 03 §Constraints; 05 §Search | The enforcement register below assigns every such rule to normal Prisma/FKs, named future migration SQL, or a named transactional application rule. |
| Dependency selection gap | Specs name no Argon2id, image re-encoder, file-signature detector, or Redis JavaScript client. | 02 §Dependency candidates; 04 §Session; 05 §File pipeline; 07 §Redis | Leave all four as later technical selections; do not invent approved dependencies. Redis JavaScript client is explicitly unresolved in the version matrix. |
| Evidence gap | Assessment PDF/email are not present. | 00 opening statement; AGENTS.md §Prohibited | This review cannot compare against those absent documents. Retain that limitation in this record and the worklog. |
| Toolchain trap | Unpinned `prisma` currently resolves to an ORM 8 RC; TS 7 conflicts with ts-jest. | 02 §Dependencies; 09 §Testing | Exact-pin Prisma CLI/client at 7.10.0 and TypeScript 6.0.3 once scaffolding is permitted; do not use `latest`. |

## Seven-day scope review

Do not add microservices, queues/event buses, generic base repositories, permission tables/CASL, real tenant onboarding, object storage, a separate upload volume, public historical-version browsing, persisted PDFs, browser-based PDF generation, external geolocation/legal-certification integrations, Kubernetes/Terraform, a bespoke MCP service, or a speculative internal gateway before inspecting actual deployment topology. Redis is a deferrable bonus after correct auth, publication, assets, and tests. TanStack Query and React Hook Form remain pinned compatibility candidates, not mandatory abstractions; retain them only if their actual use earns the dependency. Zustand is only for small UI state, never a mirror of server data.

## Dependency compatibility baseline

**Access date:** 2026-09-21 UTC. Version/release and engine/peer evidence below is publisher-maintained registry metadata or first-party release/documentation URLs. This is metadata review only: it is not an install, resolution, lockfile, transitive-dependency, or vulnerability audit.

### Exact selections and official evidence

| Component | Exact version | Official version/release source | Official engine/peer source and published constraint | License | Compatibility conclusion |
| --- | ---: | --- | --- | --- | --- |
| Node.js Active LTS | 24.21.0 | https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | https://nodejs.org/en/about/previous-releases ; https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | MIT — https://raw.githubusercontent.com/nodejs/node/v24.21.0/LICENSE | Selected common runtime; Active LTS on review date. |
| pnpm | 12.5.1 | https://registry.npmjs.org/pnpm/latest | Same manifest: `node >=18.*` | MIT | Satisfies Node 24.21.0. |
| TypeScript | 6.0.3 | https://registry.npmjs.org/typescript/6.0.3 | Same manifest: `node >=14.17`; TS 7 incompatibility evidence: https://registry.npmjs.org/ts-jest/latest and https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ | Apache-2.0 | Highest mutually compatible line; TS 7.0.2 is rejected because ts-jest requires `<7` and TS 7 lacks its JS compiler API. |
| `@nestjs/core` | 12.0.4 | https://registry.npmjs.org/@nestjs%2Fcore/latest ; https://github.com/nestjs/nest/releases/tag/v12.0.4 | Same manifest: Node `>=20`, peers common `^12.0.0`, RxJS `^7.1.0` | MIT | Uniform Nest 12 core family. |
| `@nestjs/common` | 12.0.4 | https://registry.npmjs.org/@nestjs%2Fcommon/latest | Same manifest: optional peers validator `>=0.13.2`, transformer `>=0.4.1`, RxJS `^7.1.0` | MIT | Satisfies selected DTO packages. |
| `@nestjs/platform-express` | 12.0.4 | https://registry.npmjs.org/@nestjs%2Fplatform-express/latest | Same manifest: core/common `^12.0.0` | MIT | Matches selected Nest core/common. |
| `@nestjs/testing` | 12.0.4 | https://registry.npmjs.org/@nestjs%2Ftesting/latest | Same manifest: core/common/platform `^12.0.0` | MIT | Matches Nest 12 test path. |
| `@nestjs/swagger` | 12.0.1 | https://registry.npmjs.org/@nestjs%2Fswagger/latest | Same manifest: Node `^20.19.0 || >=22.12.0`; core/common `^12.0.0` | MIT | Nest 12-compatible OpenAPI package. |
| `@nestjs/config` | 12.0.0 | https://registry.npmjs.org/@nestjs%2Fconfig/latest | Same manifest: common `^11.0.0 || ^12.0.0`, RxJS `^7.1.0` | MIT | Nest 12-compatible. |
| `@nestjs/jwt` | 12.0.2 | https://registry.npmjs.org/@nestjs%2Fjwt/latest | Same manifest: common `^8 || ^9 || ^10 || ^11 || ^12` | MIT | Nest 12-compatible. |
| `@nestjs/passport` | 12.0.0 | https://registry.npmjs.org/@nestjs%2Fpassport/latest | Same manifest: passport `^0.5.0 || ^0.6.0 || ^0.7.0`, common `^11.0.0 || ^12.0.0` | MIT | Nest 12-compatible; direct Passport strategy package is a later selection. |
| `@nestjs/throttler` | 6.7.0 | https://registry.npmjs.org/@nestjs%2Fthrottler/latest | Same manifest: Node `^20.19.0 || ^22.12.0 || >=24.0.0`; core/common `^7`–`^12` | MIT | Intentional independent version line; accepts Nest 12. |
| `@nestjs/cli` | 12.0.3 | https://registry.npmjs.org/@nestjs%2Fcli/latest | Same manifest: Node `>=20.11`; dependency TypeScript `~6.0.2` | MIT | Scaffold/build tool compatible with Node 24 and TS 6. |
| Prisma CLI `prisma` | 7.10.0 | https://registry.npmjs.org/prisma/7.10.0 ; https://registry.npmjs.org/-/package/prisma/dist-tags | https://www.prisma.io/docs/orm/release-status.md ; same manifest: Node `^20.19 || ^22.12 || >=24.0`, optional TS `>=5.4` | Apache-2.0 | Must exact-pin with client. `latest` is 8.0.0-rc.15 and must not be used. |
| `@prisma/client` | 7.10.0 | https://registry.npmjs.org/@prisma%2Fclient/latest ; https://registry.npmjs.org/-/package/%40prisma%2Fclient/dist-tags | https://www.prisma.io/docs/orm/release-status.md ; same manifest: Node `^20.19 || ^22.12 || >=24.0`, optional Prisma/TS peers | Apache-2.0 | Exact parity with Prisma CLI 7.10.0 is mandatory. |
| PostgreSQL | 18.6 | https://www.postgresql.org/about/news/postgresql-186-1711-1615-1519-1424-and-19-beta-3-released-3365/ | https://www.prisma.io/docs/orm/v7/reference/supported-databases.md (Prisma 7 supports PostgreSQL 9.6–18) | PostgreSQL License — https://www.postgresql.org/about/licence/ | Supported by the selected Prisma pair. |
| Redis server | 8.10.2 | https://api.github.com/repos/redis/redis/releases/latest ; https://redis.io/downloads/ | Server release metadata | RSALv2 OR SSPLv1 OR AGPLv3 — https://raw.githubusercontent.com/redis/redis/8.10.2/LICENSE.txt | Server pin only; license choice needs recording before use. |
| Redis JavaScript client | **UNRESOLVED** | — | No project selection in specs 02/09 | — | Do not guess `redis`, `ioredis`, or a cache-manager adapter. |
| Next.js | 16.3.5 | https://registry.npmjs.org/next/latest | Same manifest: Node `>=20.9.0`; React/DOM `^18.2.0 || ^19.0.0` | MIT | Compatible with React/DOM 19.3.0 and Node 24. |
| React | 19.3.0 | https://registry.npmjs.org/react/latest | Same manifest: Node `>=0.10.0` (stale metadata) | MIT | Exact-paired with React DOM 19.3.0. |
| React DOM | 19.3.0 | https://registry.npmjs.org/react-dom/latest | Same manifest: peer React `^19.3.0` | MIT | Must move exactly with React 19.3.0. |
| Tailwind CSS | 4.3.3 | https://registry.npmjs.org/tailwindcss/latest | Same manifest publishes no engine/peer constraint | MIT | Exact-pair with `@tailwindcss/postcss` 4.3.3. |
| `@tailwindcss/postcss` | 4.3.3 | https://registry.npmjs.org/@tailwindcss%2Fpostcss/latest | Same manifest pins `tailwindcss` exactly 4.3.3 and PostCSS `^8.5.16` | MIT | Upgrade only together with Tailwind. |
| daisyUI | 5.7.42 | https://registry.npmjs.org/daisyui/latest ; https://raw.githubusercontent.com/saadeghi/daisyui/master/packages/daisyui/package.json | https://daisyui.com/docs/install/ ; https://daisyui.com/docs/install/nextjs/ | MIT | Pairing with Tailwind is official-install-doc-only: daisyUI publishes **no** engine or peer range. |
| Zustand | 5.0.15 | https://registry.npmjs.org/zustand/latest | Same manifest: Node `>=12.20.0`, optional React `>=18`, TS `>=4.5` | MIT | Compatible with React 19 and TS 6; use only small UI state. |
| `@tanstack/react-query` | 5.103.2 | https://registry.npmjs.org/@tanstack%2Freact-query/latest | Same manifest: peer React `^18 || ^19` | MIT | React 19-compatible; retain only if server-state use warrants it. |
| React Hook Form | 7.88.0 | https://registry.npmjs.org/react-hook-form/latest | Same manifest: Node `>=18`, peer React `^16.8 || ^17 || ^18 || ^19` | MIT | React 19/Node 24-compatible; retain only if editor complexity warrants it. |
| `class-validator` | 0.15.1 | https://registry.npmjs.org/class-validator/latest | Nest common peer `>=0.13.2` at https://registry.npmjs.org/@nestjs%2Fcommon/latest | MIT | Satisfies Nest optional peer; package publishes no own engine/peer range. |
| `class-transformer` | 0.5.1 | https://registry.npmjs.org/class-transformer/latest | Nest common peer `>=0.4.1` at https://registry.npmjs.org/@nestjs%2Fcommon/latest | MIT | Satisfies Nest optional peer; package publishes no own engine/peer range. |
| Helmet | 8.3.0 | https://registry.npmjs.org/helmet/latest | Same manifest: Node `>=18.0.0` | MIT | Node 24-compatible. |
| `qrcode` (node-qrcode) | 1.5.4 | https://registry.npmjs.org/qrcode/latest | Same manifest: Node `>=10.13.0` | MIT | Node 24-compatible QR PNG generator. |
| PDFKit | 0.20.2 | https://registry.npmjs.org/pdfkit/latest | Same manifest: `engine: node >= v20.0.0` | MIT | Node 24-compatible server-side PDF candidate. |
| Bowser | 2.14.1 | https://registry.npmjs.org/bowser/latest | Same manifest publishes no engine/peer constraint | MIT | No machine-enforceable compatibility claim; bounded untrusted UA parser candidate. |
| Jest | 30.5.2 | https://registry.npmjs.org/jest/latest | Same manifest: Node `^18.14 || ^20 || ^22 || >=24.0.0` | MIT | Node 24-compatible test framework. |
| `@playwright/test` | 1.63.0 | https://registry.npmjs.org/@playwright%2Ftest/latest | Same manifest: Node `>=20`, exact `playwright` 1.63.0 | Apache-2.0 | Node 24-compatible; satisfies Next optional peer `^1.51.1`. |
| `ts-jest` | 29.4.12 | https://registry.npmjs.org/ts-jest/latest | Same manifest: Jest `^29 || ^30`; TypeScript `>=4.3 <7`; Node `>=20` | MIT | Requires TypeScript 6.0.3 rather than 7.0.2. |

### Compatibility conclusions and constraints

1. **Common runtime resolved:** Node **24.21.0** is the active-LTS intersection for Nest 12, Prisma 7, Next 16, Jest, Playwright, and the selected utilities. Prisma ORM 7 supports Active/Maintenance LTS lines: https://www.prisma.io/docs/orm/v7/reference/system-requirements.md. Re-check before moving to Node 26 because Prisma’s docs and npm engine range describe it differently.
2. **Frontend set resolved:** Next **16.3.5** accepts React/React DOM 19; React DOM **19.3.0** peers React `^19.3.0`, so React and React DOM must both remain **19.3.0**.
3. **Tailwind/daisyUI set resolved only by official installation documentation:** Tailwind **4.3.3** and `@tailwindcss/postcss` **4.3.3** are exact-coupled; daisyUI **5.7.42** has no published peer/engine range. The pairing is supported by https://daisyui.com/docs/install/ , https://daisyui.com/docs/install/nextjs/ , and https://tailwindcss.com/docs/installation/framework-guides/nextjs — it is not metadata-enforced.
4. **Nest major resolved:** core/common/platform-express/testing **12.0.4**, and all listed first-party Nest integrations accept Nest 12. `@nestjs/throttler` **6.7.0** is intentionally on an independent compatible release line.
5. **Prisma/PostgreSQL resolved:** exact Prisma CLI/client **7.10.0** pair supports PostgreSQL **18.6**. Do not let an unpinned CLI resolve to Prisma 8 RC. At scaffold time use Prisma 7’s `prisma-client` generator with an explicit output directory and configure the connection URL in a future `prisma.config.ts`; do not create that config now. Official Prisma sources read: https://github.com/prisma/web/blob/main/apps/blog/content/blog/announcing-prisma-6-19-0/index.mdx and https://github.com/prisma/web/blob/main/apps/blog/content/blog/advanced-database-schema-management-with-atlas-and-prisma-orm/index.mdx .
6. **TypeScript resolved:** TypeScript **6.0.3** is the highest mutual choice. TS 7.0.2 is stable but violates ts-jest’s `<7` peer and lacks the JavaScript compiler API; this is a tooling constraint, not a claim that TS 7 is defective.

No version is selected for Argon2id, an image re-encoder, file-signature detection, Passport strategy, `reflect-metadata`/RxJS direct-peer resolution, or Redis JavaScript client. Select each later through a focused, pinned compatibility/security review. A locked dependency audit is deferred until a manifest and lockfile exist; no package is claimed vulnerability-free.

## Schema relationship and enforcement overview

`Company` owns users, products, and assets. `Product` is a nullable/incomplete live draft with normalized materials, optional sustainability, certifications, images, and documents. Assets carry metadata and are one-to-one with bytea content. Each product can have one `Passport`; it has a stable public UUID and current version pointer. Each immutable `PassportVersion` captures JSONB public projection and retains every exposed Asset (including the Company logo) through `PassportVersionAsset`. A version can have one current, separately mutable `PassportReview`; review changes remain audit events rather than altering historical snapshot content. Sessions own refresh-token chains; analytics reference passports and optionally their captured version. Audit records retain mutation evidence; `actorId` is nullable only for system/seeded actions with no authenticated human actor or a deliberately retained record after a permitted actor hard-delete.

The schema deliberately contains no mutable Product status, no authorization permissions table, no tenant membership/onboarding, no object storage/cache/job/PDF tables, JSON/snapshot columns must not carry binary bodies, credentials, or tokens; that is a projection/transactional rule enforced by `publication.snapshot_no_binary_tx`, `audit.safe_metadata_tx` and `analytics.metadata_bounds_tx`, not something the column types guarantee.

## SQL and transactional application enforcement register

The following are migration/application requirements. **The initial migration now exists and is applied** (`prisma/migrations/20260921152150_init`), so every rule recorded below as satisfied by schema or migration SQL is live in the tested database; the remaining transactional rules are still future work. This correction supersedes the earlier 'no SQL migration has been created or applied' statement. `Prisma schema` means the ordinary relation/index/unique declaration in `prisma/schema.prisma`; `Migration SQL` means a named future PostgreSQL constraint/index/trigger; `Transactional rule` means a named Nest use-case transaction whose behavior must be integration-tested on PostgreSQL.

| Rule | Target columns / expression | Enforcement layer and future name | Why it is needed |
| --- | --- | --- | --- |
| One cover image | `ProductImage(productId)` where `role = 'COVER'` | Migration SQL: `ProductImage_one_cover_per_product_uq` partial unique index | Prisma cannot express a filtered unique index. |
| Full-text product prose | `to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,''))` | Migration SQL: `Product_search_simple_tsv_gin` GIN index; parameterized catalog search query | True multilingual prose search; SKU/serial remain separately matched identifiers. |
| Numeric/range integrity | Material percentage and position; sustainability percentages, repairability, carbon, water; asset size; image/document positions; draft revision; version number; snapshot schema version; source draft revision; daily count | **Migration SQL (applied):** `Material_percentage_range_ck`, `Material_position_nonnegative_ck`, `Sustainability_recycled_percent_range_ck`, `Sustainability_repairability_range_ck`, `Sustainability_carbon_nonnegative_ck`, `Sustainability_water_nonnegative_ck`, `Asset_size_positive_ck`, `ProductImage_position_nonnegative_ck`, `ProductDocument_position_nonnegative_ck`, `Product_draft_revision_nonnegative_ck`, `PassportVersion_number_positive_ck`, `PassportVersion_snapshot_schema_version_positive_ck`, `PassportVersion_source_draft_revision_nonnegative_ck`, `AnalyticsDaily_count_nonnegative_ck` | Prisma models types, not these PostgreSQL CHECK invariants. Unknown remains `NULL`, never a fake zero. |
| Certification date ordering | `expirationDate IS NULL OR issueDate IS NULL OR expirationDate >= issueDate` | Migration SQL: `Certification_expiration_not_before_issue_ck` | Prevents impossible completed certification dates while drafts may remain incomplete. |
| Production date | `productionDate <= CURRENT_DATE` at publish time | Transactional rule: `publication.future_date_validation_tx` | PostgreSQL CHECK with `CURRENT_DATE` is not a stable immutable expression; validate under publish lock. |
| Current Passport version belongs to same Passport | `Passport(currentVersionId, id)` references `PassportVersion(id, passportId)` | **Schema (verified):** `Passport_currentVersionId_id_fkey`, a composite FK generated by Prisma, legal because of `@@unique([currentVersionId, id])`; candidate key `PassportVersion_id_passportId_key` | Expressed in the schema, not hand-written migration SQL: Prisma reconciles away foreign keys it does not model, so the hand-written version was removed on the next `migrate dev`. Proven rejected with SQLSTATE 23503. |
| Analytics event version belongs to its passport | `AnalyticsEvent(versionId, passportId)` references `PassportVersion(id, passportId)` | **Schema (verified):** `AnalyticsEvent_versionId_passportId_fkey`, composite and Prisma-generated | Added this round. Without it a nullable `versionId` could cite another passport’s version. A NULL `versionId` short-circuits the check. Proven rejected with SQLSTATE 23503. |
| Refresh successor is same session/family and unique predecessor | `RefreshToken(replacedById, sessionId)` references `(id, sessionId)` | **Schema (verified):** `RefreshToken_replacedById_sessionId_fkey`, composite and Prisma-generated, legal because of `@@unique([replacedById, sessionId])`; candidate key `RefreshToken_id_sessionId_key`; Transactional rule `auth.refresh_rotate_strict_tx` | A session is the token-family boundary. Cycle prevention and atomic rotation remain transactional rules. Proven rejected with SQLSTATE 23503. |
| Refresh rotation/reuse | token digest, `usedAt`, session expiry/revocation | Transactional rule: `auth.refresh_rotate_strict_tx` using row lock or atomic CAS | Exactly one request consumes and links a successor; later use revokes that session family. |
| Company/link ownership | Product/asset/image/document/certification/logo/version-asset company path | Transactional rule: `catalog.asset_ownership_consistency_tx` | Cross-table company equality cannot be expressed by ordinary scalar FKs; lock/read product and asset before link/publish. |
| Material total | material rows of one product at `expectedDraftRevision` | Transactional rule: `publication.material_total_100_tx` | Sum must equal exactly 100.00 only when materials exist; it is a cross-row publication rule, not a row CHECK. |
| Publication prerequisites and idempotency | expected draft revision, required basic fields/sustainability/cover/logo/asset state, Passport/version rows | Transactional rule: `publication.publish_expected_revision_tx` | Lock/conditionally claim the product; build one coherent snapshot, asset-reference set, QR state, current pointer, and audit row or expose none. |
| Last active Admin | active Admin users per company | Transactional rule: `identity.last_active_admin_protection_tx` | Role/disable mutations must lock/count active Admins and reject removal of the last one. |
| Immutable published history and audit | `PassportVersion`, `PassportVersionAsset`, `AuditEvent` update/delete paths | Transactional rule: `history.immutable_version_audit_tx`; later DB role/trigger review `PassportVersion_no_mutation_guard` | Prisma fields do not make rows append-only; application and DB privileges/triggers must block mutation outside controlled retention. |
| Asset byte immutability and retention | Asset and AssetContent rows, especially any asset referenced by PassportVersionAsset, a live draft link, a certification/document/image link, or a company logo | Transactional rule assets.asset_immutable_tx; later DB privilege/trigger guard AssetContent_no_mutation_guard | A restrictive FK blocks deleting a referenced parent but not UPDATE or DELETE of the AssetContent child, so historical bytes could be swapped or erased without a republish. Keep the one trusted state-transition path (Asset.state moves such as quarantine review) separate from content writes, and test that a version-linked asset cannot be mutated or deleted. |
| Email normalization | `normalizedEmail` and case normalization at input | Schema `User_normalizedEmail_key`; Transactional rule `identity.normalize_email_tx`; optional migration check `User_normalized_email_ck` | Persisting a normalized field makes uniqueness deterministic; do not rely on client-side case treatment. |
| Event idempotency shape | `AnalyticsEvent(eventKey)` and `VIEW` requiring a key | Schema `AnalyticsEvent_eventKey_key`; Migration SQL `AnalyticsEvent_view_event_key_required_ck`; Transactional rule `analytics.ingest_event_tx` | Nullable unique prevents duplicate supplied keys; a CHECK/rule makes rendered-view retries provide one. |
| Synthetic provenance flag is server-controlled | `AnalyticsEvent.synthetic`, `AnalyticsDaily.synthetic` | Transactional rule `analytics.synthetic_flag_server_set_tx`; DTO whitelist must reject a client-supplied `synthetic` | Provenance must not be client-settable: otherwise real events could be masked as seeded data (or seeds counted as real) and leave reporting.
| Bounded/safe JSON and metadata | `publicSnapshot`, audit metadata, analytics metadata | Transactional rules `publication.snapshot_no_binary_tx`, `audit.safe_metadata_tx`, `analytics.metadata_bounds_tx` | JSONB must never contain byte bodies, credentials/tokens, unrestricted payloads, or unbounded client data. |
| Server-authoritative field binding | User.role, User.active, User.companyId, Product.draftRevision, Passport.currentVersionId and withdrawnAt, PassportReview status and reviewer fields, session and refresh lifecycle fields, AnalyticsEvent and AnalyticsDaily synthetic | Transactional rules identity.derive_actor_tx and catalog.reject_client_lifecycle_fields_tx; command-specific DTOs per endpoint | A generic Prisma update or nested DTO that binds client input would permit role escalation, account reactivation, forged publication or review state, session manipulation, or synthetic-data masking. Derive actor, company, session, timestamps and state on the server; reject client-supplied internal ids and lifecycle fields; add negative API tests for every listed class. |
| Analytics retention/rollup | closed raw interval and `AnalyticsDaily(passportId,dateUtc,kind,synthetic)` | Schema unique `AnalyticsDaily_passportId_dateUtc_kind_synthetic_key`; Transactional rule `analytics.rollup_and_purge_tx` | Aggregate/upsert and raw deletion must commit together; the `synthetic` discriminator preserves seed provenance in aggregates after raw purge so synthetic and real counts never merge; reports query mutually exclusive raw/rolled intervals. |
| Origin enforcement on cookie mutations | `Origin` header of `POST /auth/login`, `/auth/refresh`, `/auth/logout` | **Application:** origin-check middleware/guard against the configured `CORS_ORIGIN` | CSRF/Origin defence that does not depend on CORS or on browser SameSite behaviour. Rejection is 403 with a stable code. |
| Anonymous asset access | requested asset plus active Passport/current version/version asset/product deletion state | Transactional rule `assets.authorize_public_download_tx` on every request | Knowledge of an Asset ID, stale JSON, an asset `public` flag, or Redis must never grant access. |
| Soft deletion and withdrawal | Product, Passport, AuditEvent | Transactional rule `catalog.soft_delete_and_withdraw_tx` | Product soft delete, passport withdrawal, and audit write are one all-or-nothing mutation. |

## Lifecycle invariants and matrix

### 1. Session issuance and revocation

Login verifies an Argon2id hash (dependency selection remains open), creates a session with an absolute expiry and first refresh digest, and issues a short-lived access JWT. Logout, password change, and user disable revoke affected sessions. Every protected request checks current user activity, role, and session revocation/expiry; JWT claims alone are insufficient.

### 2. Refresh-token rotation and reuse detection

Refresh secrets are high entropy and only unique digests are persisted. Rotation never extends a successor past the session absolute expiry. `auth.refresh_rotate_strict_tx` atomically locks/compares an unused unexpired token, consumes it, creates one successor, and links it. Any later presentation of a consumed token is reuse: reject and revoke the entire session/token family. Consumed rows remain until session expiry for detection. Under the recommended strict policy, simultaneous tabs can cause a losing retry to trigger family revocation; the client must coordinate refresh. A grace window is a separate explicit decision, not an implicit workaround.

### 3. Draft mutation concurrency

Every accepted draft mutation takes the client’s expected `draftRevision`, changes normalized rows in one transaction, increments the revision exactly once, and returns `409` on stale state. Draft updates never change a public snapshot. Product visibility is derived; a published product with a newer draft revision has unpublished changes rather than a mutable status flip.

### 4. Concurrent publication

Publish accepts `expectedDraftRevision` and locks or conditionally claims that revision. A concurrent edit cannot produce a mixed snapshot: expected revision publishes atomically or caller gets a conflict/retries. First publish creates one Passport and one stable UUID; `Passport.productId` unique prevents a second passport. `(passportId, sourceDraftRevision)` makes same-revision replay idempotent and `(passportId, versionNumber)` prevents duplicate numbering. Snapshot, retained asset links, QR state, current pointer, and audit row appear in one transaction; failed publication exposes none. A successful replay returns the existing version without incrementing. New versions are unreviewed and, under the provisional policy, later draft edits remain private until republish.

### 5. Asset retention, authorization, and soft deletion

Uploaded content is immutable; replacement creates a new Asset. Every snapshot has relational retention links for every exposed file and the company logo. `PassportVersionAsset` and `AssetContent` use non-cascading restrictive semantics. Soft deletion never cascades into historical records. Anonymous download eligibility is recomputed from active, non-deleted product/passport/current version and retained version-asset reference; asset ID knowledge, stale snapshot JSON, a hypothetical asset public flag, or Redis cannot authorize it. Historical assets are back-office-only provisionally. Garbage collection may remove only grace-period-expired assets that have no live draft, logo, certification/document/image, or historical-version reference. Cache invalidation is hygiene, never correctness.

### 6. Analytics ingestion, rollup, and retention

`QR_HIT` and `VIEW` are distinct and never summed as unique visitors. A retried visible-page event reuses its event key and is accepted once; preview emits neither. Occurrence time is server-controlled UTC and seed events carry `synthetic = true`. Seven-day raw/90-day aggregate retention is unresolved. When selected, `analytics.rollup_and_purge_tx` aggregates a closed raw interval into buckets keyed by `(passportId, dateUtc, kind, synthetic)` and deletes those raw rows in one transaction; failure preserves raw rows. The `synthetic` key part keeps seeded and real provenance separate in aggregates after raw purge, and dashboard queries filter per the documented metric definition. Reports combine non-overlapping raw and rolled intervals. Raw IP/browser detail is Admin-only and disappears with raw retention; daily rows contain counts only. Withdrawal/deletion does not prematurely erase retained analytics, while active-only counters exclude inactive passports per metric definition.

| Lifecycle area / operation | Rows locked, created, updated | Uniqueness / FK relied upon | Failure outcome | Retry behavior | Retention / cleanup |
| --- | --- | --- | --- | --- | --- |
| 1. Login / revoke session | Create `AuthSession` + first `RefreshToken`; revoke session(s) | Session→User restrict; token digest unique | No partial login or revocation audit mutation | Login is a new attempt; revoke is idempotent | Expired revoked sessions/tokens may be purged only after expiry policy. |
| 2. Rotate refresh token | Lock/CAS token + session; set `usedAt`; create/link successor or set `revokedAt` on reuse | digest unique; successor unique; future same-session composite FK | Reject refresh; consumed replay revokes family | Only first valid rotation succeeds; replay requires re-login | Keep consumed chain until session expiry. |
| 3. Save draft | Lock/conditional `Product`; update draft children; increment revision | Product/company/category/asset FKs; child ownership rule | `409` stale revision or validation error; no partial nested replacement | Refetch, merge intentionally, retry with current revision | Draft rows survive until product soft deletion; no public exposure. |
| 4. Publish/replay | Lock product/revision; create/reuse Passport; create version/asset refs; update QR/current pointer; audit | one Passport/product; `(passportId, sourceDraftRevision)`; `(passportId, versionNumber)`; restrictive historical FKs | Roll back every publication write; no mixed snapshot | Same successful revision returns existing version; stale edit/publish gets conflict | Versions and version-linked assets retained after withdrawal/deletion. |
| 5. Asset link, serve, withdraw/delete | Upload creates Asset+AssetContent; publish links version assets; deletion locks Product/Passport and writes audit | AssetContent 1:1; version-asset composite key; Product/Passport restrict FKs | Reject invalid/foreign/unavailable asset; delete rolls back as a unit | Upload retry creates a new immutable asset; download reauthorizes each request | GC only unreferenced, grace-expired abandoned uploads; product deletion retains history. |
| 6. Analytics ingest/rollup | Insert raw event or upsert daily bucket; rollup locks closed interval then deletes raw rows | `eventKey` unique; daily `(passportId,dateUtc,kind,synthetic)` unique; passport/version restrict FKs | Ingestion failure leaves passport reachable and logs safe failure; rollup failure leaves raw rows | Reused VIEW key returns counted-once result; rollup retry is safe | Raw policy unresolved; proposed 7d raw/90d daily; deletion does not erase early. |

## Verification record and achieved evidence

Everything below was executed in the `build/schema-validation` round against a pinned toolchain. Claims are limited to what was actually observed.

### Validated

| Step | Result |
| --- | --- |
| `prisma validate` (CLI 7.10.0) | **The schema at prisma/schema.prisma is valid** |
| `prisma generate` | Prisma Client 7.10.0 generated to `apps/api/src/generated/prisma` in 117 ms |
| Migration generated | `prisma/migrations/20260921152150_init/migration.sql` |
| Migration applied | applied to PostgreSQL 18.6; `migrate status` reports the database schema is up to date, and re-running `migrate dev` produced **no drift** and no follow-up migration |
| Migration from an empty database | `migrate deploy` against a freshly created database applied all migrations successfully |
| Resulting objects | 21 tables, 30 foreign keys, 16 CHECK constraints, 79 indexes |
| PostgreSQL version exercised | `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu`, from the `postgres:18.6` image |

### Mechanically tested invariants

`prisma/verification/invariant-checks.sql` runs against a migrated database inside a single rolled-back transaction. All checks passed, and the SQLSTATE records which constraint class fired.

| # | Invariant | Outcome |
| --- | --- | --- |
| 1 | Passport may reference its own version | accepted |
| 2 | Passport may not reference another passport's version | rejected, 23503 |
| 3 | Same-session refresh successor | accepted |
| 4 | Cross-session refresh successor | rejected, 23503 |
| 5 | Event may cite its own passport version | accepted |
| 6 | Event may not cite another passport's version | rejected, 23503 |
| 7 | Second COVER image for one product | rejected, 23505 |
| 8a | Material percentage above 100 | rejected, 23514 |
| 8b | Non-positive asset size | rejected, 23514 |
| 9 | Certification expiry before issue date | rejected, 23514 |
| 10 | Duplicate `(passportId, sourceDraftRevision)` | rejected, 23505 |
| 11 | `VIEW` event without an idempotency key | rejected, 23514 |

### Schema changes forced by real validation

1. The three cross-table composite foreign keys are declared **in `schema.prisma`** as composite relations, and Prisma generates the actual composite foreign keys in the migration from them. What was abandoned is the *hand-written* migration-SQL form: a hand-written version was tried first and Prisma removed it on the next `migrate dev`, because it reconciles foreign keys it does not model. Declaring them in the schema instead keeps the invariant and removes that drift, at the cost of two extra candidate keys (`@@unique([currentVersionId, id])`, `@@unique([replacedById, sessionId])`), both implied by uniqueness already present.
2. `AnalyticsEvent.version` now references `PassportVersion(id, passportId)` rather than `PassportVersion(id)`.

### Not performed, and not implied by anything above

- **Application behaviour: NOT implemented and NOT tested.** No service, controller, guard, transaction, seed or module exists. Every transactional rule in this document remains unexercised.
- **NestJS/Next.js build, lint, typecheck: NOT performed.** No application scaffold exists.
- **Dependency audit: NOT performed.** The resolved tree has not been vulnerability-scanned; no package is claimed vulnerability-free.
- **Compose and deployment: NOT performed.** The database used here was a disposable container, not the project stack.
- **Trigger-based immutability, retention jobs, backup and restore: NOT implemented** — still assigned to later hardening.
