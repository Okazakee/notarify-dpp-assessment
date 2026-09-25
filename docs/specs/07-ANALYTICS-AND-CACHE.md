# Analytics and Redis

## Definitions first

| Metric | Proposed definition |
| --- | --- |
| Total Products | Non-deleted products |
| Published Product Passports | Active, non-withdrawn passports |
| Generated QR Codes | Distinct active passports with generated QR artifacts; may equal published count |
| Total Passport Views | Accepted VIEW events for currently active passports |
| QR scans today | Accepted QR_HIT events in today's UTC interval |
| Weekly scans | Accepted QR_HIT events in seven UTC daily buckets, today and previous six days |
| Most viewed products | Active passports ranked by accepted VIEW count in selected bounded interval |
| Latest scans | Recent QR_HIT rows, with permission-dependent metadata |

Use explicit UTC labels in the demo. Bound custom date ranges. Keep SQL queries and labels aligned with these definitions; a later local-time reporting feature would need DST boundary tests. Counters need not be monotonic when products are withdrawn under the active-only policy.

## Collection

`/q/{uuid}` is a non-cacheable server redirect. For an active passport, record timestamp and trusted-proxy-resolved IP, parse a bounded User-Agent for browser/OS, parse Accept-Language, and record a deterministic mock country with `countrySource=MOCK`. Exclude HEAD and known prefetch requests. All client metadata remains spoofable.

Use Bowser as a proposed parser after license/version checking. Country is not inferred from language. For the demo, a mock adapter can return a configured country or a deterministic fixture mapping; label it in analytics.

Rendered page views are a distinct event. A small client component sends a fresh navigation event key after the page is visible; retries reuse the key and the server enforces uniqueness. This avoids counting Next prefetches or React reruns as additional views. JavaScript-disabled visitors can read the page but are absent from view counts; document that limitation. Preview must never emit public views.

The QR redirect records a link hit, not both a scan and a page view. Loading the destination may subsequently produce one VIEW. Do not sum the two event kinds as “visitors”. QR scanners that prefetch, bots and copied QR URLs can still distort hit counts. Avoid claims of exact unique humans.

Bound ingestion rate and input size. Under analytics persistence failure, keep the passport reachable and log a safe failure counter; document that this demo does not provide durable exactly-once tracking. Never insert a fake successful event.

## Retention proposal

Store raw event detail for seven days, then retain daily counts for 90 days. Values are demo policy defaults; the data boundary and the claims this project does not make are recorded in 01. Convert raw events to daily aggregates atomically before deleting them; aggregate queries must combine non-overlapping raw and rolled-up periods to avoid double counts.

Protect raw IP data with Admin-only access and redact it from ordinary app/proxy logs where feasible. Test the retention task with a fixed clock. Hashing an IP is not automatically anonymization. Synthetic seed events must be identifiable as synthetic in documentation.

## Redis scope

Use Redis for immutable published snapshot content keyed by passport/version/schema version, with a bounded TTL. Always read current publication visibility/version from PostgreSQL before serving cached content; combine fresh visibility/status metadata after lookup. This makes withdrawal and status changes effective without trusting stale cached status.

Cache does not own sessions, analytics events or publication truth. Do not cache authenticated responses or the QR redirect. Redis failure falls back to PostgreSQL with bounded timeouts and logs, while PostgreSQL failure returns an honest unavailable response. Remove keys on deletion as hygiene, but correctness must not depend only on successful invalidation.

Add cache hit/miss evidence and a failure test. This demonstrates the bonus without introducing a queue or distributed system solely for the assessment. For one API process, keep the rate-limiter storage choice independent and documented; Redis snapshot caching does not automatically make rate limiting distributed.

## Acceptance

Seed events across a UTC midnight and seven-day boundary; verify daily/weekly totals and ranking. Test a QR redirect plus destination view, a direct view, duplicate event retry, private preview, deleted passport, forged forwarding header, cache outage and deletion with a previously populated cache.

## Implementation update — 2026-09-25 (Stage 5)

Stage 5 implemented this spec with the following recorded decisions, which supersede the earlier proposals in this document where they differ.

**Event semantics.** `QR_HIT` means an accepted server request to the stable resolver `/q/:uuid`; it is not proof of a physical camera scan, a unique human or a unique device. `VIEW` means one visible public Passport page navigation reported by the page's own tracker. The two kinds are never summed into a single "visitors" figure.

**Ingestion.** `GET /q/:uuid` records a `QR_HIT` best-effort: `HEAD` and obvious `Purpose`/`Sec-Purpose` prefetch requests are skipped, the record write is bounded rather than awaited indefinitely, and any analytics failure still returns the same 302. `POST /passport/:uuid/view` accepts only `{ eventKey, version }`; the server resolves time, address, browser, operating system, language, the mocked country and `synthetic = false`. A public version number is accepted so a page rendered immediately before a republish records the version it displayed, and the server proves that version belongs to the passport before using it. Unknown body properties are rejected by the global validation pipe.

**Idempotency and aggregation.** The raw `AnalyticsEvent` insert uses conflict-safe `ON CONFLICT DO NOTHING` on the unique `eventKey`, and `AnalyticsDaily` is incremented by an atomic `ON CONFLICT ... count + 1` in the *same transaction*. A duplicate key therefore inserts nothing and increments nothing; the aggregate can never drift from the raw rows. Both are covered by sequential and concurrent retry tests.

**UTC reporting.** `scansToday` is the current UTC calendar day and the weekly series is exactly seven zero-filled UTC buckets, oldest first, so the chart never omits an empty day.

**Mock country.** `ANALYTICS_MOCK_COUNTRY` (default `IT`) supplies the recorded country with `countrySource = MOCK`, and the UI labels it as mocked. Country is never inferred from IP, language or locale.

**Retention.** The previously proposed 7-day raw / 90-day daily retention job is **not** implemented in this assessment: there is no scheduler, cron worker or purge subsystem. Accepted events stay in `AnalyticsEvent`; `AnalyticsDaily` is maintained at ingestion; production retention is documented as future hardening.

**Roles.** Both `ADMIN` and `EDITOR` may read `GET /dashboard` and `GET /analytics`, company-scoped. Only the Admin projection carries the raw IP address on recent scans; the Editor response omits the property entirely, decided in the API response construction rather than hidden in the browser.

**Rate limiting.** A small bounded per-process limiter protects public ingestion. It is deliberately **not** Redis-backed, so a cache outage cannot disable it, and it never replaces a valid QR redirect with a rate-limit error — it simply skips recording. It is a technical bound (30 accepted events per minute per address and passport), not a business metric, and not a distributed limiter.

**Cache.** `@redis/client` 6.2.1 (MIT) talks to Redis 8.10.2 in CI and local testing. `REDIS_URL` is optional: absent disables caching, unreachable falls back to PostgreSQL within bounded connect and command timeouts, and `disableOfflineQueue` prevents an unbounded offline command queue. Only the interpreted content of an already-selected immutable version is cached, keyed `notarify:passport:{passportId}:version:{versionId}:schema:{schema}`, bound by a SHA-256 digest of the exact snapshot it was derived from, and given a bounded TTL (`REDIS_CACHE_TTL_SECONDS`, default 300). An oversized, unreadable, wrong-schema or mismatched entry is discarded and never served. Visibility, withdrawal, soft deletion and the current-version pointer always come from PostgreSQL first, so a warm entry cannot resurrect a withdrawn passport or mask a republish, and a republished PDF is never stale. HTTP responses keep `Cache-Control: no-store`; the internal content cache is a different layer.

**Verified against a real server.** The cache suite runs against a real Redis (`redis:8.10.2`), and CI provides the service; correctness is never asserted against a mock.
