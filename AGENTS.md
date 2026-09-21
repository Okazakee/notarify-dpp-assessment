# Agent instructions — notarify-dpp-assessment

Assessment work for Notarify: a Digital Product Passport application. Read this before changing anything.

## Current status

**Schema, toolchain and the authentication slice exist. Everything else does not.** The pnpm workspace, the pinned Prisma 7 toolchain, the initial PostgreSQL migration and a minimal NestJS API plus Next.js frontend are in place.

Implemented:
- `apps/api` — NestJS 12.0.4 family with `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` and `GET /auth/me`, Prisma 7.10.0 through `@prisma/adapter-pg`, Argon2id verification, JWT access tokens, and strict refresh-token rotation.
- `apps/web` — Next 16.3.5 App Router with a login page, an authenticated workspace view, an account-status page and logout.

Not implemented, and not to be assumed: product CRUD, editor screens, publication and passport behaviour, publish authorization, uploads, asset processing, QR, PDF, analytics, Redis, dashboard metrics, Users/Settings flows, version review, tenancy, seeding, and any Docker or Compose configuration.

Verified on 2026-09-21: `prisma validate` passes, `prisma generate` succeeds, migration `20260921152150_init` applies cleanly to PostgreSQL 18.6, the schema invariants in `prisma/verification/invariant-checks.sql` pass, Biome reports no diagnostics across 38 files, both workspaces typecheck and build, the API's 18 integration tests pass against real PostgreSQL, the 4 Playwright auth tests pass against the built stack, and `pnpm audit` reports no known vulnerabilities. Coverage stops there — **no product feature exists and none is tested**.

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

**Recorded but deliberately unimplemented:** publishing is **not** Admin-only. An Editor may publish and republish. No code may gate publish to `ADMIN` until that decision is recorded as final, and the publish permission itself is not implemented anywhere yet.

Still open: permission semantics beyond publishing, verification badge meaning, published-edit visibility, analytics definitions and retention, session lifetimes, file limits, historical-version visibility, audit retention. Anything marked *proposed* or *recommended* is a working default, **not an employer instruction**.

- Do not implement a proposal as settled fact, and do not silently choose between materially different options.
- Surface the unresolved decision, state the options and trade-offs, and get it recorded before building on it.
- Never edit a spec to make an unresolved decision look decided.

## Module boundaries

- `apps/api` (NestJS) — business rules and database access. Owns authoritative validation. Currently `src/config`, `src/prisma`, `src/common` and `src/auth`; the generated Prisma client lives in `src/generated` and is not committed.
- `apps/web` (Next.js) — UI and rendering. Reflects permissions; never enforces them. Currently the auth flow only.
- `packages/api-client` — reserved for generated API types; **still empty**.
- `prisma` — schema, migrations, and `verification/invariant-checks.sql`. No seed exists.
- `fixtures` — reserved for fictional seed data; **still empty**.

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
| `pnpm lint` / `pnpm lint:fix` | Biome check (and autofix) across the workspace |
| `pnpm typecheck` | `tsc --noEmit` in every workspace that defines it |
| `pnpm build` | Build every workspace |
| `pnpm test` | Run every workspace's tests |
| `pnpm --filter @notarify/api test:integration` | Jest integration tests against the real PostgreSQL at `DATABASE_URL` |
| `pnpm test:e2e` | Playwright auth regression against the built API and web app (starts both) |

`prisma7.config.ts` is deliberately not auto-detected, so every Prisma invocation must pass `--config prisma7.config.ts`. The scripts already do; pass it yourself if you call Prisma directly.

The API has no `dev` script: build it and run `node apps/api/dist/src/main.js`. The frontend has `pnpm --filter @notarify/web dev`.

The API needs `DATABASE_URL`, `JWT_SECRET` and (outside development) `CORS_ORIGIN`; see `.env.example`. Startup fails fast on missing or unsafe configuration.

**Not supported yet — do not document or invoke them as if they work:** `check`, `test:unit`, `db:seed`, `openapi:export`, `security:check`, `compose:up`. They remain proposals from the roadmap. There is no Docker or Compose configuration in this repository; the database used for testing is a disposable container.

## Test evidence

- Test suites today: `apps/api/test/auth.e2e-spec.ts` via `pnpm --filter @notarify/api test:integration` (18 tests, real PostgreSQL) and `e2e/auth.spec.ts` via `pnpm test:e2e` (4 Playwright tests, built API + web). Never report a test, scan, or audit as passing unless you ran it and can quote the command and its result.
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

## AI contribution records

The project's coding-agent harness is **Pi 0.87.0**, used with its `explore`, `architect`, `research`, `review` and `verify` subagents. Its default implementation model is `opencode-go/deepseek-v4.1-flash` and its architecture and review route is `openai-codex/gpt-5.6-sol`. Pi is development tooling only — the application builds, tests and runs without it.

Every meaningful task updates [docs/AI-WORKLOG.md](docs/AI-WORKLOG.md) with: date, task, the model and harness actually used, areas generated or modified, suggestions rejected, human review actually performed, checks actually run, and open questions.

- Be truthful. Inventing results, claiming review that did not happen, or asserting precise percentages of AI-written code are all prohibited.
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
