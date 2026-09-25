# AI work log

Canonical record of how `notarify-dpp-assessment` was actually built: which models and agents did what, which human decisions were made, and which checks were executed.

## Normalization note

This file was **normalized into the canonical submission history**, once the project had settled on a stable evidence format. The normalization folds known corrections directly into the rounds where they belong, so a reader does not have to replay a chain of corrections to learn what happened.

Each published milestone carries this file as it stood at that point, and the rounds below are that record. This file is the reviewer-facing source of project history, and the corrections the normalization folded in are not replayed as a separate chain.

Once a milestone is accepted into the published history, its evidence is stable. Later material corrections must be explicit and traceable in subsequent commits.

## Evidence policy

- **Factual evidence only.** No invented command output, test results, file contents or commit identifiers.
- **No contribution percentages.** They cannot be measured and are not claimed.
- **AI review is not human review.** Findings from Pi agents or from ChatGPT are AI review, recorded separately from Cristian's decisions.
- **Human review has three separate parts** and they are never collapsed:
  - *Decision / scope review* — reading a completion report, reviewing a core decision, accepting or rejecting a proposed behaviour, deciding scope or sequencing, approving a documented trade-off.
  - *Manual validation* — personally exercising the software: using the UI, running a command, testing a workflow, checking a deployed instance.
  - *Source-code review* — reading implementation source or diffs.
- **Commands are attributed to whoever ran them.** Commands recorded here ran in the local repository environment through the Pi harness unless stated otherwise. Neither ChatGPT model ran local commands.
- **Planned tests are not passed tests.** A check appears as passed only if it was executed.
- **Commands are given in the form they were actually invoked.** Prisma is never called without the project config, so `pnpm db:validate` and the explicit `--config prisma7.config.ts` forms appear rather than bare `prisma …` shorthand.
- **Historical evidence for merged milestones is stable**, as described above.
- **Terminal transcripts are not committed.** Command results recorded here are self-reported by the environment that ran them, corroborated where possible by committed artifacts — migrations, test files, manifests, lockfiles and database inspection. Independent verification can confirm that the artifacts exist and are consistent with the claims, but cannot replay a past terminal session. The same applies to external model sessions and to Cristian's decisions: the worklog and commit messages are the provenance record, and no repository evidence contradicts them.
- **A commit cannot name itself.** Each round entry names the commits it covers, not the commit that adds the entry; `git log` carries that successor relationship.

## Participants and roles

### Cristian

- Owns product and scope decisions.
- Reviews completion reports and core decisions during build rounds, and accepts or rejects recommendations before the next gate.
- Has **not** performed implementation source-code review yet. Source-code review is intentionally deferred until the complete project is built.
- Has not personally performed manual validation of the running software. No command output, UI behaviour or database state recorded here was observed by him first-hand; it was produced by Pi and reported to him.

### ChatGPT — GPT-5.6 Sol

External AI layer used outside Pi for:

- architecture, review and orchestration at the conceptual level;
- analysis of Pi completion reports that Cristian supplied;
- review of architecture, security and lifecycle decisions;
- identification of gaps and missing acceptance cases;
- sequencing and prompt engineering — it produced prompts that Cristian passed to Pi manually;
- inspection of the public GitHub repository when Cristian requested repository verification.

It did not edit the local repository and did not run the project's shell, database, test or build commands. Its analysis is AI review, not human review.

### GPT-6 Astra

External ChatGPT/browser assistance that additionally participated in browser-based validation where it was used. This is recorded from Cristian's account of his own tooling; no individual sessions or specific observations are asserted. Astra's browser validation is **not** Cristian's manual validation and is not reported as such.

### Pi

The repository coding-agent harness (Pi 0.87.0), used with its `explore`, `architect`, `research`, `review` and `verify` subagents. It performed all local repository work: reading and editing files, running installs, migrations, tests, builds, the database container and git operations.

### Implementation route — `opencode-go/deepseek-v4.1-flash`

Pi's default implementation model, used for the bounded implementation rounds as reported by the harness.

### Architecture and review route — `openai-codex/gpt-5.6-sol`

Pi's architecture and review route. The schema round recorded below is the only round that named it.

### Other Pi subagents

Rounds below record them by the role they played and the agent type the harness reported. Provider or model identities that were never recorded are not invented here.

---

## 2026-09-21 — Repository setup and planning baseline

**Scope.** Initialize the assessment repository from a supplied planning pack; no application code.

**AI participation.** Pi (`opencode-go/deepseek-v4.1-flash` route) performed the setup. The planning documents themselves were AI-assisted drafts produced before the repository existed, supplied as an archive rather than written in-repo.

**Human review.** Decision/scope review: Cristian supplied the planning pack, the assessment requirements and the target repository name, and corrected the handling of the supplied archive mid-round. Manual validation: not performed. Source-code review: not applicable — no source code existed.

**Decisions.** Repository is public; specification set lives under `docs/specs/` as the single canonical location; the assessment PDF and recruitment email stay out of the repository.

**Work performed.** Eleven planning specs extracted to `docs/specs/`; `README.md`, `AGENTS.md`, `.gitignore`, `docs/AI-WORKLOG.md`; placeholder directories for `apps/api`, `apps/web`, `packages/api-client`, `prisma`, `fixtures`.

**Findings / rejected approaches.** Committing the supplied archive, or keeping a duplicate staging copy of the specs, were both rejected in favour of one canonical location. The agent initially removed the already-extracted staging folder without asking; it was restored from the archive and reconciled against `docs/specs/`, and the exclusion was recorded locally in `.git/info/exclude`.

**Validation evidence.** `diff -r` between the extracted specs, the supplied archive and the restored staging folder was identical at import time. Secret-pattern search across the specs: matches were descriptive security text only. `gitleaks` and `trivy` were not installed and were not run.

**Not validated / deferred.** No application code, tests, builds or scans — none existed.

**Result.** The repository baseline milestone, pushed. Capability: a truthful repository skeleton with authoritative specs.

---

## 2026-09-21 — Schema, lifecycle and decision review

**Scope.** Pre-implementation review: reconcile the specs, draft the data model and record decisions. Explicitly excluded: any application code, dependency installation or migration.

**AI participation.** Pi primary; an `architect` agent authored the decision record and schema draft; a separate `verify` agent independently checked dependency versions; `review` agents covering security and integrity checked the result. `openai-codex/gpt-5.6-sol` is recorded for this round's architecture/schema role.

**Human review.** Decision/scope review: Cristian reviewed the decision record and chose one-company-per-deployment and serialized-item Product semantics; he also decided that EDITOR as well as ADMIN may publish and republish. Manual validation: not performed. Source-code review: deferred — the artifact was a draft schema, and no implementation existed.

**Decisions.** Tenancy and product granularity recorded as project decisions. Publishing is not Admin-only. Draft save semantics, ownership scoping and the enforcement-register approach were established here.

**Work performed.** `docs/IMPLEMENTATION-DECISIONS.md` and `prisma/schema.prisma` created; enforcement register assigning every rule to schema, migration SQL or a named transaction; lifecycle invariants stated.

**Findings / rejected approaches.** Several claims asserted in prose had no enforcement layer behind them. Composite foreign keys hand-written into migration SQL were removed by Prisma on the next migration, so they were later expressed as composite relations in the schema. Blanket `Restrict` on draft children, and the absence of a policy for audit metadata retention and asset-state downgrade, were recorded as open rather than fixed. Rejected: generic repositories, CASL, tenant infrastructure, queues, object storage.

**Validation evidence.** Prisma validation was **not** run — no toolchain or project manifest existed in this round. Version claims were verified against publisher registry metadata. Reviewer findings were resolved or recorded in the decision record.

**Not validated / deferred.** Schema validation, migration generation and application tests were all unperformed. No human source review.

**Result.** The data-model milestone. Capability: a reviewed, explicitly provisional data model with recorded decisions.

---

## 2026-09-21 — Schema validation and initial migration

**Scope.** Convert the draft into a validated, migrated PostgreSQL foundation. Explicitly excluded: application code, auth, product features.

**AI participation.** Pi primary on the `opencode-go/deepseek-v4.1-flash` route, plus a `verify` agent that re-ran the gates.

**Human review.** Decision/scope review: Cristian's round brief set the pinned toolchain and the validation goal, and prohibited installation claims without execution. Manual validation: not performed. Source-code review: deferred.

**Decisions.** Exact pins adopted — Node 24.21.0, pnpm 12.5.1, TypeScript 6.0.3, prisma and `@prisma/client` 7.10.0, plus the required `@prisma/adapter-pg` driver adapter that the earlier dependency matrix had missed.

**Work performed.** Root workspace and Prisma 7 config; initial migration `20260921152150_init`; hand-written constraints (partial unique index, tsvector GIN index, fourteen CHECK constraints, certification date ordering, VIEW event-key requirement); `prisma/verification/invariant-checks.sql`.

**Findings / rejected approaches.** Prisma removed hand-written composite foreign keys on the following migration because it reconciles foreign keys it does not model; the three cross-table invariants were therefore expressed as composite relations in `prisma/schema.prisma`, which required two additional candidate keys. `prisma@latest` resolved to an 8.0.0 release candidate and was rejected in favour of the stable 7.10.0 line.

**Validation evidence.** `pnpm db:validate` — valid. `pnpm db:generate` — client generated in 117 ms. `prisma migrate dev --config prisma7.config.ts` — applied with no drift. `prisma migrate deploy --config prisma7.config.ts` against an empty database — applied. `prisma migrate status --config prisma7.config.ts` — up to date. Resulting database: 21 tables, 30 foreign keys, 16 CHECK constraints, 79 indexes. All 12 invariant assertions passed, with SQLSTATE classes 23503, 23505 and 23514 proving the right constraint fired. PostgreSQL 18.6.

**Not validated / deferred.** No application behaviour, no tests, no dependency audit, no human source review.

**Result.** The schema milestone. Capability: a validated, reproducible database foundation.

---

## 2026-09-21 — Repository truthfulness and the publish permission

**Scope.** Documentation-only correction before any scaffolding. Explicitly excluded: feature code.

**AI participation.** Pi primary only.

**Human review.** Decision/scope review: Cristian required the correction and specified the publish permission. Manual validation: not performed. Source-code review: not applicable.

**Decisions.** Publishing and republishing are **not** Admin-only. EDITOR may publish and republish; ADMIN additionally deletes/withdraws, reviews versions, reads raw analytics and audit entries, and manages users and settings. Recorded as a project choice, not an employer requirement. Publish authorization remains unimplemented because publication is out of scope.

**Work performed.** `AGENTS.md` and `README.md` corrected from "repository setup only" to the actual verified state; the superseded Admin-only proposal replaced in the decision record; `docs/specs/04-AUTH-AND-SECURITY.md` split its publish row from delete/review and gained a dated note so the older wording stays visible.

**Findings / rejected approaches.** Historical planning prose was deliberately not rewritten. Proposals were not restated as approved decisions.

**Validation evidence.** None applicable — documentation only; no command was run.

**Not validated / deferred.** No tests or builds; none were relevant.

**Result.** Folded into the schema milestone. Capability: accurate repository instructions for subsequent agents.

---

## 2026-09-21 — Workspace scaffold, authentication slice and hardening

**Scope.** Minimal pnpm/Nest/Next scaffold plus login, refresh, logout and me, with the strict refresh-token transaction proven against real PostgreSQL. Explicitly excluded: product CRUD, publication, uploads, analytics, admin features.

**AI participation.** Pi primary on the `opencode-go/deepseek-v4.1-flash` route; two implementation subagents (one for the API, one for the web flow); one `review` agent focused on security. No GPT-route model was used in this round.

**Human review.** Decision/scope review: Cristian's brief froze the API contract, required Origin enforcement, authoritative actor resolution, generic login failures, idempotent logout and runtime token refresh, and required the CSRF question to be addressed rather than skipped. Manual validation: not performed. Source-code review: deferred.

**Decisions.** No separate CSRF token, accepted after its controls and residual risks were discussed — see the residual-risk statement below. Access-token lifetime made configurable for testing. Cross-tab refresh coordination explicitly deferred.

**Work performed.** `apps/api` (validated config, Prisma service with driver adapter, auth module, shared application configuration, Helmet, request IDs) and `apps/web` (login, workspace, account status, logout, runtime refresh-on-401).

**Findings / rejected approaches.**
- Biome's recommended preset rewrote injectable and DTO imports to `import type`, breaking Nest dependency injection (9/9 tests failing) and silently disabling `ValidationPipe`. The rule is disabled with the reason recorded.
- No CORS existed, so the credentialed cross-origin browser flow could not work.
- pnpm rewrote its build-approval key with placeholder strings, breaking every pnpm command.
- Three transitive advisories reached the tree through the Prisma CLI; with no patched Prisma 7.x available, they were pinned up through overrides and the toolchain re-verified.
- A class-field own-property bug made omitted PATCH scalars behave as explicit nulls; this was found in the following round.

**CSRF residual risk (corrected wording).** Requests with no `Origin` header are deliberately allowed so non-browser clients and tests work; this is the main accepted gap. Compromise of the actually allowlisted origin remains relevant. An ordinary same-site sibling subdomain does **not** satisfy an exact `Origin` allowlist and is not a residual risk of this design.

**Validation evidence.** `pnpm db:validate` — valid. `pnpm lint` — 38 files, no diagnostics. `pnpm typecheck` and `pnpm build` — both workspaces pass. API integration — 1 suite, 18/18 against PostgreSQL 18.6 (the product suite did not exist yet). Playwright — 4/4. `pnpm audit` — no known vulnerabilities. Browser validation of the running stack confirmed the login flow, session restoration on reload, empty web storage, an HttpOnly refresh cookie and logout redirect behaviour.

**Not validated / deferred.** Cross-tab refresh coordination; load, penetration and container scanning; deployment. No human source review.

**Result.** The authentication milestone, amended to carry the hardening changes. Capability: working authentication with hardened session handling.

---

## 2026-09-21 — Product draft CRUD

**Scope.** Draft editing and discovery only. Explicitly excluded: delete/withdraw, publish/republish, passports, uploads, analytics, admin features.

**AI participation.** Pi primary on the `opencode-go/deepseek-v4.1-flash` route; two implementation subagents (API and web).

**Human review.** Decision/scope review: Cristian's brief fixed the endpoint set, the ownership boundary, the draft-save contract, the atomicity requirement and the required test list. Manual validation: not performed. Source-code review: deferred.

**Decisions.** Draft save semantics recorded because clients depend on them: omitted top-level field unchanged; explicit null clears; supplied scalar replaces; omitted nested section unchanged; supplied collection replaces wholly in one transaction; sustainability object updates present fields; explicit null removes it. Publication completeness and the material-total rule are deliberately not enforced at draft save.

**Work performed.** `apps/api/src/products/**` with command-specific DTOs; `prisma/seed.ts` and `pnpm db:seed`; `apps/web/app/products/**` list and editor; product integration suite and Playwright product spec.

**Findings / rejected approaches.** A class-field own-property bug made omitted PATCH scalars and sustainability behave as explicit nulls, silently wiping fields the client never sent; fixed to test for `undefined`, with a regression test. A Prisma relation ordering issue surfaced during the HTTP smoke and was fixed. React Hook Form, TanStack Query and Zustand were each evaluated and **rejected** for this slice as unnecessary — no frontend dependency was added.

**Validation evidence.** `pnpm db:validate` — valid. `pnpm lint` — no diagnostics. `pnpm typecheck` and `pnpm build` — both workspaces pass. API integration — 2 suites, 29/29 (18 auth + 11 product) against PostgreSQL 18.6. Playwright — 6/6. `pnpm db:seed` run twice — idempotent. `pnpm audit` — no known vulnerabilities.

**Not validated / deferred.** No cross-tab draft-edit coordination test; no load or penetration testing; no human source review. Uploads, publication and everything downstream remain unimplemented and untested.

**Result.** The product-draft milestone. Capability: product drafts with proven optimistic concurrency.

---

## 2026-09-21 — AI provenance and human-review policy

**Scope.** Documentation only: make the worklog represent how the project is actually built.

**AI participation.** Pi primary only.

**Human review.** Decision/scope review: Cristian required the correction and defined the three-part review policy and the ChatGPT provenance. Manual validation: not performed. Source-code review: not applicable.

**Decisions.** Human review is reported in three separate parts and never collapsed. AI review is never reported as human review. `Not validated` must name the category.

**Work performed.** Worklog policy rewritten; a reconciliation entry appended; the policy encoded in `AGENTS.md`. Historical entries were left in place at the time and are folded into their correct rounds by the normalization you are reading.

**Findings / rejected approaches.** The previous `human review: none yet` wording was inaccurate because Cristian does review decisions and scope. The worklog's lint count of 54 files was stale; re-measured as 55. `pnpm lint` was the only command run in this round.

**Not validated / deferred.** Nothing executable changed, so no tests, builds or deployments were run or re-run.

**Result.** Folded into the product-draft milestone. Capability: an accurate evidence policy for later rounds.

---

## 2026-09-21 — Milestone pre-merge verification and workflow formalization

**Scope.** Prepare the Product Draft milestone for merge: re-run the full gate, reconcile documentation, and record the execution workflow. Explicitly excluded: the merge itself, the next branch, and any new feature.

**AI participation.** Pi primary on the `opencode-go/deepseek-v4.1-flash` route.

**Human review.** Decision/scope review: Cristian requested the pre-merge verification and the workflow documentation, and specified the milestone boundary. Manual validation: not performed. Source-code review: deferred until the complete project is built.

**Decisions.** The gated execution workflow (Gates 0–8) adopted as the current process, with the authority hierarchy and a mandatory end-of-pass checklist.

**Work performed.** `docs/specs/10-AI-AND-DX.md` gained the adopted workflow; `AGENTS.md` gained the concise operational version, the checklist and an accurate milestone status; the Playwright product test's wait condition fixed.

**Findings / rejected approaches.** The Playwright test that re-saves a draft failed intermittently: the application was correct and displayed the advanced revision, but the test's success wait matched the editor's static header text, so it queried the API before the save committed. Both product tests now poll the revision itself. This was a test-harness defect; no application code changed.

**Validation evidence.** `pnpm db:validate` — valid. `pnpm lint` — **55 files, no diagnostics**. `pnpm typecheck` and `pnpm build` — both workspaces pass. API integration — 2 suites, **29/29** against PostgreSQL 18.6. Playwright — **6/6**, confirmed over three consecutive runs. `pnpm db:seed` twice — `Seeded 3 categories.` both times, with the three seed-owned categories stable. `pnpm audit` — no known vulnerabilities. The six category rows in the test database are the three seed categories plus three Playwright fixture categories created by `e2e/global-setup.ts`.

**Not validated / deferred.** No load, penetration or container scanning; no Docker/Compose or VPS deployment; no human source-code review. Every feature listed as excluded from the milestone is unimplemented and therefore untested.

**Result.** Folded into the product-draft milestone. Capability: a verified milestone ready for Cristian's acceptance decision.

---

## Standing corrections applied throughout

These were once recorded incorrectly and are stated correctly in the rounds above.

| Earlier statement | Correct position |
| --- | --- |
| "NestJS 12.4.0-family" | Typo. The pinned family is **12.0.4** for `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` and `@nestjs/testing`. |
| Roles exist as a JWT claim | Incorrect. Role is **not** in the access JWT. Current role and company are resolved authoritatively from PostgreSQL on every protected request. |
| A same-site sibling subdomain can satisfy both CSRF controls | Incorrect under exact `Origin` allowlisting. The accepted residual risks are no-`Origin` requests from supported non-browser contexts, and compromise of the allowlisted origin. |
| Final milestone lint count of 54 files | The verified final-milestone result is **55 files, no diagnostics**. Round-specific counts recorded earlier were correct for those rounds. |

## Current milestone boundary

**Included:** planning baseline; validated schema and initial migration; PostgreSQL invariants; workspace and app scaffold; authentication and session hardening; Product draft CRUD; optimistic `draftRevision` concurrency; product search, filter and pagination; editor sections for General Information, Materials, Sustainability and Certifications; deterministic category seed; integration and browser coverage for implemented behaviour.

**Explicitly excluded:** binary asset uploads; images, documents and certificate PDFs; publication and republish; Passport/PassportVersion; public passport pages; QR; PDF export; delete/withdraw; analytics; Redis; dashboard metrics; Users/Settings; version review; Docker/Compose; VPS deployment; load, penetration and container scanning; final human source-code review.

---

## 2026-09-21 — Worklog normalization and status-banner correction

**Scope.** One-time canonical normalization of this file before the first milestone merge, plus the present-state corrections that independent verification of it surfaced. Documentation only.

**AI participation.** Pi primary on the `opencode-go/deepseek-v4.1-flash` route, plus one `verify` agent that audited the rewrite against repository and Git evidence.

**Human review.** Decision/scope review: Cristian authorized the normalization and specified the canonical structure, the participants section and the correction set. Manual validation: not performed. Source-code review: not applicable — no source code changed.

**Decisions.** The worklog policy changed: while a milestone is active and unmerged the worklog may be reconciled and normalized for accuracy; once a milestone is merged into `main` its evidence becomes stable, and later material corrections must be explicit and traceable through Git. Recorded in `AGENTS.md` and `docs/specs/10-AI-AND-DX.md`. Gates 0–8 are unchanged.

**Work performed.** This file rewritten into the structure described in its normalization note; the policy amended in both owning documents; the rounds above reconstructed from Git history, commit messages and the repository rather than from memory.

**Findings / rejected approaches.** Independent verification of the rewrite produced four findings, all resolved: the auth round claimed two integration suites where only one existed at that commit; the module-boundary text in `AGENTS.md` still said no seed existed; bare `prisma …` command names were replaced with the exact forms used, since this project never invokes Prisma without `--config prisma7.config.ts`; and both `README.md` and `docs/IMPLEMENTATION-DECISIONS.md` still opened by claiming no application code existed. Rejected: preserving known-wrong statements behind later corrections, and inventing commit identifiers to make every round look symmetrical.

**Validation evidence.** `pnpm lint` — 55 files, no diagnostics. `git status` — documentation files only; no executable code, test or configuration file changed.

**Not validated / deferred.** No tests, builds, migrations or scans were run or re-run, because nothing executable changed. Human source-code review remains deferred until the complete project is built.

**Result.** Folded into the product-draft milestone, together with the worklog normalization and the status-banner correction. Capability: a canonical, reviewer-friendly evidence record. The gate that remained next at that point was Cristian's milestone acceptance decision.

---

## 2026-09-21 — Milestone 1 integration

**Scope.** Gate 8 only: integrate the accepted Product Draft milestone into `main`, reconcile the final milestone documentation, and record the permanent integration workflow. No next milestone, no new branch, no feature work.

**AI participation.** Pi performed the milestone integration and its verification, on the `opencode-go/deepseek-v4.1-flash` route. No external model participated in the integration itself; Sol's and Astra's roles are unchanged from the participants section above and are not extended by this round.

**Human review.** Decision/scope review: Cristian explicitly accepted the Product Draft milestone and authorized its integration into `main`, and specified the housekeeping scope. Manual validation: not performed by Cristian. Source-code review: intentionally deferred until the complete project is built. Milestone acceptance is a decision, not source-code review.

**Decisions.** Product Draft accepted as Milestone 1. Milestone integration is a direct verified merge to `main` with `--no-ff`; internal milestone commit history is preserved. There is no permanent `develop` branch and no mandatory pull request — pull requests are optional tooling and none was used. Completed milestone branches are deleted once their tips are proven reachable from `main`. No squash merges, and no rebasing of accepted milestone history for cosmetic cleanup.

**Work performed.** Final Gate 5 correction removing the contradictory `append-only` sentence from `AGENTS.md`; the full executable gate re-run on the final candidate; the verified integration of the accepted milestone into `main`; and the adopted integration workflow recorded in `docs/specs/10-AI-AND-DX.md` and `AGENTS.md`.

**Findings / rejected approaches.** One stale statement was found and corrected: `AGENTS.md`'s concise Gate 5 description still said the worklog stays append-only, contradicting the policy adopted later in the same file. A targeted scan found no other stale present-state claims. Rejected: rewriting the earlier planning text that mentions pull requests — it stands as a proposal and is superseded by the adopted workflow instead.

**Validation evidence.** All executed during this integration pass:

| Gate | Result |
| --- | --- |
| `pnpm db:validate` | schema is valid |
| `pnpm lint` | 55 files, no diagnostics |
| `pnpm typecheck` | both workspaces pass |
| `pnpm build` | both workspaces pass |
| API integration | 2 suites, 29/29 against PostgreSQL 18.6 |
| `pnpm test:e2e` | 6/6 |
| `pnpm db:seed` twice | idempotent; 3 seed-owned categories remained stable |
| `pnpm audit` | no known vulnerabilities |
| accepted milestone tree vs `main` | empty content diff |
| local vs remote `main` after push | equal |

The accepted milestone is the product-draft milestone commit.

**Not validated / deferred.** Human source-code review; load testing; penetration testing; container scanning; Compose and VPS deployment; and every feature outside Milestone 1 — binary asset uploads, images/documents/certificate PDFs, publication and republish, Passport/PassportVersion, public passport pages, QR, PDF export, delete/withdraw, analytics, Redis, dashboard metrics, Users/Settings and version review.

**Result.** Milestone 1 is integrated into `main` as the product-draft milestone commit. The next milestone requires an explicit Cristian instruction, a fresh Gate 0, a fresh Gate 1, and a new scoped branch created from the then-current `main`.

---

## 2026-09-21 — Tooling: local hooks and CI safety net

**Scope.** A proportional tooling slice from `main`: one canonical local quality command, two git hooks, one CI workflow, and the documentation that goes with them. Explicitly excluded: release automation, deployment, coverage thresholds, conventional-commit enforcement, changelogs, dependency bots, multiple workflows, runtime matrices, container or security scanning, branch protection, PR requirements, Docker/Compose, and any application feature.

**AI participation.** Pi performed the work on the `opencode-go/deepseek-v4.1-flash` route. No external model participated in this round.

**Human review.** Decision/scope review: Cristian approved this tooling slice and set its boundaries, including the instruction to keep it proportional and to prefer a dependency-free hook mechanism if practical. Manual validation: not performed by Cristian. Source-code review: intentionally deferred until the complete project is built.

**Decisions.** `pnpm check` is the normal local contract (`db:validate`, `lint`, `typecheck`, `build`, API integration) and deliberately excludes Playwright so it stays fast enough for every push. Hooks use git's own `core.hooksPath` pointing at a tracked `.githooks` directory — no hook framework, no dependency. CI is a single workflow and does not depend on pull requests.

**Work performed.** Added the `check` and `hooks:install` scripts; `.githooks/pre-commit` and `.githooks/pre-push`; `.github/workflows/ci.yml`; updated `docs/specs/10-AI-AND-DX.md`, `AGENTS.md` and `README.md`.

**Findings / rejected approaches.** CI caught a **real defect that local runs had hidden**: the product filter test called `prisma.category.findFirstOrThrow()`, so it required a Category to exist. That held locally only because the development database had been seeded; a freshly migrated database has none, which is exactly how CI runs it. The test now creates its own category and tracks it for cleanup. Proven against a newly created, newly migrated database with zero categories: 2 suites, 29/29 pass, where 1 of 29 had failed before. Fixed in this round.

A `prepare` script was written first to enable the hooks automatically on install, then **removed**: it did not run on a genuinely fresh clone or with `--force` in this pnpm 12.5.1 setup, so documenting automatic hook setup would have described something that never happens. The replacement is an explicit `pnpm hooks:install` command. Also rejected: Husky, Lefthook and simple-git-hooks as unnecessary dependencies for two one-line hooks; commit-msg hooks; conventional commits; and a browser matrix in CI.

**Validation evidence.** `pnpm check` — passes: schema valid, 55 files linted with no diagnostics, both workspaces typecheck and build, 2 test suites and 29/29 API integration tests. `pnpm test:e2e` — 6/6. `pnpm audit` — no known vulnerabilities. Workflow YAML parsed and structurally verified (one job, nine steps, PostgreSQL 18.6 service, `contents: read`, concurrency cancellation enabled). Action pins resolved to commit SHAs through the GitHub API rather than guessed. Hook behaviour verified directly: `pre-commit` ran `pnpm lint` on a real commit, and `pre-push` ran `pnpm check` during a `--dry-run` push. **CI: run 35652357007 — success**, all sixteen steps green in 2m0s: install with frozen lockfile, migrations applied to a fresh database, `pnpm check`, Playwright Chromium install, `pnpm test:e2e`, and `pnpm audit`. An earlier run (35652066813) failed on the category defect above; the workflow itself was never at fault.

**Not validated / deferred.** No container or security scanning, no coverage thresholds, no branch protection, no deployment. Human source-code review remains deferred until the complete project is built.

**Result.** The tooling slice — the canonical `check` command, the two hooks and the CI workflow, with the product-filter test defect fixed in the same round — is the final repository commit. Capability: a local contract, cheap local feedback and a green clean-environment CI layer. The next gate is Cristian's decision on whether to accept this tooling slice.

---

## 2026-09-21 — Tooling integration (CI and Git hooks)

**Scope.** Gate 8 integration of the accepted CI/hooks tooling slice only. No next milestone, no new branch, no additional tooling, no application change.

**AI participation.** Pi performed the integration and the repository verification, on the `opencode-go/deepseek-v4.1-flash` route. No external model participated in this round.

**Human review.** Decision/scope review: Cristian accepted the tooling slice and explicitly authorized Gate 8. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built. Milestone acceptance is a decision, not source-code review.

**Decisions.** The dependency-free tracked `.githooks/` directory is retained, enabled per clone with `pnpm hooks:install` through git's `core.hooksPath`. `pre-commit` runs `pnpm lint`; `pre-push` runs `pnpm check`. GitHub CI is the authoritative clean-environment validation, and hooks are explicitly non-authoritative because they can be bypassed with `--no-verify`. Pull requests remain optional and no PR was used. Direct `--no-ff` merges remain the adopted integration workflow.

**Work performed.** Verified the tooling slice on a clean environment, integrated it as the final repository commit, pushed `main`, required green CI on the resulting `main` commit, and recorded this round.

**Findings / rejected approaches.** None new in this round. The earlier CI failure caused by the product filter test's ambient-database assumption was fixed in the tooling round above and is carried by this commit. Rejected: squash-based integration and pull-request ceremony, which would add no decision authority in a solo repository.

**Validation evidence.**

| Item | Value |
| --- | --- |
| Tooling slice CI | run `35652679189`, workflow `CI`, **success** |
| CI on integrated `main` | run `35654454808`, workflow `CI`, **success**, 16/16 steps |
| Application behaviour change | none |

**Not validated / deferred.** Human source-code review remains deferred. No container or security scanning, no coverage thresholds, no branch protection, no deployment. No Asset work exists yet.

**Result.** The tooling slice is integrated into `main`. Capability: `pnpm check`, local hooks and a green clean-environment CI layer are now part of the repository contract. The next milestone requires an explicit Cristian instruction, a fresh Gate 0 and Gate 1, and a new scoped branch from the then-current `main`.

---

## 2026-09-23 — Dev-worktree hygiene and the `NODE_ENV` build trap

**Scope.** Repository hygiene on a branch from `main` after Milestone 1: stop `next dev` from dirtying the working tree, and close a build failure discovered while verifying that change. Explicitly excluded: every application, API, schema and frontend behaviour change; and any change to the root `check` script, `.env`, `.env.example`, CI or the hooks. No next milestone was started.

**AI participation.** Pi performed the investigation and the change on the `opencode-go/deepseek-v4.1-flash` route. No external model participated in this round.

**Human review.** Decision/scope review: Cristian chose this option after being shown the alternatives and their trade-offs, and authorized the commit and the push. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built.

**Decisions.** `apps/web/next-env.d.ts` is untracked and gitignored rather than committed: Next 16.3.5's bundled documentation states that its contents are an implementation detail which differs between dev and build, and instructs projects that track the file to remove it from Git. The Next 16 `agentRules` auto-generation of `apps/web/AGENTS.md` and `CLAUDE.md` is disabled rather than committed, because this repository deliberately keeps a single human-owned instruction file at the root and a framework-rewritten second one would be silently regenerated on every Next upgrade. The safety of untracking was established by experiment before it was applied, not assumed.

The `NODE_ENV` build failure is fixed at the build command rather than by removing the value from `.env`: `apps/web`'s build script now runs `NODE_ENV=production next build`. A production build is always a production build, so the invariant belongs to the command, and pinning it there makes every invocation path deterministic instead of only the ones that happen to clear the variable. This follows an existing repository convention rather than introducing one — `e2e/playwright.config.ts` already pins `NODE_ENV: 'production'` for `next start` with the comment that dotenv loads `NODE_ENV=development` into the process. `next build` had simply never been given the same treatment.

**Work performed.** Added `agentRules: false` to `apps/web/next.config.ts`; added `apps/web/next-env.d.ts` to `.gitignore`; ran `git rm --cached apps/web/next-env.d.ts`, leaving the file on disk for the local toolchain; pinned `NODE_ENV=production` in `apps/web`'s build script; documented the interaction in `AGENTS.md`.

**Findings / rejected approaches.** A hard `next build` failure — `TypeError: Cannot read properties of null (reading 'useContext')` while prerendering `/_global-error` — was hit while running `pnpm check`. It was first attributed to the change under test, then to a `next dev` process sharing the same `.next` directory. Both explanations were wrong. Two controlled builds isolated the config change as innocent: the build passes both with and without `agentRules`, and fails only when `NODE_ENV=development` is exported. The value came from the repository's own `.env`, which the API never reads, so exporting it is the natural local setup. `NODE_ENV=test`, the value CI sets, builds cleanly, so CI was never affected and the failure was never observed there. The error message names none of this, which is what made it misleading.

Rejected: committing the generated `apps/web/AGENTS.md` and `CLAUDE.md` (Next's own suggested remedy for the untracked-file churn) — it would place a framework-managed instruction file inside a repository whose instruction surface is deliberately single-owner. Rejected: adding `next typegen` to the web typecheck script — a fresh-clone simulation proved `tsc --noEmit` passes without `next-env.d.ts`, so the extra step would be unearned. Rejected for the build failure: deleting `NODE_ENV` from `.env`, which would strip a value the API legitimately uses for local configuration while still leaving any other ambient `NODE_ENV=development` able to break the build; pinning the variable in the root `check` script, which would fix the aggregate command but leave a bare `pnpm build` — a documented command — still exposed; and documenting the trap without fixing it, which would leave a known failure in place.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` (canonical contract, `NODE_ENV` unset) | **passes** — schema valid, 55 files linted with no diagnostics, both workspaces typecheck and build, 2 suites / 29 of 29 integration tests |
| Web build, `NODE_ENV` unset | passes |
| Web build, `NODE_ENV=test` | passes |
| Web build, `NODE_ENV=development` (before the fix) | **fails**, reproduced deterministically after `rm -rf apps/web/.next` |
| Web build, `NODE_ENV=development` (after the fix) | **passes**, exit 0, no `/_global-error` failure |
| `pnpm check` under `NODE_ENV=development` (after the fix) | **passes** — 55 files linted with no diagnostics, 29 of 29 integration tests |
| `pnpm test:e2e` (after the fix) | **6 of 6 pass** (9.4s) |
| Fresh-clone typecheck without `next-env.d.ts` (temp tsconfig, `.next/types` excluded) | `tsc --noEmit` exit 0 |
| `git status` after a fresh `next dev` run | only the intended changes; no `AGENTS.md`, `CLAUDE.md` or `next-env.d.ts` churn |
| Web routes after the change (`/`, `/login`, `/dashboard`, `/products`) | 200 |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built. The fix is pinned at the build command, so the underlying Next.js behaviour — an explicitly exported `NODE_ENV=development` producing a failed prerender with an error that names none of the real cause — remains a framework-level defect that is worked around here rather than reported upstream. No container or security scanning, no coverage thresholds, no branch protection, no deployment.

**Result.** `next dev` no longer dirties the working tree, and a `next build` that inherits `NODE_ENV=development` from the local environment no longer fails. Capability: the working tree stays clean during frontend work, and the build is deterministic regardless of ambient `NODE_ENV`. The branch awaits green CI on its own HEAD and Cristian's decision on the merge.

---

## 2026-09-23 — Assets: validated upload, private retrieval and draft attachments

**Scope.** The Assets and file-attachment portion of Stage 3, on `build/assets` from `fed4a0530f24342607a031c4c66e8d222f9ac368`. In scope: authenticated upload, immutable PostgreSQL storage, image normalization, private retrieval, cover/gallery images, product documents, certification PDFs, editor upload UX, and deterministic integration and browser coverage. Explicitly excluded and not started: publication, republish, Passport/PassportVersion, `PassportVersionAsset` writes, public asset visibility or downloads, company logo, QR, PDF export, analytics, Redis, product delete/withdraw, garbage collection, antivirus, malware sandboxing, PDF CDR, OCR, object storage, local upload volumes, thumbnails, presigned URLs, resumable uploads, CDN behaviour and Docker/Compose.

**AI participation.** Pi performed the implementation, tests, documentation and validation on the `opencode-go/deepseek-v4.1-flash` route. Three read-only subagents were used, all on that same route: `explore` to map the existing draft editor and its state model; `research` to verify current releases, Node 24 compatibility, licenses and module formats for the two new dependencies; `review` for the independent read-only review of the final diff. No external model participated in this round, and no unavailable model was used.

**Human review.** Decision/scope review: Cristian approved the milestone prompt, which locked the scope, the accepted types, the limits, the upload-before-save model and the private-visibility rule; the three remaining choices that the prompt left to the implementer (output strategy, library versions, PDF structural check) were resolved from evidence and are recorded in section B5. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built.

**Decisions.** Recorded in full in section B5 of `docs/IMPLEMENTATION-DECISIONS.md`. In summary: PostgreSQL `bytea` storage is implemented; the accepted types are JPEG/PNG/WebP and PDF; limits are 5 MiB per image, 10 MiB per PDF, 12 gallery images and 20 documents and certifications per product; detection is `file-type` 22.1.1 and image processing is `sharp` 0.35.4; normalization is one strategy — decode with a bounded pixel count, reject oversized dimensions, bake orientation, re-encode in the input's own format; assets are private to the owning company with no public route; accepted bytes are immutable.

**Work performed.** Added `AssetsModule` (upload, bounded validation pipeline, private retrieval, upload exception mapping) and registered it; extended the product DTOs, response projection and transaction to carry image, document and certification-PDF associations; extended the draft editor with an Images and a Documents section, per-certification PDF controls, and a single shared upload path used by both the file picker and drag-and-drop; added deterministic in-process fixtures, two integration suites and three browser flows. No schema change was required and no migration was created.

**Findings / rejected approaches.** Three defects were found by the independent review and fixed with regression tests written first, each of which failed before the fix: a malformed asset id reached the database as a raw query value and returned 500 instead of 404; upload failures omitted `requestId` from the error body; and an out-of-range `position` returned 500. Two further defects were caught during implementation rather than review: the download handler originally returned the buffer from the controller, which Nest serialized as `{"type":"Buffer",...}` and which also made the declared `Content-Length` disagree with the body; and the upload exception filter originally keyed on the raw Multer error, which never arrives because `@nestjs/platform-express` converts those failures into `PayloadTooLargeException` and `BadRequestException` before any filter runs.

Rejected: relying on `file-type` alone for PDFs, because a probe showed a file whose entire content is `%PDF-1.7` is reported as `application/pdf` — a bounded structural check was added instead. Rejected: returning asset bytes from a product response, or adding a separate asset-metadata endpoint, when display metadata in the product projection is enough. Rejected: adding `@types/multer` and `@types/express`, since `platform-express` does not reference the `Express.Multer` namespace in its own declarations and Multer 2.x ships no types, so a local interface is accurate and dependency-free. Rejected: committing `apps/web/next-env.d.ts` or the framework-generated agent files, and unpinning the web build's `NODE_ENV`; the preceding hygiene invariants are preserved and were re-verified after the build and browser cycles. Rejected: a thumbnail or multi-variant pipeline, and any form of dynamic quality reduction, progressive re-encoding or resizing to fit a byte bound.

A fourth defect was found after the independent review, in the pre-acceptance pass on this same branch. The image limit was enforced only against the uploaded bytes, so a valid compressed input under 5 MiB could normalize into a larger stored representation and be persisted, breaching the locked limit for database-backed immutable storage. The bound is now applied to the normalized bytes as well, before hashing and before any write, reusing the 413 `FILE_TOO_LARGE` contract with a message that distinguishes the two cases; a rejected image leaves no `Asset` and no `AssetContent`. PDFs are unaffected, being stored as received and already bounded by their own input limit. A deterministic fixture proves the case: a 2000x2000 PNG written at maximum effort with palette quantization is 3.82 MiB uploaded and 7.81 MiB once normalized. The regression test was written first and failed with 201 before the fix. Rejected for this fix: lowering image quality dynamically, retrying the encode at progressively lower quality, and resizing to satisfy the byte limit, each of which would silently degrade a user's image rather than reject it.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` | **passes** — schema valid, 65 files linted with no diagnostics, both workspaces typecheck and build, 4 suites / 61 of 61 integration tests against PostgreSQL 18.6 |
| `pnpm test:e2e` | **9 of 9 pass** against the built API and web app |
| `pnpm audit` | **no known vulnerabilities** |
| Upload matrix | JPEG, PNG, WebP and PDF accepted; fake and truncated images, a magic-number-only PDF, SVG, HTML, ZIP, ELF and MZ/PE rejected; declared MIME and filename shown not to influence the stored type |
| Limits | 6.45 MiB image rejected as `FILE_TOO_LARGE` after identification; 11 MiB PDF rejected while the body was read |
| Stored-representation bound | a 3.82 MiB PNG that normalizes to 7.81 MiB is rejected with 413 `FILE_TOO_LARGE` and leaves no `Asset` and no `AssetContent`; the regression test failed with 201 before the fix |
| Normalization | stored bytes decode, stored size equals served length, EXIF present in the input is absent from the stored copy, and re-encoding the same input twice gives the same size |
| Access | unauthenticated 401; foreign-company and missing assets both 404 `ASSET_NOT_FOUND`; `Content-Type` server-controlled with `nosniff`; product JSON contains no `bytes` |
| Attachments | ordering, both collection bounds, family mismatches, foreign-company and non-accepted assets, full rollback on an invalid reference, one revision increment per save, stale save changes nothing, and exactly one of two competing writers wins |
| Worktree integrity | clean after the build and browser cycles; `next-env.d.ts` still untracked and ignored; no generated `apps/web/AGENTS.md` or `CLAUDE.md`; `agentRules: false` and the pinned production build retained |
| GitHub Actions CI | run `35886908917` on `93aaf6b06c9f3af00094025a30065daf0d42859b`, workflow `CI`, **success** — 65 files linted with no diagnostics, 4 suites / 61 of 61 integration tests, 9 of 9 Playwright tests, and `pnpm audit` reporting no known vulnerabilities, all on a clean runner against a fresh PostgreSQL 18.6 service |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built. No human has manually exercised the upload UX. Antivirus, malware sandboxing and PDF CDR are absent by scope, so a structurally valid PDF is accepted without content inspection. The PDF structural check rejects a legitimate PDF with more than roughly 4 KB of trailing data after `%%EOF`. There is no concurrency cap on image decoding beyond the per-request pixel bound, and the spec defers rate limiting. No garbage collection of unlinked uploads exists. `MaterialInputDto` still permits 1000 entries against the proposed 200, which was left as it was found. No container, deployment or VPS capacity work was done.

**Result.** Authenticated users can upload validated images and PDFs, retrieve them privately, and attach them to a product draft as cover and gallery images, typed documents and certification PDFs, with the existing atomic `draftRevision` contract preserved. Both the uploaded bytes and the persisted representation are bounded by the locked limits. The slice was accepted and integrated in the round below.

---

## 2026-09-23 — Assets integration (Gate 8)

**Scope.** Gate 8 integration of the accepted Assets slice only. No next milestone, no new feature, no publication or Passport work, and no change to application behaviour. The only source change in this round is the documentation reconciliation required by the end-of-pass gate, because `AGENTS.md` still described the slice as unmerged.

**AI participation.** Pi performed the merge, the verification and this reconciliation on the `opencode-go/deepseek-v4.1-flash` route. No subagent was used in this round and no external model participated.

**Human review.** Decision/scope review: Cristian reviewed the completion report, including the recorded limitations and the `sharp` licensing position, and explicitly approved the merge. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built. Milestone acceptance is a decision, not source-code review.

**Decisions.** No new product or architecture decision. The integration followed the recorded workflow: a direct `--no-ff` merge with no pull request and no squash, CI required on the resulting `main` commit before the branch is removed.

**Work performed.** Verified the starting state (`main` equal to `origin/main` at `fed4a05`, branch equal to `origin/build/assets` at `65da48a`, clean worktree), merged `build/assets` into `main` as `49fe1aa` with `--no-ff`, pushed `main`, required green CI on that merge commit, reconciled `AGENTS.md` to the post-merge state, and closed out by proving reachability and deleting the completed branch locally and remotely.

**Findings / rejected approaches.** None new. The three defects found by the independent review and the fourth found in the pre-acceptance pass were all fixed on the branch before integration and are carried by this merge. Rejected: squash-based integration and pull-request ceremony, which would add no decision authority in a solo repository.

**Validation evidence.**

| Item | Value |
| --- | --- |
| Branch HEAD integrated | `65da48a9e054d40f164bc9bc078b23e6f55bf773` |
| Merge commit | `49fe1aabcde9ee39dfb649c31c6268a0c4b18e0b` (`--no-ff`) |
| CI on the merge commit | run `35888242273`, workflow `CI`, **success** — 65 files linted with no diagnostics, 4 suites / 61 of 61 integration tests, 9 of 9 Playwright tests, and `pnpm audit` reporting no known vulnerabilities, on a clean runner against a fresh PostgreSQL 18.6 service |
| Application behaviour change | none |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built, and no human has manually exercised the upload UX. Everything the Assets round listed as deferred is still deferred: antivirus, malware sandboxing and PDF CDR; a concurrency cap on image decoding; garbage collection of unlinked uploads; `MaterialInputDto` limits; container, deployment and VPS capacity work. Publication, Passport and public-asset work has not been started.

**Result.** The Assets slice is integrated into `main`. Capability: authenticated upload of validated images and PDFs, private company-scoped retrieval, and product draft attachments as cover and gallery images, typed documents and certification PDFs, all under the existing atomic `draftRevision` contract and with both the uploaded and stored representations bounded. The next milestone requires an explicit Cristian instruction, a fresh Gate 0 and Gate 1, and a new scoped branch from the then-current `main`.

---

## 2026-09-23 — Roadmap normalization and Stage 4.1 publication core

**Scope.** Two connected pieces on `build/publication`, branched from `main` at `627fb94`. First, a repository-wide planning-document reconciliation that normalizes the roadmap to the canonical stage model and records two settled semantics. Second, Stage 4.1 of the canonical roadmap: publication prerequisites, `POST /products/:id/publish`, stable Passport identity, immutable `PassportVersion`, retained `PassportVersionAsset` references, QR artifact generation, republish semantics, and publication concurrency and idempotency. Explicitly excluded and not started: the remaining Stage 4 milestones (public passport API and page, public asset downloads, QR redirect, back-office Passports page, version history, PDF export), and everything in Stages 5–7.

**AI participation.** Pi performed the reconciliation, the implementation, the tests and the validation on the `opencode-go/deepseek-v4.1-flash` route. Two read-only subagents were used on that same route: `explore` to inventory stale planning and status statements across all fifteen documents against the canonical roadmap, and `research` to verify the current release, module format, types, license and API shape of the QR dependency before adding it. No external model participated in this round.

**Human review.** Decision/scope review: Cristian supplied the canonical project goal, the canonical remaining roadmap, the six-milestone Stage 4 decomposition and the two settled semantics, and approved them for this pass; he also required the reconciliation to be a dedicated early commit. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built.

**Decisions.** Recorded in section B6 of `docs/IMPLEMENTATION-DECISIONS.md` and owned by `docs/specs/00-ROADMAP.md`. The roadmap now carries eight stages (0–7), Stage 4 is six independent milestones, and all nine bonuses remain in scope with none described as optional or expendable. Two semantics settled: verification is a prototype/application-level indicator on an active published passport with no review or approval subsystem required, and the public passport's brand logo is satisfied by a bundled application asset, so publication does not depend on `Company.logoAssetId`. For Stage 4.1 specifically: publication prerequisites are publication-only and never block a draft save; the public UUID and QR are allocated once and retained; the QR target origin comes from validated `PUBLIC_APP_ORIGIN` configuration rather than a request `Host` header; and `qrcode` 1.5.4 is pinned with `@types/qrcode`.

**Work performed.** Reconciled `README.md`, `AGENTS.md`, `docs/IMPLEMENTATION-DECISIONS.md` and eight specs, correcting stage numbering, the single-slice Stage 4, PDF export placement, Users/Settings placement, Product DELETE absence, stale implemented-module and test-count claims, review-workflow assumptions, the company-logo prerequisite and Redis described as deferrable. Left historical planning prose in place where the decisions record already directs that approval be recorded there instead. Then added `PublicationModule` (publish transaction, policy, QR rendering, controller, DTO), a transaction-aware draft loader on `ProductsService`, `PUBLIC_APP_ORIGIN` validated configuration, and ten integration tests.

**Findings / rejected approaches.** The document inventory found fifteen categories of stale statement across eleven files; the substantive ones were structural rather than cosmetic — a stage model with seven rows rather than eight, Stage 4 as one slice, PDF export scheduled with Stage 5, a review workflow treated as mandatory project work, and a company-logo publication prerequisite. Rejected: mechanically editing every file, since several documents were already consistent and the project requires one owning document per subject. Rejected: rewriting the specs' original planning prose, because the decisions record already directs that approvals be recorded there rather than retro-fitted into history. Rejected: a review/approval subsystem merely to satisfy a badge, and a dynamic-quality or resize step to satisfy the byte bound.

On the implementation, the first smoke run appeared to reject a complete draft; the cause was the test script passing `categoryId: null` explicitly, and the prerequisite was correct to refuse it. The QR option surface has a trap worth recording: `toBuffer` accepts only PNG, and passing `type: 'svg'` fails at runtime, so SVG requires `toString`. An integer `scale` is used rather than `width`, because a width that is not an exact multiple of modules plus quiet zone yields a fractional scale that can clip the quiet zone.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` | **passes** — schema valid, 72 files linted with no diagnostics, both workspaces typecheck and build, 5 suites / 71 of 71 integration tests against PostgreSQL 18.6 |
| `pnpm test:e2e` | **9 of 9 pass** against the built API and web app |
| `pnpm audit` | **no known vulnerabilities** |
| Publication smoke test | incomplete draft → 400 `PUBLICATION_INCOMPLETE` naming the missing fields; complete draft → version 1 with a stable UUID and QR target; same revision again → `replayed=true` with the same version id; stale revision → 409; edit then republish → version 2 with the same UUID |
| QR artifact | a real decodable PNG (328×328, 2467 bytes) read back from `Passport.qrPngBytes`, not a placeholder |
| Retained assets | each version carries its `PassportVersionAsset` rows; two versions each retained their cover image and product document |
| Immutability | version 1 still held its pre-edit snapshot after version 2 was published, and the current-version pointer moved to version 2 |
| Worktree integrity | clean after the build and browser cycles; `next-env.d.ts` untracked, no generated agent files, `agentRules: false` and the pinned production build retained |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built, and no human has manually exercised the publication flow or the editor. No independent review of the Stage 4.1 diff has been run yet; the milestone's Gate 3 review is still owed. The public surface does not exist yet, so the QR target URL resolves to nothing until Stage 4.2, and the QR has not been scanned by a real phone or decoded by an independent decoder. There is no public visibility rule, no historical-version browsing, no PDF, and no analytics. `PassportReview` remains unused infrastructure. Everything the Assets round deferred is still deferred.

**Result.** The repository's planning surface now describes one canonical roadmap, and Stage 4.1 is implemented: an authorized editor or admin can publish a complete draft into an immutable, idempotently-addressable version with a stable public identity and QR artifact, retaining its asset references, and can republish after further edits without disturbing published history. The branch awaits Cristian's decision; it has not been merged, and Stages 4.2–4.6 and 5–7 have not been started.

---

## 2026-09-23 — Stage 4.1 review corrections

**Scope.** A focused correction round on `build/publication`, driven by an external independent review of the Stage 4.1 contract and by the milestone's own Gate 3 review. No new milestone, no new feature, and no change to the publication architecture: the `FOR UPDATE` serialization, `expectedDraftRevision` precondition, stable Passport UUID, single QR allocation, same-revision replay, `(passportId, sourceDraftRevision)` idempotency, immutable snapshots, current-version pointer and retained asset references are all preserved unchanged.

**AI participation.** Pi performed the corrections, the regression tests and the validation on the `opencode-go/deepseek-v4.1-flash` route. One read-only subagent was used, on that same route: `review`, for the milestone's required independent Gate 3 review of the entire Stage 4.1 diff from `main`. No external model participated in this round.

**Human review.** Decision/scope review: Cristian supplied the review findings, the required behaviours and the boundaries of this round, and required the independent Gate 3 review that had been owed. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built.

**Decisions.** No new architecture decision. The publication completeness rule was tightened to match the approved contract: sustainability must be present **and** carry all five assessment fields; each certification must carry all five fields including its expiration date, with a non-empty name and issuing authority; the production date must not be in the future, compared as date-only strings rather than timestamps. Every referenced asset is now revalidated inside the publish transaction and before version creation. Company-logo participation and the publication `AuditEvent` were removed from Stage 4.1, and the response contract was completed. All of this is recorded in section B7 of `docs/IMPLEMENTATION-DECISIONS.md`.

**Work performed.** Added asset revalidation through `AssetsService.findLinkableAssets`; tightened the completeness rules; removed `logoAssetId` from the snapshot and `COMPANY_LOGO` from retained assets; removed the publication audit write and its assertion; completed the publication response; validated `PUBLIC_APP_ORIGIN` as an absolute http(s) origin; rebuilt the canonical publishable fixture to be genuinely complete; and added regression coverage for every rule above.

**Findings / rejected approaches.** The independent review reported four confirmed defects and five test-quality weaknesses. All were addressed.

*Committed-state versus working tree.* The review was run while the correction changes were still uncommitted, so it correctly observed that `git diff main...HEAD` did not yet contain them. That is a sequencing artifact of this round, not a code defect; the changes are in this commit.

*Documentation contradicted the code.* The service class comment, `AGENTS.md` and three rows of `docs/IMPLEMENTATION-DECISIONS.md` still described publication as writing an audit row after the write had been removed. All are corrected, and `PUBLIC_APP_ORIGIN` is now listed among the required environment variables.

*Blank certification fields published.* The completeness rule tested `=== null` for a certification's name and issuing authority while the seven basic fields also rejected empty strings. The DTO accepts `''` and the save path stores it unchanged, so an unnamed certification could reach a published version. Both fields now reject empty and whitespace-only values.

*Malformed origin accepted.* `PUBLIC_APP_ORIGIN` was checked for non-emptiness and then had trailing slashes stripped, so `///` reduced to an empty string and `https://` to `https:`, producing a QR code encoding an unscannable relative target with no startup failure. It is now required to parse as an absolute http(s) origin with no path, query or fragment.

*Test quality.* The concurrency test could not distinguish a held row lock from ordinary request ordering; it now holds the product row on a separate connection and asserts that nothing is written while the lock is held, which fails deterministically if `FOR UPDATE` is removed. The replay test asserted two of eleven response fields and now asserts full equality apart from `replayed`. The origin assertion could not distinguish configuration from a hardcoded literal, so the suite now runs against a distinct configured origin. The audit-absence assertion was keyed only to the version id and is now keyed to the actor and every touched entity. Retained-asset coverage now asserts the exact `(role, assetId)` set, plus a duplicate-PDF case and a republish case proving version 1 keeps its references after an image is unlinked.

Rejected: writing the audit row "for now" to satisfy the older documentation, since the audit bonus is a separate milestone with its own event policy. Rejected: making the certification ordering check the only guard, because the database `CHECK` constraint and the draft-save validation already prevent that state; the publication rule is retained as defence in depth and proven directly against the policy rather than by fabricating an unreachable row. Rejected: a dynamic-quality or resize step to satisfy a byte bound, and any new idempotency key, queue, event or storage abstraction.

Recorded as observations rather than defects, for later milestones: a `P2002` inside the publish transaction is mapped to a revision conflict, which is self-healing through replay but imprecise for a hypothetical `publicUuid` collision; the QR is rendered while the row lock is held, which extends lock hold by a few milliseconds; asset revalidation reads without locking, which is unreachable today because the only `state` write is the insert that creates an `ACCEPTED` asset, and must be revisited when quarantine transitions exist; and `PassportVersionAsset` is keyed `(versionId, assetId)`, so one asset used in two roles yields one row and any future consumer reading `role` must account for that.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` | **passes** — 72 files linted with no diagnostics, both workspaces typecheck and build, 5 suites / 89 of 89 integration tests against PostgreSQL 18.6 |
| `pnpm test:e2e` | **9 of 9 pass** against the built API and web app |
| `pnpm audit` | **no known vulnerabilities** |
| Publication suite | 28 tests, covering completeness for every sustainability field and every certification field, blank certification fields, future production date, asset revalidation for cover/gallery/document/certification PDF, family mismatch, cross-company refusal, the row lock, exact retained sets, dedupe, immutability across republish, replay equality and origin validation |
| Independent review | `review` subagent, read-only, over `git diff main...HEAD`; four confirmed defects and five test-quality findings, all resolved above |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built, and no human has exercised the publication flow. The QR artifact has not been scanned by a real phone or decoded by an independent decoder; that needs a live public target, which Stage 4.2 provides. The public surface, visibility rules, historical browsing, PDF export and analytics do not exist. `PassportReview` remains unused infrastructure. No migration was needed or created.

**Result.** Stage 4.1 now matches its approved contract: publication prerequisites are complete, every referenced asset is revalidated at the public visibility boundary, company-logo and audit participation are out of scope as recorded, and the response exposes stable publication metadata without binary content or the snapshot. The branch awaits Cristian's decision; it has not been merged, and Stage 4.2 has not been started.

---

## 2026-09-23 — Stage 4.2 public passport API, published assets and QR

**Scope.** Stage 4.2 on `build/public-passport-api`, branched from `main` at `8542082`. In scope: the anonymous public projection, published-asset downloads, the stored QR artifact, the QR redirect, the web routing bridge, and the tests and independent decoding evidence for all of it. Explicitly excluded and not started: the visual public passport page, the editor Preview tab, back-office Passports and version history, PDF export, analytics, Redis, audit logging, product delete/withdraw, Users, Settings, company-logo management and deployment. No schema or migration change was needed.

**AI participation.** Pi performed the implementation, tests and validation on the `opencode-go/deepseek-v4.1-flash` route. Two read-only subagents were used, both on that same route: `research` to verify the release, license, module format, API shape and pixel-format requirements of the test-only QR decoder before adding it, and `review` for the independent read-only security review of the complete Stage 4.2 diff. No external model participated in this round.

**Human review.** Decision/scope review: Cristian supplied the Stage 4.2 goal, the visibility rule, the endpoint shapes, the exclusion list and the review focus areas, and approved them for this pass. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built. The external orchestration layer is AI review, not human source review.

**Decisions.** Recorded in section B8 of `docs/IMPLEMENTATION-DECISIONS.md`. In summary: public reads use only the current immutable snapshot; active visibility requires an existing passport with a current version, no withdrawal and a non-deleted product; all failures collapse to one identical 404; `PassportView` is the single public contract; assets are public only while retained by the current active version; the snapshot owns semantic role and ordering while retained rows own retention and download authorization; the QR artifact is stored once and served unchanged; Nest owns QR resolution and the web app bridges `/q/:uuid` narrowly to it; every response is `no-store`; and no analytics are written.

**Work performed.** Added `PublicPassportModule` with the projection, the visibility resolver, the published-asset authorization and the three anonymous routes plus the redirect. Extracted the binary-response header logic into a shared helper so the new binary route could not ship a weaker variant, and added one narrow `AssetsService` read whose trust boundary is documented rather than exposing a general download-by-id. Added the single-segment `/q/:uuid` rewrite to `next.config.ts` reusing the existing `NEXT_PUBLIC_API_URL`. Reconciled the two lifecycle specs that still described the pre-4.1 design before starting.

**Findings / rejected approaches.** The independent review confirmed three defects, all fixed with regression tests: the JSON projection carried no `Cache-Control`, so a shared cache could have kept serving published content after a republish or a future withdrawal while every sibling route was protected; element-level snapshot corruption raised a `TypeError` that escaped as a generic 500 instead of the intended controlled error, and `sustainability` was echoed from stored JSON rather than projected so a wrong-shaped value could pass through under a scalar type; and the controlled-failure path had no test at all. Two observations were also addressed because the claims around them were untested: the QR read no longer uses `findUniqueOrThrow`, and the suite now asserts that the 404 body is byte-identical across all five unavailable states rather than checking the code for one of them.

Rejected: reconstructing public content from `PassportVersionAsset.role`, which would mislabel an asset used in two roles because the table is keyed `(versionId, assetId)`. Rejected: adding `PUBLIC_API_ORIGIN`, since API-relative asset URLs need no origin and page URLs already have one. Rejected: a generic snapshot-versioning framework for a single supported version. Rejected: a `410 Gone` tombstone, Redis or any public caching, a public historical-version route, and any analytics write, all of which belong to later milestones. Rejected: adding `sharp` and `jsqr` as root dependencies for the browser test; the test imports the decoder from the API workspace instead, so it resolves its own dependencies and the root gains nothing.

Recorded as observations rather than defects: the view advertises a QR target derived from current configuration while the printed artifact froze the origin at first publication, so a future origin migration would make the two diverge until the QR is regenerated; `PASSPORT_UNAVAILABLE` is the one place the indistinguishable-failure property is deliberately broken, for a caller who already holds the UUID; the Next bridge falls back to a localhost API origin when unconfigured rather than failing loudly; and the anonymous binary routes have no rate limiting, which the approved scope defers.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` | **passes** — 80 files linted with no diagnostics, both workspaces typecheck and build, 6 suites / 110 of 110 integration tests against PostgreSQL 18.6 |
| `pnpm test:e2e` | **10 of 10 pass** against the built API and web app |
| `pnpm audit` | **no known vulnerabilities** |
| Public passport suite | 21 tests: anonymous access without token or cookie, identical 404 across malformed/unknown/withdrawn/unpublished/deleted, snapshot isolation across an unpublished edit and a republish, projection contents and exclusions, URL shapes, current-version asset visibility for cover/gallery/document/certification, unattached/draft-only/foreign/malformed assets, historical isolation after republish with the retained row surviving, a retained asset that stops being accepted, binary headers for images and PDFs, QR bytes served exactly and stable across republish, redirect safety including `Host` poisoning, controlled failure for four kinds of corrupt snapshot, and the absence of any analytics write |
| Independent QR decode | the real stored `qrPngBytes` decoded with `jsqr` (a different library from the encoder) yields exactly `{PUBLIC_APP_ORIGIN}/q/{publicUuid}` |
| Browser bridge | one Playwright test decodes the artifact, requests that exact URL from the Next server without following redirects, and gets 302 with the canonical `Location` |
| Independent review | `review` subagent, read-only, over the complete diff: three confirmed defects and seven observations, all defects fixed above |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built, and no human has exercised the public surface. The QR has not been scanned with a physical phone: that needs the visual public page, which is Stage 4.3, and the redirect target intentionally still 404s. No public caching exists, so no cache-invalidation behaviour was tested. No analytics were written, so no scan or view recording was tested. The public surface has no rate limiting.

**Result.** A published passport is anonymously readable through an explicit projection of its current immutable version, its published assets are downloadable only while the current version retains them, its stored QR artifact is served unchanged and independently verified to decode to the configured target, and a scan reaches the backend resolver through a narrow web-origin bridge. The branch awaits Cristian's decision; it has not been merged, and Stage 4.3 has not been started.

---

## 2026-09-24 — Stage 4.2 integration (Gate 8)

**Scope.** Gate 8 integration of the accepted Stage 4.2 tip only. No next milestone and no new feature. The only source change in this round is the documentation reconciliation the end-of-pass gate requires, because `AGENTS.md`, the README, the roadmap and section B8 still described Stage 4.2 as unmerged. No application code, schema, migration, test or configuration was touched, and Stage 4.3 was not started.

**AI participation.** Pi performed the pre-merge verification, the merge, the CI gate, the reconciliation and the branch cleanup on the `opencode-go/deepseek-v4.1-flash` route. No subagent was used in this round and no external model participated.

**Human review.** Decision/scope review: Cristian explicitly approved the accepted tip `313dbfc835257b52a3e419574333bf40124001c0` for integration into `main` and instructed this Gate 8 pass, including the pre-merge truth check, the preserve list and the deferred observations. Manual validation: not performed by Cristian. Source-code review: still intentionally deferred until the complete project is built. Milestone acceptance is a decision, not source-code review.

**Decisions.** No new product or architecture decision. The integration followed the recorded workflow: a direct `--no-ff` merge with no pull request, no squash and no rebase, CI required on the resulting `main` commit before the branch is removed, and the accepted public-surface contract left unchanged.

**Work performed.** Verified the starting state (`origin/main` equal to `8542082111bc88f52a623ac9b441aecbbb574f48`, the branch equal to `origin/build/public-passport-api` at `313dbfc`, a clean worktree, a merge base equal to the main tip, and no commit on `main` absent from the branch), confirmed CI run `35907545052` had completed successfully on that exact branch SHA, synchronized `main`, merged `build/public-passport-api` into `main` as `a27a4b13` with `--no-ff`, pushed `main`, required green CI on that exact merge commit, then reconciled the four stale current-state statements so the repository no longer describes Stage 4.2 as awaiting acceptance.

**Findings / rejected approaches.** The first `git push` was rejected by the local `pre-push` hook, which runs `pnpm check`: the integration suite failed in every suite because the disposable PostgreSQL container `notarify-pg-test` had been stopped, so nothing was listening on the `localhost:55432` that `DATABASE_URL` targets. This was environmental, not a regression — both parents were already green on their own commits. The container was restarted and the hook then passed on its own terms; the hook was **not** bypassed with `--no-verify`. Rejected: treating the accepted tip as sufficient authority to skip the merge-commit CI gate; squashing or rebasing, which would have detached the accepted SHA from the published history; deleting the milestone branch before, rather than after, successful integration CI; and rewriting the Stage 4.2 round's closing sentence, which stays as the historical statement of the state at that time and is superseded by this round rather than edited.

**Validation evidence.**

| Item | Value |
| --- | --- |
| Pre-merge `main` | `8542082111bc88f52a623ac9b441aecbbb574f48` (CI run `35903341811`, success) |
| Branch HEAD integrated | `313dbfc835257b52a3e419574333bf40124001c0` |
| Branch CI before integration | run `35907545052`, workflow `CI`, **success**, `head_sha` equal to the branch HEAD |
| Merge commit | `a27a4b1307440cf2da162d65ccded6c8a2316ed9` (`--no-ff`, two parents) |
| Local `pnpm check` on the merge commit | **passes** — 80 files linted with no fixes applied, both workspaces typecheck and build, 6 suites / 110 of 110 integration tests against PostgreSQL 18.6 |
| CI on the merge commit | run `36017618829`, workflow `CI`, **success**, `head_sha` equal to `a27a4b13` — 80 files linted, 6 suites / 110 of 110 integration tests against a fresh PostgreSQL 18.6 service, 10 of 10 Playwright tests, and `pnpm audit` reporting no known vulnerabilities |
| Reachability | `313dbfc8` is an ancestor of the final `main`, and all four branch commits are present in it |
| Migrations | no migration was added, changed or created by this pass |
| Application behaviour change | none |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built, and no human has exercised the public surface. Everything the Stage 4.2 round listed as deferred is still deferred, and the observations it recorded remain open and were deliberately not resolved during integration: no public caching or Redis, no anonymous rate limiting, no policy for regenerating an already printed QR after an origin migration, no physical phone scan, no `410 Gone` lifecycle tombstone, no quarantine-state transition locking, and no public historical-version route.

**Result.** Stage 4.2 is integrated into `main`. Capability: an anonymous read surface projecting a published passport's current immutable version, published-asset downloads authorized by retention from that current version, the stored QR artifact served unchanged, a `302` resolver and a narrow web-origin bridge, and no analytics. Stage 4.3 has not been started and requires a fresh Cristian instruction with its own Gate 0 and Gate 1.

---

## 2026-09-24 — Stage 4.3 public Passport UI, editor Preview and Publish UX

**Scope.** Stage 4.3 on `build/passport-ui`, branched from `main` at `5cbf826`. In scope: the anonymous server-rendered `/passport/:uuid` page, one shared Passport presentation component, the seven assessment tabs in the product editor, a Preview tab rendering the current editor state, a dirty-state baseline, an explicit Publish/Republish interaction, the browser evidence for all of it, and a one-time documentation truth cleanup of stale pre-4.1/pre-4.2 claims found at Gate 0. Explicitly excluded and not started: the back-office Passports page and version history, PDF export, analytics and `QR_HIT`, Redis, the audit-log bonus, product delete/withdraw, soft delete, Users, Settings, company-logo management, Docker/Compose and deployment. No schema or migration change was made, and no dependency was added.

**AI participation.** Pi performed the Gate 0 reconciliation, the implementation, the tests, the review fixes and the validation on the `opencode-go/deepseek-v4.1-flash` route. Three read-only subagents were used, all on that same route: two `explore` agents to map the existing frontend and the backend public/publish contracts before any edit, and `review` for the independent read-only review of the complete `main...HEAD` diff. No external model participated in this round.

**Human review.** Decision/scope review: Cristian supplied the Stage 4.3 goal, the seven-tab requirement, the shared-presentation requirement, the preview-from-current-editor-state requirement, the publish-safety rules, the responsive and accessibility requirements, the deferral list and the review focus areas. Manual validation: not performed by Cristian, and no physical phone scan was performed. Source-code review: still intentionally deferred until the complete project is built. The external orchestration layer is AI review, not human source review.

**Decisions.** Recorded in section B9 of `docs/IMPLEMENTATION-DECISIONS.md`. In summary: the public page is a Server Component reading only the anonymous projection; Preview is built client-side from the current editor form and is deliberately not a second API call; one presentation component serves both surfaces through one display model and two adapters; preview identity uses explicit placeholders and never shows published or verified status; draft images stay authenticated and are exposed only as revoked `blob:` object URLs; dirty state is the canonical save payload against the last server baseline; publishing requires a clean saved draft and sends only `expectedDraftRevision`; and the public binary routes opt into `Cross-Origin-Resource-Policy: cross-origin`. One recorded spec position was superseded: Stage 4.3 implements preview from current editor state rather than the protected draft-projection API `docs/specs/06-PASSPORTS-QR-PDF.md` had described, and that spec now carries a dated update rather than a silent edit.

**Work performed.** Reconciled six genuinely stale present-state claims left after Stages 4.1 and 4.2 before touching application code (the publish permission described as unimplemented, an API module inventory omitting `src/publication` and `src/public-passport`, a claim that publication was out of scope, a claim that publication had not happened, a claim that the snapshot retained the company logo, and a QR resolver described as recording a scan). Created `apps/web/app/api-origin.ts` and made `auth-context.tsx` consume it so the web app has one API origin. Added the shared presentation component, its display model and label map, a bundled SVG brand mark, the `PassportView` mirror with a structural guard, the public adapter, the public page, its not-found state and the draft adapter. Converted the editor into seven accessible tabs without rewriting its controls, ordered the tab panels by a verified mechanical reorder of the existing JSX, added the Preview tab, dirty-state tracking, tab-aware client validation with focus, and the Publish/Republish action with `PUBLICATION_INCOMPLETE`, `PRODUCT_REVISION_CONFLICT` and upload/unsaved guards. Added the four-tab-aware browser suite and extended the QR spec to follow the redirect into the real public page.

**Findings / rejected approaches.** The independent review confirmed five findings, all fixed with regressions. Highest: the root `AuthProvider` mounted on the public page and restored a session there, which on a signed-in visitor rotates the browser-wide refresh cookie from a page that never reads it; the provider now skips restoration on the anonymous route and the exemption is limited to the single-segment `/passport/:uuid` pattern rather than the whole `/passport` prefix. Also confirmed and fixed: an invalid field in a hidden tab could block submission with no visible feedback (the form is now `noValidate`, and the editor's own validation reports the message, reveals the owning tab and focuses the field); upload failures were rendered only inside the Images panel and so were invisible from the Documents and Certifications tabs; and Publish stayed enabled during an in-flight upload, which could publish the previous revision and then surface the new asset as an unsaved change. The review also confirmed the dirty baseline itself, the absence of any draft-content path into the anonymous projection, no private-asset exposure or object-URL leak, no published state in Preview, a correct publish body, no missing headline section, no unsafe URL source, no client-only public content, and no 4.4/PDF/analytics creep. Found and fixed during my own testing rather than by review: Helmet's `Cross-Origin-Resource-Policy: same-origin` made the browser refuse the published cover image outright with `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`, which curl could not reveal, so the two public binary routes now opt into `cross-origin` while the authenticated asset route keeps `same-origin`. Rejected: proxying public asset bytes through the Next server, adding a protected draft-projection endpoint, `next/image` for public assets (it would route public binaries through the optimiser, and the API origin is configurable), any carousel or component-library dependency, Zustand for tab state, a second visually similar passport implementation, hiding sections that have no data, and generating placeholder public identifiers.

**Validation evidence.**

| Check | Result |
| --- | --- |
| `pnpm check` | **passes** — 89 files linted with no diagnostics, both workspaces typecheck and build, 6 suites / 110 of 110 integration tests against PostgreSQL 18.6 |
| `pnpm test:e2e` | **24 of 24 pass** against the built API and web app, including the four new regression tests for the review findings |
| `pnpm audit` | **no known vulnerabilities** |
| Public page | An anonymous browser context renders every required section, the cover image really loads through the published-asset route, and the 404 state is byte-identical for an unknown UUID with no lifecycle term leaked |
| Server rendering | An HTTP request that never executes JavaScript receives HTML containing the published product name, the public UUID, the verification badge, materials, sustainability and the certification |
| QR full chain | The stored artifact decodes to `{PUBLIC_APP_ORIGIN}/q/{uuid}`, the web bridge answers 302 to `/passport/{uuid}`, and following it renders the real public page for that passport |
| Isolation chain | Published v1 stays on the public page through an unsaved edit and a save while Preview shows the edited draft, and only an explicit republish moves the public projection to v2 on the same public UUID |
| Editor | Seven tabs exist in order, one is selected, panels are hidden rather than unmounted, entered data survives a tab round trip, tab switching does not save, and arrows/Home/End navigate with focus following selection |
| Publish safety | A dirty draft cannot publish and says why, a saved one publishes to a v1 public link, an incomplete draft reports the gap and keeps the draft, a stale revision is refused and publishes nothing, an unsaved draft is not published implicitly, and publishing is blocked while an upload is in flight |
| Preview privacy | Preview images are `blob:` object URLs from the authenticated route, the private asset route still answers 401 anonymously, a draft-only asset is 404 through the public route, and Preview does not advance the revision |
| Mobile | At 390 px the public page shows its core content with no horizontal overflow |
| Independent review | `review` subagent, read-only, over the complete `main...HEAD` diff: five confirmed findings, all fixed with regressions, plus one spec-owned navigation-protection gap that was implemented |
| GitHub Actions CI | run `36027931967` on `7550600abd53a920a8a96b2bdcd5e5ebd7f53cfb`, workflow `CI`, **success** — 89 files linted, 6 suites / 110 of 110 integration tests against a fresh PostgreSQL 18.6 service, 24 of 24 Playwright tests, and `pnpm audit` reporting no known vulnerabilities |

**Not validated / deferred.** Human source-code review remains deferred until the complete project is built. No human has exercised the editor, the Preview tab or the public page, and the QR has not been scanned with a physical phone: the decoded-QR-to-rendered-page chain is proven in the browser, but a real handset scan remains unverified and is recorded as such rather than claimed. Nothing was deployed, so the responsive and performance behaviour on a real VPS is unmeasured. No public caching exists, so no cache-invalidation behaviour was tested, and no analytics were written, so no scan or view recording was tested. The public surface still has no rate limiting. The cross-tab refresh race that makes session restoration risky outside the public route is a pre-existing accepted limitation of the authentication slice and was not redesigned here. The back-office Passports page, version history, PDF export and everything in Stages 5–7 remain unimplemented.

**Result.** A reviewer can now open a published passport anonymously at its own URL, read every assessment-required section from server-rendered HTML, download its published assets and QR, and reach that same page by scanning the printed code end to end. An operator can edit a product through the seven required tabs, see the current draft — including unsaved changes — rendered through the same presentation component the public page uses, save explicitly, and publish or republish only a clean saved revision, with the public projection changing solely on that explicit republish. The branch awaits Cristian's decision; it has not been merged, and Stage 4.4 has not been started.

---

## 2026-09-24 — Stage 4.3 Gate 7 Preview presentation correction

**Scope.** Continued `build/passport-ui` from `68506f3`, without branching or merging. Cristian explicitly settled published-edit visibility: neither unsaved nor saved draft changes alter the public Passport until an explicit successful republish creates an immutable version and advances the current pointer; UUID and QR remain stable. This is a human decision, recorded in B10, not an AI-selected default. He corrected Preview's presentation contract: editor-only chrome calls it an unpublished draft, while the shared Passport must simulate eventual Published / qualified prototype Verified presentation, without creating publication records or identifiers. No Stage 4.4, PDF, analytics, schema or dependency work was authorized.

**AI participation.** Pi, using `opencode-go/deepseek-v4.1-flash`, inspected the adapter, shared presentation, browser tests, schema and owning documents; implemented the correction and ran local validation. Pi's read-only `review` subagent independently reviewed the repository diff. The external ChatGPT orchestration/review layer (ChatGPT / GPT-5.6 Sol) performed Cristian-facing Gate 7 review of the prior branch result, identified the Preview-presentation mismatch and stale decision/audit documentation, and generated the approved correction scope before Pi executed it. External ChatGPT did not author repository files directly or execute local repository commands. Its orchestration and review are AI participation, not human source-code review.

**Human review.** Decision/scope review: Cristian supplied this explicit correction and settled published-edit visibility. Manual validation: none by Cristian, including no physical phone scan. Source-code review: deferred until the completed project is built; AI review is not human review.

**Work performed / decisions.** The draft adapter now supplies `PUBLISHED` and `VERIFIED` only to the shared display model; no Preview branch was added to `PassportPresentation`. The existing editor banner continues to say the state is unpublished. The metadata view now supplies a placeholder for last-published date when no date exists, alongside existing UUID, creation-date and version placeholders; links and QR are unavailable before publication, and no next version is invented. Published-edit and historical visibility are settled in B10 and removed from the unresolved table; the lifecycle matrix no longer claims that publication writes an audit event. The dated spec update and current-state documents now describe simulation and the still-private draft. Historical Stage 4.3 evidence above is preserved rather than rewritten; its earlier assertion that Preview is never presented as published/verified is superseded by this explicitly authorized correction.

**Focused evidence.** `pnpm check` passed with 6 integration suites / 110 tests and successful lint/typecheck/build. `pnpm test:e2e e2e/passport-ui.spec.ts` passed 15 of 15 against the built stack. The new browser regression verifies unpublished editor chrome, Published status, qualified Verified badge, placeholders, no public URL/QR, Product API status `DRAFT` with unchanged revision and zero Passport/PassportVersion rows for that Product in PostgreSQL. The v1→unsaved draft→saved draft→explicit v2 test now asserts simulated Published/Verified Preview with unchanged v1 public content until republish and stable UUID. The privacy regression attaches a new image to a saved draft after publishing v1, observes a private authenticated `blob:` Preview URL, and verifies anonymous private retrieval is 401 and public-asset retrieval is 404. An initial invocation of `pnpm exec playwright test e2e/passport-ui.spec.ts` failed for all tests because it omitted this repository's Playwright config and therefore did not start its web servers; rerunning via the supported `pnpm test:e2e` script with the focused spec passed. The aggregate `pnpm check` passed (89 files linted, both workspaces typecheck and build, 6 integration suites / 110 tests); `pnpm test:e2e` passed 25 of 25; and `pnpm audit` reported no known vulnerabilities. The final branch HEAD must still receive green CI; the completion report will cite its actual run rather than infer it from earlier runs. The independent read-only review of the complete `main...HEAD` diff found no runtime regression or Stage 4.4 creep; its two confirmed documentation findings (roadmap still calling published edits proposed and premature worklog wording about final-HEAD CI) were corrected before the final push.

**Not validated / deferred.** Physical phone scan, Cristian's manual/source-code review, deployment, and Stage 4.4/PDF/analytics remain outstanding. The generic Next `PASSPORT_UNAVAILABLE` page still returns HTTP 200 without exposing controlled backend failure or stored snapshot; redesigning its status/error boundary was expressly excluded from this round.

**Result.** Preview simulates how the current draft will look when published while remaining explicitly identified as unpublished editor content. No Preview publication side effect or public draft-asset exposure is allowed; publication continues to require explicit republish. The branch awaits Cristian's Gate 7 decision and remains unmerged.

---

## 2026-09-24 — Stage 4.3 integration (Gate 8)

**Scope.** Integrate Cristian's accepted `build/passport-ui` tip `a728865e2ccf4c2888878599d53ad19fb665a9ae` into `main` without changing application behavior. Reconcile only current-state prose made false by the merge and append integration evidence. No Stage 4.4 branch or implementation, PDF, analytics, Redis, schema or migration change is authorized.

**AI participation.** Pi performed the remote-ref and CI preflight, the merge, the verification and this documentation reconciliation. No subagent was used in this Gate 8 round. The external ChatGPT / GPT-5.6 Sol contribution to the preceding Gate 7 correction remains recorded in that round; this entry makes no claim of further external model work.

**Human review.** Decision/scope review: Cristian explicitly approved the exact Stage 4.3 tip for a `--no-ff` merge and specified the preserve list and deferred limitations. Manual validation: not performed by Cristian, including no physical phone scan. Source-code review: still deferred until the completed project is built. Acceptance of the milestone is a decision, not human source-code review.

**Decisions / work performed.** No product or architecture decision changed. Fetched origin; required `origin/main` at `5cbf826806fba64f93af746b8d106a2db6bc08e3`, `origin/build/passport-ui` at the accepted tip, a clean worktree, zero unexpected divergence (0 behind / 14 ahead), and final correction commit `a728865e` changing only `docs/AI-WORKLOG.md` from its parent. Required branch CI run `36046019904` to have succeeded on that exact tip. Switched to synchronized `main`; merged with `git merge --no-ff build/passport-ui` as `b925a856147152c560dd26488a5f71b150b74879` (parents: previous main and accepted tip); pushed main without deleting the milestone branch. Required CI run `36049440655` to complete successfully with `head_sha` equal to the merge commit. Re-read current documents; reconciled the present-state status in `AGENTS.md`, README, the roadmap and section B9 of the decisions record. The public Passport and frontend specs require no merge-induced change. Historical Stage 4.3 worklog rounds were not rewritten.

**Findings / rejected approaches.** The four current-state statements still described Stage 4.3 as on an unmerged branch or awaiting acceptance; these became false at the merge. Rejected: squashing/rebasing or changing accepted application code, treating branch CI as proof of integration CI, and deleting the branch before final-main CI. The accepted `PASSPORT_UNAVAILABLE` HTTP-200 observation, absent real-phone scan, missing caching/rate limiting and cross-tab refresh coordination remain deferred; none is silently presented as resolved.

**Validation evidence.** The accepted tip was reachable from the merge commit by its second parent; the merge commit was pushed and CI run `36049440655` completed with `success` on the exact SHA `b925a856147152c560dd26488a5f71b150b74879`. The pre-push hook ran `pnpm check` successfully on the merge commit (6 integration suites / 110 tests); this does not replace independent CI. Final-HEAD CI after the documentation-only reconciliation and branch deletion are not claimed here and must be verified before the Gate 8 completion report.

**Not validated / deferred.** No physical phone QR scan or Cristian manual UI validation, no human source-code review, no deployment/VPS check. No Stage 4.4 back-office Passports/version history, PDF or analytics was implemented.

**Result.** Stage 4.3 is merged into `main`, with accepted published-version isolation, shared public/Preview presentation, simulated qualified verification under unpublished editor chrome, seven tabs, explicit saved-revision publishing, and private draft assets retained. Final-main CI and branch cleanup remain separate Gate 8 evidence.

## 2026-09-25 — Stage 4.4 back-office Passports and complete version history

**Scope.** Implement the Stage 4.4 milestone only, on `build/passport-history` cut from exact `main` `651008e9855ff61eb7faff240d36f606cb24ab08`: an authenticated company Passport list, current-publication actions for ADMIN and EDITOR, Admin-only listing and inspection of every retained immutable `PassportVersion`, exact-version historical asset retrieval, the back-office Product Passports page, the product table's publication columns and actions, and the Product-table cover image. Explicitly out of scope and not started: Passport PDF export (Stage 4.5), analytics and Total Views (Stage 5), product delete/withdraw and a read-only View destination (Stage 6), public historical-version routes, rollback/diff/retention management, and any schema or migration change. `main` was not modified and no Stage 4.5 branch was created.

**AI participation.** Pi implemented the slice end to end as the primary agent, using `opencode-go/deepseek-v4.1-flash`, and performed the repository reconnaissance, the API and frontend implementation, the integration and Playwright tests, the fixes, the documentation reconciliation and the commits. One read-only Pi `review` subagent (ephemeral, `openai-codex/gpt-5.6-sol`) independently reviewed the complete `main...HEAD` diff; its findings and the fixes are recorded below. No other Pi subagent was used, and Astra was not used. The Cristian-facing orchestration prompt for this round came from the external ChatGPT / GPT-5.6 Sol layer: that layer did not author any repository file and did not run any local command, and it is AI orchestration/review, not human review.

**Human review.** Decision/scope review: Cristian approved the Stage 4.4 scope and its locked decisions by supplying this milestone's instruction. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. No part of this round is human source-code review.

**Decisions / work performed.** No unresolved product decision was silently selected. The round implements already-recorded decisions: back-office-only history (B10), the accepted permission matrix (Admin history, both roles for current-publication management), stable UUID/QR, and retained-role authority. No schema change was needed; the existing models already support complete history. Work performed: extracted the validated snapshot interpretation into `publication/passport-snapshot-content.ts` so the anonymous and historical projections share one implementation; added `RolesGuard`/`@Roles` in `auth`; added the authenticated `src/passports` module (`GET /passports`, Admin-only `GET /passports/:passportId/versions`, `GET /passports/:passportId/versions/:versionNumber`, `GET /passports/:passportId/versions/:versionNumber/assets/:assetId`); extended the product list with a bounded `passport` summary and the draft cover asset id inside the existing list query; added the `/passports` and `/passports/[passportId]` web pages; extended the product table with cover, QR, Total Views placeholder and publication actions; added 18 API integration tests and 8 Playwright tests, including the central v1/v2/draft separation proof and a same-session role-downgrade proof. Total Views renders an explicit unavailable placeholder; no analytics, PDF, delete or withdrawal behaviour was introduced.

**Findings / rejected approaches.** The independent review confirmed six defects, all fixed in commit `2a75315`: (1) historical files were all fetched with an unbounded `Promise.all`, which could let one slow PDF hold up the cover and spike memory — replaced with bounded four-way concurrency that shows images as they arrive; (2) blob-backed historical PDF links inherited no `Content-Disposition`, so they opened inline — historical files now carry their stored original filename and the shared presentation names the download; (3) a blob URL that resolved after effect cancellation could leak — such URLs are now revoked immediately; (4) one browser assertion checked a relative asset URL against the web origin, which proved nothing — it now targets the API origin and also proves the current asset stays readable; (5) the historical response validator did not require asset ids — it now validates every consumed field; (6) invalid passport pagination returned the unsanitized fallback error — it now returns the same sanitized `VALIDATION_ERROR` contract as product pagination. The review's ownership-change hypothesis was recorded as residual risk rather than "fixed": there is no ownership-transfer path in the repository today. Rejected: introducing a third passport presentation, a shared repository/DI abstraction for the two read projections, a public historical URL to simplify rendering, unbounded asset preloading, and any fake PDF/delete/analytics control.

**Validation evidence.** Locally on `build/passport-history`: `pnpm check` passes (104 files linted with no diagnostics, both workspaces typecheck and build, 7 integration suites with 128 of 128 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 33 of 33 against the built stack; `pnpm audit` reports no known vulnerabilities. Schemas, migrations and dependencies are unchanged. The branch was pushed and CI run `36140600586` passed on `d99b8e4`, and the accepted final tip `033680a` passed CI run `36141115620` (lint, typecheck, build, 128 integration tests against a fresh PostgreSQL 18.6 service, 33 Playwright tests and the dependency audit).

**Not validated / deferred.** Human source-code review and Cristian's manual UI validation are deferred. No physical QR scan, no deployment/VPS check, no load or penetration testing. Historical-file download was asserted through the browser's `download` attribute and blob href, not by observing a real downloaded file on disk. The review's concurrent-ownership-change scenario has no reachable path today and is not covered by a test.

**Result.** Stage 4.4 is implemented, locally validated and merged into `main`; see the Gate 8 round below. Both roles can list company passports, open the current public passport and download the stable QR; Admin can list every retained immutable version, inspect each historical snapshot and retrieve the files retained by that exact version; the public surface still serves only the current version and no older asset became anonymously reachable.

## 2026-09-25 — Stage 4.4 integration (Gate 8)

**Scope.** Integrate Cristian's accepted `build/passport-history` tip `033680a67155e0f0324937904bb7ca3518fd5548` into `main` without changing accepted application behavior. Reconcile only current-state prose made false by the merge and by the satisfied branch-CI condition. No Stage 4.5 PDF work, no Stage 5 analytics, no delete/withdraw, no schema, migration or dependency change, and no branch deletion before green integration CI.

**AI participation.** Pi performed the pre-merge truth check, the merge, the CI gate, the documentation reconciliation and the branch cleanup on the `opencode-go/deepseek-v4.1-flash` route. No subagent was used in this Gate 8 round; the independent review recorded in the Stage 4.4 implementation round already ran against the accepted diff. No external model participated in this round.

**Human review.** Decision/scope review: Cristian explicitly approved the exact tip for a `--no-ff` merge and specified the preserve list, the reconciliation scope and the deferred observations. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. Milestone acceptance is a decision, not human source-code review.

**Decisions / work performed.** No product or architecture decision changed. Fetched origin and required `origin/main` at `651008e9855ff61eb7faff240d36f606cb24ab08`, `origin/build/passport-history` at the accepted tip, a clean worktree, zero unexpected divergence (0 behind / 6 ahead) and exactly the six expected Stage 4.4 commits. Required CI run `36141115620` to have completed successfully with `head_sha` equal to the accepted tip; the earlier documentation tip `d99b8e4` and its run `36140600586` were treated as historical evidence only. Switched to synchronized `main`, merged with `git merge --no-ff build/passport-history` as `57ade8315ffb04ed44c0e445eca93619735a55f4` (parents: previous main and accepted tip), pushed `main`, and required CI run `36146706397` to complete successfully with `head_sha` equal to the merge commit. Then reconciled the present-state statements in `AGENTS.md`, `README.md`, the roadmap and this log, narrowed the unresolved-permission wording to the permissions that are actually settled, and replaced the branch-CI sentence with the recorded run ids. The accepted application behavior was not altered by this round.

**Findings / rejected approaches.** Four current-state statements still described Stage 4.4 as awaiting acceptance, and one still said the documentation-only commit required its own CI although run `36141115620` had already satisfied that condition. Rejected: squashing, rebasing, cherry-picking or changing accepted code; treating branch CI as proof of integration CI; deleting the branch before green integration CI; and recording the post-merge documentation commit's own CI run id inside the repository, which would create a self-referential loop. The accepted residual observations (concurrent ownership mutation, physical QR scan, manual UI validation, human source-code review, disk-level download observation, public caching and rate limiting, deployment) were deliberately not resolved.

**Validation evidence.** Accepted branch CI run `36141115620` succeeded on exact tip `033680a67155e0f0324937904bb7ca3518fd5548`. Merge commit `57ade8315ffb04ed44c0e445eca93619735a55f4` has exactly two parents and its CI run `36146706397` succeeded with `head_sha` equal to that merge commit (lint, typecheck, build, 128 integration tests against a fresh PostgreSQL 18.6 service, 33 Playwright tests and dependency audit). The final-main CI run after the documentation reconciliation is reported in the Gate 8 completion report rather than stored here.

**Not validated / deferred.** Cristian's manual UI validation, human source-code review, a physical phone QR scan, deployment/VPS behavior, public caching and rate limiting remain outstanding. The ownership-transfer race is not reachable because no ownership-transfer path exists in the repository.

**Result.** Stage 4.4 is merged into `main`: back-office Product Passports for both roles, Admin-only complete immutable version history with exact-version retained-asset retrieval, the Product-table publication columns and actions, and the full Passport-versioning bonus for the currently supported lifecycle. Stage 4.5 has not been started.

## 2026-09-25 — Stage 4.5 Passport PDF export

**Scope.** Implement the Stage 4.5 milestone only, on `build/passport-pdf` cut from exact `main` `cdaaad22843e1f4f4207ab50a91b1f4b2e6db130`: a server-side PDF export of the current immutable published Passport, the anonymous `GET /passport/:uuid/pdf` route, the `pdfDownloadUrl` contract on the public projection and the back-office list, Download PDF actions on the public page and Product Passports, and the independent PDF test evidence. Explicitly out of scope and not started: Stage 4.6 acceptance, historical PDF routes, PDF attachments for supporting files, Redis or any PDF cache, analytics, audit writes, schema changes and deployment. `main` was not modified and no Stage 4.6 branch was created.

**AI participation.** Pi implemented the slice end to end as the primary agent on the `opencode-go/deepseek-v4.1-flash` route: repository reconnaissance, dependency verification, the renderer, the route, the frontend actions, the tests, the review fixes, the documentation reconciliation and the commits. One read-only Pi `review` subagent (ephemeral, `openai-codex/gpt-5.6-sol`) independently reviewed the complete `main...HEAD` diff; its findings and the fixes are recorded below. No other Pi subagent was used and Astra was not used. The Cristian-facing scope for this round came from the external ChatGPT / GPT-5.6 Sol orchestration layer, which performed scope and research orchestration only: it did not author any repository file, did not run any local repository command, and is AI participation, not human source review.

**Human review.** Decision/scope review: Cristian approved the Stage 4.5 scope, the locked constraints and the review focus areas by supplying this milestone's instruction. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. No part of this round is human source-code review.

**Dependency research.** Verified against the registry metadata and the packages pnpm actually resolved, then exercised before coding: `pdfkit` 0.20.2 (MIT) ships a Node ESM build exporting a named `PDFDocument`, embeds JPEG/PNG and streams; `@types/pdfkit` 0.17.6 (MIT) is required because PDFKit ships no declarations, and the default import is the smallest compatible type form because the declaration file models the module with `export =`; `pdfjs-dist` 6.3.289 (Apache-2.0) is a dev-only independent parser with bundled types and works in Node for text, annotation and embedded-image extraction. The planned `@fontsource/noto-sans` 5.3.0 (OFL-1.1) was rejected with evidence: fontkit coverage checks showed its `latin` subset lacks `Ł`/`ź` and its `latin-ext` subset lacks basic ASCII, and PDFKit has no automatic font fallback, so no single file there can render realistic mixed European text. It was replaced by the full Noto Sans regular/bold files in `@expo-google-fonts/noto-sans` 0.4.2 (package MIT, font files OFL-1.1). No font is fetched at runtime.

**Decisions / work performed.** No unresolved product decision was silently selected; the milestone implements the recorded current-version-only, stable-UUID/QR and back-office-only-history decisions, and the technical choices are recorded in section B11 of `docs/IMPLEMENTATION-DECISIONS.md`. Work performed: a pure A4 renderer (`passport-pdf-document.ts`) split into document creation and drawing; an orchestration service (`passport-pdf.service.ts`) that resolves one active version, validates the stored QR, converts WebP in memory with `sharp` and bounds image dimensions without mutating stored bytes; a streaming helper (`passport-pdf-stream.ts`) that pipes before drawing and aborts on failure; the `GET /passport/:uuid/pdf` route; `pdfDownloadUrl` on the public view and the back-office list; Download PDF on the public Passport page and Product Passports for both roles; and 12 integration tests plus 5 streaming unit tests, with `pdfjs-dist` inspecting the output independently of PDFKit.

**Findings / rejected approaches.** The independent review confirmed six major and two minor defects, all fixed in commit `df15fc7` with regressions: (1) a corrupt stored QR produced a successful PDF with a placeholder — the artifact is now validated in preflight and the export fails with the controlled `PASSPORT_UNAVAILABLE`; (2) the flow origin was reset only after a section heading, so headings and paragraphs after the materials table were clipped, and key/value columns were vertically staggered — the origin now resets before the heading and rows share one baseline; (3) gallery captions moved the second image in a row and were truncated by `lineBreak: false` — rows now share one origin, captions wrap, and the row advances by the tallest caption; (4) certification and document entries stated availability without linking — they now link to the canonical public page; (5) the view, QR and retained images were resolved through separate active-version lookups, so a concurrent republish could mix two versions into one export — all three now come from one resolution; (6) a stream error ended the response cleanly, presenting a truncated body as a complete download — the response is now destroyed instead; (7) content was queued before piping — the document is now piped before drawing; (8) preflight failures lacked `no-store` — the header is now route-level. The review's suggestion to company-scope the batched asset read was recorded rather than changed: the retention rule is the authority on the public surface and matches the existing `findAcceptedContentById` boundary, and publication validation prevents a foreign retained reference. Rejected: a second QR generation path, HTML/Chromium rendering, a table library, embedding supporting PDFs, a PDF cache, an internal HTTP self-fetch, and any historical PDF route.

**Validation evidence.** Locally on `build/passport-pdf`: `pnpm check` passes (110 files linted with no diagnostics, both workspaces typecheck and build, 9 integration suites with 145 of 145 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 38 of 38 against the built stack; `pnpm audit` reports no known vulnerabilities. The integration suite proves, with the independent parser, the response headers and signature, the anonymous visibility parity and safe 404s, full section headings and link annotations, Unicode text, multi-page output with a repeated material header, JPEG/PNG/WebP embedding, the corrupt-QR refusal, the v1 → draft edit → v1 PDF → republish → v2 PDF isolation chain, the stored-QR sentinel proof, and the absence of analytics and audit writes. Schemas and migrations are unchanged; the only dependency changes are the four packages listed above. The branch was pushed and CI run `36154972651` passed on `94d36de`.

**Not validated / deferred.** Human source-code review and Cristian's manual UI validation are deferred. No physical QR scan, no deployment/VPS check, no load or penetration testing. The concurrent-republish interleaving is fixed by construction but not exercised by a deterministic race test, and peak concurrent exports and real client-disconnect behavior were not measured. The generated PDF was inspected programmatically and in the browser; no human has read a printed or on-screen copy.

**Result.** Stage 4.5 is implemented, locally validated and merged into `main`; see the Gate 8 round below. A reviewer can download an A4 PDF of the current published Passport from the public page or the back office; it is generated server-side from the immutable snapshot, embeds the stored QR artifact and the retained images, reflects a republish immediately, and never exposes a draft, a historical version or a regenerated QR.

## 2026-09-25 — Stage 4.5 integration (Gate 8)

**Scope.** Integrate Cristian's accepted `build/passport-pdf` tip `94d36de1863d0b460dc6a39f35b7aa24959a2488` into `main` without changing accepted application behavior. Reconcile only current-state prose made false by the merge and by the satisfied branch-CI condition. No Stage 4.6 work, no analytics or Redis, no schema, migration, dependency or lockfile change, and no branch deletion before green integration CI.

**AI participation.** Pi performed the pre-merge truth check, the merge, the CI gate, the documentation reconciliation and the branch cleanup on the `opencode-go/deepseek-v4.1-flash` route. No subagent was used in this Gate 8 round; the independent review recorded in the Stage 4.5 implementation round already ran against the accepted diff. No external model participated in this round.

**Human review.** Decision/scope review: Cristian explicitly approved the exact tip for a `--no-ff` merge and specified the preserve list and deferred observations. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. Milestone acceptance is a decision, not human source-code review.

**Decisions / work performed.** No product or architecture decision changed. Fetched origin and required `origin/main` at `cdaaad22843e1f4f4207ab50a91b1f4b2e6db130`, `origin/build/passport-pdf` at the accepted tip, a clean worktree, zero unexpected divergence (0 behind / 3 ahead) and exactly the three expected Stage 4.5 commits. Required CI run `36154972651` to have completed successfully with `head_sha` equal to the accepted tip. Switched to synchronized `main`, merged with `git merge --no-ff build/passport-pdf` as `1867a670987a873988153b247e07d1e3c7e7f4a9` (parents: previous main and accepted tip), pushed `main`, and required CI run `36156162845` to complete successfully with `head_sha` equal to the merge commit. Then reconciled the present-state statements in `AGENTS.md`, `README.md`, the roadmap, section B11 and this log, and replaced the outstanding-branch-CI sentence with the recorded run ids. The accepted application behavior was not altered by this round.

**Findings / rejected approaches.** Four current-state statements still described Stage 4.5 as on an awaiting-acceptance branch, and the Stage 4.5 round still said its final branch CI was outstanding although run `36154972651` had satisfied it. Rejected: squashing, rebasing, cherry-picking or changing accepted code; treating branch CI as proof of integration CI; deleting the branch before green integration CI; and storing the post-merge documentation commit's own CI run id inside the repository, which would create a self-referential loop. The accepted limitations (physical QR scan, manual UI validation, human source-code review, deployment, measured peak concurrency, a deterministic republish race test and real client-disconnect behavior) were deliberately not resolved, and the accepted asset-query residual was left unchanged as recorded.

**Validation evidence.** Accepted branch CI run `36154972651` succeeded on exact tip `94d36de1863d0b460dc6a39f35b7aa24959a2488`. Merge commit `1867a670987a873988153b247e07d1e3c7e7f4a9` has exactly two parents and its CI run `36156162845` succeeded with `head_sha` equal to that merge commit (lint, typecheck, build, 145 integration tests against a fresh PostgreSQL 18.6 service, 38 Playwright tests and dependency audit). The final-main CI run after the documentation reconciliation is reported in the Gate 8 completion report rather than stored here.

**Not validated / deferred.** Cristian's manual UI validation, human source-code review, a physical phone QR scan, deployment/VPS behavior, measured peak concurrent PDF exports, a deterministic concurrent-republish race test and real client-disconnect behavior remain outstanding.

**Result.** Stage 4.5 is merged into `main`: the anonymous current-version Passport PDF export, its stored-QR reuse and current-version image authorization, its streaming and header contract, and the public and back-office Download PDF actions. Stage 4.6 has not been started.

## 2026-09-25 — Stage 4.6 full Stage 4 acceptance and regression

**Scope.** Final Stage 4 milestone, on `build/stage4-acceptance` cut from exact `main` `e3ea1c8ba8a26b6d9d5d1ddc310f36fa14189a39`. This is an acceptance, integration and regression pass, not a feature milestone: map what the existing suites already prove, add one cross-milestone lifecycle journey and the missing cross-milestone regressions, fix any confirmed defect, produce one explicit evidence map, and reconcile documentation. Explicitly out of scope and not started: Stage 5 analytics/Redis, Stage 6 delete/withdraw/Users/Settings, Stage 7 packaging/deployment, and any new Stage 4 product feature. `main` was not modified and no Stage 5 branch was created.

**AI participation.** Pi implemented the pass end to end as the primary agent on the `opencode-go/deepseek-v4.1-flash` route: repository reconnaissance, the coverage map and gap analysis, the acceptance journey, the shared PDF-parser extraction and parity/isolation tests, the review fixes, the documentation reconciliation and the commits. One read-only Pi `review` subagent (ephemeral, `openai-codex/gpt-5.6-sol`) reviewed the complete `main...HEAD` diff and the Stage 4 contracts as a whole; its findings are recorded below. No other Pi subagent was used and Astra was not used. The Cristian-facing scope for this round came from the external ChatGPT / GPT-5.6 Sol orchestration layer, which generated and reviewed the acceptance scope only: it did not author any repository file, did not run any local repository command, and is AI participation, not human review.

**Human review.** Decision/scope review: Cristian approved the Stage 4.6 acceptance scope and its manual-evidence boundary by supplying this milestone's instruction. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. No part of this round is human source-code review, and the physical handset QR scan was not performed.

**Decisions / work performed.** No product or architecture decision changed; the pass found **no Stage 4 production regression**. Work performed: mapped every existing integration and browser suite against the Stage 4 contract and identified the cross-milestone gaps; added `e2e/stage4-acceptance.spec.ts`, one deterministic journey proving `A → v1 → unsaved B (Preview only) → saved B (still A publicly) → republish v2 (same Passport/UUID/QR) → draft C (private)`, with database, PDF-parser, public-page, back-office and asset-route evidence; extracted the independent `pdfjs-dist` parser into `apps/api/test/pdf-inspect.ts` and reused it from the journey; added a PDF/public projection parity test and a PDF isolation test after a further draft edit; added reusable solid-colour image fixtures; and wrote `docs/STAGE4-ACCEPTANCE.md`, the evidence map that names the proof for every Stage 4 invariant and keeps the manual items explicitly unvalidated. No dependency, schema or migration change was made.

**Findings / rejected approaches.** The independent review confirmed no Stage 4 production regression and three evidence-map problems, all fixed in commit `fe96d39`: (1) the matrix marked some claims as automated PASS although the cited tests did not assert them — the component-sharing row now distinguishes rendered parity from the source-reviewed single component, the no-public-historical-route row is now backed by an executable check over candidate anonymous routes and the authenticated path, and the bounded-work row is split into executable pagination caps and a source-reviewed note; (2) the journey assumed globally empty analytics tables in an e2e database that accumulates rows across runs — it now compares against the baseline captured at the start of the journey; (3) the matrix said "byte-for-byte unchanged" while the test compares parsed snapshots — the wording now says structural equality. The review's suggestion to assert section sizes before the parity loops was also applied, so an omitted section cannot pass vacuously. Test-harness defects found and fixed during the pass (not product defects): a `max(uuid)`/`max(bytea)` SQL error in the journey's database helper, a fixed fixture name colliding with rows from earlier runs, a second sign-in on an already-authenticated context (the login page redirects a restored session), and a missing `await` on `context.cookies()`. Rejected: duplicating the existing authoritative integration suites into the browser layer (the matrix references them instead), moving `pdfjs-dist` or `jsqr` to the root just to import them from e2e (the existing API-workspace helper import pattern was reused), and implementing any Stage 5/6/7 behavior discovered as a gap.

**Validation evidence.** Locally on `build/stage4-acceptance`: `pnpm check` passes (112 files linted with no diagnostics, both workspaces typecheck and build, 9 integration suites with 146 of 146 tests against PostgreSQL 18.6); `pnpm test:e2e` passes 49 of 49 against the built stack, including the 11-case Stage 4 acceptance journey; `pnpm audit` reports no known vulnerabilities. Dependencies, Prisma schema and migrations are unchanged. The acceptance matrix records, per invariant, the owning milestone, the evidence location, the result and whether manual evidence is still required. The branch was pushed and CI run `36162682815` passed on `8fcf08e`.

**Not validated / deferred.** The physical handset QR scan is **NOT MANUALLY VALIDATED** — the automated chain (stored bytes → independent decode → configured target → 302 → canonical page) is proven, and automated decoding is not presented as a substitute. Cristian's manual UI walkthrough, human source-code review, a printed/on-screen PDF review and deployment/VPS validation are outstanding. Peak concurrent PDF exports, a deterministic concurrent-republish race test and real client-disconnect behavior remain unmeasured, and no load or penetration testing was performed.

**Result.** Stage 4 automated acceptance and regression are complete: the five Stage 4 milestones compose as one subsystem across publication, the public API and assets, the public UI and Preview, the back-office Passports and version history, and the PDF export; the stable UUID and QR survive a republish while the current version moves; draft edits never reach a public surface; historical versions and their retained files stay immutable and back-office-only; and no analytics or audit rows are written. The milestone is merged into `main`; see the Gate 8 round below. Stage 5 has not been started.

## 2026-09-25 — Stage 4.6 integration (Gate 8)

**Scope.** Integrate Cristian's accepted `build/stage4-acceptance` tip `8fcf08e1849fa849a2b76a217f2db91ee96f181e` into `main` without changing production behavior. Reconcile only current-state prose made false by the merge and by the satisfied branch-CI condition. No Stage 5 analytics/Redis, no Stage 6 lifecycle/Users/Settings, no Stage 7 packaging/deployment, no schema, migration, dependency or lockfile change, and no branch deletion before green merge-commit CI.

**AI participation.** Pi performed the pre-merge truth check, the merge, the CI gate, the documentation reconciliation and the branch cleanup on the `opencode-go/deepseek-v4.1-flash` route. No subagent was used in this Gate 8 round; the independent review recorded in the Stage 4.6 round already ran against the accepted diff. No external model participated in this round.

**Human review.** Decision/scope review: Cristian explicitly approved the exact tip for a `--no-ff` merge and specified the preserve list and the manual-evidence boundary. Manual validation: not performed by Cristian. Source-code review: still deferred until the complete project is built. Milestone acceptance is a decision, not human source-code review.

**Decisions / work performed.** No product or architecture decision changed, and Cristian's Gate 7 conclusion is recorded as accepted: Stage 4 automated acceptance/regression passes, no Stage 4 production defect was found, test-harness defects and evidence-map overclaims were corrected, and the physical handset scan, manual UI validation and human source-code review remain outstanding. Fetched origin and required `origin/main` at `e3ea1c8ba8a26b6d9d5d1ddc310f36fa14189a39`, `origin/build/stage4-acceptance` at the accepted tip, a clean worktree, zero unexpected divergence (0 behind / 3 ahead), exactly the three expected Stage 4.6 commits, and a diff limited to tests, test helpers and documentation with no production runtime source change. Required CI run `36162682815` to have completed successfully with `head_sha` equal to the accepted tip. Switched to synchronized `main`, merged with `git merge --no-ff build/stage4-acceptance` as `b734a5e5e5385da7a25c718107841d437439fabd` (parents: previous main and accepted tip), pushed `main`, and required CI run `36163976849` to complete successfully with `head_sha` equal to the merge commit. Then reconciled the present-state statements in `AGENTS.md`, `README.md`, the roadmap and this log. The acceptance evidence map was left intact, including the executable/source-reviewed/manual distinction.

**Findings / rejected approaches.** Four current-state statements still described Stage 4.6 as awaiting acceptance, and the Stage 4.6 round still said its branch CI was outstanding although run `36162682815` had satisfied it. Rejected: squashing, rebasing, cherry-picking or changing accepted code; treating branch CI as proof of merge CI; deleting the branch before green merge CI; collapsing the acceptance map's source-reviewed rows into automated PASS claims; and storing the post-merge documentation commit's own CI run id inside the repository, which would create a self-referential loop. The manual evidence boundary was preserved: the physical handset scan remains **NOT MANUALLY VALIDATED**, the manual UI walkthrough **NOT PERFORMED**, human source-code review **DEFERRED**, and the printed-PDF review and deployment validation outstanding.

**Validation evidence.** Accepted branch CI run `36162682815` succeeded on exact tip `8fcf08e1849fa849a2b76a217f2db91ee96f181e`. Merge commit `b734a5e5e5385da7a25c718107841d437439fabd` has exactly two parents and its CI run `36163976849` succeeded with `head_sha` equal to that merge commit (lint, typecheck, build, 146 integration tests against a fresh PostgreSQL 18.6 service, 49 Playwright tests and dependency audit). The final-main CI run after the documentation reconciliation is reported in the Gate 8 completion report rather than stored here.

**Not validated / deferred.** Cristian's manual UI validation, human source-code review, a physical phone QR scan, a printed/on-screen PDF review, deployment/VPS validation, measured peak concurrent PDF exports, a deterministic concurrent-republish race test and real client-disconnect behavior remain outstanding.

**Result.** Stage 4.6 is merged into `main`: Stage 4 automated acceptance and regression are complete, `docs/STAGE4-ACCEPTANCE.md` is the evidence map, and Stages 4.1–4.6 are integrated. Stage 5 has not been started.

## 2026-09-25 — Stage 5: analytics, dashboard, Total Views and the Redis cache bonus

**Scope.** Implement the assessment analytics and dashboard requirements and the Redis caching bonus on `build/analytics-dashboard-redis`, cut from `main` at `aacc56455e3a634ab15c9794c1fc8d2d9ece2343`. In scope: `QR_HIT` ingestion on the stable resolver, one idempotent `VIEW` per visible public navigation, transactional daily aggregates, `GET /dashboard`, `GET /analytics`, a measured Product `Total Views`, the dashboard and analytics UI, and a disposable Redis cache of immutable published content. Out of scope: product delete/withdraw, audit logs, Users/Settings, Docker/Compose, deployment and any schema or migration change.

**AI participation.** Pi was the primary implementation agent on `opencode-go/deepseek-v4.1-flash`, owning repository inspection, dependency verification, implementation, tests, review fixes, documentation reconciliation, commits and this report. One read-only `review` subagent (ephemeral, `openai-codex/gpt-5.6-sol`) reviewed the complete `main...HEAD` diff against a 23-point risk list; its findings are recorded below and were fixed with regression tests. No other Pi subagent was used. The external orchestration layer **ChatGPT / GPT-5.6 Sol** produced the Cristian-facing Stage 5 scope and the dependency research: it inspected repository state through the connected GitHub source, researched current public information for the Redis client/server and Bowser candidates, and produced the approved scope and decision list. It did not author any repository file, did not execute any local repository command, and did not run any test; it is AI participation, not human review.

**Human review.** Decision/scope review: Cristian settled the previously open analytics and cache decisions by supplying the Stage 5 instruction, which is recorded in B12 of the decisions record. Manual validation: not performed. Source-code review: still deferred until the complete project is built. A milestone instruction is a scope decision, not human source-code review.

**Decisions / work performed.** No schema change and no migration: `AnalyticsEvent`, `AnalyticsDaily`, the event kinds, `CountrySource`, the indexes and the `VIEW` event-key CHECK already existed. Two runtime dependencies were verified before installing — `@redis/client` 6.2.1 (MIT, Node ≥20, built-in types, one runtime dependency) and `bowser` 2.14.1 (MIT, built-in types) — and the Redis OSS image `redis:8.10.2` was pulled and exercised locally. Added a focused `analytics` module (ingestion, server-authoritative metadata, daily aggregate, dashboard and reporting queries, role-shaped projections, a bounded non-Redis ingestion limiter) and a narrow `cache` module that owns the only Redis client in the codebase. Instrumented `GET /q/:uuid` with `HEAD`/prefetch exclusion and a bounded best-effort write, added the anonymous `POST /passport/:uuid/view`, added `totalViews` to the product list from one bounded aggregate, and built the dashboard, analytics, navigation and public view-tracker UI. The cache stores only the interpreted content of an already-selected immutable version, keyed by passport, version and schema, bound by digest to the exact snapshot, with a bounded TTL and full fallback on absence, outage, corruption or mismatch.

**Findings / rejected approaches.** The independent review confirmed the core invariants by inspection and raised four defects, all fixed: (1) the QR redirect awaited its analytics write, now bounded by a short budget so a slow insert cannot delay a valid scan; (2) the view tracker generated its event key inside the effect, so a repeated effect could mint a second key — it now creates one key per mounted navigation; (3) a shape-valid cached payload from a different version could be served, now impossible because the entry is bound by digest to the snapshot PostgreSQL selected; (4) a mutation's view total was read after its transaction committed, so a failed read could answer a committed save with an error — the total is now read inside the same transaction, and create proves its own zero without a query. Review suggestions were also applied: a concurrent same-key idempotency test, a wrong-version cache payload test, a stale-schema test, an oversized-payload bound before parsing, and daily-aggregate assertions in both directions. Rejected: a Redis-backed rate limiter (a cache outage must not disable ingestion protection), a scheduled retention job (Cristian's decision records it as future hardening), inferring country from IP/language/locale, hiding the raw address in the browser, and caching anything other than immutable content.

**Validation evidence.** Locally on `build/analytics-dashboard-redis`: `pnpm check` passes (130 files linted with no diagnostics, both workspaces typecheck and build, 11 integration suites with 181 of 181 tests against PostgreSQL 18.6, including the cache suite against a real Redis 8.10.2); `pnpm test:e2e` passes 59 of 59 against the built stack; `pnpm audit` reports no known vulnerabilities. Dependencies, Prisma schema and migrations are unchanged. The Stage 4.6 acceptance journey was reconciled to the current per-surface truth and still passes end to end. Branch-HEAD CI evidence is recorded in the completion report once the branch is pushed; no CI result is claimed before it exists.

**Not validated / deferred.** Cristian's manual UI validation, human source-code review, a physical phone QR scan, a printed PDF review and deployment/VPS validation remain outstanding. A stalled-but-open Redis socket, a genuinely concurrent publication race with a warm cache, peak concurrent PDF exports and real client-disconnect behavior are not measured. The raw-retention gap is deliberate and documented.

**Result.** Stage 5 is implemented and locally validated on `build/analytics-dashboard-redis`; it awaits Cristian's decision and has not been merged. Stage 6 has not been started.

## 2026-09-25 — Stage 5 Gate 7 correction: cache integrity binding

**Scope.** A narrow correctness correction on the existing `build/analytics-dashboard-redis` branch, at Cristian's Gate 7 review. The Stage 5 cache envelope bound only the PostgreSQL snapshot, so shape-valid cached content could be modified inside Redis and still be served. Fix that binding, replace the test that relied on the flaw, and leave Stage 5 analytics semantics untouched. No merge, no Stage 6.

**AI participation.** Pi remained the implementation and execution agent on `opencode-go/deepseek-v4.1-flash`. The mismatch was identified by the external Cristian-facing review layer **ChatGPT / GPT-5.6 Sol**, which inspected the cache service, the real-Redis tests and the recorded Stage 5 contracts; it did not author repository files and did not execute local repository commands, and it is AI review/orchestration rather than human source review. Two read-only Pi `review` subagent passes were run over the correction: the first found the stalled-socket defect described below, and the second re-reviewed the final state on the `opencode-go/deepseek-v4.1-flash` route, confirming the integrity check and the timeout bound and raising only the evidence and wording gaps recorded here.

**Human review.** Decision/scope review: Cristian's Gate 7 review defined this correction. Manual validation: not performed. Source-code review: still deferred until the complete project is built.

**Decisions / work performed.** The envelope's integrity value is now an unkeyed SHA-256 checksum over a domain separator plus **both** the serialized snapshot PostgreSQL selected for that version **and** the serialized interpreted content being returned, and the cache schema version was bumped to 2 so entries from the previous envelope are never selected. `read` recomputes the checksum over the selected snapshot and the parsed content; a mismatch discards the entry, interprets the stored snapshot, returns the authoritative content and best-effort repopulates the cache.

Review then found a second, pre-existing defect in the same area: the per-command `timeout` option in `@redis/client` 6.2.1 removes its listener as soon as a command is written, so it bounds queueing rather than the wait for a reply, and a connected-but-silent Redis could hold a public read open. A `socketTimeout` was added to the socket options, which is the mechanism that actually bounds a stalled server, and a real-Redis test now proves the fallback by pausing the server with `CLIENT PAUSE ... ALL`. No dependency was added and no schema or migration changed.

The documentation was corrected to say precisely what the integrity value covers and what it does not: it detects corruption, inconsistency and transplantation, and it is not authentication against an actor who controls Redis, which is out of scope for this assessment.

**Findings / rejected approaches.** The unsafe proof was removed rather than patched: the previous "cache hit" test mutated cached content and asserted the API served the mutation, which contradicted the correctness contract. A hit is now proved through the cache port itself — the entry is read back from real Redis through `PassportContentCache.read()` and validated against the snapshot PostgreSQL holds — and a new regression asserts that mutating only the cached content (leaving the checksum untouched) returns the PostgreSQL content, not the mutation, and that the bad entry is repaired. An oversized-entry test was added. The stalled-socket defect above was fixed with a regression that fails without it. Two further review observations were recorded as non-blocking rather than fixed, because neither can serve wrong content: (1) a snapshot that omits optional keys makes `buildPassportContent` emit `undefined` fields, which `JSON.stringify` drops, so the stored entry fails shape validation and that passport never benefits from the cache — a lost optimisation, never wrong content, and the root cause is pre-existing Stage 4 interpretation code this round did not touch; (2) the API-level cache hit now has an explicit oracle (a hit leaves the entry's TTL counting down while a miss rewrites it), because the removed mutation-based proof was the only thing exercising that branch. Rejected: keeping the mutation-based hit proof, treating an unkeyed checksum as tamper-proof, adding a hashing or canonicalization dependency, and introducing a debug or cache-statistics endpoint to observe the cache.

**Tracker observation (non-blocking, no production change).** `apps/web/app/passport/view-tracker.tsx` holds a mount-scoped event key and a mount-scoped "recorded" ref, so a client-side navigation that preserved the same instance between two public Passport identities would miss the second view. The reachable-navigation review found no such path in the current application: the public page contains no link to another Passport, the only `next/link` to a public Passport is on the Analytics page (a different route segment, so the page mounts fresh), and the Products and Product Passports actions open the absolute public URL as a full document load in a new tab. Recorded as a non-blocking observation; if an in-page link between Passports is ever added, the tracker should be keyed by identity and version.

**Validation evidence.** Locally on `build/analytics-dashboard-redis` after the correction: `pnpm check` passes (131 files linted with no diagnostics, both workspaces typecheck and build, 12 suites with 185 of 185 tests against PostgreSQL 18.6; eleven are integration suites and one is the database-less cache-port spec, and the cache suite runs against a real Redis 8.10.2); `pnpm test:e2e` passes 59 of 59 against the built stack; `pnpm audit` reports no known vulnerabilities. The earlier exact-HEAD CI run `36175767390` on `cf974ca` passed before this correction and is now historical evidence only; the corrected HEAD requires its own run, recorded in the completion report.

**Not validated / deferred.** Unchanged from the Stage 5 round: Cristian's manual UI validation, human source-code review, a physical phone QR scan, a printed PDF review and deployment validation remain outstanding. Hostile-Redis authenticity remains explicitly out of scope: the checksum is an unkeyed corruption and consistency check, not authentication against an actor who controls the cache.

**Result.** The cache-integrity mismatch is fixed with a regression that would have failed before it. The correction is on the branch and unmerged; Stage 6 has not been started.
