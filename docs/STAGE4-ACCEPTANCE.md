# Stage 4 acceptance matrix

**Status:** Stage 4 automated acceptance/regression is complete. Physical handset scan,
Cristian's manual UI walkthrough and human source-code review remain **not validated** —
see [Manual evidence still required](#manual-evidence-still-required).

This document is the evidence map for the Stage 4 subsystem (publication, public Passport,
public UI/Preview, back-office Passports/version history and PDF export). It records
**where** each accepted invariant is proven, so a reviewer does not have to read every
suite. It is not a duplicate requirements spreadsheet.

Run the evidence with:

```bash
pnpm check        # lint, typecheck, build and the API integration suites (real PostgreSQL)
pnpm test:e2e     # Playwright against the built API and web app
```

## Central lifecycle journey

`e2e/stage4-acceptance.spec.ts` is the cross-milestone proof. One deterministic product
runs through the whole lifecycle in order:

```text
complete draft A → Preview A → publish v1 → public/QR/PDF/history = A,v1
→ unsaved draft B (Preview only; nothing persisted) → save B (public still A,v1)
→ republish v2 (same Passport, same UUID, same QR) → public/PDF/back office = B,v2
→ further draft C stays private → v1/v2 remain immutable snapshots
```

| # | Acceptance case | Result |
| --- | --- | --- |
| 1 | First publication from the editor: one Passport, one v1, current pointer, snapshot identity, public/PDF/assets, idempotent replay | PASS |
| 2 | Unsaved editor edit appears only in Preview; nothing persisted; public/PDF/history stay on A,v1 | PASS |
| 3 | Saved draft B without republish: revision advances, back office reports A with unpublished changes, public/PDF/QR/UUID unchanged | PASS |
| 4 | Republish v2: current pointer moves, same Passport/UUID/QR bytes, public/PDF/back office converge on B, v1 assets private again, Admin history retains both versions, Editor history 403 | PASS |
| 5 | Further draft C stays private; v1/v2 parsed snapshots remain equal to their stored originals; draft asset never public or historical | PASS |
| 6 | Automated QR chain: stored bytes → independent decode → configured target → 302 → canonical page; QR download records nothing | PASS |
| 7 | No public historical Passport or historical PDF route exists, for anonymous or authenticated callers | PASS |
| 8 | Server-rendered public page for an anonymous visitor with no cookies | PASS |
| 9 | Public page responsive at 390 px and desktop; headings, named actions, table headers, alt text, long-content wrapping | PASS |
| 10 | Analytics and audit tables unchanged across the journey | PASS |
| 11 | Product-list Stage 4 behavior for the accepted product (draft identity, cover, publication actions, honest Total Views) | PASS |

## Invariant evidence map

| Invariant | Owning milestone | Evidence | Result | Manual evidence required |
| --- | --- | --- | --- | --- |
| Unique Passport UUID, generated QR and public URL on first publication | 4.1 | acceptance #1; `publication.e2e-spec.ts` | PASS | no |
| Exactly one Passport/version; current-version pointer atomic | 4.1 | acceptance #1; `publication.e2e-spec.ts` | PASS | no |
| Publishing an already-published revision replays instead of duplicating | 4.1 | acceptance #1/#4; `publication.e2e-spec.ts` | PASS | no |
| Concurrent publish of one revision creates exactly one version | 4.1 | `publication.e2e-spec.ts` (race test) | PASS | no |
| Incomplete draft cannot publish and leaves no partial Passport | 4.1 | `publication.e2e-spec.ts`; `e2e/passport-ui.spec.ts` (publication gap) | PASS | no |
| Stale revision cannot publish or save silently | 4.1 | `publication.e2e-spec.ts`; `e2e/passport-ui.spec.ts`; `e2e/products.spec.ts` | PASS | no |
| Passport id and public UUID stable across republish | 4.1 | acceptance #3/#4; `publication.e2e-spec.ts` | PASS | no |
| Stored QR artifact byte-stable across republish | 4.1/4.2 | acceptance #4/#6; `public-passport.e2e-spec.ts` | PASS | physical handset scan: **NOT VALIDATED** |
| QR independently decodes to the configured target | 4.1/4.2 | acceptance #6; `e2e/public-passport.spec.ts`; `public-passport.e2e-spec.ts` (jsqr) | PASS | physical handset scan: **NOT VALIDATED** |
| QR resolver returns 302 to the canonical page (never from `Host`) | 4.2 | acceptance #6; `public-passport.e2e-spec.ts`; `e2e/public-passport.spec.ts` | PASS | no |
| QR download serves stored bytes and records nothing | 4.2 | acceptance #6/#10; `public-passport.e2e-spec.ts` | PASS | no |
| Anonymous public projection is the current immutable version only | 4.2 | acceptance #1–#5; `public-passport.e2e-spec.ts`; `e2e/passport-ui.spec.ts` | PASS | no |
| Draft edits (unsaved or saved) never change the public Passport before republish | 4.1/4.3 | acceptance #2/#3/#5; `e2e/passport-ui.spec.ts` | PASS | no |
| Public asset requires current-version retention + accepted state + content | 4.2 | acceptance #4/#5; `public-passport.e2e-spec.ts` | PASS | no |
| An asset only an older version retained is private again after republish | 4.2/4.4 | acceptance #4; `public-passport.e2e-spec.ts`; `e2e/passports.spec.ts` | PASS | no |
| Malformed/unknown/withdrawn/soft-deleted all return one safe public 404 (no `410`) | 4.2 | `public-passport.e2e-spec.ts`; `passport-pdf.e2e-spec.ts` | PASS | no |
| Corrupt stored snapshot fails as a controlled server error | 4.2 | `public-passport.e2e-spec.ts` | PASS | no |
| Corrupt stored QR makes the PDF unavailable rather than substituting one | 4.5 | `passport-pdf.e2e-spec.ts` | PASS | no |
| Anonymous public page carries every required section and the qualified badge | 4.3 | acceptance #1/#9; `e2e/passport-ui.spec.ts` | PASS | manual UI walkthrough: **NOT VALIDATED** |
| Public page is server-rendered without client JavaScript | 4.3 | acceptance #8; `e2e/passport-ui.spec.ts` | PASS | no |
| Preview renders the current editor state (unsaved included) under unpublished chrome | 4.3 | acceptance #1/#2; `e2e/passport-ui.spec.ts` | PASS | no |
| Preview/public/history render the same sections and labels (semantic parity) | 4.3/4.4 | acceptance #1/#4; `e2e/passport-ui.spec.ts`; `e2e/passports.spec.ts` | PASS (rendered parity; that one shared component is used in source is code-reviewed, not separately asserted) | no |
| Seven editor tabs, roving tabindex and arrow/Home/End navigation | 4.3 | `e2e/passport-ui.spec.ts` | PASS | no |
| Public surface requires no session and never restores one | 4.3 | acceptance #8; `e2e/passport-ui.spec.ts` | PASS | no |
| Verification badge stays prototype/application-level in every surface | 4.3/4.5 | acceptance #1/#8; `passport-pdf.e2e-spec.ts`; `e2e/passport-ui.spec.ts` | PASS | no |
| Back-office Passport list (both roles) uses the published snapshot identity | 4.4 | acceptance #1/#3/#5; `passports.e2e-spec.ts`; `e2e/passports.spec.ts` | PASS | no |
| `hasUnpublishedChanges` reflects draft revision vs published source revision | 4.4 | acceptance #3/#5; `passports.e2e-spec.ts` | PASS | no |
| Admin lists/inspects every immutable version; Editor is refused (403) | 4.4 | acceptance #4; `passports.e2e-spec.ts`; `e2e/passports.spec.ts` | PASS | no |
| Historical detail is the exact stored snapshot, never the draft or current version | 4.4 | acceptance #5; `passports.e2e-spec.ts` | PASS | no |
| Historical asset requires retention by the exact requested version | 4.4 | acceptance #4/#5; `passports.e2e-spec.ts`; `e2e/passports.spec.ts` | PASS | no |
| Role authority is re-read from PostgreSQL, not from JWT claims | 4.4 | `passports.e2e-spec.ts` (same-session downgrade) | PASS | no |
| Company isolation: foreign Passport/version/asset is a safe 404 | 4.4 | `passports.e2e-spec.ts`; `publication.e2e-spec.ts` | PASS | no |
| No public historical-version or historical-PDF route exists | 4.4/4.5 | acceptance #7 (candidate anonymous routes return 404; the authenticated history route requires a token) | PASS | no |
| PDF exports the current immutable version, reuses the stored QR, and never regenerates one | 4.5 | acceptance #1/#4; `passport-pdf.e2e-spec.ts` (sentinel QR) | PASS | printed PDF review: **NOT VALIDATED** |
| PDF and public projection agree on the stable published fields | 4.5 | `passport-pdf.e2e-spec.ts` (parity test) | PASS | no |
| PDF embeds only current-version retained images; WebP converted in memory | 4.5 | acceptance #4/#5; `passport-pdf.e2e-spec.ts` | PASS | no |
| PDF streams and aborts instead of finishing a truncated download | 4.5 | `passport-pdf-stream.spec.ts` | PASS | no |
| Public and back-office Download PDF actions; none in Preview or history | 4.5 | acceptance #1; `e2e/passport-pdf.spec.ts` | PASS | no |
| Product-list cover, status, QR state, publication actions; drafts show no broken public action | 4.4 | acceptance #11; `e2e/passports.spec.ts` | PASS | no |
| Product list shows an honest Total Views placeholder, never an invented `0` | 4.4 | acceptance #11; `e2e/passports.spec.ts` | PASS | no |
| Product search, filters and bounded pagination still work | 3 | `e2e/products.spec.ts`; `e2e/passports.spec.ts`; `products.e2e-spec.ts` | PASS | no |
| No `AnalyticsEvent`, `AnalyticsDaily` or `AuditEvent` is written by any Stage 4 path | 4.1–4.5 | acceptance #10; `public-passport.e2e-spec.ts`; `passport-pdf.e2e-spec.ts` | PASS | no |
| Bounded pagination caps on Product and Passport lists | 3/4.4 | `products.e2e-spec.ts`; `passports.e2e-spec.ts` (over-limit `pageSize` is rejected) | PASS | no |
| Sequential PDF image conversion and no HTTP self-fetch in PDF generation | 4.5 | source review of `passport-pdf.service.ts` and `passport-pdf-document.ts` (no benchmark claim) | PASS (source-reviewed) | no |
| Long published content, long identifiers and multi-page PDF | 4.3/4.5 | acceptance #9; `passport-pdf.e2e-spec.ts` | PASS | no |

## Manual evidence

When this milestone was recorded these were **not** claimed, and were not to be reported as
passed until Cristian actually performed them. He performed four of the five on the deployed
application on 2026-09-26; the human source-code review remains deferred:

| Item | Status |
| --- | --- |
| Physical handset scan of the printed QR code | **PERFORMED** by Cristian on 2026-09-26 against the deployed application |
| Cristian's manual UI walkthrough (public page, editor, Preview, back office) | **PERFORMED** by Cristian on 2026-09-26 against the deployed application |
| Human source-code review | **DEFERRED** until the complete project is built |
| Printed/on-screen review of the exported PDF | **PERFORMED** by Cristian on 2026-09-26 against the deployed application |
| Deployment/VPS validation | **PERFORMED** by Cristian on 2026-09-26 on a real VPS host |

## Known limitations

- This map records the **Stage 4** result: it proves the publication subsystem as it existed before
  analytics. Stage 5 later added instrumentation deliberately, so two observations here are
  intentionally superseded — `/q/:uuid` now records one `QR_HIT` and a visible public page
  navigation records one idempotent `VIEW`. Everything else still records nothing: the JSON
  projection, asset downloads, QR image downloads, PDF downloads, the editor Preview and the
  historical back-office view. The journey's assertions were reconciled to that current truth
  rather than deleted, and this historical result is not rewritten.
- A server-side Redis cache of immutable published content exists as of Stage 5. It never caches
  visibility, the current-version pointer, asset bytes or PDF bytes, and every public read still
  resolves existence, withdrawal, soft deletion and the current version from PostgreSQL first.
  Public HTTP responses remain `Cache-Control: no-store`.
- Product `Delete`/withdraw and a read-only `View` destination are Stage 6 work. The Product
  table's Total Views column is a measured value as of Stage 5: an unpublished product reports a
  real `0`, and the Stage 4.6 placeholder assertion was replaced with a database comparison.
- The e2e fixtures run against a disposable database that accumulates rows across runs;
  the acceptance journey therefore uses run-unique names and stable UUID filters.
- Peak concurrent PDF exports and real client-disconnect behavior are not measured.
