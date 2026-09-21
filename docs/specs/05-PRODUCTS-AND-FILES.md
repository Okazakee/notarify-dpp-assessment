# Product editing, files and discovery

## Product editing contract

Support every specified basic field: name, SKU, serial number, category, description, production date, country of origin and Draft/Published status. Status follows the publication lifecycle, not a free client-controlled boolean.

Nested sections: ordered materials; sustainability; certifications with attached PDFs; typed documents; cover/gallery images. Use an explicit draft-save contract with optimistic revision checking. Replacing a nested collection must be transactional and must validate ownership of existing IDs. Document omitted versus empty versus null fields for PATCH. A deleted child cannot be changed by supplying its old ID under a different product.

The initial implementation may save the whole editor draft in one transaction rather than build many tiny nested endpoints. Upload binary files separately, then link accepted asset IDs during save. Avoid automatically creating a publication every time a field is saved.

## Revised storage proposal

For this small assessment, PostgreSQL binary storage is reasonable: Asset holds metadata and AssetContent holds `bytea`. A bounded download endpoint returns the bytes with the correct MIME type; public images use ordinary asset URLs and private previews use authenticated fetch/blob URLs. Product/list/snapshot JSON contains IDs or URLs, never file bodies. Explicit Prisma selects avoid accidentally loading binary columns.

Base64 works in JSON seed fixtures, but decode it once during seeding. Keeping it as text adds roughly one-third encoding overhead and embedding it in API responses couples file delivery to those responses. PostgreSQL has a native binary type. Sources: [PostgreSQL bytea](https://www.postgresql.org/docs/current/datatype-binary.html), [MDN Base64](https://developer.mozilla.org/en-US/docs/Glossary/Base64).

A bucket is optional. The other simple choice is a local persistent upload volume behind the same Asset API. Database bytes are the current recommendation for one backup and fewer moving parts; revisit volume/object storage if file sizes or traffic grow.

## File pipeline

1. Require authentication and upload permission. Apply per-file size, total request, count and storage-quota limits.
2. Proposed allowlist: PDF for certificates/documents; JPEG, PNG and WebP for images. Reject uploaded HTML/SVG and archives for this scope. A generated QR SVG is trusted server output, not an accepted user upload.
3. Validate file signature/detected type in addition to extension and declared MIME. Reject invalid/truncated files. Generate asset IDs; treat original names as display metadata only.
4. Decode and re-encode images with an image library selected during implementation, bounding pixel dimensions and stripping metadata. Image decoding needs its own resource limits.
5. Store accepted bytes and metadata in the database transactionally. A draft attachment remains private even if someone guesses its ID.
6. Serve PDFs as attachments with a safe filename and `nosniff`; keep them out of inline HTML contexts. Public downloads require a reference from an active published passport version. Internal preview requires a current authorized session.
7. Replacing a file creates a new Asset. Never overwrite a blob used by a historical snapshot. Garbage-collect only unreferenced abandoned uploads after a configured grace period, never version-linked assets.

These controls follow the layered approach described in [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Content-type detection is not malware scanning. For the assessment, uploads are limited to authorized demo operators; document the absence of full PDF malware/CDR inspection. A later untrusted-upload service needs a quarantine/scanning policy and a capacity budget.

Proposed starting limits: 10 MiB per PDF, 5 MiB per image, 12 gallery images, 20 documents/certificates per product, 200 materials. Validate against representative fixtures and document configurable values. Rate-limit expensive file processing separately.

## File access and deletion junction

All downloads go through an authorization/visibility decision; do not include binary bodies in public product JSON. Publishing makes only explicitly referenced approved assets public. Soft deletion withdraws access even when cached metadata or an old URL exists. Old versions are available to authorized back-office users, while the public route shows the current version only.

## Search and product list

Build pagination/filtering with CRUD. Proposed bounded page size: 20 default, 100 maximum; deterministic sort with ID tie-breaker. Filters: Draft/Published, category, country, production-date range and text query. Soft-deleted products are excluded by default.

Implement true PostgreSQL full-text search for name/description using `tsvector`, a GIN index and a parameterized query. Handle SKU/serial matching separately because punctuation-heavy identifiers do not behave like prose. Choose the `simple` search configuration for this multilingual demo, or explicitly document a language-specific alternative. PostgreSQL supplies native full-text search and indexing. [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html).

Do not label a plain substring filter as the full-text-search bonus. Keep Prisma as the ORM; use narrowly scoped parameterized SQL where its selected version cannot express the needed search/index feature.

## Acceptance

An Editor can create an incomplete draft, upload files, populate every tab, save and reopen it. Invalid percentages, mismatched ownership, unsupported files and stale edits fail safely. An Editor or an Admin can publish it, find it through filters/search, and an Admin can soft-delete it without removing history. Drag-and-drop and the keyboard-accessible file picker use the same upload contract.

**Update 2026-09-21:** the earlier wording of this acceptance line implied publication was Admin-only. It is not: the recorded project decision lets an Editor publish and republish (see section B2 of `docs/IMPLEMENTATION-DECISIONS.md`). Publication is not implemented yet in any case.
