import type { PassportDocumentKind, PassportPresentationModel } from '../passport/presentation'
import type { HistoricalPassportView } from './types'

/**
 * Adapts one immutable historical version into the shared presentation model.
 *
 * The same component that renders the anonymous public passport renders this, so a
 * historical version cannot drift into a second visual implementation. Two deliberate
 * differences keep the presentation honest:
 *
 * - `publicUrl` and `qrDownloadUrl` are null. Both belong to the passport's *current*
 *   version, and `/passport/:uuid` always serves that version. The back-office chrome
 *   offers those actions separately, labelled as current, instead of letting a
 *   historical view imply that the public URL opens the selected old version.
 * - Image and file hrefs come from authenticated blob object URLs keyed by asset id.
 *   Historical bytes are private; a direct href would carry no access token.
 */
export function toHistoricalPresentationModel(
  view: HistoricalPassportView,
  objectUrls: Readonly<Record<string, string>>,
): PassportPresentationModel {
  return {
    passport: {
      publicUuid: view.passport.publicUuid,
      creationDate: view.passport.creationDate,
      version: view.passport.version,
      publishedAt: view.passport.publishedAt,
      status: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
      publicUrl: null,
      qrDownloadUrl: null,
    },
    brand: { displayName: view.brand.displayName },
    product: view.product,
    materials: view.materials.map((material) => ({
      key: `material-${material.position}`,
      name: material.name,
      percentage: material.percentage,
      originCountry: material.originCountry,
      recyclable: material.recyclable,
    })),
    sustainability: view.sustainability,
    certifications: view.certifications.map((certification) => ({
      key: `certification-${certification.pdfAssetId ?? certification.name ?? 'unknown'}`,
      name: certification.name,
      issuingAuthority: certification.issuingAuthority,
      issueDate: certification.issueDate,
      expirationDate: certification.expirationDate,
      fileHref:
        certification.pdfAssetId === null ? null : (objectUrls[certification.pdfAssetId] ?? null),
      // The stored filename lets the shared component name the download; the bytes still
      // come from the authenticated blob URL in `fileHref`.
      fileName: certification.originalName,
    })),
    documents: view.documents.map((document) => ({
      key: `document-${document.assetId}`,
      kind: toDocumentKind(document.kind),
      title: document.title,
      fileHref: objectUrls[document.assetId] ?? null,
      fileName: document.originalName,
    })),
    images: view.images.map((image) => ({
      assetId: image.assetId,
      role: image.role,
      altText: image.altText,
      src: objectUrls[image.assetId] ?? null,
    })),
  }
}

function toDocumentKind(kind: string): PassportDocumentKind {
  return kind === 'WARRANTY' || kind === 'TECHNICAL_DATASHEET' ? kind : 'MANUAL'
}

/**
 * Every asset id a historical version presents, de-duplicated.
 *
 * One asset can appear in more than one place — a PDF used as both a document and a
 * certification attachment — and the API retains it once per version, so fetching the
 * same id twice would be wasted work.
 */
export function historicalAssetIds(view: HistoricalPassportView): string[] {
  const ids = new Set<string>()
  for (const image of view.images) {
    ids.add(image.assetId)
  }
  for (const document of view.documents) {
    ids.add(document.assetId)
  }
  for (const certification of view.certifications) {
    if (certification.pdfAssetId !== null) {
      ids.add(certification.pdfAssetId)
    }
  }
  return [...ids]
}
