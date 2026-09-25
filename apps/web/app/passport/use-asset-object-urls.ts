'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPassportVersionAssetObjectUrl } from '../passports/api'
import { type AuthenticatedRequest, fetchAssetObjectUrl } from '../products/api'

/**
 * Resolves private asset ids into browser object URLs.
 *
 * Private assets stay private: their bytes are only reachable through authenticated
 * routes, and the access token lives in memory, so an `<img src>` cannot carry it. These
 * hooks are the only supported way to display such an asset — they fetch through the
 * shared authenticated `request` function and hand back `blob:` URLs.
 *
 * Every created URL is revoked, whether the effect is superseded, the ids change or the
 * component unmounts. No public visibility is added to make rendering work.
 */
/**
 * How many assets are fetched at once.
 *
 * Bounded on purpose: the shared presentation requests images and downloadable files
 * together, and an unbounded `Promise.all` of many PDFs would make one slow file hold up
 * every other asset and spike memory. Images are requested first by the adapters, so the
 * cover appears without waiting for the documents behind it.
 */
const MAX_CONCURRENT_LOADS = 4

function useObjectUrls(
  ids: readonly string[],
  load: (assetId: string) => Promise<string>,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (ids.length === 0) {
      setUrls({})
      return
    }

    let cancelled = false
    const created = new Set<string>()
    let nextIndex = 0
    setUrls({})

    const loadOne = async (assetId: string) => {
      try {
        const url = await load(assetId)
        if (cancelled) {
          // The effect was superseded while this request was in flight. Revoke now rather
          // than waiting for every other request to settle, or this URL would leak.
          URL.revokeObjectURL(url)
          return
        }
        created.add(url)
        setUrls((current) => ({ ...current, [assetId]: url }))
      } catch {
        // A missing or unreadable asset simply stays absent; the presentation renders its
        // placeholder rather than failing the whole page.
      }
    }

    const worker = async () => {
      while (!cancelled && nextIndex < ids.length) {
        const assetId = ids[nextIndex]
        nextIndex += 1
        if (assetId === undefined) {
          return
        }
        await loadOne(assetId)
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_LOADS, ids.length) }, () => worker()),
    )

    return () => {
      cancelled = true
      for (const url of created) {
        URL.revokeObjectURL(url)
      }
    }
  }, [ids, load])

  return urls
}

/**
 * Keyed on the sorted, de-duplicated id set so a fresh array identity or a reordered list
 * does not re-fetch anything.
 */
function useStableIds(assetIds: readonly string[]): string[] {
  const key = useMemo(() => Array.from(new Set(assetIds)).sort().join(','), [assetIds])
  return useMemo(() => (key.length === 0 ? [] : key.split(',')), [key])
}

/** Resolves the caller company's draft assets through `GET /assets/:id`. */
export function useAssetObjectUrls(
  request: AuthenticatedRequest,
  assetIds: readonly string[],
): Record<string, string> {
  const ids = useStableIds(assetIds)
  const load = useCallback((assetId: string) => fetchAssetObjectUrl(request, assetId), [request])
  return useObjectUrls(ids, load)
}

/**
 * Resolves assets retained by one historical passport version.
 *
 * The route is version-scoped and Admin-only, so an asset that only an older version
 * retained stays readable here without ever becoming anonymously reachable.
 */
export function usePassportVersionAssetObjectUrls(
  request: AuthenticatedRequest,
  passportId: string,
  versionNumber: number,
  assetIds: readonly string[],
): Record<string, string> {
  const ids = useStableIds(assetIds)
  const load = useCallback(
    (assetId: string) =>
      fetchPassportVersionAssetObjectUrl(request, passportId, versionNumber, assetId),
    [request, passportId, versionNumber],
  )
  return useObjectUrls(ids, load)
}
