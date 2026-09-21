# Notarify DPP Assessment

Technical assessment submission for **Notarify**: a Digital Product Passport (DPP) application.

> **Status: repository setup only.** No framework has been scaffolded, no dependency installed, and no feature implemented. This repository currently contains the planning specifications and the agreed directory layout. Nothing here is a claim of working software.

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

There is nothing to run yet — no application code and no dependencies. Setup, migration, seed, and test commands land with roadmap Stage 1 and will be documented here and in [09-TESTING-AND-DELIVERY.md](docs/specs/09-TESTING-AND-DELIVERY.md) once they actually exist and have been executed.

## Data and claims

All product, sustainability, certification, and analytics data in this project is **fictional assessment data**. Verification badges are a simulated internal review, not independent certification. This is an assessment prototype informed by the EU ESPR framework; it makes **no claim of ESPR compliance, EU certification, or official DPP registration**. See [01-ESPR-SCOPE.md](docs/specs/01-ESPR-SCOPE.md) for the full boundary.

## AI assistance

The planning specifications are AI-assisted drafts, and AI assistance is used during implementation. Contributions, their review status, and the checks actually run are recorded in [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md). That log distinguishes completed work from proposals and never reports unrun checks as passed.

## License

No license is granted. This is an assessment submission published for review; it is not intended for reuse or redistribution.
