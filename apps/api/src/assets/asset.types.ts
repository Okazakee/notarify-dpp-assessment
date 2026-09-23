/**
 * Public asset contracts.
 *
 * Prisma records are never returned directly; these are the shapes the HTTP layer
 * exposes. `sizeBytes` is a `number` rather than the `bigint` Prisma uses, because
 * the assessment limits cap stored content far below `Number.MAX_SAFE_INTEGER` and
 * `JSON.stringify` cannot serialize a `bigint` at all.
 */

export type AssetResponse = {
  id: string
  originalName: string
  detectedMime: string
  sizeBytes: number
  createdAt: string
}

/**
 * The subset of Multer's file object this module relies on.
 *
 * Declared locally rather than pulling in `@types/multer` and `@types/express`:
 * `@nestjs/platform-express` does not reference the `Express.Multer` namespace in
 * its own declarations, and Multer 2.x ships no types, so a local shape is both
 * accurate and dependency-free.
 */
export type UploadedFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

/** Metadata required to authorize an asset reference from a product draft. */
export type LinkableAsset = {
  id: string
  detectedMime: string
}
