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

## Seven editor tabs

General Information; Materials; Sustainability; Certifications; Documents; Images; Preview. Each supports loading, empty and validation states. Show which tabs contain errors and focus the first invalid field. Explain publish failures in field-level terms.

Use one coherent explicit-save flow with dirty-state indication and navigation protection. Drag-and-drop has a normal file input fallback, progress, type/size feedback and retry. Do not lose entered fields on an upload error or authentication refresh.

Preview reuses the public presentation component and the same public field mapping. API validation is authoritative; client validation provides immediate feedback. Prevent publishing an unsaved editor revision accidentally.

## Acceptance

Test mobile and desktop public pages, keyboard-only editor/navigation, labels and focus, contrast, zoom, long names, long material tables, empty states and expired credentials. Check that no draft, credential or Admin-only data appears in anonymous HTML or serialized hydration payloads. Measure production page assets and server response timings on the actual VPS; no invented performance guarantees.
