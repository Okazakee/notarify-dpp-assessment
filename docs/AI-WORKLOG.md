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
