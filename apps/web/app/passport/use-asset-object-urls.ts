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
    const created: string[] = []

    const run = async () => {
      const entries = await Promise.all(
        ids.map(async (assetId) => {
          try {
            const url = await load(assetId)
            created.push(url)
            return [assetId, url] as const
          } catch {
            return null
          }
        }),
      )

      if (cancelled) {
        for (const url of created) {
          URL.revokeObjectURL(url)
        }
        return
      }

      const next: Record<string, string> = {}
      for (const entry of entries) {
        if (entry !== null) {
          next[entry[0]] = entry[1]
        }
      }
      setUrls(next)
    }

    void run()

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
