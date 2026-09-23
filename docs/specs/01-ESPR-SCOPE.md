# ESPR context for the assessment

Updated 21 September 2026 following Cristian's scope clarification.

## Agreed scope

This is a technical assessment using fictional data. Generate mocked JSON fixtures for products, materials, sustainability metrics, certificates, publication states and historical analytics, then validate/import them with a repeatable seed script. Sample images and PDFs can be generated too. The upload and CRUD features must still work with new tester input; seeded content does not replace functional behavior.

ESPR is useful domain context, not a certification workstream or release blocker for this demo. No live EU registration, certification integration or proof of real sustainability claims is planned. Label demo data clearly and document that metrics and certificates are fictional.

## Relevant regulatory context

ESPR provides a framework; concrete passport requirements depend on the product and applicable rules. That explains why the assessment's generic field list is not itself a legal conformity checklist. [Commission ESPR overview](https://environment.ec.europa.eu/strategy/circular-economy/ecodesign-sustainable-products-regulation_en).

The Commission describes progressive sector-specific DPP implementation. Our application UUID and mock verification status are demo concepts, not official registration or certification. [Commission DPP guidance](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en).

## Mock verification and analytics

Make the required Verified Product badge and verification status demonstrable on published content. Explain in the UI or demo context that verification is prototype/application-level. No review or approval subsystem is required to display it, and an additional real-world verification integration is unnecessary.

Historical scans, IPs, browser metadata and countries can be synthetic. Real requests to the running demo are still real requests, so new scan tracking should behave as required by the PDF and keep collected metadata protected. Mocked seed data does not require disabling actual analytics or uploads.

## Documentation boundary

A short README note is sufficient: fictional assessment data, no claim of ESPR certification, and real regulatory integration listed as future work only. Keep standard application security and input validation because they are assessment requirements and Cristian's priorities.

Earlier Commission research was contextual. EUR-Lex's full regulation text could not be retrieved during that research, so no article-by-article legal verification is claimed. No additional legal research is needed to proceed with this demo plan.
