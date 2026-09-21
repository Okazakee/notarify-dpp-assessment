# Agent instructions — notarify-dpp-assessment

Assessment work for Notarify: a Digital Product Passport application. Read this before changing anything.

## Current status

**Toolchain and database only — no application code.** The pnpm workspace, the pinned Prisma 7 toolchain and the initial PostgreSQL migration exist and are verified. There is still **no NestJS or Next.js app, no service, controller, guard, DTO, seed or Docker configuration**. Do not assume a command exists because a spec mentions it; the commands listed below are the only ones that run.

Verified on 2026-09-21: `prisma validate` passes, `prisma generate` succeeds, migration `20260921152150_init` applies cleanly to PostgreSQL 18.6, and the schema-level invariants in `prisma/verification/invariant-checks.sql` pass. Application behaviour is **not** implemented and **not** tested.

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

The roadmap lists topics with no agreed answer yet (tenancy, product granularity, permission semantics, verification badge meaning, published-edit behavior, analytics definitions). Anything marked *proposed* or *recommended* is a working default, **not an employer instruction**.

- Do not implement a proposal as settled fact, and do not silently choose between materially different options.
- Surface the unresolved decision, state the options and trade-offs, and get it recorded before building on it.
- Never edit a spec to make an unresolved decision look decided.

## Module boundaries

- `apps/api` (NestJS) — business rules and database access. Owns authoritative validation.
- `apps/web` (Next.js) — UI and rendering. Reflects permissions; never enforces them.
- `packages/api-client` — generated types/client from the exported OpenAPI document.
- `prisma` — schema, migrations, seed.
- `fixtures` — fictional JSON seed data and generated sample assets.

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

`prisma7.config.ts` is deliberately not auto-detected, so every Prisma invocation must pass `--config prisma7.config.ts`. The scripts already do; pass it yourself if you call Prisma directly.

**Not supported yet — do not document or invoke them as if they work:** application dev servers, `check`, `test:unit`, `test:integration`, `test:e2e`, `db:seed`, `openapi:export`, `security:check`, `compose:up`. They remain proposals from the roadmap. There is no Docker configuration in this repository; the validation round used a disposable container.

## Test evidence

- No test suite exists yet. Never report a test, scan, or audit as passing unless you ran it and can quote the command and its result.
- Tests must target observable behavior and critical invariants — not trivial getters, and not the implementation the test claims to verify. Never mock away the guard, transaction, or constraint under test.
- Integration tests use a real isolated PostgreSQL database; SQLite or a mocked Prisma client cannot validate PostgreSQL constraints, transactions, or search behavior.
- Record failures that remain unresolved instead of omitting them. A green badge is never worth suppressing a finding.
- Never report "no vulnerabilities" from an unrun or incomplete scan.

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
