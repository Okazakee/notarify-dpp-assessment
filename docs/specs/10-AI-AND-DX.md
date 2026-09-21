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
