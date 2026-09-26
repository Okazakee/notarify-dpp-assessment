# Notarify — Digital Product Passport (assessment)

A Digital Product Passport application: operators maintain product data, publish an immutable
Passport version, and a customer scans a QR code to read it. Built for the Notarify
full-stack assessment.

**This is a prototype.** The data is fictional, the analytics country is mocked, and nothing
here is a regulatory registration or an ESPR compliance claim.

---

## Quick start (Docker Compose)

Everything runs from the repository alone — no pre-existing database, Node installation or
build output.

```bash
cp .env.example .env
docker compose up --build -d
docker compose run --rm seed
```

Then open:

| | |
| --- | --- |
| Web application | <http://localhost:3001> |
| API | <http://localhost:3000> |
| API documentation (Swagger UI) | <http://localhost:3000/docs> |

`docker compose up` applies the tracked migrations through a one-shot service the API waits
for, so the application never starts before the schema exists. The seed step is explicit and
never runs on its own, so it cannot overwrite your data by surprise.

## Demo credentials

Seeded by `docker compose run --rm seed`. **Local/demo values only — never production
credentials.** Change them in `.env` (`DEMO_ADMIN_PASSWORD`, `DEMO_EDITOR_PASSWORD`) before
seeding something real.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.test` | `AdminDemoPassw0rd!` |
| Editor | `editor@demo.test` | `EditorDemoPassw0rd!` |

The seed also creates three product categories, a second product for list and filter
demonstration, and one **complete draft** ("Demo Reusable Bottle") that already satisfies
every publication prerequisite: materials with a 100% split, all five sustainability values,
a certification with its PDF, a product document, a cover image and a gallery image.

## Reviewer walkthrough

1. Sign in as the Administrator.
2. **Dashboard** — the four counters (products, published Passports, QR codes, Passport views).
3. **Products** — search and filter, then note the **View** action (the private, read-only
   record) beside **Edit**.
4. Open "Demo Reusable Bottle" → step through the seven editor tabs → **Preview** (the current
   draft, unsaved changes included, clearly marked unpublished).
5. **Publish**. The Passport gets a stable UUID and a QR artifact.
6. **Product Passports** → **Open Passport** (anonymous page) → **Download QR** →
   **Download PDF**.
7. Scan the QR target with a phone, or follow `/q/<uuid>`: it resolves through the API and
   redirects to the public page — and records one QR scan.
8. **Analytics** — scans today, seven UTC buckets, most viewed, latest scans. Revisit the
   public page and the view counter moves too.
9. **Product Passports** → **Version history** (Admin only): every retained immutable version.
10. **Users** — create a user, change a role, disable and reactivate.
11. **Settings** — company display name, logo, and Recent Audit Activity.
12. **Delete** a product (Admin only): it disappears from the back office, its public
    Passport is withdrawn, and its versions, files, analytics and audit rows are retained.

The walkthrough mutates the demo data. The smoke suite does too. Reset to a clean state with:

```bash
docker compose down -v      # -v destroys the local demo database
docker compose up --build -d
docker compose run --rm seed
```

## What is where

```
apps/api         NestJS API: business rules, validation, database access
apps/web         Next.js App Router UI (server components for the public Passport)
packages/        reserved for generated API types
prisma/          schema, migrations, seed
fixtures/demo/   tiny fictional sample files used by the seed
e2e/             Playwright suites (native stack + packaged smoke)
docs/            specs (engineering reference), OpenAPI export, acceptance map
```

Architecture, database design, security approach, scalability and future work are covered in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The detailed planning specs live in
[docs/specs/](docs/specs/) and remain the engineering reference.

## Roles

| Capability | Editor | Administrator |
| --- | :---: | :---: |
| Read and edit products, publish and republish | yes | yes |
| Dashboard and aggregate analytics | yes | yes |
| Current published Passport: open, QR, PDF | yes | yes |
| View read-only product record | yes | yes |
| Historical Passport versions | — | yes |
| Delete / withdraw a product | — | yes |
| Users, company settings, audit log | — | yes |

Hiding a control is presentation only; the API refuses unauthorized requests regardless of
what the browser shows. The access token carries no role claim — the role is re-read from the
database on every protected request, so a role change takes effect on the next request.

## Main functionality

* **Product drafts** — general information, materials, sustainability, certifications
  (with PDF), documents, images, with optimistic concurrency (`draftRevision`).
* **Assets** — uploads validated from their bytes (`file-type` magic numbers, plus a PDF
  structure check), images decoded and re-encoded with `sharp` (metadata stripped, dimensions
  bounded), bytes stored in PostgreSQL and served privately per company.
* **Publication** — a transactional publish that creates a stable Passport identity, an
  immutable version snapshot, its retained asset references and the QR artifact, revalidating
  every referenced asset.
* **Public Passport** — server-rendered, anonymous, built only from the immutable snapshot,
  with published asset downloads, the stored QR artifact and a PDF export.
* **Lifecycle** — soft delete that withdraws the published Passport in one transaction while
  keeping every version, file, analytics row and audit row.
* **Analytics** — QR scans and page views recorded server-side, dashboard and reporting,
  per-product view counts.
* **Administration** — users with last-active-admin protection, company settings, append-only
  audit log.

## Bonus coverage

All nine bonuses are implemented.

| Bonus | Where |
| --- | --- |
| Full-text product search | `GET /products?q=` — PostgreSQL full-text search |
| Passport versioning | immutable `PassportVersion` rows, Admin history view |
| Soft delete | `DELETE /products/:id` — Admin-only, withdraws, retains history |
| Audit logs | transactional `AuditEvent` + Admin `GET /audit-logs` and Settings activity |
| Redis caching | immutable published content only, PostgreSQL always authoritative |
| Pagination + advanced filtering | products, Passports, analytics, audit, users |
| Passport PDF export | `GET /passport/:uuid/pdf`, server-rendered, stored QR reused |
| Drag-and-drop uploads | the editor's image and document pickers |
| Automated tests | integration suites against real PostgreSQL/Redis + Playwright |

## Native development (without Docker)

Requires Node 24.21.0 and pnpm 12.5.1, plus a reachable PostgreSQL 18 and (optionally) Redis.

```bash
pnpm install --frozen-lockfile
cp .env.example .env          # point DATABASE_URL at your own PostgreSQL
pnpm db:validate && pnpm db:generate
pnpm db:migrate               # prisma migrate dev
pnpm db:seed
pnpm --filter @notarify/api build && node apps/api/dist/src/main.js
pnpm --filter @notarify/web dev
```

There is no API `dev` script: build it and run the compiled entry point, which is the same
artifact the container runs.

## Tests

```bash
pnpm check      # schema validation, lint, typecheck, build, integration suites
pnpm test:e2e   # Playwright against the built API and web app
pnpm test:smoke # Playwright against the running Compose stack
pnpm audit      # dependency audit
```

The integration suites (`apps/api/test/*.e2e-spec.ts`) run against a real PostgreSQL and
exercise real transactions, constraints and the Redis cache. The browser suites cover the
reviewer journeys, and `docs/STAGE4-ACCEPTANCE.md` maps Stage 4's acceptance evidence.

| Suite | Count |
| --- | --- |
| Integration (API) | 15 suites / 213 tests |
| Browser (native stack) | 71 tests |
| Browser (packaged stack) | 1 end-to-end journey |

## API documentation

`GET /docs` serves Swagger UI and `GET /docs-json` the raw document. The committed artifact is
[docs/openapi.json](docs/openapi.json), generated — never hand-edited — with:

```bash
pnpm openapi:generate   # rewrite docs/openapi.json
pnpm openapi:check      # fail when the artifact is stale
```

Interactive documentation is enabled outside production and **disabled in production unless
`SWAGGER_ENABLED=true`**, so an API console is never exposed by accident.

## Database, migrations and seed

The schema is in `prisma/schema.prisma`; the initial migration
`prisma/migrations/20260921152150_init` is the only one, and it is applied with
`prisma migrate deploy` (never `db push`, never `migrate dev` in a container).

`pnpm db:seed` never creates duplicates: deterministic ids mean a second run adds no copy, and
it never touches a product, user or asset you created. It **is** a reset of the demo fixtures
themselves — their nested content, scalar fields, the company display name and their password
hashes return to the deterministic state, and a withdrawn demo Passport is restored — so treat
it as "restore the demo" rather than a no-op.

## Backups

Asset bytes live in PostgreSQL, so a database dump is the complete durable backup — there is
no separate upload volume to forget.

```bash
docker compose exec -T postgres pg_dump -U notarify -d notarify > notarify-backup.sql
# restore into a clean database
docker compose exec -T postgres psql -U notarify -d postgres -c 'CREATE DATABASE notarify_restore;'
docker compose exec -T postgres psql -U notarify -d notarify_restore < notarify-backup.sql
```

Redis holds only disposable cache entries and needs no backup.

## Security notes

* Access tokens live in memory only; the refresh token is an opaque rotating cookie scoped to
  `/auth` with `HttpOnly`, `Secure` and `SameSite=Lax`.
* Every cookie-authenticated mutation validates the request `Origin` against the configured
  app origin. A missing `Origin` is allowed deliberately for non-browser clients. CORS is not
  described as CSRF protection.
* Authorization is server-authoritative: session, user, role and company are re-read from
  PostgreSQL on each protected request, and every query is company-scoped in the query itself,
  so a foreign id is indistinguishable from a missing one.
* Uploaded content is never trusted: the type comes from the bytes, the served `Content-Type`
  matches what is stored, images are re-encoded, and stored bytes are re-checked against the
  limit.
* Deleting a product is a soft delete; every anonymous surface for a withdrawn Passport
  returns one identical 404, so the surface cannot be probed.
* Audit metadata is a closed, bounded vocabulary and never contains passwords, hashes, tokens,
  cookies, request bodies or file bytes. It is append-only through the application, which is
  **not** cryptographic tamper-proofing.
* Redis holds only the interpreted content of an already-selected immutable version, and every
  public read resolves visibility and the current version from PostgreSQL first.
* No secret is baked into an image: configuration is supplied at runtime, and the runtime
  images contain no package manager.
* `pnpm audit` runs in CI on every push. Gitleaks (repository history), Trivy (repository and
  the built images) and a ZAP baseline of the anonymous surface were run during Stage 7, with
  their commands, results and triage recorded in [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md); they
  are not yet a CI gate.

## Deployment notes

The Compose stack is a reviewer topology. A real deployment needs an exact production
configuration rather than defaults: set `NODE_ENV=production`, real `CORS_ORIGIN` and
`PUBLIC_APP_ORIGIN`, a strong `JWT_SECRET`, a managed database and (optionally) Redis, and
leave `SWAGGER_ENABLED` false unless the documentation is protected.

Because the refresh cookie is scoped to `/auth`, serving the API from its own origin or
subdomain is simpler than proxying it under `/api` on the web origin:

```
https://dpp.example.com      → web      NEXT_PUBLIC_API_URL=https://api.dpp.example.com
https://api.dpp.example.com  → API      CORS_ORIGIN=https://dpp.example.com
                                        PUBLIC_APP_ORIGIN=https://dpp.example.com
inside the network:                     INTERNAL_API_URL=http://api:3000
```

**This topology has not been deployed or tested on a real host.** It is the documented shape,
not a verified deployment.

## Known limitations

Deliberately out of scope, or genuinely unfinished:

* **No automatic analytics retention.** Accepted events stay in `AnalyticsEvent`; production
  retention or purge is future hardening.
* **No antivirus or PDF CDR** on uploads; an object store and CDN are future work if scale
  requires them.
* **The analytics country is mocked** (`countrySource = MOCK`) and never inferred from IP,
  language or locale. The stored IP is not anonymized and has no automatic retention.
* **No public historical Passport or PDF route, no `410 Gone` tombstone, no restore.** A
  withdrawn Passport is reachable only through the authenticated Admin history.
* **No password reset, invitation email or social login.** An administrator sets an initial
  password; the bundled `PassportReview` model is unused infrastructure.
* The web origin does not set CSP, COEP or SRI (reasons recorded in `apps/web/next.config.ts`);
  a production reverse proxy would typically add them.
* Reverse-proxy trust is not configured: without it the recorded analytics address is the
  proxy's. Trusted-proxy configuration belongs with the real deployment.
* Human review status: Cristian's manual UI walkthrough, a physical phone QR scan, a printed
  PDF review and human source-code review are **outstanding** — see below.

## AI assistance

This repository was built with **Pi** (`opencode-go/deepseek-v4.1-flash`) as the primary
implementation agent, with read-only review subagents for verification, and an external
ChatGPT orchestration layer used for scope and dependency research. AI review is not human
review. The per-round record — scope, decisions, findings, validation evidence and what was
left unvalidated — is [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md).

**Not yet performed by a human:** the manual UI walkthrough, a physical handset scan of a
printed QR code, a printed/on-screen visual review of the PDF, human source-code review, and
deployment to a real host.
