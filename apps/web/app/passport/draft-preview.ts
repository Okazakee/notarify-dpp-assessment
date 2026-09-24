import type { DocumentKind, ProductEditorForm } from '../products/types'
import type { PassportDocumentKind, PassportPresentationModel } from './presentation'

/**
 * The editor-side draft adapter.
 *
 * It maps the *current* editor state into the shared presentation model so the Preview tab
 * renders the exact same component as the public page. It deliberately does **not** fetch
 * `GET /passport/:uuid`: that would show the current published version rather than the
 * draft being reviewed.
 *
 * A pure function with type-only imports, so it stays out of the client boundary and can be
 * unit-reasoned about independently of React.
 */

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanOrNull(value: '' | 'true' | 'false'): boolean | null {
  return value === '' ? null : value === 'true'
}

function toDocumentKind(kind: DocumentKind): PassportDocumentKind {
  return kind === 'WARRANTY' || kind === 'TECHNICAL_DATASHEET' ? kind : 'MANUAL'
}

export type DraftPreviewPublication = {
  publicUuid: string
  version: number
  publicUrl: string
  publishedAt: string
  creationDate: string
}

export type DraftPreviewInput = {
  form: ProductEditorForm
  categoryName: string | null
  /** Preview brand placeholder: the account exposes no company display name to the editor. */
  brandDisplayName: string
  /** Known published passport metadata, available once the editor has published in this session. */
  publication: DraftPreviewPublication | null
  /** Authenticated object URLs for the draft's image assets, keyed by asset id. */
  imageSrcs: Record<string, string>
}

export function toDraftPresentationModel(input: DraftPreviewInput): PassportPresentationModel {
  const { form, publication } = input

  return {
    passport: {
      publicUuid: publication?.publicUuid ?? null,
      creationDate: publication?.creationDate ?? null,
      version: publication?.version ?? null,
      publishedAt: publication?.publishedAt ?? null,
      // Simulate the eventual public presentation; the editor-only banner identifies this
      // content as an unpublished draft. These values never create publication records.
      status: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
      publicUrl: publication?.publicUrl ?? null,
      qrDownloadUrl: null,
    },
    brand: { displayName: input.brandDisplayName },
    product: {
      name: nullIfBlank(form.name),
      sku: nullIfBlank(form.sku),
      serialNumber: nullIfBlank(form.serialNumber),
      description: nullIfBlank(form.description),
      productionDate: nullIfBlank(form.productionDate),
      originCountry: nullIfBlank(form.originCountry),
      categoryName: input.categoryName,
    },
    materials: form.materials
      // Untouched empty rows are noise in a preview; a row the user started typing stays.
      .filter(
        (material) => material.name.trim().length > 0 || material.percentage.trim().length > 0,
      )
      .map((material) => ({
        key: `material-${material.clientId}`,
        name: material.name.trim(),
        percentage: numberOrNull(material.percentage) ?? 0,
        originCountry: nullIfBlank(material.originCountry),
        recyclable: booleanOrNull(material.recyclable),
      })),
    sustainability:
      form.sustainability === null
        ? null
        : {
            carbonKgCo2e: numberOrNull(form.sustainability.carbonKgCo2e),
            waterLitres: numberOrNull(form.sustainability.waterLitres),
            recycledPercent: numberOrNull(form.sustainability.recycledPercent),
            repairabilityScore: numberOrNull(form.sustainability.repairabilityScore),
            recyclable: booleanOrNull(form.sustainability.recyclable),
          },
    certifications: form.certifications.map((certification) => ({
      key: `certification-${certification.clientId}`,
      name: nullIfBlank(certification.name),
      issuingAuthority: nullIfBlank(certification.issuingAuthority),
      issueDate: nullIfBlank(certification.issueDate),
      expirationDate: nullIfBlank(certification.expirationDate),
      // Draft assets stay private: the Preview deliberately shows attachment metadata rather
      // than minting a download URL through the authenticated/private asset route.
      fileHref: null,
      fileName: certification.pdfOriginalName,
    })),
    documents: form.documents.map((document) => ({
      key: `document-${document.clientId}`,
      kind: toDocumentKind(document.kind),
      title: nullIfBlank(document.title),
      fileHref: null,
      fileName: document.originalName,
    })),
    images: form.images.map((image) => ({
      assetId: image.assetId,
      role: image.role,
      altText: nullIfBlank(image.altText),
      src: input.imageSrcs[image.assetId] ?? null,
    })),
  }
}
