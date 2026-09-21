# AI usage, Pi and development tooling

## Purpose

The employer permits AI assistance but expects Cristian to understand, explain and maintain the submitted work independently. Documentation supports that expectation; it cannot substitute for actual understanding.

Use **Pi 0.87.0** as the coding-agent harness. Its default implementation model is `opencode-go/deepseek-v4.1-flash`; its architecture and review route is `openai-codex/gpt-5.6-sol`. These are harness-reported model labels, not independently verified provider IDs. Record the exact configured model and route for each round in the actual work log.

Pi is development tooling only. The application builds, tests and runs without it.

## Proposed division of work

| Work | Default model role |
| --- | --- |
| Architecture, schema/lifecycle changes, auth/concurrency review | `openai-codex/gpt-5.6-sol` (Pi `architect` and `review` agents) |
| Bounded implementation tasks, straightforward UI, fixtures, documentation drafts | `opencode-go/deepseek-v4.1-flash` (Pi default) |
| Risky changes | Pi `review` agent against spec and tests, followed by Cristian's review |
| Ambiguous failures | Whichever model has the relevant context; tool evidence decides |

This routing is a workflow proposal, not a benchmark-based claim. Use one task at a time unless parallel work is explicitly chosen and ownership is clear. A second model's agreement is not independent proof of correctness.

Pi's subagents are `explore` (repository reconnaissance), `architect` (blast-radius and invariant analysis), `research` (external documentation and upstream behavior), `review` (independent correctness, regression, security and trust-boundary review) and `verify` (canonical-check verification).

## Repository guidance

Create `AGENTS.md` when the repository is initialized. It should point to the specs, list exact supported commands, state module boundaries, identify test requirements and require truthful updates to the AI log. It should forbid inventing test results, silently changing requirements, exposing secrets to prompts, or rewriting deployed migrations.

Keep tasks narrow: goal, linked requirement/spec, affected area, required checks and exit condition. Allow agents to suggest spec changes, but record a decision before changing a shared contract. Every pull request explains why the change exists, its behavior, its checks and limitations.

daisyUI has an [official skill](https://daisyui.com/docs/skill/). Review and pin the selected skill source in the development setup; verify Pi's actual skill discovery mechanism before installation. No MCP service is necessary just because an agent can use tools. Avoid adding speculative binaries or assuming flags from memory.

## CLI toolbox

| Tool | Purpose |
| --- | --- |
| git, gh | Version control, GitHub issues/PRs and CI inspection |
| rg, fd or find, jq | Fast source navigation and structured JSON inspection |
| curl | API smoke checks and header inspection |
| Node, pnpm | Pinned JS runtime and workspace scripts |
| Docker with Compose | Reproducible application and test services |
| Prisma CLI through pinned project scripts | Schema validation, migrations, generation and seed |
| psql, pg_dump, pg_restore | Database inspection and restore rehearsal |
| Playwright CLI through project scripts | Browser tests, screenshots, traces |
| Gitleaks, Trivy, ZAP container | Repeatable security checks |

Use versioned project scripts as the stable agent interface: `check`, `test:unit`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed`, `openapi:export`, `security:check`, `compose:up`. These names are proposed, not commands available today. Keep output machine-readable where useful and preserve exit codes.

Do not add Kubernetes, Terraform, a bespoke MCP server or an elaborate task orchestrator for this single-VPS assessment. GitHub issues can map to roadmap stages; small PRs and a traceable release are enough.

## Documentation layout during development

| Document | What it records |
| --- | --- |
| Topic specs | Current intended behavior and acceptance criteria |
| Decision log | Choice, alternatives, reasoning, cost and date |
| AI-USAGE.md | Concise methods/tools summary and limitations for reviewer |
| AI-WORKLOG.md | Per meaningful task: actual contribution, review, changes and evidence |
| TEST-REPORT.md | Commands/results and target commit, including failures not yet resolved |
| SECURITY-REVIEW.md | Findings, triage, fixes and remaining deployment risks |

Do not create a separate document for every tiny function. Each rule has one owner. Keep final reviewer documents short and link to supporting evidence.

Suggested worklog fields: date; issue/commit; exact model and harness; task; generated/modified areas; suggestions rejected; human review actually performed; checks actually run; unresolved questions. Avoid claiming precise percentages of AI-written code or that every line was manually reviewed unless that is demonstrably true. Full chat transcripts are optional and should be checked for secrets and irrelevant personal data.

This planning pack itself is AI-assisted research and design, informed by Cristian's stated preferences and the supplied assessment. No implementation or execution evidence exists yet. Future documentation must not retroactively describe these planned tests as passed tests.

## Understanding checks

Before considering a scope complete, Cristian should be able to explain its main behavior and modify a representative part:

1. Trace login, expired access token, refresh rotation, reuse detection and logout.
2. Explain where role permissions are enforced and why hiding a button is insufficient.
3. Trace a draft through validation, snapshot creation and public rendering.
4. Explain why versions and referenced files survive edits/deletion.
5. Explain which count represents a QR-link hit versus a page view and where inaccuracies remain.
6. Show how a malformed file or unauthorized asset request is rejected.
7. Run a focused test, interpret a failure and make a small change with understanding.
8. Explain a dependency choice, one rejected alternative and one known limitation.

If a critical section cannot be explained, simplify it or work through it before submission. This is a practical completion gate, not wording to conceal AI use.

## Adopted execution workflow (2026-09-21)

The planning sections above describe the intended division of work. This section records the **adopted** execution contract actually used from the Product Draft milestone onward. It does not replace the planning text; it supersedes it as the current process.

Every meaningful implementation or verification pass runs these gates in order. The concise operational version agents read first lives in `AGENTS.md`.

### Gate 0 — establish repository truth

Read `AGENTS.md`; inspect branch, HEAD and working tree; read the owning specs for the requested slice and the relevant recorded decisions; read the current AI worklog; identify stale present-state documentation; identify any unresolved decision whose deadline this slice reaches. Do not implement from stale assumptions. If `AGENTS.md` contradicts the repository, correct it before feature work or explicitly include the correction in the pass.

### Gate 1 — scope and decision gate

Before implementing, establish: the exact goal; explicitly in-scope and out-of-scope behaviour; shared contracts affected; unresolved decisions this slice requires; required tests and evidence; the exit condition. **No unresolved material product, security or architecture decision may be silently selected.** If such a decision reaches its implementation deadline, present the options and stop for Cristian's decision unless his prompt already selects one, and record the chosen result before implementing behaviour that depends on it. An earlier AI recommendation is not human approval, and scope is not expanded because an adjacent feature looks convenient.

### Gate 2 — implementation

Implement only the approved slice. Preserve previously proven invariants unless a demonstrated defect requires changing them. Use small logical commits. Do not modify `main` during active milestone work, and do not create the next milestone branch early.

### Gate 3 — focused independent verification

After the primary implementation is internally green, run a focused independent AI verification matched to the risk: auth → session, replay and authorization boundaries; drafts → ownership, concurrency and mass assignment; assets → MIME, signature, immutability and access; publication → transactional snapshot, versioning and idempotency; analytics → semantics, privacy and aggregation boundaries. A second AI agreeing is not proof by itself; findings must be resolved or recorded. Escalate to a more expensive reviewer only when the risk or a finding justifies it, never for ceremony.

### Gate 4 — executable validation

Run the exact applicable quality gates: schema validation where relevant, lint, typecheck, production build, real PostgreSQL integration tests, relevant Playwright tests, seed validation where relevant, dependency audit, and milestone-specific checks. Later passes add security, container and deployment checks once those capabilities exist. Do not create fake scripts for gates that are not implemented, and do not report a check as passed unless it ran against the relevant final commit state.

### Local feedback, `pnpm check` and CI

**`pnpm check`** is the normal local repository contract: `pnpm db:validate`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the API integration suite against real PostgreSQL. Playwright is deliberately excluded so the command stays fast enough to run on every push; CI and milestone Gate 4 run it separately.

**Local feedback.** `pnpm hooks:install` points git at the tracked `.githooks` directory once per clone. `pre-commit` runs `pnpm lint`; `pre-push` runs `pnpm check`. There is no hook framework, no commit-msg hook and no conventional-commit enforcement. **Hooks are local developer feedback only: they can be bypassed with `--no-verify` and are therefore not authoritative evidence.** CI is the clean-environment validation layer.

**CI.** Every pushed milestone or tooling branch receives CI from the single workflow `.github/workflows/ci.yml`, triggered on `main`, `build/**`, `chore/**` and `fix/**`. It uses a real PostgreSQL 18.6 service, a frozen-lockfile install, migrations applied to a fresh database, and then the same commands a developer runs locally: `pnpm check`, `pnpm test:e2e`, `pnpm audit`. There is one workflow, no browser matrix, no coverage threshold, no release automation and no container scanning. Pull requests may trigger it as a convenience, but **CI does not depend on pull requests** and the project does not require them.

**Gate 4 addition.** A meaningful implementation pass is not considered fully validated until applicable local validation passes **and** the final pushed branch HEAD has green CI.

**Gate 8 addition.** After an accepted milestone is merged with `--no-ff` into `main`: push `main`, require CI on the resulting `main` commit to pass, then prove milestone reachability, then delete the completed local and remote milestone branch.

### Gate 5 — end-of-pass repository truthfulness reconciliation (mandatory)

Before declaring a pass complete, re-read and reconcile `AGENTS.md`, README/current-state documentation, `docs/IMPLEMENTATION-DECISIONS.md`, `docs/AI-WORKLOG.md`, and any owning spec whose adopted behaviour changed. `AGENTS.md` must be updated whenever the repository's actual state changed, and must accurately state what is implemented, what is explicitly not, supported commands, current test suites and counts, proven invariants, client/server contracts agents must preserve, unresolved decisions relevant to future work, and known warnings or limitations. This is not optional cleanup: a pass is not complete while `AGENTS.md` describes the state from before it. The worklog policy is: **during an active, unmerged milestone the AI worklog may be reconciled and normalized for accuracy; once a milestone is accepted and merged into `main`, its completed historical evidence becomes stable, and later material corrections must be explicit and traceable through Git rather than silently rewritten.** Historical planning prose is not silently rewritten, adopted behaviour may be clarified with dated notes, and stale present-state claims must not survive merely because they were once true.

### Gate 6 — completion report and stop

Push the working branch; report final HEAD, exact commands and results, decisions made, defects found and fixed, unresolved items, what remains unvalidated, and the recommended next slice. Then stop. Do not automatically merge, create the next branch, start the next milestone, implement the recommended slice, or settle the next slice's unresolved decisions. A successful pass grants permission to report readiness, not permission to advance the project.

### Gate 7 — Cristian decision gate

Cristian reviews the completion report and the core decisions. For this project's current human workflow: decision and scope review happen during development; human manual validation happens only when he actually performs it; source-code review is intentionally deferred until the complete project is built. The next action occurs only after he explicitly decides — another correction pass, milestone acceptance, a milestone merge, an unresolved product decision, or a new scoped branch. Approval is never inferred from silence or from green automated tests.

### Worklog normalization

`docs/AI-WORKLOG.md` is the canonical evidence record. It may be normalized while a milestone is still unmerged — folding corrections into the rounds where they belong so a reader does not replay a chain of later corrections. Once a milestone is accepted into the published history, its evidence is stable, and later material corrections must be explicit and traceable in subsequent commits.

### Gate 8 — milestone merge

This is a solo assessment repository with an explicit gated workflow. **Pull requests are optional tooling, not a project gate.** Direct, verified milestone merges into `main` are the adopted workflow. Earlier planning text in other specs that mentions pull requests is a proposal, and it is superseded here; **no pull request was used for Milestone 1**.

The adopted integration sequence:

1. Create a scoped milestone branch from the current `main` (`build/assets`, `build/publication`, `build/analytics`, …).
2. Complete Gates 0–6 on that branch.
3. Stop at Gate 7.
4. Cristian explicitly accepts or rejects the milestone.
5. On acceptance, Pi performs the merge directly:
   - switch to `main` and fetch/update it;
   - verify no unexpected divergence;
   - `git merge --no-ff <milestone-branch>`;
   - push `main`, then verify local and remote `main` agree;
   - prove the milestone tip is reachable from `main`;
   - delete the completed milestone branch locally and remotely;
   - stop.
6. The next milestone begins only on a new explicit Cristian instruction, with a fresh Gate 0 and Gate 1.

There is no permanent `develop` branch, no mandatory pull request, no chain in which an unmerged milestone branches from another, no automatic creation of the next milestone branch, no squash merge for accepted milestones, and no rebase of accepted milestone history for cosmetic cleanup. A normal `--no-ff` merge is the default because it preserves the meaningful commits inside the milestone and gives the milestone a clear boundary on `main`, without pull-request ceremony that would add no decision authority in a solo repository.

### Decision authority

1. Employer assessment requirements, when available and unambiguous.
2. Recorded project decisions approved by Cristian.
3. Current owning specs and contracts.
4. Approved task scope for the current pass.
5. AI recommendations.

AI recommendations do not become project decisions merely because they were written in a spec, worklog, completion report or previous prompt. For material ambiguity, stop at the relevant gate rather than deciding silently.
