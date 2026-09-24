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
