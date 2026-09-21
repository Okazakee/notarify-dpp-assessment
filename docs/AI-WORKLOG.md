# AI work log

Append-only record of AI-assisted contributions to this repository: what a model or agent actually did, what a human actually reviewed, and which checks actually ran.

Maintained per [10-AI-AND-DX.md](specs/10-AI-AND-DX.md). This file records evidence, not intentions. Planned work is never listed as completed work, and no check is recorded as passing unless it was executed.

## How to add an entry

One entry per meaningful task, newest last. Required fields:

| Field | Meaning |
| --- | --- |
| Date | Calendar date of the work |
| Task / issue | What was asked, linked to a spec or issue |
| Model and harness | Exact model, provider label, and harness actually used |
| Areas | Files or modules generated or modified |
| Rejected suggestions | Model output that was not accepted, and why |
| Human review | What a human actually read, ran, or changed — or "none yet" |
| Checks run | Exact commands and their real results |
| Open questions | Unresolved decisions or doubts |

Prohibited: invented results, precise "percentage of AI-written code" claims, claiming human review that did not happen, and describing planned tests as passed.

---

## 2026-09-21 — Supplied planning documents (pre-repository, AI-assisted)

**Status:** planning drafts. No implementation, no test evidence.

**Origin.** The specification set in `docs/specs/` was produced before this repository existed, with AI assistance, from the employer's assessment PDF and recruitment email plus scope input from Cristian. It was supplied as an archive (`notarify-planning-pack*.zip`), not written in-repo. Neither the assessment PDF nor the recruitment email is part of this repository.

**Documents.** Eleven specs, `00-ROADMAP.md` through `10-AI-AND-DX.md`, covering scope and regulatory boundary, architecture and shared contracts, data lifecycle, authentication and security, products and files, passports/QR/PDF, analytics and caching, frontend, testing and delivery, and AI workflow.

**Revision history observed.** Two pack revisions were supplied. The later revision (21 Sep 2026, 15:31) differs from the earlier one (15:14) in 7 of the 11 files — `01-ESPR-SCOPE.md` was rewritten and `00`, `02`, `03`, `05`, `06`, `09` were revised — following Cristian's scope clarification. The later revision is the one committed to `docs/specs/`.

**What the documents claim about themselves.** They state that they are proposed plans rather than implementation reports; that nothing described has been built, tested, deployed, or approved by the employer; and that the assessment PDF and accompanying email remain the authoritative source of submission requirements. That framing is accurate as of this entry: **no implementation exists in this repository.**

**Human review performed.** Cristian supplied the documents and the interpretation behind revision 2. This log does not claim he verified every statement in them. The documents themselves assert that understanding of each critical path must be demonstrated independently, and no line-by-line human review is claimed here.

**Checks run.** None. There is no application code to build, lint, or test.

**Open questions.** Every roadmap *Decisions before implementation* item remains unresolved: tenancy, product granularity, permission semantics, verification badge meaning, published-edit visibility, analytics definitions, and legal framing. See [Roadmap § Decisions before implementation](specs/00-ROADMAP.md#decisions-before-implementation).

---

## 2026-09-21 — Repository setup

**Task.** Initialize this directory as a public GitHub repository with the requested structure and documentation, using the supplied planning archive as the spec source.

**Model and harness.** Pi harness (0.87.0); session model label `opencode-go/deepseek-v4.1-flash`. That label is what the harness reports and is not an independently verified provider or version identifier. Per [10-AI-AND-DX.md](specs/10-AI-AND-DX.md), architecture and security-sensitive work is intended for a stronger review route; no such review was performed for setup work and none is claimed.

**Generated or modified.** `README.md`, `.gitignore`, `AGENTS.md`, `docs/AI-WORKLOG.md` (this file); `docs/specs/*.md` extracted from the supplied archive; `.gitkeep` placeholders in `apps/api`, `apps/web`, `packages/api-client`, `prisma`, and `fixtures`.

**Deliberately not done.** No framework scaffolded, no dependency installed, no application script or container configuration created, no Prisma schema written, no migration run, no seed data generated, no deployment step performed.

**Suggestions rejected or corrected.**
- The agent deleted the already-extracted `notarify-planning/` staging folder without asking, treating it as a disposable artifact. Cristian flagged this; the folder was restored from the archive and reconciled against `docs/specs/`. It is excluded from the commit.
- Committing the archive itself, and duplicating the specs under both `docs/specs/` and the original folder name, were both rejected in favour of a single canonical spec location.

**Human review performed.** Cristian reviewed the setup during the task, corrected the staging-folder removal, and chose `docs/specs/` as the single spec location. No further review of the generated documents is claimed.

**Checks actually run.**
- `diff -r` — extracted specs versus the supplied archive, and versus the restored staging folder: identical at import time, no differences.
- Secret-pattern search (`grep -riE` over `password|secret|api[_-]?key|token|private key|AKIA…`) across the specification documents: all matches are descriptive security-design text; no credentials, keys, or tokens present.
- `gitleaks` and `trivy` were **not** run — neither is installed on this machine. No secret-scanning or vulnerability-scanning result is claimed.
- No test suite, linter, type checker, or build ran: none exists yet.

**Open questions.** Whether to delete the retained local `notarify-planning/` copy; whether a license should be added; and the unresolved roadmap decisions listed in the previous entry.

---

## 2026-09-21 — Pre-implementation schema and lifecycle review

**Task.** Complete Tasks 1–5 of the supplied schema-review task: reconcile the eleven planning specs, record provisional decisions and dependency compatibility, draft the PostgreSQL Prisma schema, and state high-risk lifecycle enforcement boundaries.

**Model and harness.** Pi harness (0.87.0); session model label `openai-codex/gpt-5.6-sol`. This is the harness-reported label, not an independently verified provider/version claim.

**Generated or modified.** Exactly `docs/IMPLEMENTATION-DECISIONS.md`, `prisma/schema.prisma`, and `docs/AI-WORKLOG.md` (this appended entry). Existing `.gitkeep` files and planning specs were not changed.

**Work actually performed.** Read `AGENTS.md`, the existing worklog, and all eleven `docs/specs/*.md` documents; reconciled contradictions/gaps against the supplied task; consumed the parallel official-source dependency verification record dated 2026-09-21; consulted official Prisma 7 schema/configuration documentation; drafted the provisional PostgreSQL schema and SQL/application enforcement register; manually cross-checked model/lifecycle coverage; and resolved an independent reviewer finding by adding the `synthetic` discriminator to the analytics daily rollup key so seed provenance survives raw-event purge.

**Suggestions rejected or deferred.** No generic repository/base-class layer, microservices, queues/event buses, CASL/permission tables, tenant onboarding, object storage/upload volume, public historical browsing, persisted/browser-generated PDFs, external legal/certification/geolocation integration, Kubernetes/Terraform, bespoke MCP service, or speculative gateway was added. Redis client, Argon2id package, image re-encoder, file-signature detector, Passport strategy/direct peers, and rate-limit backing store remain unselected. Tenancy, product granularity, permissions, review wording, published-edit visibility, analytics definitions/retention, auth lifetime/concurrency policy, limits, historical visibility, and Users/Settings scope remain human decisions at their documented gates.

**Human review performed.** none yet. An independent architect/security review is still required before primary-owned commit; no AI review is represented as human review.

**Official-source checks actually performed.** The supplied verified matrix provided publisher-maintained registry, release, license, and compatibility links for the pinned baseline. Official Prisma 7 documentation was read for the `prisma-client` generator/output, `prisma.config.ts` datasource URL ownership, PostgreSQL native mapping, and relation syntax. The original assessment PDF/email are absent, so no independent comparison against them was possible.

**Checks actually run.** Manual document/schema cross-check only. **Prisma schema validation: NOT PERFORMED** — Prisma CLI is unavailable and installation is forbidden. **Migration generation/application: NOT PERFORMED.** **Dependency installation/audit: NOT PERFORMED.** **Application tests/build/lint/typecheck/Compose/deployment: NOT PERFORMED** because no scaffold or dependencies exist.

**Open questions.** Validate this draft with the exact pinned Prisma CLI 7.10.0 before creating the initial migration, then test migration SQL and the refresh/publication/asset/analytics transactions against real PostgreSQL. The product and dependency selections deferred above remain open.

---

## 2026-09-21 — Independent review round (same session)

**Task.** Independent review of the schema draft and decision record before commit, per Task 6 of the engineered task.

**Model and harness.** Pi harness (0.87.0). Reviewers were separate read-only agents on their own model routes; this entry does not claim their provider labels, which were not recorded by the primary.

**Review performed.**
- **Security lens (completed):** reported one schema-level finding — `AnalyticsEvent.synthetic` provenance would be lost when raw rows roll into `AnalyticsDaily`, whose uniqueness key lacked a provenance discriminator, so seeded/synthetic and real counts could merge and become indistinguishable after raw purge. **Disposition:** already resolved in the authored artifacts before the finding landed — `AnalyticsDaily` carries `synthetic Boolean @default(false)`, the composite unique key and indexes include it, and the enforcement register and lifecycle matrix describe the discriminator. The primary additionally corrected one stale reference in the lifecycle matrix that still showed the old three-column key.
- **Data-integrity / Prisma-syntax lens (NOT completed):** the second reviewer was cancelled before yielding because the session budget was nearly exhausted. No findings from that lens are claimed, and the schema has therefore **not** received a complete independent read for FK/delete-action, relation-cycle, index-coverage, or Prisma-syntax correctness.
- No reviewer edits were made by the reviewers themselves; review was report-only.

**Human review performed.** none yet. The reviews above are AI reviews and are not represented as human review.

**Checks actually run by the primary.**
- `git status --porcelain` — exactly `M docs/AI-WORKLOG.md`, `?? docs/IMPLEMENTATION-DECISIONS.md`, `?? prisma/schema.prisma`; no existing file deleted, moved, or renamed.
- Long-line completeness check (`awk` over lines >700 chars) — confirmed the very long table/lifecycle paragraphs are complete sentences, not truncated content.
- Trailing-whitespace scan — only two intentional Markdown hard-break lines (trailing double space in the header block).
- `git check-ignore -v notarify-planning/00-ROADMAP.md` — matched `.git/info/exclude`, confirming the local duplicate cannot enter commits.
- Explicit-pathspec staging and post-push upstream verification.

**Still unvalidated.** Prisma schema validation (CLI unavailable; installation forbidden), migration SQL execution, PostgreSQL constraint/transaction behavior, and all dependency installation/audit remain unperformed. The incomplete data-integrity review lens should be re-run before the initial migration.

---

## 2026-09-21 — Completed integrity sweep and review findings

**Task.** Finish the data-integrity / Prisma-syntax review lens that an earlier reviewer had not completed.

**Model and harness.** Pi harness (0.87.0), fast/cheap review route. Reviewer agents are AI, not humans.

**Findings and dispositions.**
- **Fixed — likely Prisma compile blocker:** `Passport` declared no opposite back-relation fields for `AnalyticsEvent.passport` and `AnalyticsDaily.passport`. Prisma requires a back-relation for every relation, so this would most likely fail `prisma validate`/`generate`. Added `analyticsEvents AnalyticsEvent[]` and `analyticsDaily AnalyticsDaily[]` to `Passport`. **Requires CLI validation to confirm** — not proven here.
- **Fixed earlier in this round — uncreatable composite FK:** `RefreshToken` lacked the candidate key `@@unique([id, sessionId])` that the register's `RefreshToken_successor_same_session_fkey` requires; added.
- **Fixed earlier in this round — documentation overclaim:** the schema overview asserted no binary values in JSON/snapshot fields; JSONB cannot guarantee that, so it is now stated as a `..._no_binary_tx` / `safe_metadata_tx` / `metadata_bounds_tx` projection rule.
- **Open (documentation, not a defect):** blanket `Restrict` on `Material`, `Sustainability`, `Certification`, `ProductImage`, `ProductDocument` means a `Product` cannot be hard-deleted until draft children are removed first. Retained/history paths must stay restrictive; an explicit draft-cleanup transaction or purge policy is still needed and is not yet documented.
- **Open (index coverage, not a defect):** no `Product` index covers `originCountry` filtering, and none aligns `companyId` + `deletedAt` with the documented deterministic `id` tie-breaker. Logically correct without them; add only if query plans justify.

**Verified correct by the sweep.** Both documented composite-FK rules now have matching candidate keys; no `onDelete` cascade can erase `PassportVersion`, `PassportVersionAsset`, `AssetContent`, `AuditEvent`, or `AnalyticsEvent`; the tsvector/GIN search index is correctly assigned to future migration SQL rather than claimed in the schema.

**Not performed / not claimed.** Prisma schema validation, migration generation, PostgreSQL execution, dependency installation, and all tests/builds remain **NOT PERFORMED**. The back-relation change above is reasoned from Prisma's documented requirement, not from a successful validation run.

---

## 2026-09-21 — Schema validation and initial migration (build/schema-validation)

**Task.** Turn the reviewed schema draft into a validated, reproducible PostgreSQL foundation, without starting application implementation.

**Model and harness.** Pi harness (0.87.0). Implementation and integration ran on the primary `opencode-go/deepseek-v4.1-flash` route; an independent verification pass was run on a separate fast-model subagent. No GPT-route model participated in this round. Reviewers are AI, not humans.

**Locked decisions.** Deployment tenancy (one company per deployment) and product granularity (one serialized item per product, unique `(companyId, serialNumber)`, serials reserved after soft delete) were adopted from the round brief and moved out of the unresolved list. No other open decision was touched.

**Toolchain added.** Root ESM `package.json` with exact pins only, `pnpm-workspace.yaml`, `prisma7.config.ts`, `.env.example`, `.gitignore` entry for the generated client, `pnpm-lock.yaml`. Installed: prisma 7.10.0, @prisma/client 7.10.0, @prisma/adapter-pg 7.10.0, pg 8.23.0, dotenv 18.0.1, typescript 6.0.3, on Node 24.21.0 and pnpm 12.5.1. The dependency matrix had missed the required driver adapter; corrected here.

**Commands executed and actual results.**
- `pnpm install` — exit 0, 159 packages. Initially exit 1 with `ERR_PNPM_IGNORED_BUILDS`; resolved with `pnpm approve-builds --all`, which wrote an `allowBuilds` map into `pnpm-workspace.yaml` (an earlier draft of this entry and of the corresponding commit message said `onlyBuiltDependencies`; pnpm 12 uses `allowBuilds`, and the file is authoritative).
- `prisma validate` — "The schema at prisma/schema.prisma is valid".
- `prisma generate` — Prisma Client 7.10.0 generated in 117 ms.
- `prisma migrate dev --create-only` — created `20260921152150_init`.
- `prisma migrate dev` — applied; no follow-up migration, no drift.
- `prisma migrate deploy` against a fresh database — all migrations applied.
- `prisma migrate status` — database schema up to date.
- `psql` on PostgreSQL 18.6 — 21 tables, 30 FKs, 16 CHECKs, 79 indexes.
- `prisma/verification/invariant-checks.sql` — 11 checks (12 assertions) all passed, inside one rolled-back transaction.

**Schema changes forced by real validation.** A hand-written composite FK for the three cross-table invariants was written into the migration and Prisma silently removed it on the next `migrate dev`, because it reconciles foreign keys it does not model. The fix was to express the composite foreign keys as composite relations in `schema.prisma`, which required adding `@@unique([currentVersionId, id])` and `@@unique([replacedById, sessionId])`. This is a better outcome than the planned hand-written SQL: the constraints are now Prisma-managed and cannot drift. `AnalyticsEvent.version` now targets `PassportVersion(id, passportId)`.

**Suggestions rejected or deferred.** No application scaffold, no Nest/Next project, no Compose stack, no seed script, no trigger-based immutability, no retention job, no Redis. The Prisma CLI offered 8.0.0-rc.15 as an update; declined, as recorded earlier.

**Human review performed.** none yet.

**Not performed.** Application behaviour, Nest/Next build, lint, typecheck, dependency vulnerability audit, Compose, deployment. The PostgreSQL instance was a disposable container.

**Open questions.** The unresolved product and policy assumptions in the decision record remain open, now excluding tenancy and granularity. Schema-level validation does not exercise any transactional rule.

**Independent verification pass (fast-model subagent, same round).** Confirmed by re-running: `prisma --version` pins (Node v24.21.0, pnpm 12.5.1, Prisma/client 7.10.0, TS 6.0.3), `db:validate` valid, `migrate status` up to date, all 12 invariant assertions PASS with the claimed SQLSTATE classes, and live counts of 21 tables / 30 FKs / 16 CHECKs / 79 indexes. It also re-read the enforcement register against the migration SQL and found every assigned rule present.

Corrections it forced, applied in the following commit:
- `pnpm-workspace.yaml` uses `allowBuilds`, not `onlyBuiltDependencies`; the earlier claim was wrong and is corrected here and in the file's comment.
- The decision record's status line still said "no migration or package manifest exists", and the enforcement register preamble still said no SQL migration had been created or applied. Both were stale after this round and are corrected.
- `PassportVersion_source_draft_revision_nonnegative_ck` existed in the migration without being named in the register; the numeric/range row now names all fourteen CHECK constraints that were actually created.
- The composite-FK note was reworded: the constraints *are* present in the migration, generated by Prisma from the schema; what was abandoned was the hand-written SQL form.

---

## 2026-09-21 — Repository truthfulness pass and publish-permission correction

**Task.** Before any scaffolding, correct stale present-state claims written by earlier planning rounds so later agents receive accurate instructions. Documentation only.

**Model and harness.** Pi harness (0.87.0), primary `opencode-go/deepseek-v4.1-flash` route. No subagents, no GPT-route models. No human review occurred.

**Stale claims corrected.**
- `AGENTS.md` described the repository as having no package manager, no dependencies, no supported commands, and no schema validation or migration. It now states that the toolchain and initial migration exist and are verified, that there is still no application code, and it lists the only four commands that actually run. The unsupported command names remain listed as proposals, explicitly marked as not working.
- `README.md` claimed "repository setup only" with nothing to run and no dependencies. It now documents the working database commands and scopes the missing pieces to the applications.
- `docs/IMPLEMENTATION-DECISIONS.md` still carried an unresolved row asserting "Admin alone publishes". Replaced with the recorded project decision.

**Decision recorded.** Publishing and republishing are **not** Admin-only. Editor: read private product data and previews, create/edit drafts with child data and assets, publish and republish, read aggregate analytics. Admin: all of that plus delete/withdraw, version review, raw analytics and audit access, user/role management, company settings. This supersedes the earlier Admin-only proposal. The brief does not define permissions, so it remains a project choice rather than a Notarify requirement, and publish authorization stays **unimplemented** — nothing may gate publish to ADMIN in code yet.
- `docs/specs/04-AUTH-AND-SECURITY.md` split its publish row from the delete/review row and gained a dated note, so the older Admin-only text is visibly superseded rather than silently rewritten.

**Deliberately not changed.** Historical proposals, rejections and unresolved items elsewhere in the specs were left intact; no planning decision was retroactively restated as if it had always been correct. No product requirement was changed.

**Checks run.** Documentation edits only. No build, test, linter, typecheck, Prisma command or database command was run in this pass.

---

## 2026-09-21 — Workspace scaffold and authentication slice (build/schema-validation)

**Task.** Minimal truthful pnpm/Nest/Next scaffold, the authentication slice (login, refresh, logout, me), a strict refresh-token transaction proven against real PostgreSQL, a minimal browser auth flow, and test/build/lint/typecheck/audit evidence.

**Model and harness.** Pi harness (0.87.0), `opencode-go/deepseek-v4.1-flash` route for the primary and for both implementation subagents. No GPT-route model was used. Reviewers are AI, not humans; human review is `none yet`.

**Added.** `apps/api` (NestJS 12.4.0-family, Prisma 7.10.0 via `@prisma/adapter-pg`, Argon2id through `@node-rs/argon2`, cookie-parser, JWT access tokens, strict refresh rotation) and `apps/web` (Next 16.3.5 App Router, Tailwind 4 + daisyUI, in-memory access token only). Root: `biome.json`, `tsconfig.base.json`, workspace scripts, CORS configuration, dependency overrides.

**Commands executed and actual results.**
- `pnpm install --no-frozen-lockfile` — exit 0
- `pnpm db:validate` — schema is valid
- `pnpm lint` (Biome 2.5.14) — 34 files checked, no diagnostics
- `pnpm typecheck` — both workspaces pass
- `pnpm build` — both workspaces pass
- `pnpm --filter @notarify/api test:integration` — 1 suite, **9/9 tests pass** against PostgreSQL 18.6
- `pnpm audit` — **no known vulnerabilities** (after the overrides below)
- Browser validation against the real stack (Next on :3001, Nest on :3000, PostgreSQL 18.6)

**Browser evidence.** Wrong password returns the generic error and stays on `/login`. Correct password logs in and renders "Signed in as demo@example.test, Role: EDITOR". `/dashboard` shows email, role and company. A full page reload restores the session through the silent refresh. `localStorage` and `sessionStorage` hold zero keys and `document.cookie` is empty, confirming the access token stays in memory and the refresh cookie is HttpOnly. Logout returns to `/login`, and a subsequent visit to `/dashboard` redirects to `/login` with `POST /auth/refresh` answering 401.

**Defects found and fixed during this round.**
1. **Biome's recommended preset silently broke NestJS dependency injection.** `lint/style/useImportType` rewrote injectable classes and DTO classes (`PrismaService`, `ConfigService`, `JwtService`, `AuthService`, `LoginDto`) into `import type`. The suite went from 9/9 passing to 9/9 failing with "Nest can't resolve dependencies of the PrismaService". It also would have erased the DTO metadata `ValidationPipe` depends on, silently disabling request validation. `useImportType` is now off, with the reason recorded in `biome.json`. Pure types and interfaces still use `import type` where `emitDecoratorMetadata` would otherwise emit them.
2. **No CORS configuration existed**, so the cross-origin credentialed browser flow could not work. Added `CORS_ORIGIN` to the validated config (required in production, defaulting to the Next port in development) and `enableCors` with an exact origin plus credentials.
3. **pnpm rewrote `allowBuilds` with placeholder strings** ("set this to true or false"), which made every pnpm command fail. The two optional helpers are now explicitly denied and the NestJS same-day-release exclusion is documented.
4. **Three transitive advisories** (`mysql2` twice, `deepmerge-ts`) reached the tree through the Prisma CLI, which pins `mysql2@3.15.3`. Prisma has no patched 7.x release, so targeted pnpm overrides pin `mysql2@3.24.4` and `deepmerge-ts@8.0.2`; the toolchain was re-verified afterwards. These paths are MySQL-only and unreachable from this PostgreSQL application, but they were fixed rather than suppressed.

**Deliberately not implemented.** Product CRUD, editor screens, publication/passport behaviour, publish authorization, uploads, asset processing, QR, PDF, analytics, Redis, dashboard metrics, Users/Settings flows, version review, tenant onboarding, CASL or permission tables, generic repositories, Docker Compose and deployment. Roles exist only as a JWT claim and in `GET /auth/me`; **nothing is gated to ADMIN**, consistent with the recorded decision that publishing is not Admin-only.

**Not verified.** No end-to-end Playwright suite; browser validation was manual and is not a regression test. No load, penetration or container scan. The PostgreSQL instance is a disposable container, not the project stack. Application behaviour beyond the auth slice does not exist.

---

## 2026-09-21 — Authentication hardening pass (build/schema-validation)

**Task.** Close the remaining auth acceptance gaps without redesigning the architecture: Origin enforcement, authoritative actor resolution, generic login failures, idempotent logout, runtime token refresh in the browser, shared app configuration, HTTP hardening, tests and a Playwright regression.

**Model and harness.** Pi harness (0.87.0), `opencode-go/deepseek-v4.1-flash` route for the primary and both subagents. No GPT-route model. Reviewers are AI; human review is `none yet`.

**Fixed.**
1. **Origin enforcement.** `/auth/login`, `/auth/refresh` and `/auth/logout` now validate `Origin` against the configured application origin and reject a mismatch with 403 `INVALID_ORIGIN`. A missing `Origin` is deliberately allowed for non-browser clients, tests and curl, with the rationale in code and coverage for both cases. CORS is not treated as CSRF protection anywhere.
2. **Authoritative actor.** `AccessTokenGuard` now establishes the full actor in one place — signature, algorithm, issuer, audience, expiry, session existence, session/subject match, revocation, session expiry, user existence, user active, and fresh role/companyId from PostgreSQL — and attaches it to the request. `/auth/me` consumes it with no second lookup, and a probe controller in the test suite proves an arbitrary protected endpoint gets the same treatment. Roles remain absent from the JWT.
3. **Generic login failures.** Unknown email, wrong password and disabled account now return an identical 401 `INVALID_CREDENTIALS`; the real reason is logged server-side only. A dummy Argon2 verification keeps the disabled path from becoming an obvious timing oracle.
4. **Idempotent logout.** Returns 204 when the session is active, already revoked, the token is unknown, or the cookie is absent, and resolves the session only from the presented cookie digest.
5. **Shared application configuration.** `apps/api/src/application.ts` applies middleware, pipes, Helmet, request IDs and Origin checks; `main.ts` and the integration tests both use it, so tests exercise real configuration.
6. **HTTP hardening.** Helmet, per-request ID (accepting a well-formed inbound `x-request-id`, otherwise `randomUUID`), the ID echoed in a response header and included as `requestId` in the stable error body, and minimal logging that never records cookies, authorization headers, passwords or refresh tokens.
7. **Runtime token refresh.** The web client performs exactly one refresh and one retry on a 401 from a protected call, sharing a single in-flight refresh promise so concurrent 401s do not stampede, and clears state to `/login` when refresh fails. The token stays memory-only; cross-tab coordination remains a documented follow-up.
8. **Access-token lifetime is configurable** via `ACCESS_TOKEN_TTL_SECONDS` (validated, 1–86400, default 600) so the browser test can exercise refresh in seconds instead of sleeping ten minutes.
9. **Playwright regression** (`e2e/`, run with `pnpm test:e2e`): login, session restoration on reload with empty web storage, runtime refresh with exactly one 200 on `/auth/refresh`, and logout with protected-route redirect. It starts the built API and web app itself.

**CSRF decision.** Spec 04 asks for an explicit CSRF token on cookie mutations. It is **not** implemented, and that is recorded rather than skipped: section B3 of `docs/IMPLEMENTATION-DECISIONS.md` states the reasoning (`SameSite=Lax` plus server-side `Origin` allowlisting on a same-site topology), the residual risk (same-site subdomain attacker; a stolen cookie is unaffected either way), and the conditions that would require revisiting it. Spec 04 carries a dated note pointing at that decision so the deviation is visible.

**Commands executed and actual results.**
- `pnpm db:validate` — schema is valid
- `pnpm lint` — 38 files checked, no diagnostics
- `pnpm typecheck` — both workspaces pass
- `pnpm build` — both workspaces pass
- `pnpm --filter @notarify/api test:integration` — 1 suite, **18/18 pass** against PostgreSQL 18.6
- `pnpm test:e2e` — **4/4 pass** (login, session restore, runtime refresh, logout)
- `pnpm audit` — no known vulnerabilities

**Not verified.** No cross-tab refresh coordination (explicitly deferred). No load, penetration or container scan. No dependency-age or licence review beyond `pnpm audit`. The database remains a disposable container. Every product feature is still absent and untested.
