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
