'use client'

import { useEffect, useRef } from 'react'
import { API_ORIGIN } from '../api-origin'

/** Bounded retries: enough to survive a transient failure, not an endless loop. */
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2_000

/**
 * Records one Passport view for a real public page navigation.
 *
 * It is mounted only on the public Passport page, so the editor Preview and the
 * back-office history never emit a view. It is deliberately tiny and failure-tolerant:
 * analytics is an observation of the page, never a condition for reading it, and this
 * component renders nothing and never blocks or alters the page.
 *
 * One event key is generated per navigation and reused by every retry, so a retry after a
 * transient failure cannot be counted twice — the server's unique key and single
 * transaction make the second attempt a no-op.
 *
 * A visitor with JavaScript disabled still reads the Passport and is simply not counted,
 * which the completion report states rather than hides.
 */
export function PassportViewTracker({
  publicUuid,
  version,
}: {
  publicUuid: string
  version: number
}) {
  const recordedRef = useRef(false)

  useEffect(() => {
    if (recordedRef.current) {
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    // Generated once per navigation; every retry sends this same value.
    const eventKey = crypto.randomUUID()

    async function send(attempt: number): Promise<void> {
      if (cancelled || recordedRef.current) {
        return
      }

      let retryable = true
      try {
        const response = await fetch(
          `${API_ORIGIN}/passport/${encodeURIComponent(publicUuid)}/view`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventKey, version }),
          },
        )

        if (response.ok) {
          recordedRef.current = true
          return
        }
        // A 4xx that is not a throttle means the request itself is unacceptable, so
        // retrying it would only repeat the same rejection. 429 and 5xx are transient.
        retryable = response.status === 429 || response.status >= 500
      } catch {
        // A network failure is transient by definition here.
        retryable = true
      }

      if (retryable && attempt < MAX_ATTEMPTS && !cancelled) {
        retryTimer = setTimeout(() => void send(attempt + 1), RETRY_DELAY_MS * attempt)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        void send(1)
      }
    }

    // Only a page the visitor can actually see counts as a view.
    if (document.visibilityState === 'visible') {
      void send(1)
    } else {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer)
      }
    }
  }, [publicUuid, version])

  return null
}
