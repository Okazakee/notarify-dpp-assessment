# Testing, security review and VPS delivery

## Testing belongs to each scope

Use Jest for Nest unit/integration tests, a small frontend component-test setup if useful, and Playwright for real browser workflows. Use an isolated real PostgreSQL database for integration tests; SQLite or mocked Prisma cannot validate PostgreSQL constraints, transactions and search behavior. Run unit/integration tests throughout development and browser tests against local application processes. Defer full Compose testing until the product is functionally complete, then run release E2E against that composed application. The [Playwright CLI](https://playwright.dev/docs/test-cli) provides repeatable browser-test execution and reports.

| Layer | Tests that matter |
| --- | --- |
| Unit | Permission matrix, publication prerequisites, percentage sums, date rules, public projection, analytics time boundaries |
| Integration | Validation/guards, real constraints, refresh rotation/reuse/revocation, unauthorized file access, search, transactions, concurrent publish and edits |
| End-to-end | Login → complete editor → upload → preview → publish → open public passport → QR/PDF download → analytics → deletion |
| Abuse/regression | Role escalation, IDOR, mass assignment, spoofed proxy headers, unsafe file types, oversized bodies, malformed nested data, CSRF, SQL/XSS payloads |
| Deployment | Empty-DB migration, seed, restart persistence, Redis outage, fresh clone boot, backup/restore |

Write tests against observable behavior, not trivial getters or the exact implementation. A global coverage percentage is not the acceptance criterion. Name the critical invariants and prove them. Do not mock away the guard or transaction that the test claims to validate.

**Update 2026-09-25 (Stage 4.6):** the Stage 4 acceptance evidence map lives in [../STAGE4-ACCEPTANCE.md](../STAGE4-ACCEPTANCE.md). It records one cross-milestone lifecycle journey (`e2e/stage4-acceptance.spec.ts`) plus the focused API and browser suites that prove each invariant, and it keeps the physical handset scan, manual UI walkthrough and human source-code review explicitly unvalidated rather than inferred from automated decoding.

For QR, decode the actual image with an independent decoder. For PDF, parse expected content and visually inspect a long multi-page fixture. For public UI, include keyboard and accessibility checks plus manual inspection; automated accessibility tools alone cannot prove conformance.

## Security review evidence

Proposed tooling: package-manager dependency audit; Gitleaks for repository secrets; Trivy for filesystem/container vulnerabilities and configuration; ZAP baseline against the owned test deployment. Validate exact commands against pinned tool versions. Sources: [Gitleaks](https://github.com/gitleaks/gitleaks), [Trivy](https://trivy.dev/docs/latest/guide/), [ZAP baseline](https://www.zaproxy.org/docs/docker/baseline-scan/).

Automated scans complement review of auth, uploads, publication visibility, raw analytics and proxy configuration. A baseline scan is not a full penetration test. Record tool/version/date/target commit, commands, actual results, triaged findings and remaining limitations. Never report “no vulnerabilities” from an unrun or incomplete scan.

Release gate: no unexplained failing critical-path tests, leaked secrets, known exploitable critical/high findings, anonymous private-data exposure or broken deployment steps. Triage tool noise explicitly; do not suppress findings just to obtain a green badge.

## Packaging and deployment after functional completion

During feature development, use ordinary local backend/frontend processes and an isolated real PostgreSQL test database. Environment variables and service boundaries are planned upfront, but Compose startup, networking, persistence and deployment tests wait until functional completion.

The final Docker Compose configuration contains web, API, PostgreSQL, Redis and a one-shot migration service. Add a small internal gateway if needed to provide the same origin and routing locally and on the VPS. Only the gateway's port is reachable by the existing TLS reverse proxy. The proxy sends `/api/*` to Nest (document prefix stripping), `/q/*` to Nest and page/static routes to Next.

This internal gateway is a proposed packaging convenience; reuse existing proxy location routing if that is already reproducible. Avoid two competing TLS configurations. A local HTTP profile must remain runnable without owning the production domain.

| Concern | Deployment requirement |
| --- | --- |
| Network | DB/Redis/API/web remain on private Compose networks; expose only gateway to the intended proxy |
| TLS / origin | Validated external origin, trusted forwarded headers, secure production cookies |
| Containers | Multi-stage builds, non-root application processes, minimal runtime dependencies |
| Filesystem | Persistent PostgreSQL volume including asset bytes; read-only application root where supported |
| Startup | Health checks and readiness; migration finishes successfully before application rollout |
| Config | `.env.example` with placeholders; startup validation; no secrets in images/repo |
| Resources | Set and measure CPU/memory, upload and log limits on actual VPS capacity |
| Observability | Structured redacted logs, request IDs, safe health endpoints |
| Durability | PostgreSQL backup including asset bytes, restore procedure and test |
| Release | Deploy a known Git commit/image digest; keep previous images and migration compatibility notes |

The VPS specs and current reverse-proxy topology are not yet inspected. The final deployment phase includes that check; do not promise the full stack fits an assumed memory budget. Build images in CI if building on the VPS would create excessive load.

Health endpoints return minimal status, not credentials or full environment diagnostics. Protect interactive Swagger on public hosting while shipping an exported OpenAPI file with the source. Reviewer credentials are shared privately.

Database migrations are forward-only after deployment. A rollback cannot be promised merely because an old image exists: verify schema compatibility or use the documented restore/forward-fix path. Before destructive migrations, preserve a tested backup. Restoring the database must also recover the asset bytes and coherent passport references.

## CI and final deliverables

PR jobs: locked install, formatting/lint, typecheck, unit tests, PostgreSQL integration tests, build, OpenAPI/client drift check, secret/dependency scans. Add container scans once images are built; run Compose E2E after functional completion and on the release candidate. Local application tests continue throughout. Pin third-party CI actions and keep deployment credentials out of untrusted pull-request jobs.

Final repository includes source for backend/frontend, Dockerfiles/Compose, migration history, seeds and sample files, OpenAPI, runnable tests, README and an architecture document of **2–3 pages**. The topic specs complement that document; they do not replace it with an oversized architecture submission.

README covers prerequisites, exact setup/start/migrate/seed/test commands, credential setup, URLs, required/bonus coverage, deployment and known limitations. Architecture covers system shape, decisions, database, security, scaling and future work. Add an AI usage summary and evidence log, clearly separating completed work from proposals.

Final rehearsal: start from a clean checkout and empty database, follow only the README, complete the reviewer journey, download QR/PDF, restart, restore a backup, then reconcile every claim with actual results. Tag the reviewed commit. Confirm the submission cutoff timezone if timing becomes material.
