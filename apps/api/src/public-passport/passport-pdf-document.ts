import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import type { PassportView } from './passport-view.js'

/**
 * The print layout for one published passport.
 *
 * This module is deliberately pure: it receives an already-resolved immutable
 * `PassportView`, the stored QR artifact and PDF-safe image bytes, and returns a
 * `PDFDocument` stream. It performs no lifecycle lookup, no asset authorization and no
 * database access, so the only content it can render is what the caller proved the
 * current active version may expose.
 *
 * The layout is an independently designed print document, not a copy of the web page:
 * the shared presentation contract stays the source of the field mapping, while the
 * visual structure here is built for A4.
 */

const require = createRequire(import.meta.url)

/**
 * Embedded font files, resolved from the installed package so the API stays
 * reproducible offline after `pnpm install`. No font is fetched at runtime.
 *
 * The full Noto Sans files are used rather than a subset package because PDFKit has no
 * automatic font fallback: `@fontsource/noto-sans` splits basic Latin and Latin Extended
 * into separate subset files, so no single file there can render a realistic mixed
 * European string such as "Caffè Torino · München · Łódź".
 */
const FONT_REGULAR = require.resolve(
  '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf',
)
const FONT_BOLD = require.resolve('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf')

const PAGE_MARGIN = 48
/** Reserved below the content area for the page footer. */
const PAGE_FOOTER_HEIGHT = 64
/** Longest side an embedded image is reduced to. Never upscales. */
export const PDF_IMAGE_MAX_DIMENSION = 1600

const COLOR_INK = '#1f2933'
const COLOR_MUTED = '#6b7280'
const COLOR_BRAND = '#1d4ed8'
const COLOR_BORDER = '#d1d5db'
const COLOR_SURFACE = '#f3f4f6'
const COLOR_SUCCESS = '#15803d'

export type PassportPdfImageMime = 'image/jpeg' | 'image/png'

/** The document type the renderer and the streaming helper both speak. */
export type PassportPdfDocument = PDFKit.PDFDocument

export type PassportPdfImage = {
  role: 'COVER' | 'GALLERY'
  altText: string | null
  bytes: Buffer
  mime: PassportPdfImageMime
}

export type PassportPdfSource = {
  /** The current immutable published projection. Never mutable draft content. */
  view: PassportView
  /** The stored Stage 4.1 QR artifact, byte for byte. */
  qrPng: Buffer
  /** Retained images of the current version, already converted to a PDF-safe format. */
  images: PassportPdfImage[]
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

/** Deterministic date formatting, mirroring the public presentation contract. */
function formatDate(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (match === null) {
    return value
  }
  const month = MONTH_NAMES[Number(match[2]) - 1]
  return month === undefined ? value : `${Number(match[3])} ${month} ${match[1]}`
}

function formatQuantity(value: number, unit: string, maximumFractionDigits: number): string {
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`.trim()
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0
}

function displayValue(value: string | null): string {
  return hasText(value) ? value : 'Not provided'
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE_FOOTER_HEIGHT
}

/**
 * Adds a page when the next block would not fit, returning whether it did.
 *
 * The footer is drawn from the `pageAdded` handler, so a page added here is already
 * labelled before content continues.
 */
function ensureSpace(doc: PDFKit.PDFDocument, height: number): boolean {
  if (doc.y + height <= contentBottom(doc)) {
    return false
  }
  doc.addPage()
  return true
}

function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
  const flowY = doc.y
  // The footer lives in the bottom margin, below the content area. Temporarily removing
  // the bottom margin stops PDFKit from treating this text as overflow and adding a
  // page, which would fire `pageAdded` again and recurse forever.
  const bottomMargin = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc
    .font('regular')
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text(
      `Notarify · Digital Product Passport · Page ${pageNumber}`,
      PAGE_MARGIN,
      doc.page.height - 40,
      { width: contentWidth(doc), align: 'center', lineBreak: false },
    )
  doc.page.margins.bottom = bottomMargin
  doc.fillColor(COLOR_INK)
  doc.y = flowY
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  // The previous block may have left `doc.x` at a column position (the materials table
  // and key/value grids draw at explicit x coordinates). The heading and every paragraph
  // under it must start at the page margin, or they are clipped at the right edge.
  doc.x = PAGE_MARGIN
  ensureSpace(doc, 40)
  doc.moveDown(0.8)
  doc
    .font('bold')
    .fontSize(13)
    .fillColor(COLOR_INK)
    .text(title.toUpperCase(), { characterSpacing: 0.6 })
  const ruleY = doc.y + 3
  doc
    .save()
    .moveTo(PAGE_MARGIN, ruleY)
    .lineTo(PAGE_MARGIN + contentWidth(doc), ruleY)
    .lineWidth(0.8)
    .strokeColor(COLOR_BORDER)
    .stroke()
    .restore()
  doc.y = ruleY + 8
  // Full-width flow text must start at the page margin; the previous block may have left
  // `doc.x` at a column position, which would clip wrapped paragraphs at the page edge.
  doc.x = PAGE_MARGIN
}

function keyValues(doc: PDFKit.PDFDocument, pairs: Array<[string, string]>, columns = 2): void {
  const width = contentWidth(doc) / columns
  const labelHeight = 11
  let column = 0
  let rowY = doc.y
  let rowHeight = 0
  for (const [label, value] of pairs) {
    if (column === 0) {
      ensureSpace(doc, 34)
      // Every column of one row starts at the same y, so a grid stays aligned even when
      // one value wraps to more lines than its neighbour.
      rowY = doc.y
      rowHeight = 0
    }
    const x = PAGE_MARGIN + column * width
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(label.toUpperCase(), x, rowY, {
        width: width - 12,
        lineBreak: false,
      })
    const valueHeight = doc
      .font('regular')
      .fontSize(10)
      .fillColor(COLOR_INK)
      .heightOfString(value, { width: width - 12 })
    doc.text(value, x, rowY + labelHeight, { width: width - 12 })
    rowHeight = Math.max(rowHeight, labelHeight + Math.max(valueHeight, 12))
    column += 1
    if (column === columns) {
      column = 0
      doc.y = rowY + rowHeight + 8
    }
  }
  if (column !== 0) {
    doc.y = rowY + rowHeight + 8
  }
  // Reset the flow position: callers draw full-width text next, and an explicit x/y draw
  // leaves `doc.x` at the last column.
  doc.x = PAGE_MARGIN
}

function drawBadge(doc: PDFKit.PDFDocument, text: string, x: number, y: number): number {
  doc.font('bold').fontSize(9)
  const width = doc.widthOfString(text) + 18
  const height = 18
  doc.save().roundedRect(x, y, width, height, 9).fill(COLOR_SUCCESS).restore()
  doc
    .fillColor('#ffffff')
    .font('bold')
    .fontSize(9)
    .text(text, x + 9, y + 4.5, { lineBreak: false })
  doc.fillColor(COLOR_INK)
  return width
}

function drawImagePlaceholder(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): void {
  doc.save().roundedRect(x, y, width, height, 6).fill(COLOR_SURFACE).restore()
  doc
    .font('regular')
    .fontSize(10)
    .fillColor(COLOR_MUTED)
    .text(label, x, y + height / 2 - 6, { width, align: 'center' })
  doc.fillColor(COLOR_INK)
}

function drawBrandHeader(doc: PDFKit.PDFDocument, brandName: string): void {
  const y = PAGE_MARGIN
  doc.save().roundedRect(PAGE_MARGIN, y, 26, 26, 6).fill(COLOR_BRAND).restore()
  doc
    .fillColor('#ffffff')
    .font('bold')
    .fontSize(16)
    .text('N', PAGE_MARGIN, y + 5.5, { width: 26, align: 'center', lineBreak: false })
  doc
    .fillColor(COLOR_INK)
    .font('bold')
    .fontSize(16)
    .text('Notarify', PAGE_MARGIN + 34, y + 1, {
      lineBreak: false,
    })
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(brandName, PAGE_MARGIN + 34, y + 17, { width: 260, lineBreak: false })
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text('Digital Product Passport', PAGE_MARGIN, y + 2, {
      width: contentWidth(doc),
      align: 'right',
      lineBreak: false,
    })
  doc.fillColor(COLOR_INK)
  doc.y = y + 36
  doc
    .save()
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + contentWidth(doc), doc.y)
    .lineWidth(1)
    .strokeColor(COLOR_BORDER)
    .stroke()
    .restore()
  doc.y += 16
}

function drawCover(doc: PDFKit.PDFDocument, image: PassportPdfImage | null): void {
  const width = contentWidth(doc)
  const height = 210
  ensureSpace(doc, height + 12)
  const x = PAGE_MARGIN
  const y = doc.y
  if (image === null) {
    drawImagePlaceholder(doc, x, y, width, height, 'Cover image unavailable')
  } else {
    try {
      doc.image(image.bytes, x, y, { fit: [width, height], align: 'center', valign: 'center' })
    } catch {
      // A corrupt stored image must not abort the export; the immutable product
      // information below is still worth delivering.
      drawImagePlaceholder(doc, x, y, width, height, 'Cover image unavailable')
    }
  }
  doc.y = y + height + 16
}

function drawProductHeader(doc: PDFKit.PDFDocument, view: PassportView): void {
  doc.font('bold').fontSize(22).fillColor(COLOR_INK)
  doc.text(displayValue(view.product.name), { width: contentWidth(doc) })
  doc.moveDown(0.4)
  const badgeY = doc.y
  if (view.passport.verificationStatus === 'VERIFIED') {
    const badgeWidth = drawBadge(doc, 'Verified Product', PAGE_MARGIN, badgeY)
    doc.y = badgeY
    doc.x = PAGE_MARGIN + badgeWidth + 8
  }
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text('Prototype/application-level indicator only', doc.x, badgeY + 4, {
      width: contentWidth(doc) - (doc.x - PAGE_MARGIN),
      lineBreak: false,
    })
  doc.fillColor(COLOR_INK)
  doc.x = PAGE_MARGIN
  doc.y = badgeY + 26
  keyValues(
    doc,
    [
      ['SKU', displayValue(view.product.sku)],
      ['Serial number', displayValue(view.product.serialNumber)],
      ['Category', displayValue(view.product.categoryName)],
    ],
    3,
  )
}

function drawMaterialsTable(doc: PDFKit.PDFDocument, view: PassportView): void {
  sectionTitle(doc, 'Materials')
  if (view.materials.length === 0) {
    doc.font('regular').fontSize(10).fillColor(COLOR_MUTED).text('No materials recorded.')
    doc.fillColor(COLOR_INK)
    return
  }

  const width = contentWidth(doc)
  const columns: Array<{ label: string; width: number; align?: 'right' }> = [
    { label: 'Material', width: width * 0.44 },
    { label: 'Share', width: width * 0.16, align: 'right' },
    { label: 'Origin', width: width * 0.18 },
    { label: 'Recyclable', width: width * 0.22 },
  ]
  const cellPadding = 6

  const drawHeader = (): void => {
    const headerHeight = 20
    const y = doc.y
    doc.save().rect(PAGE_MARGIN, y, width, headerHeight).fill(COLOR_SURFACE).restore()
    let x = PAGE_MARGIN
    doc.font('bold').fontSize(8).fillColor(COLOR_INK)
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), x + cellPadding, y + 6, {
        width: column.width - cellPadding * 2,
        align: column.align ?? 'left',
        lineBreak: false,
      })
      x += column.width
    }
    doc.y = y + headerHeight
    doc
      .save()
      .moveTo(PAGE_MARGIN, doc.y)
      .lineTo(PAGE_MARGIN + width, doc.y)
      .lineWidth(0.8)
      .strokeColor(COLOR_BORDER)
      .stroke()
      .restore()
  }

  drawHeader()
  for (const material of view.materials) {
    const values = [
      material.name,
      formatQuantity(material.percentage, '%', 2),
      displayValue(material.originCountry),
      material.recyclable === null ? '—' : material.recyclable ? 'Yes' : 'No',
    ]
    // Pair each value with its column once, so no later access needs an index that the
    // compiler must treat as possibly missing.
    const cells = columns.map((column, index) => ({ column, value: values[index] ?? '' }))
    doc.font('regular').fontSize(9)
    const rowHeight =
      Math.max(
        ...cells.map(({ column, value }) =>
          doc.heightOfString(value, { width: column.width - cellPadding * 2 }),
        ),
      ) +
      cellPadding * 2
    if (ensureSpace(doc, rowHeight)) {
      // The continuation page repeats the header so a long material list stays readable.
      drawHeader()
    }
    const y = doc.y
    let x = PAGE_MARGIN
    for (const { column, value } of cells) {
      doc.font('regular').fontSize(9).fillColor(COLOR_INK)
      doc.text(value, x + cellPadding, y + cellPadding, {
        width: column.width - cellPadding * 2,
        align: column.align ?? 'left',
      })
      x += column.width
    }
    doc.y = y + rowHeight
    doc
      .save()
      .moveTo(PAGE_MARGIN, doc.y)
      .lineTo(PAGE_MARGIN + width, doc.y)
      .lineWidth(0.5)
      .strokeColor(COLOR_BORDER)
      .stroke()
      .restore()
  }
}

function drawSustainability(doc: PDFKit.PDFDocument, view: PassportView): void {
  sectionTitle(doc, 'Sustainability')
  const sustainability = view.sustainability
  if (sustainability === null) {
    doc.font('regular').fontSize(10).fillColor(COLOR_MUTED).text('No sustainability data recorded.')
    doc.fillColor(COLOR_INK)
    return
  }
  keyValues(
    doc,
    [
      [
        'Carbon footprint',
        sustainability.carbonKgCo2e === null
          ? 'Not provided'
          : formatQuantity(sustainability.carbonKgCo2e, 'kg CO2e', 3),
      ],
      [
        'Water consumption',
        sustainability.waterLitres === null
          ? 'Not provided'
          : formatQuantity(sustainability.waterLitres, 'L', 3),
      ],
      [
        'Recycled material',
        sustainability.recycledPercent === null
          ? 'Not provided'
          : formatQuantity(sustainability.recycledPercent, '%', 2),
      ],
      [
        'Repairability score',
        sustainability.repairabilityScore === null
          ? 'Not provided'
          : `${formatQuantity(sustainability.repairabilityScore, '', 2)} / 10`,
      ],
      [
        'Recyclable',
        sustainability.recyclable === null
          ? 'Not provided'
          : sustainability.recyclable
            ? 'Yes'
            : 'No',
      ],
    ],
    2,
  )
}

function drawCertifications(doc: PDFKit.PDFDocument, view: PassportView): void {
  sectionTitle(doc, 'Certifications')
  if (view.certifications.length === 0) {
    doc.font('regular').fontSize(10).fillColor(COLOR_MUTED).text('No certifications recorded.')
    doc.fillColor(COLOR_INK)
    return
  }
  for (const certification of view.certifications) {
    ensureSpace(doc, 84)
    doc.font('bold').fontSize(11).fillColor(COLOR_INK)
    doc.text(displayValue(certification.name), { width: contentWidth(doc) })
    doc.moveDown(0.2)
    keyValues(
      doc,
      [
        ['Issuing authority', displayValue(certification.issuingAuthority)],
        ['Issued', displayValue(formatDate(certification.issueDate))],
        ['Expires', displayValue(formatDate(certification.expirationDate))],
      ],
      3,
    )
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(
        certification.pdfAssetId === null
          ? 'No certificate PDF attached.'
          : 'Supporting certificate PDF available from the public passport.',
        {
          width: contentWidth(doc),
          // The supporting file is reachable through the canonical public passport page,
          // which is already the document's link target. No API origin is invented here.
          link: certification.pdfAssetId === null ? undefined : view.passport.publicUrl,
        },
      )
    doc.fillColor(COLOR_INK)
    doc.moveDown(0.6)
  }
}

function drawDocuments(doc: PDFKit.PDFDocument, view: PassportView): void {
  sectionTitle(doc, 'Documents')
  if (view.documents.length === 0) {
    doc.font('regular').fontSize(10).fillColor(COLOR_MUTED).text('No documents attached.')
    doc.fillColor(COLOR_INK)
    return
  }
  const labels: Record<string, string> = {
    MANUAL: 'Manual',
    WARRANTY: 'Warranty',
    TECHNICAL_DATASHEET: 'Technical datasheet',
  }
  for (const document of view.documents) {
    ensureSpace(doc, 30)
    doc
      .font('bold')
      .fontSize(10)
      .fillColor(COLOR_INK)
      .text(labels[document.kind] ?? 'Document', { continued: true })
    doc
      .font('regular')
      .fontSize(10)
      .text(` — ${displayValue(document.title)}`)
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text('Supporting file available from the public passport.', {
        width: contentWidth(doc),
        link: view.passport.publicUrl,
      })
    doc.fillColor(COLOR_INK)
    doc.moveDown(0.4)
  }
}

function drawGallery(doc: PDFKit.PDFDocument, images: PassportPdfImage[]): void {
  const gallery = images.filter((image) => image.role === 'GALLERY')
  sectionTitle(doc, 'Gallery')
  if (gallery.length === 0) {
    doc.font('regular').fontSize(10).fillColor(COLOR_MUTED).text('No gallery images.')
    doc.fillColor(COLOR_INK)
    return
  }

  const columnGap = 12
  const columnWidth = (contentWidth(doc) - columnGap) / 2
  const imageHeight = 140
  const captionGap = 2
  let column = 0
  let rowY = doc.y
  let rowCaptionHeight = 0
  // Both columns of a row share one origin, and the row advances once by the tallest
  // caption. Drawing the first caption must not move the second image.
  const advanceRow = (): void => {
    doc.y = rowY + imageHeight + captionGap + rowCaptionHeight + 18
  }
  for (const image of gallery) {
    if (column === 0) {
      ensureSpace(doc, imageHeight + 46)
      rowY = doc.y
      rowCaptionHeight = 0
    }
    const x = PAGE_MARGIN + column * (columnWidth + columnGap)
    try {
      doc.image(image.bytes, x, rowY, { fit: [columnWidth, imageHeight], align: 'center' })
    } catch {
      // An optional gallery image that cannot be embedded is skipped rather than
      // failing the whole export; no draft image is substituted for it.
      drawImagePlaceholder(doc, x, rowY, columnWidth, imageHeight, 'Image unavailable')
    }
    if (hasText(image.altText)) {
      doc.font('regular').fontSize(8).fillColor(COLOR_MUTED)
      const captionHeight = doc.heightOfString(image.altText, { width: columnWidth })
      // Captions wrap; they are never truncated to keep a row short.
      doc.text(image.altText, x, rowY + imageHeight + captionGap, { width: columnWidth })
      rowCaptionHeight = Math.max(rowCaptionHeight, captionHeight)
      doc.fillColor(COLOR_INK)
    }
    column += 1
    if (column === 2) {
      column = 0
      advanceRow()
    }
  }
  if (column !== 0) {
    advanceRow()
  }
}

function drawPassportInformation(doc: PDFKit.PDFDocument, view: PassportView): void {
  sectionTitle(doc, 'Passport information')
  keyValues(
    doc,
    [
      ['Passport ID', view.passport.publicUuid],
      ['Version', `v${view.passport.version}`],
      ['Creation date', displayValue(formatDate(view.passport.creationDate))],
      ['Last published', displayValue(formatDate(view.passport.publishedAt))],
      ['Status', view.passport.status === 'PUBLISHED' ? 'Published' : 'Draft — not published'],
      [
        'Verification status',
        view.passport.verificationStatus === 'VERIFIED'
          ? 'Verified (prototype/application-level indicator)'
          : 'Not applicable before publication',
      ],
    ],
    2,
  )
  doc
    .font('regular')
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text(
      'This badge is a prototype/application-level indicator only. It is not a legal certification, proof of authenticity, an ESPR compliance statement or an EU registration.',
      { width: contentWidth(doc) },
    )
  doc.fillColor(COLOR_INK)
  doc.moveDown(0.6)
}

function drawQrSection(doc: PDFKit.PDFDocument, view: PassportView, qrPng: Buffer): void {
  sectionTitle(doc, 'Open the published passport')
  ensureSpace(doc, 150)
  const qrSize = 120
  const x = PAGE_MARGIN
  const y = doc.y
  try {
    doc.image(qrPng, x, y, { fit: [qrSize, qrSize] })
  } catch {
    drawImagePlaceholder(doc, x, y, qrSize, qrSize, 'QR unavailable')
  }
  const textX = x + qrSize + 20
  const textWidth = contentWidth(doc) - qrSize - 20
  doc.font('regular').fontSize(10).fillColor(COLOR_INK)
  doc.text('Scan the QR code or open the canonical public passport URL.', textX, y, {
    width: textWidth,
  })
  doc.moveDown(0.4)
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(COLOR_BRAND)
    .text(view.passport.publicUrl, textX, doc.y, {
      width: textWidth,
      link: view.passport.publicUrl,
    })
  doc.fillColor(COLOR_INK)
  doc.moveDown(0.4)
  doc
    .font('regular')
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('The QR code belongs to the passport and stays valid across versions.', textX, doc.y, {
      width: textWidth,
    })
  doc.fillColor(COLOR_INK)
  doc.y = Math.max(y + qrSize, doc.y) + 10
}

/**
 * Creates the document shell: page size, margins, metadata, embedded fonts and the page
 * footer. No published content is drawn yet.
 *
 * Splitting creation from drawing lets the route pipe the document to the client before
 * any content is written, so a large passport streams instead of being queued in memory
 * ahead of the response.
 */
export function createPassportPdfDocument(view: PassportView): PDFKit.PDFDocument {
  const productName = hasText(view.product.name) ? view.product.name : 'Product'

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_FOOTER_HEIGHT,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    info: {
      Title: `${productName} — Digital Product Passport`,
      Subject: `Digital Product Passport ${view.passport.publicUuid} version ${view.passport.version}`,
      Creator: 'Notarify DPP assessment prototype',
      Producer: 'Notarify DPP assessment prototype (PDFKit)',
    },
  })

  doc.registerFont('regular', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('regular')

  let pageNumber = 0
  const labelPage = (): void => {
    pageNumber += 1
    drawFooter(doc, pageNumber)
  }
  doc.on('pageAdded', labelPage)
  // The first page exists before this listener is attached, so label it explicitly.
  labelPage()

  return doc
}

/** Draws every published section into a document created by `createPassportPdfDocument`. */
export function drawPassportPdf(doc: PDFKit.PDFDocument, source: PassportPdfSource): void {
  const { view } = source

  drawBrandHeader(doc, view.brand.displayName)
  const cover = source.images.find((image) => image.role === 'COVER') ?? null
  drawCover(doc, cover)
  drawProductHeader(doc, view)

  sectionTitle(doc, 'Product information')
  doc
    .font('regular')
    .fontSize(10)
    .fillColor(COLOR_INK)
    .text(displayValue(view.product.description), {
      width: contentWidth(doc),
    })
  doc.moveDown(0.6)
  keyValues(
    doc,
    [
      ['Category', displayValue(view.product.categoryName)],
      ['Production date', displayValue(formatDate(view.product.productionDate))],
      ['Country of origin', displayValue(view.product.originCountry)],
    ],
    3,
  )

  drawMaterialsTable(doc, view)
  drawSustainability(doc, view)
  drawCertifications(doc, view)
  drawDocuments(doc, view)
  drawGallery(doc, source.images)
  drawPassportInformation(doc, view)
  drawQrSection(doc, view, source.qrPng)
}
