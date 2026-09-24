# Publication, public passport, QR and PDF

## One shared view contract

`PassportView` is the explicit public projection. The public page and editor preview render the same React presentation component. Preview receives a projected draft through a protected API; public rendering receives the current published snapshot. The preview's draft indication belongs in surrounding editor chrome, not a different passport template.

**Update 2026-09-24:** Stage 4.3 implemented preview deliberately differently, and the difference is settled rather than pending. Preview renders the **current editor state** — unsaved changes included — through the same presentation component and the same public field mapping, built client-side from `ProductEditorForm`; no protected draft-projection endpoint was added and `packages/api-client` stayed empty. Public rendering is unchanged: the current immutable published snapshot. Both surfaces therefore share one structure, one section order, one set of labels and one field formatting; only the data source and the resolved asset URLs differ. See section B9 of `docs/IMPLEMENTATION-DECISIONS.md`.

PDF uses the same view data but an independently designed print layout. Exact HTML/PDF visual parity is not promised or required.

## Required public content

| Section | Contents |
| --- | --- |
| Header | Brand logo, cover image, name, SKU, serial, conditional qualified Verified Product badge |
| Product | Description, category, production date, origin |
| Materials | Material, percentage and origin table |
| Certifications | Metadata, expiry status and authorized public PDF links |
| Sustainability | Carbon, water, recycled percentage, repairability; units and unknown states |
| Documents | Manuals, warranty and technical datasheets |
| Images | Cover and gallery |
| Passport metadata | UUID, creation date, version, status and verification status |

The page is responsive and readable without authentication. Core published content should render without client JavaScript; analytics enhancement can be separate. Historical versions are back-office-only in the proposed scope.

## QR decision

Use the `qrcode` package (`soldair/node-qrcode`) server-side for PNG and optional SVG. It supports image generation and configurable encoding/error correction. We have not established it is the smallest package or audited a selected release. [node-qrcode](https://github.com/soldair/node-qrcode).

Create UUIDs with Node's built-in cryptographic UUID facility. Do not introduce a UUID dependency solely for this operation.

Proposed QR target: `https://<configured-origin>/q/{uuid}`. Nest records a QR-link hit, then sends a non-cacheable redirect to the canonical HTML `/passport/{uuid}`. The brief's passport route is preserved; the extra redirect separates QR-link traffic from ordinary page views. The server cannot prove the hit came from a physical scan: copies, bots and direct requests can use the same link.

**Update 2026-09-24:** the resolver is implemented and currently records **nothing**: `GET /q/{uuid}` returns the `302`, and the QR download returns the stored bytes, neither of which writes an analytics row or an `AuditEvent`. Recording `QR_HIT` is Stage 5 work; see section B8 of `docs/IMPLEMENTATION-DECISIONS.md`.

The QR artifact is automatically generated on first publication and retained/reproducible for downloads. Do not count every download or regeneration as another unique QR. Keep the origin in validated configuration, not a client-supplied Host header. An origin change needs redirects or regeneration; printed QR stability is an operational responsibility.

Use a high-contrast code with an intact quiet zone and no logo overlay. Test the exported image by decoding it independently, following its URL and scanning from a real phone. Do not consider an image snapshot sufficient proof of scannability.

## Publication and verification

Use the lifecycle in 03. UUID stays stable; version number increases only when a new draft revision is published. Publication validation and snapshot creation are transactional. Repeated/concurrent publication must not create duplicate revisions.

Verification is a prototype/application-level indicator on an active published version, presented as described in 01; never infer it from the existence of a PDF or from a content hash. No review or approval workflow is required for the assessment and `PassportReview` may stay unused infrastructure. Preview must show the same verification presentation the public page will show.

## PDF export decision

Use PDFKit in Nest for a compact A4 passport containing brand/header, key product data, materials, sustainability, certification/document links, passport ID/version/date and the QR. Support page breaks, long text, repeated table headers, local embedded Unicode fonts and page numbers. Stream the result with bounded work and download headers. PDFKit provides text, images, tables and font embedding. [PDFKit](https://pdfkit.org/).

This keeps PDF generation out of the client bundle and avoids a browser process in the production API container. It does not imply a verified package-size advantage over every alternative. Browser tooling remains useful in development for testing the site.

PDF export resolves an authorized snapshot and its database-backed asset references. Do not fetch arbitrary user-provided remote URLs while generating a PDF. Invalid/missing optional images get a controlled fallback; hidden draft data must never be substituted into a published export.

## Acceptance

Publish v1, edit draft, verify public content remains v1, then publish v2 and verify the URL/QR stays stable. Confirm draft preview matches the intended v2 presentation. Download QR/PDF and test their content. Withdraw/delete and ensure public page, file URLs, QR redirect and cached reads no longer expose the passport.
