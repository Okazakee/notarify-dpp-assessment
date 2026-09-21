# Architecture and shared contracts

## Proposed shape

One repository with `apps/api` (NestJS), `apps/web` (Next.js), `packages/api-client` (generated API types/client), `docs`, and deployment configuration. Use a package-manager workspace; start with pnpm, without adding a build orchestrator unless needed. Select supported stable versions through a compatibility spike and pin the lockfile and container versions.

The backend is a modular monolith. NestJS owns business rules and database access; Next.js owns UI and rendering. PostgreSQL is authoritative. Redis is a disposable cache. Revised proposal: store bounded image/document bytes in PostgreSQL, behind the Asset service. No bucket or separate upload volume is needed. Keep binary bodies out of product JSON responses; return asset URLs. This storage choice is recommended for assessment scale, not assumed approved.

| Backend area | Owns | Junction |
| --- | --- | --- |
| Identity | Users, credentials, sessions and policies | Supplies trusted actor to use cases |
| Company | Single-company profile and branding | Supplies publication branding |
| Catalog | Draft products, materials, sustainability, certifications and attachments | Supplies consistent draft to publication |
| Assets | File validation, storage and retrieval | Supplies immutable asset references |
| Publication | Publish transaction, versions, visibility and verification | Supplies public snapshot to web/PDF/QR |
| Analytics | Events, aggregates and dashboard queries | Reads product/publication identity; cannot alter product content |
| Audit | Append-only application mutation records | Called within business transactions |

Infrastructure adapters handle persistence, files, QR, PDF and cache. Modules expose specific operations; do not let controllers directly orchestrate cross-module Prisma calls. Keep pure domain rules independent of HTTP where useful. Avoid a generic base repository and interfaces that merely repeat every Prisma method.

## SOLID decision for discussion

Cristian proposed omitting SOLID because this is TypeScript rather than Java/Kotlin. Recommendation: retain the requirement and satisfy it proportionately. This recommendation is not yet an accepted reversal of that preference.

| Principle | Concrete application |
| --- | --- |
| Single responsibility | Auth, publication, file handling and analytics have separate owners |
| Open/closed | A file-storage adapter can change without rewriting publish rules |
| Liskov substitution | Storage implementations and test doubles obey the same behavioral contract |
| Interface segregation | Consumers depend on small read/write contracts they actually use |
| Dependency inversion | Publication consumes storage/clock/QR ports through Nest injection |

Functions, composition, narrow TypeScript interfaces and Nest providers are enough. No inheritance hierarchy is required. The final architecture document should cite actual examples, not claim compliance just because folders have certain names.

## Contract ownership

| Contract | Authoritative definition | Consumers |
| --- | --- | --- |
| HTTP DTOs / errors | Nest DTOs and exported OpenAPI | Generated client, UI and API tests |
| Permission rules | Identity policy functions | Guards, use cases, tests; UI only reflects capabilities |
| Publication view | Explicit versioned public DTO | Preview, public page, PDF, JSON response |
| File access | Asset service + publication visibility policy | Uploads, preview, downloads, PDF |
| Analytics semantics | Analytics spec | Dashboard, list counters, charts |

Do not expose Prisma models as public response contracts. Do not import the Nest runtime or database client into the browser. Runtime validation remains server-side even with generated types.

## API outline

Keep the brief's API paths on the Nest server. The external proxy may map `/api/*` to these routes by stripping `/api`; document the mapping in OpenAPI's server URL and README.

| Required endpoint | Responsibility |
| --- | --- |
| POST /auth/login | Issue access JWT and refresh session |
| GET /products | Bounded search/filter/pagination |
| POST /products | Create draft |
| PATCH /products/{id} | Update draft with concurrency check |
| DELETE /products/{id} | Soft delete and withdraw public access |
| POST /products/{id}/publish | Validate and publish current draft revision |
| GET /passport/{uuid} | Published snapshot only |
| GET /analytics | Authorized aggregate/report queries |
| GET /dashboard | Four documented counters |

Additional endpoints: refresh/logout/me; product detail; asset upload/download; version history; version review; QR/PDF downloads; QR redirect `/q/{uuid}`; view event ingestion; Users and Settings operations. Define these in the owning feature PR and generated OpenAPI. A separate public HTML route `/passport/{uuid}` belongs to Next.js.

Use a stable error body with code, safe message, optional field errors and request ID. Invalid input 400, unauthenticated 401, disallowed 403, unavailable/nonexistent resource 404, concurrent edit/duplicate 409, oversized upload 413, throttled request 429. Deleted formerly public passports may return 410 with a non-sensitive tombstone.

## Dependency candidates

| Need | Proposed choice | Reason / qualification |
| --- | --- | --- |
| UI | Tailwind + daisyUI | CSS components; measure final bundle and interaction quality |
| Client state | Zustand | Small explicit stores; no server-data mirror |
| Server-state requests | TanStack Query | Cache/invalidation and request lifecycle; confirm during spike |
| Forms | React Hook Form | Complex editor arrays and error handling; confirm during spike |
| Validation | class-validator / class-transformer | Fits Nest DTO workflow |
| HTTP hardening | Helmet / @nestjs/throttler | Configure and test behind proxy |
| QR | qrcode (node-qrcode) | Server-side PNG/SVG generation |
| PDF | PDFKit | Server-side document generation without runtime browser |
| Browser/OS parsing | Bowser | Parse bounded user-agent strings; metadata is untrusted |

These are recommendations, not comparative performance measurements or a dependency audit. Check license, maintenance, transitive dependencies, known vulnerabilities and compatibility for the exact selected versions.

Sources for verified capabilities: [Nest authorization](https://docs.nestjs.com/security/authorization), [Nest validation](https://docs.nestjs.com/techniques/validation), [daisyUI installation](https://daisyui.com/docs/install/), [Zustand](https://zustand.docs.pmnd.rs/), [node-qrcode](https://github.com/soldair/node-qrcode), [PDFKit](https://pdfkit.org/), [Bowser](https://github.com/bowser-js/bowser). The detailed TanStack Query and React Hook Form integration is a pending spike, not research completed in this pack.
