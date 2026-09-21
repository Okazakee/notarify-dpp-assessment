# Authentication, authorization and security

## Proposed access model

Use `role: ADMIN | EDITOR`, not an `isAdmin` boolean. A boolean could represent two roles, but the enum is clearer in the database, API and logs. Resolve roles into named permissions, then evaluate action/resource rules in a small policy service. This is RBAC with permission/policy checks; there is no single “PBAC standard” that choosing a boolean satisfies. Nest supports permission checks and policies without requiring a separate policy library. [Nest authorization](https://docs.nestjs.com/security/authorization).

| Action | Editor | Admin |
| --- | --- | --- |
| Read private product data / preview | Yes | Yes |
| Create/edit product, materials, documents and images | Yes | Yes |
| Publish/republish | Yes | Yes |
| Delete/withdraw, review a publication | No | Yes |
| Read aggregate analytics/dashboard | Yes | Yes |
| Read raw scan metadata / audit entries | No | Yes |
| Manage users, roles, company settings | No | Yes |

**Update 2026-09-21:** publishing and republishing are **not** Admin-only. The project decided Editors may publish; the earlier draft above that put publish on the Admin-only row was a project proposal, not a Notarify requirement, and has been split into separate rows. The brief still does not define permissions, so the remaining cells stay a project choice rather than a source requirement.

This matrix is a proposal because the brief does not define permissions. Enforce it on every protected endpoint and within sensitive use cases. UI hiding is not authorization. Avoid CASL until resource rules become complex enough to justify it.

## Session design

Proposed defaults: short-lived access JWT (10 minutes), rotating opaque refresh token with a seven-day absolute session lifetime. These durations are configurable project decisions.

- Login verifies an Argon2id password hash, creates a database session/refresh record and returns an access token. Benchmark hashing cost against the VPS during implementation.
- Access token is used as a bearer token and kept in browser memory, without localStorage persistence. Its claims include subject, session ID, issuer, audience, expiry and token ID. Validate a fixed allowed signing algorithm and all required claims.
- Refresh token goes into a host-only HttpOnly, Secure, SameSite cookie. Use an explicit limited path compatible with refresh/logout. Local HTTP development needs a clearly separate cookie configuration.
- Store only a digest of the high-entropy refresh secret. Rotate atomically; retain consumed-token references until session expiry so reuse is detectable. Reuse revokes the family.
- Check active session and current user/role on protected requests, enabling immediate logout, account disable and role-change enforcement. This intentionally uses server state despite JWT access tokens.
- Refresh/logout are cookie-authenticated operations: verify exact configured Origin and an explicit CSRF token on browser mutations. Apply equivalent login-CSRF protection. SameSite is supplementary.

**Update 2026-09-21:** exact configured `Origin` is enforced server-side on all three cookie-authenticated mutations. An additional CSRF token is **not** implemented; that is a recorded decision with reasoning and residual risk in section B3 of `docs/IMPLEMENTATION-DECISIONS.md`, not an omission. This line remains the requirement of record and the decision must be revisited if the topology changes.
- The client serializes refresh attempts; across tabs use coordinated refresh or explicitly test/document a strict reuse policy that may require re-login. Never allow a refresh stampede to silently bypass rotation.
- Logout revokes the session, clears cookies and discards client caches. Password changes and disabling a user revoke sessions. Prevent removing/disabling the last active Admin.

No registration, password-reset email service or social login is required by the brief. Admin can create users with a documented demo-friendly initial-credential workflow; do not embed credentials in public pages.

Security references: [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) and [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The exact token/session scheme above is our design, not a quoted OWASP prescription.

## Request boundary

Configure global Nest `ValidationPipe` with whitelisting, rejection of unexpected fields, transformation and safe error output. Use explicit conversion for numbers/booleans; avoid surprising implicit coercion such as treating the string “false” as truthy. Validate nested objects and arrays, UUIDs, lengths, enum values and pagination limits. Nest documents these validation facilities. [ValidationPipe](https://docs.nestjs.com/techniques/validation).

DTO validation checks shape. Domain validation checks relationships and lifecycle rules. SQL constraints protect data under concurrency. Use explicit field mapping so clients cannot mass-assign role, companyId, status, review state or internal IDs.

Prefer plain text for descriptions. Normalize only according to documented field rules; never strip/transform passwords. Escape output in its rendering context and use parameterized SQL. Do not treat generic string sanitization as protection against SQL injection, XSS, invalid business data or malicious files.

## HTTP, operational and file boundaries

| Boundary | Proposed controls | Evidence |
| --- | --- | --- |
| Authentication | Generic failure messages; limits by IP and account key; no secrets in logs | Brute-force and enumeration tests |
| Reverse proxy | Trust only actual proxy addresses/hops; strip spoofed forwarded headers | Spoofed X-Forwarded-For cannot bypass limits |
| Browser | TLS, narrow CORS if required, Helmet, tested CSP, safe referrer policy | Inspect actual Next HTML and API headers |
| Input/resource use | JSON/upload size limits, bounded arrays, request timeouts, bounded queries | Oversize/malformed/resource-abuse cases |
| Public/private split | Explicit public DTO and per-file visibility check | Draft or deleted assets unavailable anonymously |
| Persistence | Parameterized operations, unique/check constraints, transactions | Injection and race tests |
| Secrets/config | Validated environment, no default production secret, least-privilege DB user | Startup fails on unsafe/missing required config |
| Logs | Request IDs; redact authorization, cookies, passwords and raw sensitive payloads | Log inspection with synthetic secrets |

Helmet on Nest does not secure Next.js HTML automatically. Configure and test the frontend headers too. Configure @nestjs/throttler against the selected adapter and trusted proxy topology; its default storage choice must be explicit. Start with one API replica and document that a shared limiter is needed before scaling out. [Nest throttler](https://github.com/nestjs/throttler).

Audit writes for successful product/user/settings/publish/delete/review mutations belong in the same transaction as the mutation. Record actor/action/target/time and safe change metadata. Do not store credential hashes, tokens, PDF contents or unrestricted request bodies. Append-only through the application is not cryptographic tamper-proofing.
