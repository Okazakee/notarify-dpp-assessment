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
