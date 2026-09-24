# Notarify DPP Assessment

Technical assessment submission for **Notarify**: a Digital Product Passport (DPP) application.

> **Status: Stages 0–3, Stage 4.1 and Stage 4.2 are complete on `main`.** The validated schema and initial PostgreSQL migration, the hardened authentication flow, Product draft CRUD with optimistic concurrency, and the Assets slice — validated upload with private retrieval, plus image, document and certification-PDF attachments — are implemented, verified and merged into `main`. So is the publication core: publish prerequisites, a stable Passport identity, immutable versions, retained asset references, QR generation, republish semantics and publication idempotency. So is the anonymous public surface: the public projection, published-asset downloads, the QR download and the QR redirect. The visual public passport page, Passport PDF export, public historical-version routes, analytics, Redis, dashboards, Users/Settings, product delete and deployment are not implemented. Nothing here is a claim of working software beyond what the sections below describe.

## The assessment

Build a DPP application where an operator maintains product records and publishes a public passport for each one:

- Email/password authentication with JWT sessions and `ADMIN` / `EDITOR` roles.
- Product CRUD covering the eight basic fields, materials, sustainability metrics, certifications, manuals, warranties, datasheets, cover image, and gallery.
- A stable passport UUID, a generated QR image, and a public passport URL.
- A public passport page: header, product information, materials, certifications, sustainability, documents, and passport metadata.
- Scan and view analytics (timestamp, IP, browser, OS, language, country) with dashboard counters and time-based reports.
- Delivery via Docker Compose, runnable locally and on a VPS behind a TLS reverse proxy.

## Documentation

The specification set is the entry point for all work. **Start with the roadmap:**

| Document | Owns |
| --- | --- |
| [00-ROADMAP.md](docs/specs/00-ROADMAP.md) | Stages, Stage 4 milestones, required coverage, delivery sequence |
| [01-ESPR-SCOPE.md](docs/specs/01-ESPR-SCOPE.md) | Regulatory boundary, mock-data scope, claims we do not make |
| [02-ARCHITECTURE.md](docs/specs/02-ARCHITECTURE.md) | Modules, contract ownership, API outline, dependency candidates |
| [03-DATA-AND-LIFECYCLE.md](docs/specs/03-DATA-AND-LIFECYCLE.md) | Schema blueprint, constraints, publication and deletion |
| [04-AUTH-AND-SECURITY.md](docs/specs/04-AUTH-AND-SECURITY.md) | Sessions, permissions, trust boundaries, validation |
| [05-PRODUCTS-AND-FILES.md](docs/specs/05-PRODUCTS-AND-FILES.md) | CRUD, nested data, uploads, search, filters |
| [06-PASSPORTS-QR-PDF.md](docs/specs/06-PASSPORTS-QR-PDF.md) | Public projection, preview, QR, versioning, PDF |
| [07-ANALYTICS-AND-CACHE.md](docs/specs/07-ANALYTICS-AND-CACHE.md) | Scan/view definitions, dashboards, Redis |
| [08-FRONTEND.md](docs/specs/08-FRONTEND.md) | Routes, forms, state, accessibility |
| [09-TESTING-AND-DELIVERY.md](docs/specs/09-TESTING-AND-DELIVERY.md) | Tests, security review, Docker, VPS, CI |
| [10-AI-AND-DX.md](docs/specs/10-AI-AND-DX.md) | AI workflow, tooling, evidence and review |

**The specs are planning drafts, not implementation reports.** Items marked *proposed* are working defaults awaiting a recorded decision — see [Decisions before implementation](docs/specs/00-ROADMAP.md#decisions-before-implementation).

## Repository layout

```text
apps/api               NestJS API                     (implemented)
apps/web               Next.js frontend               (implemented)
packages/api-client    Generated API types and client (still empty)
prisma                 Schema, migrations, seed       (implemented)
fixtures               Mocked JSON seed data          (still empty)
docs/specs             Planning specifications
```

`apps/api`, `apps/web` and `prisma` are implemented. `packages/api-client` and `fixtures` remain empty: the API types are currently hand-written in `apps/web`, and deterministic test fixtures are generated in-process by the test suites.

## Getting started

The database toolchain and both applications run locally. The commands below are the supported ones; [AGENTS.md](AGENTS.md) holds the canonical table and the reasons each command exists.

```bash
# Requires Node 24.21.0 and pnpm 12.5.1
pnpm install
cp .env.example .env          # then set DATABASE_URL to a PostgreSQL 18 instance
pnpm db:validate              # prisma validate
pnpm db:generate              # generate the Prisma client
pnpm db:migrate               # apply migrations
```

`prisma/verification/invariant-checks.sql` re-checks the schema-level invariants against an already-migrated database; it rolls back everything it inserts.

The authentication slice, product **draft** CRUD, the Assets slice, the Stage 4.1 publication core and the Stage 4.2 anonymous public surface exist. The API serves `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /categories`, `POST`/`GET` on `/assets` (validated upload and private retrieval), `GET`/`POST`/`PATCH` on `/products` (draft editing with optimistic revision checks, including image, document and certification-PDF attachments), `POST /products/:id/publish` (immutable version creation with a stable passport UUID and QR artifact), and the anonymous `GET /passport/:uuid`, `GET /passport/:uuid/assets/:assetId`, `GET /passport/:uuid/qr.png` and `GET /q/:uuid`. The frontend provides login, the workspace, the product list with filters and pagination, a draft editor covering General Information, Images, Documents, Materials, Sustainability and Certifications, and a `/q/:uuid` bridge to the API resolver.

Not implemented: product delete/withdraw and soft delete, the visual public passport page, Passport PDF export, public historical-version routes, analytics, Redis, dashboards, Users/Settings, and deployment. All nine assessment bonuses remain in scope; see the [roadmap](docs/specs/00-ROADMAP.md) for where each one lands.

```bash
pnpm lint && pnpm typecheck && pnpm build     # static checks
pnpm db:seed                                  # idempotent fictional categories
pnpm --filter @notarify/api test:integration  # API tests, real PostgreSQL
pnpm test:e2e                                 # Playwright auth + product regression
```

Delivery commands such as the Compose profile and the Swagger/OpenAPI export land with Stage 7 and will be documented here and in [09-TESTING-AND-DELIVERY.md](docs/specs/09-TESTING-AND-DELIVERY.md) once they exist and have been executed. [AGENTS.md](AGENTS.md) lists what is supported today and what must not be documented as working before it does.

## Local quality gate and CI

```bash
pnpm hooks:install   # once per clone: points git at .githooks
pnpm check           # db:validate, lint, typecheck, build, API integration tests
pnpm test:e2e        # Playwright, run by CI and at milestone gates
```

`pnpm check` is the normal local contract and is what `pre-commit`/`pre-push` invoke (`pre-commit` runs `pnpm lint` only). Hooks are convenience: they can be bypassed with `--no-verify`, so they are not evidence. `.github/workflows/ci.yml` is the authoritative clean-environment check — one workflow, real PostgreSQL 18.6, migrations applied to a fresh database, then `pnpm check`, `pnpm test:e2e` and `pnpm audit`. Pull requests are optional; they are not required by the project workflow.

## Data and claims

All product, sustainability, certification, and analytics data in this project is **fictional assessment data**. A verification badge is a prototype/application-level indicator on an active published passport; it is not independent certification, not proof of authenticity, and not the output of a review or approval process. This is an assessment prototype informed by the EU ESPR framework; it makes **no claim of ESPR compliance, EU certification, or official DPP registration**. See [01-ESPR-SCOPE.md](docs/specs/01-ESPR-SCOPE.md) for the full boundary.

## AI assistance

The planning specifications are AI-assisted drafts, and AI assistance is used during implementation. Contributions, their review status, and the checks actually run are recorded in [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md). That log distinguishes completed work from proposals and never reports unrun checks as passed.

## License

No license is granted. This is an assessment submission published for review; it is not intended for reuse or redistribution.
