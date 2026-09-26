# Architecture

A technical summary of the Notarify Digital Product Passport prototype: how it is shaped, why
it is shaped that way, and what a production version would need. Detailed planning lives in
[docs/specs/](specs/); this document is the short version.

---

## 1. System shape

```text
Browser ──► Next.js (web)  ──► NestJS (api) ──► PostgreSQL
                 │                  │
                 │                  └──► Redis (disposable cache, optional)
                 └── public Passport page is server-rendered from the API snapshot
```

Two deployable applications and two stores:

* **`apps/web`** — Next.js App Router. Server Components render the anonymous public Passport
  so published content is present in the HTML; the back office is a client-rendered React app.
* **`apps/api`** — NestJS modular monolith. It owns validation, authorization, transactions
  and every database write. Modules are `auth`, `products`, `assets`, `publication`,
  `public-passport`, `passports`, `analytics`, `users`, `settings`, `audit`, `cache` and
  `health`. Controllers never orchestrate cross-module Prisma calls; they call the owning
  module.
* **PostgreSQL** is the single source of truth, including binary asset bytes.
* **Redis** is optional and disposable: it only ever holds the interpreted content of a
  published version that PostgreSQL has *already* identified as current.

### The central design idea: immutable publication

A `Product` is a mutable draft. Publishing produces a `PassportVersion` containing an
immutable JSON **snapshot** of that draft, plus `PassportVersionAsset` rows retaining every
file the version exposed. Everything public reads only the snapshot. A later draft edit is
invisible until an explicit republish, and a republish creates a new version rather than
mutating the old one, so history stays trustworthy.

A `Passport` carries the identity that must survive editing: a stable public UUID and one QR
artifact, allocated on first publication and reused afterwards. A printed code keeps working
across every future revision.

### Lifecycle

```text
draft ──publish──► immutable version 1 ──republish──► immutable version 2 ──delete──► withdrawn
                          │                                  │                            │
                    stable UUID + QR  ──────────── retained, never regenerated ────────────┘
```

Deleting a product is a **soft delete**: one transaction sets `Product.deletedAt`, sets
`Passport.withdrawnAt` when a Passport exists, and appends the audit row. Every version, file,
analytics row and audit row is retained. Anonymous access closes immediately and uniformly —
the same 404 for malformed, unknown, withdrawn and deleted, so the surface cannot be probed —
while an Administrator can still inspect the retained history.

## 2. Database design

Two deliberately different halves:

**Normalized mutable area** — `Product` with `Material`, `Sustainability`, `Certification`,
`ProductImage`, `ProductDocument`. These support editing, search and filtering, and they are
never read by the public surface.

**Immutable publication area** — `Passport`, `PassportVersion` (with `publicSnapshot` JSON and
`snapshotSchemaVersion`), `PassportVersionAsset`. Append-only by construction: nothing updates
a version.

Supporting tables: `Asset` + `AssetContent` (validated metadata plus bytes), `AnalyticsEvent`
(raw facts) and `AnalyticsDaily` (UTC aggregates), `AuditEvent`, `User`/`Company`/`AuthSession`/
`RefreshToken`.

Constraints are expressed in PostgreSQL, not only in TypeScript: a hand-written `CHECK` that
a `VIEW` must carry an event key, a non-negative daily count, partial uniqueness and composite
foreign keys that tie a version's assets to the same passport. Correctness that the database
can enforce is not left to application code.

Two decisions deserve naming. **Asset bytes live in PostgreSQL**: for a single-instance
prototype this makes a database dump the complete backup, and it keeps the ownership rule in
the same transaction as the metadata. At scale this is the first thing to move (see §6).
**Analytics are stored raw plus aggregated**: `AnalyticsEvent` answers "show me the latest
scans", `AnalyticsDaily` answers "how many per day" without scanning history, and both are
written in one transaction so the aggregate can never drift from the rows behind it.

## 3. Security approach

* **Sessions.** A short-lived access JWT (no role claim) plus an opaque rotating refresh token
  in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to `/auth`. Refresh rotation is one
  transaction with a row lock and a conditional compare-and-set, so exactly one concurrent
  refresh wins; presenting a consumed token is treated as reuse and revokes the whole session
  family. Consumed rows are retained.
* **Authorization is server-owned.** The guard re-reads session, user, role and company from
  PostgreSQL on every protected request, so disabling a user or changing a role takes effect on
  their next request without touching the token. Deactivation revokes live sessions in the same
  transaction. The last active Administrator cannot be removed or disabled, and that rule is
  concurrency-safe because administrative writes lock the company's user rows first.
* **Tenant isolation.** Every query is scoped by `companyId` *inside the query*, so another
  company's row is indistinguishable from a missing one.
* **Untrusted input.** Declared MIME type, filename and extension are never authoritative: the
  type comes from the bytes, images are decoded and re-encoded to strip metadata and bound
  dimensions, PDFs must pass a structural check, the persisted size is re-checked after
  re-encoding, and validation happens entirely before the first write.
* **Public/private boundary.** Draft and historical assets are authenticated; the public asset
  route requires a retained reference from the *current active* version, so an asset only an
  older version used becomes private again after a republish.
* **CSRF.** Cookie-authenticated mutations validate the request `Origin`; CORS is configured
  with an exact origin and credentials and is deliberately not described as CSRF protection.
  The residual risk of not using a separate token is recorded as a decision.
* **Analytics and audit.** Event metadata is server-resolved, real reporting excludes synthetic
  events, only the Admin projection carries the raw address (the Editor response omits the
  property), and audit metadata is a closed vocabulary that never contains credentials, tokens,
  bodies or file bytes.

## 4. Caching

Redis caches one thing: the interpreted content of an **already-selected immutable** version,
keyed by passport, version and content schema, bound by digest to both the snapshot PostgreSQL
selected and the content being returned, with a bounded TTL.

Every public read resolves existence, withdrawal, soft deletion and the current version from
PostgreSQL first. That ordering is what makes the cache safe: a warm entry can never resurrect
a withdrawn Passport, mask a republish, or serve a different version. An absent, unreachable,
slow or corrupt cache degrades to "not cached" and never to a wrong answer — proven by tests
that kill Redis and by a connected-but-silent server. HTTP responses remain `no-store`; the
internal cache and the browser cache policy are different layers.

## 5. Scalability

The application tier is stateless: both containers can be replicated behind a load balancer,
and sessions live in PostgreSQL, so no sticky routing is required. The database is the first
bottleneck. Obvious next steps are connection pooling, read replicas for reporting, and moving
analytics aggregation off the request path. Redis is already optional, so it can be scaled or
dropped without touching correctness. Asset bytes in PostgreSQL are the clearest scaling
limit — moving them to object storage with signed URLs is the natural evolution, at the cost of
giving up "one dump is the whole backup". The public Passport page is cacheable at the edge
because it is derived purely from an immutable snapshot; only the readiness to confirm the
current version would need rethinking.

Ingestion protection is a bounded per-process rate limiter, deliberately not Redis-backed so a
cache outage cannot disable it. A multi-instance deployment would need an accurate distributed
limiter; today's is explicitly approximate.

## 6. Future improvements

* **Antivirus and PDF CDR** on uploads before bytes are served to anyone.
* **Analytics privacy and retention**: automatic expiry of raw events, address truncation or
  hashing, and a documented lawful basis. The mock country should be replaced by a deliberate
  decision rather than a placeholder.
* **Trusted-proxy configuration** with the real deployment topology, so recorded addresses are
  client addresses rather than the proxy's.
* **Observability**: structured request logs, metrics and traces. Today's diagnostics are
  request IDs and bounded log lines.
* **Object storage and CDN** for assets if scale or cost requires it.
* **A distributed rate limiter** accurate across instances.
* **CSP with nonces, COEP and SRI** on the web origin, which today sets only the baseline
  headers that are safe without build integration.
* **Formal regulatory validation**: the passport content model is an assessment-scale
  interpretation of ESPR-style data, not a validated compliance artifact.
* **Automated backup verification** rather than the documented manual dump/restore.
