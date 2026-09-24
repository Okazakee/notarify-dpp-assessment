'use client'

import { useEffect, useMemo, useState } from 'react'
import { type AuthenticatedRequest, fetchAssetObjectUrl } from '../products/api'

/**
 * Resolves private draft asset ids into browser object URLs.
 *
 * Draft assets stay private: their bytes are only reachable through the authenticated
 * `GET /assets/:id` route, and the access token lives in memory, so an `<img src>` cannot
 * carry it. This hook is the only supported way to display a draft asset outside the
 * upload lists — it fetches through the shared authenticated `request` function and hands
 * back `blob:` URLs.
 *
 * Every created URL is revoked, whether the effect is superseded, the ids change or the
 * component unmounts. No public visibility is added to draft assets to make Preview work.
 */
export function useAssetObjectUrls(
  request: AuthenticatedRequest,
  assetIds: readonly string[],
): Record<string, string> {
  // Keyed on the sorted, de-duplicated id set so a fresh array identity or a reordered list
  // does not re-fetch anything.
  const key = useMemo(() => Array.from(new Set(assetIds)).sort().join(','), [assetIds])
  const ids = useMemo(() => (key.length === 0 ? [] : key.split(',')), [key])
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
            const url = await fetchAssetObjectUrl(request, assetId)
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
  }, [request, ids])

  return urls
}
