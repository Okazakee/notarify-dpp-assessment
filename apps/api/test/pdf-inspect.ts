/**
 * Independent PDF inspection for tests.
 *
 * The parser is `pdfjs-dist`, deliberately a different implementation from the PDFKit
 * renderer under test, so "the document parses and contains the published content" is
 * evidence rather than a re-read of our own generator's state. It is test-only tooling:
 * neither this module nor `pdfjs-dist` is part of the application runtime.
 *
 * It is shared by the API integration suite and the Stage 4 acceptance journey so both
 * layers inspect generated documents the same way.
 */

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

export type PdfImage = { width: number; height: number; data: Uint8Array }

export type ParsedPdf = {
  pages: number
  /** All page text, whitespace-normalised for stable substring assertions. */
  text: string
  images: PdfImage[]
  /** Clickable link annotation targets. */
  links: string[]
}

let pdfjsModule: PdfjsModule | null = null

async function pdfjs(): Promise<PdfjsModule> {
  if (pdfjsModule === null) {
    pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  return pdfjsModule
}

/** Parses a generated PDF independently of PDFKit and extracts its text, links and images. */
export async function parsePdf(bytes: Buffer): Promise<ParsedPdf> {
  const pdfjsLib = await pdfjs()
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
  }).promise
  let text = ''
  const images: PdfImage[] = []
  const links: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') {
        text += `${item.str} `
      }
    }
    text += '\n'

    // Clickable link annotations are extracted independently of the drawn text, so a
    // missing or wrong link target fails even when the surrounding words look right.
    const annotations = await page.getAnnotations()
    for (const annotation of annotations) {
      if (annotation.subtype === 'Link' && typeof annotation.url === 'string') {
        links.push(annotation.url)
      }
    }

    const operators = await page.getOperatorList()
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      if (operators.fnArray[index] === pdfjsLib.OPS.paintImageXObject) {
        const id = operators.argsArray[index]?.[0]
        if (typeof id !== 'string') {
          continue
        }
        // PDF.js decodes embedded images asynchronously. An already-resolved object can
        // be read directly; otherwise the callback form waits for the decode instead of
        // throwing "object isn't resolved yet".
        let image: PdfImage | undefined
        try {
          image = page.objs.get(id) as PdfImage | undefined
        } catch {
          image = await new Promise<PdfImage | undefined>((resolve) => {
            const timer = setTimeout(() => resolve(undefined), 3000)
            page.objs.get(id, (resolved: PdfImage) => {
              clearTimeout(timer)
              resolve(resolved)
            })
          })
        }
        if (image !== undefined && image.data !== undefined) {
          images.push(image)
        }
      }
    }
  }

  return { pages: document.numPages, text: text.replace(/\s+/g, ' '), images, links }
}

/** Counts pixels close to an RGB colour across every embedded image. */
export function countColour(images: PdfImage[], colour: [number, number, number]): number {
  let count = 0
  for (const image of images) {
    const pixels = image.width * image.height
    if (pixels <= 0) {
      continue
    }
    const channels = Math.round(image.data.length / pixels)
    if (channels !== 3 && channels !== 4) {
      continue
    }
    for (let offset = 0; offset + channels - 1 < image.data.length; offset += channels) {
      const matches =
        Math.abs((image.data[offset] ?? 0) - colour[0]) <= 8 &&
        Math.abs((image.data[offset + 1] ?? 0) - colour[1]) <= 8 &&
        Math.abs((image.data[offset + 2] ?? 0) - colour[2]) <= 8
      if (matches) {
        count += 1
      }
    }
  }
  return count
}
