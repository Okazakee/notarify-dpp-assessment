import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { AssetState } from '../generated/prisma/enums.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AssetResponse, LinkableAsset, UploadedFile } from './asset.types.js'
import {
  assertStoredMime,
  assetNotFound,
  detectUpload,
  IMAGE_MIME_TYPES,
  normalizeImage,
  sanitizeOriginalName,
  unsupportedFileType,
} from './asset-processing.js'

/**
 * Read-only view of the Prisma model delegate an asset query needs.
 *
 * Typing the client structurally lets the same query run inside a caller's
 * transaction without this module importing Prisma's namespace internals or
 * exposing a second way to reach the database.
 */
type AssetQueryClient = Pick<PrismaService, 'asset'>

const ASSET_METADATA_SELECT = {
  id: true,
  originalName: true,
  detectedMime: true,
  sizeBytes: true,
  createdAt: true,
} as const

type AssetMetadataRow = {
  id: string
  originalName: string
  detectedMime: string
  sizeBytes: bigint
  createdAt: Date
}

function toAssetResponse(row: AssetMetadataRow): AssetResponse {
  return {
    id: row.id,
    originalName: row.originalName,
    detectedMime: row.detectedMime,
    sizeBytes: Number(row.sizeBytes),
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Prisma 7 types `Bytes` as `Uint8Array<ArrayBuffer>`, which a Node `Buffer`
 * (backed by `ArrayBufferLike`) does not satisfy. Copying into a fresh array both
 * satisfies the type and detaches stored content from the request buffer.
 */
function toStoredBytes(value: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value)
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates, normalizes and stores one uploaded file.
   *
   * Validation happens entirely before the first write, so an upload that fails
   * never leaves an `Asset` behind — let alone an accepted one. The `Asset` and its
   * `AssetContent` are then created in one transaction, because an asset without
   * its bytes is not a meaningful row.
   */
  async create(
    companyId: string,
    uploaderId: string,
    file: UploadedFile | undefined,
  ): Promise<AssetResponse> {
    if (file === undefined || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw unsupportedFileType()
    }

    const detected = await detectUpload(file.buffer)
    if (detected === null) {
      throw unsupportedFileType()
    }

    // PDFs are stored as received: rewriting them is PDF CDR work and out of scope.
    // Images are decoded and re-encoded, which strips metadata and proves decodability.
    const storedBytes =
      detected.kind === 'IMAGE'
        ? await normalizeImage(file.buffer, detected.mime)
        : Buffer.from(file.buffer)

    await assertStoredMime(storedBytes, detected.mime)

    const sha256 = createHash('sha256').update(storedBytes).digest('hex')
    const originalName = sanitizeOriginalName(file.originalname)

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          companyId,
          uploaderId,
          detectedMime: detected.mime,
          sizeBytes: BigInt(storedBytes.length),
          sha256,
          originalName,
          state: AssetState.ACCEPTED,
        },
        select: ASSET_METADATA_SELECT,
      })

      await tx.assetContent.create({
        data: { assetId: asset.id, bytes: toStoredBytes(storedBytes) },
      })

      return asset
    })

    return toAssetResponse(created)
  }

  /**
   * Loads an asset for authenticated retrieval, scoped to the caller's company.
   *
   * The `companyId` predicate is part of the lookup rather than a check afterwards,
   * so an asset belonging to another company is indistinguishable from one that does
   * not exist: both produce the same 404 and neither confirms existence.
   *
   * Bytes are pulled through an explicit `select` so that no other query in this
   * module can accidentally load `AssetContent.bytes`.
   */
  async findForDownload(
    companyId: string,
    assetId: string,
  ): Promise<{
    id: string
    detectedMime: string
    sizeBytes: number
    originalName: string
    bytes: Buffer
  }> {
    // A malformed id must never reach the database as a raw query value: the driver
    // would reject it as an internal error rather than the endpoint's clean not-found,
    // and any authenticated caller could trigger that with a hand-written path.
    if (!isUUID(assetId)) {
      throw assetNotFound()
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, state: AssetState.ACCEPTED },
      select: {
        ...ASSET_METADATA_SELECT,
        content: { select: { bytes: true } },
      },
    })

    if (asset === null || asset.content === null) {
      throw assetNotFound()
    }

    return {
      id: asset.id,
      detectedMime: asset.detectedMime,
      sizeBytes: Number(asset.sizeBytes),
      originalName: asset.originalName,
      bytes: Buffer.from(asset.content.bytes),
    }
  }

  /**
   * Loads an accepted asset and its bytes by exact id, performing **no** authorization of
   * its own.
   *
   * The trust boundary is explicit and narrow. This exists for a caller that has already
   * established the asset may be served — currently the anonymous published-asset route,
   * which proves the asset is retained by the current active published version before
   * calling. It deliberately does not scope by company or state beyond `ACCEPTED`, so it
   * must never be called from a route that has not made that authorization decision
   * first. It returns `null` rather than throwing so the caller maps every failure to its
   * own safe response.
   */
  async findAcceptedContentById(assetId: string): Promise<{
    id: string
    detectedMime: string
    originalName: string
    bytes: Buffer
  } | null> {
    if (!isUUID(assetId)) {
      return null
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, state: AssetState.ACCEPTED },
      select: {
        id: true,
        detectedMime: true,
        originalName: true,
        content: { select: { bytes: true } },
      },
    })

    if (asset === null || asset.content === null) {
      return null
    }

    return {
      id: asset.id,
      detectedMime: asset.detectedMime,
      originalName: asset.originalName,
      bytes: Buffer.from(asset.content.bytes),
    }
  }

  /**
   * Loads the accepted content of several assets in one query.
   *
   * Same trust boundary as `findAcceptedContentById`: it performs no authorization of
   * its own and must only be called after the caller has established that every id may
   * be served. It exists so a bounded batch read — currently the passport PDF, which
   * embeds several retained images — does not become one query per asset. Malformed ids
   * are dropped rather than passed to the driver, and a missing or non-accepted asset is
   * simply absent from the result.
   */
  async findAcceptedContentsByIds(assetIds: string[]): Promise<
    Array<{
      id: string
      detectedMime: string
      originalName: string
      bytes: Buffer
    }>
  > {
    const uniqueIds = [...new Set(assetIds)].filter((assetId) => isUUID(assetId))
    if (uniqueIds.length === 0) {
      return []
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: uniqueIds }, state: AssetState.ACCEPTED },
      select: {
        id: true,
        detectedMime: true,
        originalName: true,
        content: { select: { bytes: true } },
      },
    })

    return assets.flatMap((asset) =>
      asset.content === null
        ? []
        : [
            {
              id: asset.id,
              detectedMime: asset.detectedMime,
              originalName: asset.originalName,
              bytes: Buffer.from(asset.content.bytes),
            },
          ],
    )
  }

  /**
   * Resolves one accepted, same-company image asset that still has stored content.
   *
   * This is the company-logo rule in one place: a foreign id, a non-accepted asset, an
   * asset whose content is gone and a non-image all resolve to `null`, so a caller cannot
   * accidentally accept one. The `companyId` predicate is part of the query rather than a
   * check afterwards, which keeps a foreign asset indistinguishable from a missing one.
   */
  async findCompanyAcceptedImage(
    companyId: string,
    assetId: string,
  ): Promise<{ id: string; detectedMime: string } | null> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, state: AssetState.ACCEPTED, content: { isNot: null } },
      select: { id: true, detectedMime: true },
    })
    if (asset === null) {
      return null
    }

    const isImage = IMAGE_MIME_TYPES.some((mime) => mime === asset.detectedMime)
    return isImage ? asset : null
  }

  /**
   * Resolves the assets a product draft is allowed to reference.
   *
   * Only accepted, same-company assets are returned, and the query is scoped by
   * `companyId` so a foreign id simply does not resolve. Callers compare the result
   * against the ids they were given and reject any that did not resolve, which keeps
   * the authorization rule in one place.
   *
   * Accepts an optional client so it can run inside a caller's transaction.
   */
  async findLinkableAssets(
    companyId: string,
    assetIds: string[],
    client: AssetQueryClient = this.prisma,
  ): Promise<Map<string, LinkableAsset>> {
    const uniqueIds = [...new Set(assetIds)]
    if (uniqueIds.length === 0) {
      return new Map()
    }

    const rows = await client.asset.findMany({
      where: { id: { in: uniqueIds }, companyId, state: AssetState.ACCEPTED },
      select: { id: true, detectedMime: true },
    })

    return new Map(rows.map((row) => [row.id, { id: row.id, detectedMime: row.detectedMime }]))
  }
}
