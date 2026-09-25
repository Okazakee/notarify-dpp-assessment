# Frontend and interaction boundaries

## Proposed foundation

Next.js App Router, React, TypeScript, Tailwind and daisyUI. The brief permits “Material UI (or equivalent)”, so a different component system is within its stated options. Equivalence is judged by delivered behavior, responsiveness and quality.

daisyUI uses component classes and has official agent setup/skill documentation. Treat it as styling infrastructure, with our responsibility for semantic markup, keyboard interaction and focus behavior. Do not assume styled tabs/dialogs/forms are accessible without testing. [daisyUI usage](https://daisyui.com/docs/use/), [official skill](https://daisyui.com/docs/skill/).

Use a restrained professional design: legible tables, clear status labels, consistent spacing and useful empty/error states. No custom design system project is needed. Configure the components/themes actually used and measure the production result before claiming reduced bundle size.

## State ownership

| State | Owner |
| --- | --- |
| Published passport data | Server rendering with explicit backend visibility checks |
| Authenticated product/API data | Typed API client; proposed TanStack Query cache |
| Field values, nested arrays, field errors | Proposed React Hook Form |
| Editor tab, preview drawer, temporary selection | Small Zustand stores or local component state |
| Filters, search and pagination | URL query parameters |
| Refresh credential | HttpOnly cookie |
| Access JWT | Transient in-memory auth layer; never persisted |

Zustand is included as requested; it does not need to hold every category of state. Avoid module-level mutable stores shared across server requests. Instantiate any hydrated store per provider/request boundary and pass serializable initial state. RSC code does not mutate client stores. Reset user-specific state and request caches on logout. [Zustand reference entrypoint](https://zustand.docs.pmnd.rs/); exact installed-version Next integration is an implementation check.

## Routes and minimum behavior

| Navigation | Required implementation |
| --- | --- |
| Dashboard | Four counters, loading/error states, useful links |
| Products | Required columns/actions, search, filters, bounded pagination |
| Product Passports | Active publications, version/status, public link, QR/PDF downloads, internal version history |
| Analytics | Daily/weekly counts, most viewed products, latest scans; raw details Admin-only |
| Users | Admin list/create/role/disable flows and last-Admin protection |
| Settings | Company display name/logo; read-only operational origin information if useful |

Users and Settings are under-specified in the brief. The minimum useful flows described here are required remaining work, scheduled in Stage 6 of the roadmap; they stay proportional to the brief rather than growing into an enterprise administration surface. Hide restricted navigation from Editor and still enforce authorization at the API.

The product list includes image, name, SKU, status, QR, total views and actions: view, edit, delete, open passport, download QR. Draft rows show unavailable public actions clearly instead of broken links. Destructive actions require a clear confirmation dialog.

**Update 2026-09-25:** Stage 4.4 implemented `/passports` and the publication part of that table. Product Passports lists the current published identity per row for both roles, marks a row with unpublished changes, and offers Open Passport and Download QR; `/passports/[passportId]` is the Admin-only retained-version view, and an Editor who navigates there is shown an explicit unavailable state while the API refuses the request with 403. On the Products table the cover image, QR column, Total Views column and Open Passport/Download QR actions now exist. Total Views renders an unavailable placeholder with an accessible "Available after analytics" explanation until Stage 5 supplies the metric — it must never display an invented `0`. Product delete and a read-only View destination remain Stage 6 gaps, and no fake Delete or PDF control was added.

**Update 2026-09-25 (Stage 4.5):** the public Passport page and Product Passports now offer **Download PDF** for the current published version. The public action resolves the API-relative `pdfDownloadUrl` against the configured API origin exactly like the QR download, and the back-office action uses the same endpoint for both ADMIN and EDITOR; the API sets the attachment disposition, so no PDF is generated or rendered by the browser. Draft Preview does not advertise a PDF export, and the historical version view deliberately has no PDF action because `/passport/:uuid/pdf` always exports the current version.

## Seven editor tabs

General Information; Materials; Sustainability; Certifications; Documents; Images; Preview. Each supports loading, empty and validation states. Show which tabs contain errors and focus the first invalid field. Explain publish failures in field-level terms.

Use one coherent explicit-save flow with dirty-state indication and navigation protection. Drag-and-drop has a normal file input fallback, progress, type/size feedback and retry. Do not lose entered fields on an upload error or authentication refresh.

Preview maps current editor content (including unsaved edits) into the same public presentation component. The shared presentation simulates eventual Published and qualified prototype Verified state; editor-only chrome labels the candidate as unpublished. Publication identifiers, version and dates remain placeholders unless known from actual publication, and Preview never publishes. API validation is authoritative; client validation provides immediate feedback. Prevent publishing an unsaved editor revision accidentally.

## Acceptance

Test mobile and desktop public pages, keyboard-only editor/navigation, labels and focus, contrast, zoom, long names, long material tables, empty states and expired credentials. Check that no draft, credential or Admin-only data appears in anonymous HTML or serialized hydration payloads. Measure production page assets and server response timings on the actual VPS; no invented performance guarantees.
