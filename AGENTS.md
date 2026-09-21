# Agent instructions — notarify-dpp-assessment

Assessment work for Notarify: a Digital Product Passport application. Read this before changing anything.

## Current status

**Milestone 1 is merged into `main`.** The validated schema, the hardened authentication flow and Product draft CRUD are implemented and verified on `main`. Everything downstream of drafts is not.

Implemented:
- **Schema and database** — Prisma 7.10.0 schema validated; initial migration `20260921152150_init` applied to PostgreSQL 18.6, including the hand-written CHECK, partial-unique and GIN constraints and the three composite foreign keys.
- **`apps/api`** — NestJS 12.0.4 family, Prisma through `@prisma/adapter-pg`.
  - Auth: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`; Argon2id; JWT access tokens carrying **no role claim**; strict refresh rotation; Origin enforcement on cookie mutations; Helmet and request IDs.
  - Catalog: `GET /categories`, `POST /products`, `GET /products` (bounded pagination, category/country/date filters, PostgreSQL full-text search), `GET /products/:id`, `PATCH /products/:id` with atomic `draftRevision` concurrency.
- **`apps/web`** — Next 16.3.5 App Router: login, workspace, account status, product list with filters and pagination, and a draft editor covering General Information, Materials, Sustainability and Certifications.
- **`prisma/seed.ts`** — deterministic, idempotent fictional categories via `pnpm db:seed`.

Not implemented, and not to be assumed: product delete/withdraw, publication and republish, publish authorization, Passport/PassportVersion, public passport pages, binary asset uploads, ProductImage, ProductDocument, certification PDFs, company logo, QR generation, PDF export, analytics, Redis, dashboard metrics, Users/Settings flows, version review, tenancy onboarding, Docker/Compose and deployment.

Verified on 2026-09-21 by re-running the full milestone gate on the accepted milestone commit now merged into `main`: `prisma validate` passes; `pnpm lint` reports no diagnostics across 55 files; both workspaces typecheck and build; the API's 29 integration tests in 2 suites pass against PostgreSQL 18.6; the 6 Playwright tests pass against the built stack; `pnpm db:seed` is idempotent; `pnpm audit` reports no known vulnerabilities.

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

- `apps/api` (NestJS) — business rules and database access. Owns authoritative validation. Currently `src/config`, `src/prisma`, `src/common`, `src/auth` and `src/products`; the generated Prisma client lives in `src/generated` and is not committed.
- `apps/web` (Next.js) — UI and rendering. Reflects permissions; never enforces them. Currently the auth flow, the product list and the product draft editor.
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

The API needs `DATABASE_URL`, `JWT_SECRET` and (outside development) `CORS_ORIGIN`; see `.env.example`. Startup fails fast on missing or unsafe configuration.

**Not supported yet — do not document or invoke them as if they work:** `test:unit`, `openapi:export`, `security:check`, `compose:up`. They remain proposals from the roadmap. There is no Docker or Compose configuration in this repository; the database used for testing is a disposable container.

## Test evidence

- Test suites today: `apps/api/test/auth.e2e-spec.ts` and `apps/api/test/products.e2e-spec.ts` via `pnpm --filter @notarify/api test:integration` (2 suites, 29 tests, real PostgreSQL); `e2e/auth.spec.ts` and `e2e/products.spec.ts` via `pnpm test:e2e` (6 Playwright tests, built API + web). Never report a test, scan, or audit as passing unless you ran it and can quote the command and its result.
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
