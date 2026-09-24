import type { ReactNode } from 'react'
import { NotarifyMark } from './brand-mark'

/**
 * The one Passport presentation contract.
 *
 * This module is server-safe by design: it has no `'use client'` directive, no hooks and
 * no data fetching, so the anonymous server-rendered public page and the editor's Preview
 * tab render the *same* component from the *same* structure. Only the data source and the
 * resolved asset hrefs differ between the two surfaces.
 *
 * `PassportView` remains the authoritative public API contract; this model is the
 * smallest explicit display shape the component needs, produced by the two adapters
 * (`public-passport.ts` for the published projection, `draft-preview.ts` for the current
 * editor state). It is deliberately not a generic mapping framework.
 */

export const DOCUMENT_KIND_LABELS = {
  MANUAL: 'Manual',
  WARRANTY: 'Warranty',
  TECHNICAL_DATASHEET: 'Technical datasheet',
} as const

export type PassportDocumentKind = keyof typeof DOCUMENT_KIND_LABELS

export type PassportPresentationModel = {
  passport: {
    /** Null before first publication; the editor Preview shows a placeholder. */
    publicUuid: string | null
    creationDate: string | null
    version: number | null
    publishedAt: string | null
    status: 'DRAFT' | 'PUBLISHED'
    /** Prototype/application-level presentation, never a certification. */
    verificationStatus: 'VERIFIED' | null
    publicUrl: string | null
    qrDownloadUrl: string | null
  }
  brand: {
    /** Company display name; the Notarify mark itself is a bundled application asset. */
    displayName: string
  }
  product: {
    name: string | null
    sku: string | null
    serialNumber: string | null
    description: string | null
    productionDate: string | null
    originCountry: string | null
    categoryName: string | null
  }
  materials: ReadonlyArray<{
    /** Stable identity assigned by the adapter, never an array index. */
    key: string
    name: string
    percentage: number
    originCountry: string | null
    recyclable: boolean | null
  }>
  sustainability: {
    carbonKgCo2e: number | null
    waterLitres: number | null
    recycledPercent: number | null
    repairabilityScore: number | null
    recyclable: boolean | null
  } | null
  certifications: ReadonlyArray<{
    key: string
    name: string | null
    issuingAuthority: string | null
    issueDate: string | null
    expirationDate: string | null
    fileHref: string | null
    fileName: string | null
  }>
  documents: ReadonlyArray<{
    key: string
    kind: PassportDocumentKind
    title: string | null
    fileHref: string | null
    fileName: string | null
  }>
  images: ReadonlyArray<{
    assetId: string
    role: 'COVER' | 'GALLERY'
    altText: string | null
    /** Null while a Preview object URL is still being minted. */
    src: string | null
  }>
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Formats a date-only or ISO timestamp deterministically.
 *
 * A fixed month table and the UTC date portion are used deliberately instead of
 * `toLocaleDateString`: the server and the browser must produce identical markup or React
 * reports a hydration mismatch, and the value is a calendar date rather than an instant.
 */
export function formatPassportDate(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (match === null) {
    return value
  }
  const month = MONTH_NAMES[Number(match[2]) - 1]
  if (month === undefined) {
    return value
  }
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** Formats a quantity with a pinned locale so server and client markup agree. */
export function formatQuantity(value: number, unit: string, maximumFractionDigits: number): string {
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)
  if (unit.length === 0) {
    return formatted
  }
  // Percentages read as "40%"; every other unit is spaced ("12.5 kg CO₂e").
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0
}

function Provided({ value }: { value: string | null }) {
  if (!hasText(value)) {
    return <span className="text-base-content/50">Not provided</span>
  }
  return <>{value}</>
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-base-content/60">{children}</p>
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      data-passport-section={id}
      className="card border border-base-300 bg-base-100 shadow-sm"
    >
      <div className="card-body gap-4">
        <h2 id={id} className="card-title text-base sm:text-lg">
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-base-content/60">{label}</dt>
      <dd className="mt-1 break-words text-sm text-base-content">{children}</dd>
    </div>
  )
}

function PassportHeader({
  model,
  cover,
}: {
  model: PassportPresentationModel
  cover: PassportPresentationModel['images'][number] | null
}) {
  const productName = hasText(model.product.name) ? model.product.name : 'Untitled product'
  const coverAlt = hasText(cover?.altText ?? null)
    ? (cover?.altText as string)
    : `${productName} cover image`

  return (
    <header className="card overflow-hidden border border-base-300 bg-base-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 bg-base-200 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <NotarifyMark className="h-9 w-9 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Notarify</p>
            <p className="truncate text-xs text-base-content/70" data-testid="brand-name">
              {model.brand.displayName}
            </p>
          </div>
        </div>
        <span className="badge badge-outline badge-sm whitespace-nowrap">
          Digital Product Passport
        </span>
      </div>

      {cover === null ? null : cover.src === null ? (
        <div className="flex h-40 w-full items-center justify-center bg-base-200 text-sm text-base-content/60 sm:h-64">
          Cover image loading…
        </div>
      ) : (
        // biome-ignore lint/performance/noImgElement: published asset bytes are served by the API origin, and routing them through the Next image optimiser would proxy public binaries through the web server. See the public passport scope.
        <img
          src={cover.src}
          alt={coverAlt}
          data-testid="passport-cover-image"
          className="h-40 w-full bg-base-200 object-cover sm:h-64"
        />
      )}

      <div className="card-body gap-3">
        <h1
          className="break-words text-2xl font-semibold sm:text-3xl"
          data-testid="passport-product-name"
        >
          {productName}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {model.passport.verificationStatus === 'VERIFIED' ? (
            <span className="badge badge-success badge-sm" data-testid="verification-badge">
              Verified Product
            </span>
          ) : null}
          <span className="badge badge-ghost badge-sm" data-testid="passport-status">
            {model.passport.status === 'PUBLISHED' ? 'Published' : 'Draft — not published'}
          </span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU">
            <Provided value={model.product.sku} />
          </Field>
          <Field label="Serial number">
            <Provided value={model.product.serialNumber} />
          </Field>
          <Field label="Category">
            <Provided value={model.product.categoryName} />
          </Field>
        </dl>

        {model.passport.verificationStatus === 'VERIFIED' ? (
          <p className="text-xs text-base-content/60">
            Prototype/application-level indicator only. It is not a legal certification, proof of
            authenticity, an ESPR compliance statement or an EU registration.
          </p>
        ) : null}
      </div>
    </header>
  )
}

function MaterialsSection({ materials }: { materials: PassportPresentationModel['materials'] }) {
  const showRecyclable = materials.some((material) => material.recyclable !== null)

  return (
    <Section id="materials" title="Materials">
      {materials.length === 0 ? (
        <EmptyNote>No materials recorded.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm w-full">
            <caption className="sr-only">Materials, their share of the product and origin</caption>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col" className="text-right">
                  Share
                </th>
                <th scope="col">Origin</th>
                {showRecyclable ? <th scope="col">Recyclable</th> : null}
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.key}>
                  <th scope="row" className="break-words font-medium">
                    {material.name}
                  </th>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {formatQuantity(material.percentage, '%', 2)}
                  </td>
                  <td>
                    <Provided value={material.originCountry} />
                  </td>
                  {showRecyclable ? (
                    <td>
                      {material.recyclable === null ? '—' : material.recyclable ? 'Yes' : 'No'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function CertificationsSection({
  certifications,
}: {
  certifications: PassportPresentationModel['certifications']
}) {
  return (
    <Section id="certifications" title="Certifications">
      {certifications.length === 0 ? (
        <EmptyNote>No certifications recorded.</EmptyNote>
      ) : (
        <ul className="space-y-4">
          {certifications.map((certification) => (
            <li key={certification.key} className="rounded-box border border-base-300 p-4">
              <p className="break-words text-sm font-semibold">
                <Provided value={certification.name} />
              </p>
              <dl className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field label="Issuing authority">
                  <Provided value={certification.issuingAuthority} />
                </Field>
                <Field label="Issued">
                  <Provided value={formatPassportDate(certification.issueDate)} />
                </Field>
                <Field label="Expires">
                  <Provided value={formatPassportDate(certification.expirationDate)} />
                </Field>
              </dl>
              {certification.fileHref !== null ? (
                <a
                  className="link link-primary mt-3 inline-block text-sm"
                  href={certification.fileHref}
                  data-testid="certification-download"
                >
                  {hasText(certification.fileName)
                    ? `Download ${certification.fileName}`
                    : 'Download certificate PDF'}
                </a>
              ) : hasText(certification.fileName) ? (
                <p className="mt-3 text-xs text-base-content/60">
                  Attached: {certification.fileName}
                </p>
              ) : (
                <p className="mt-3 text-xs text-base-content/60">No certificate PDF attached.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SustainabilitySection({
  sustainability,
}: {
  sustainability: PassportPresentationModel['sustainability']
}) {
  const cards: Array<{ label: string; value: string | null }> = [
    {
      label: 'Carbon footprint',
      value:
        sustainability?.carbonKgCo2e == null
          ? null
          : formatQuantity(sustainability.carbonKgCo2e, 'kg CO₂e', 3),
    },
    {
      label: 'Water consumption',
      value:
        sustainability?.waterLitres == null
          ? null
          : formatQuantity(sustainability.waterLitres, 'L', 3),
    },
    {
      label: 'Recycled material',
      value:
        sustainability?.recycledPercent == null
          ? null
          : formatQuantity(sustainability.recycledPercent, '%', 2),
    },
    {
      label: 'Repairability score',
      value:
        sustainability?.repairabilityScore == null
          ? null
          : `${formatQuantity(sustainability.repairabilityScore, '', 2)} / 10`,
    },
    {
      label: 'Recyclable',
      value: sustainability?.recyclable == null ? null : sustainability.recyclable ? 'Yes' : 'No',
    },
  ]

  return (
    <Section id="sustainability" title="Sustainability">
      {sustainability === null ? (
        <EmptyNote>No sustainability data recorded.</EmptyNote>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-box border border-base-300 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                {card.label}
              </dt>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums">
                {card.value === null ? (
                  <span className="text-sm font-normal text-base-content/50">Not provided</span>
                ) : (
                  card.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}

function DocumentsSection({ documents }: { documents: PassportPresentationModel['documents'] }) {
  return (
    <Section id="documents" title="Documents">
      {documents.length === 0 ? (
        <EmptyNote>No documents attached.</EmptyNote>
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li
              key={document.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{DOCUMENT_KIND_LABELS[document.kind]}</p>
                <p className="break-words text-xs text-base-content/70">
                  <Provided value={document.title} />
                  {hasText(document.fileName) ? ` · ${document.fileName}` : ''}
                </p>
              </div>
              {document.fileHref !== null ? (
                <a
                  className="btn btn-outline btn-sm"
                  href={document.fileHref}
                  data-testid="document-download"
                >
                  Download
                </a>
              ) : hasText(document.fileName) ? (
                <span className="text-xs text-base-content/60">Attached</span>
              ) : (
                <span className="text-xs text-base-content/60">Not available</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function ImagesSection({
  cover,
  gallery,
  productName,
}: {
  cover: PassportPresentationModel['images'][number] | null
  gallery: PassportPresentationModel['images']
  productName: string
}) {
  const images = [cover, ...gallery].filter(
    (image): image is PassportPresentationModel['images'][number] => image !== null,
  )

  return (
    <Section id="images" title="Images">
      {images.length === 0 ? (
        <EmptyNote>No images attached.</EmptyNote>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li key={`${image.role}-${image.assetId}`} className="min-w-0">
              {image.src === null ? (
                <div className="flex h-40 w-full items-center justify-center rounded-box bg-base-200 text-sm text-base-content/60">
                  Image loading…
                </div>
              ) : (
                // biome-ignore lint/performance/noImgElement: draft images are private blob: object URLs, which the Next image optimiser cannot fetch or optimise.
                <img
                  src={image.src}
                  alt={
                    hasText(image.altText)
                      ? image.altText
                      : `${productName} ${image.role.toLowerCase()}`
                  }
                  data-testid="passport-gallery-image"
                  className="h-40 w-full rounded-box bg-base-200 object-cover"
                />
              )}
              <p className="mt-2 text-xs text-base-content/60">
                {image.role === 'COVER' ? 'Cover image' : 'Gallery'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function PassportInformationSection({
  passport,
}: {
  passport: PassportPresentationModel['passport']
}) {
  const published = passport.status === 'PUBLISHED'

  return (
    <Section id="passport-information" title="Passport information">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Passport ID">
          {hasText(passport.publicUuid) ? (
            <span className="break-all font-mono text-xs sm:text-sm" data-testid="passport-uuid">
              {passport.publicUuid}
            </span>
          ) : (
            <span className="text-base-content/50">Assigned on first publication</span>
          )}
        </Field>
        <Field label="Creation date">
          {hasText(formatPassportDate(passport.creationDate)) ? (
            formatPassportDate(passport.creationDate)
          ) : (
            <span className="text-base-content/50">Set on first publication</span>
          )}
        </Field>
        <Field label="Version">
          {passport.version === null ? (
            <span className="text-base-content/50">Not published yet</span>
          ) : (
            `v${passport.version}`
          )}
        </Field>
        <Field label="Status">{published ? 'Published' : 'Draft — not published'}</Field>
        <Field label="Verification status">
          {passport.verificationStatus === 'VERIFIED' ? (
            'Verified (prototype/application-level indicator)'
          ) : (
            <span className="text-base-content/50">Not applicable before publication</span>
          )}
        </Field>
        {hasText(passport.publishedAt) ? (
          <Field label="Last published">{formatPassportDate(passport.publishedAt)}</Field>
        ) : null}
      </dl>

      {published && (hasText(passport.publicUrl) || hasText(passport.qrDownloadUrl)) ? (
        <div className="flex flex-wrap gap-2">
          {hasText(passport.publicUrl) ? (
            <a
              className="btn btn-sm btn-outline"
              href={passport.publicUrl}
              data-testid="passport-public-link"
            >
              Open passport
            </a>
          ) : null}
          {hasText(passport.qrDownloadUrl) ? (
            <a
              className="btn btn-sm btn-outline"
              href={passport.qrDownloadUrl}
              data-testid="passport-qr-download"
            >
              Download QR code
            </a>
          ) : null}
        </div>
      ) : null}
    </Section>
  )
}

export function PassportPresentation({ model }: { model: PassportPresentationModel }) {
  const cover = model.images.find((image) => image.role === 'COVER') ?? null
  const gallery = model.images.filter((image) => image.role === 'GALLERY')

  return (
    <article className="mx-auto w-full max-w-5xl space-y-6" data-testid="passport-presentation">
      <PassportHeader model={model} cover={cover} />
      <Section id="product-information" title="Product information">
        <Field label="Description">
          <Provided value={model.product.description} />
        </Field>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <Provided value={model.product.categoryName} />
          </Field>
          <Field label="Production date">
            <Provided value={formatPassportDate(model.product.productionDate)} />
          </Field>
          <Field label="Country of origin">
            <Provided value={model.product.originCountry} />
          </Field>
        </dl>
      </Section>
      <MaterialsSection materials={model.materials} />
      <CertificationsSection certifications={model.certifications} />
      <SustainabilitySection sustainability={model.sustainability} />
      <DocumentsSection documents={model.documents} />
      <ImagesSection
        cover={cover}
        gallery={gallery}
        productName={model.product.name ?? 'Product'}
      />
      <PassportInformationSection passport={model.passport} />
    </article>
  )
}
