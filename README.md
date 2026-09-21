# Notarify DPP Assessment

Technical assessment submission for **Notarify**: a Digital Product Passport (DPP) application.

> **Status: Milestone 1 merged.** The validated schema and initial PostgreSQL migration, the hardened authentication flow, and Product draft CRUD with optimistic concurrency are implemented, verified and merged into `main`. Everything downstream of drafts is not: no uploads, publication, passports, QR, PDF, analytics, Redis, dashboards, Users/Settings or deployment. Nothing here is a claim of working software beyond what the sections below describe.

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
| [00-ROADMAP.md](docs/specs/00-ROADMAP.md) | Stages, seven-day schedule, required coverage, open decisions |
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
apps/api               NestJS API                     (planned, empty)
apps/web               Next.js frontend               (planned, empty)
packages/api-client    Generated API types and client (planned, empty)
prisma                 Schema, migrations, seed       (planned, empty)
fixtures               Mocked JSON seed data          (planned, empty)
docs/specs             Planning specifications
```

The five code directories hold only `.gitkeep`; no dependency has been installed and no framework selected version has been pinned yet.

## Getting started

The database toolchain runs today; the applications do not exist yet.

```bash
# Requires Node 24.21.0 and pnpm 12.5.1
pnpm install
cp .env.example .env          # then set DATABASE_URL to a PostgreSQL 18 instance
pnpm db:validate              # prisma validate
pnpm db:generate              # generate the Prisma client
pnpm db:migrate               # apply migrations
```

`prisma/verification/invariant-checks.sql` re-checks the schema-level invariants against an already-migrated database; it rolls back everything it inserts.

The authentication slice and product **draft** CRUD exist. The API serves `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /categories`, and `GET`/`POST`/`PATCH` on `/products` (draft editing with optimistic revision checks). The frontend provides login, the workspace, the product list with filters and pagination, and a draft editor covering General Information, Materials, Sustainability and Certifications.

Not implemented: product delete/withdraw, publication and passports, publish authorization, uploads and asset linking, QR, PDF, analytics, Redis, dashboards, Users/Settings, version review, and deployment.

```bash
pnpm lint && pnpm typecheck && pnpm build     # static checks
pnpm db:seed                                  # idempotent fictional categories
pnpm --filter @notarify/api test:integration  # API tests, real PostgreSQL
pnpm test:e2e                                 # Playwright auth + product regression
```

Application setup, seed and test commands land with roadmap Stage 2 and will be documented here and in [09-TESTING-AND-DELIVERY.md](docs/specs/09-TESTING-AND-DELIVERY.md) once they exist and have been executed.

## Local quality gate and CI

```bash
pnpm hooks:install   # once per clone: points git at .githooks
pnpm check           # db:validate, lint, typecheck, build, API integration tests
pnpm test:e2e        # Playwright, run by CI and at milestone gates
```

`pnpm check` is the normal local contract and is what `pre-commit`/`pre-push` invoke (`pre-commit` runs `pnpm lint` only). Hooks are convenience: they can be bypassed with `--no-verify`, so they are not evidence. `.github/workflows/ci.yml` is the authoritative clean-environment check — one workflow, real PostgreSQL 18.6, migrations applied to a fresh database, then `pnpm check`, `pnpm test:e2e` and `pnpm audit`. Pull requests are optional; they are not required by the project workflow.

## Data and claims

All product, sustainability, certification, and analytics data in this project is **fictional assessment data**. Verification badges are a simulated internal review, not independent certification. This is an assessment prototype informed by the EU ESPR framework; it makes **no claim of ESPR compliance, EU certification, or official DPP registration**. See [01-ESPR-SCOPE.md](docs/specs/01-ESPR-SCOPE.md) for the full boundary.

## AI assistance

The planning specifications are AI-assisted drafts, and AI assistance is used during implementation. Contributions, their review status, and the checks actually run are recorded in [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md). That log distinguishes completed work from proposals and never reports unrun checks as passed.

## License

No license is granted. This is an assessment submission published for review; it is not intended for reuse or redistribution.
