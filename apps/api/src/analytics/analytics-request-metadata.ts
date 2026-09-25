import Bowser from 'bowser'
import type { AnalyticsEventSource, AnalyticsRequestMetadata } from './analytics.types.js'

/**
 * Bounds applied before anything is parsed or stored.
 *
 * Every value recorded from a request is client-controlled, so each one is truncated to
 * a known maximum and reduced to a normalized form. The raw header is never stored.
 */
const USER_AGENT_PARSE_MAX_LENGTH = 512
const ACCEPT_LANGUAGE_MAX_LENGTH = 128
const IP_MAX_LENGTH = 45
const BROWSER_MAX_LENGTH = 128
const OPERATING_SYSTEM_MAX_LENGTH = 128
const LANGUAGE_MAX_LENGTH = 35

/** Headers a browser may send to mark a speculative (prefetch/prerender) navigation. */
const PREFETCH_HEADERS = ['purpose', 'sec-purpose', 'x-purpose', 'x-moz'] as const

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }
  return null
}

/**
 * Reports whether a request is an obvious prefetch rather than a real navigation.
 *
 * This is deliberately narrow: it only reads the conventional `Purpose`/`Sec-Purpose`
 * style headers browsers and link prefetchers actually send. It is not bot detection,
 * and a plain bot or a direct URL request still counts as a scan — the assessment
 * accepts that limitation rather than building a heuristic that would silently drop
 * real traffic.
 */
export function isPrefetchRequest(headers: Record<string, string | string[] | undefined>): boolean {
  for (const name of PREFETCH_HEADERS) {
    const value = firstHeaderValue(headers[name])?.toLowerCase()
    if (value === undefined) {
      continue
    }
    if (value.includes('prefetch') || value.includes('prerender')) {
      return true
    }
  }
  return false
}

/**
 * The server-resolved client address.
 *
 * It reads the address the runtime resolved for the socket. It never parses
 * `X-Forwarded-For`: the application does not enable proxy trust, so a forged forwarding
 * header must not become the recorded address. A future reverse proxy will need an
 * explicit trusted-proxy configuration (Stage 7), and until then the proxy's own address
 * is what gets recorded — which is documented rather than papered over.
 */
function resolveIpAddress(ip: string | undefined): string | null {
  if (typeof ip !== 'string') {
    return null
  }

  const trimmed = ip.trim()
  if (trimmed.length === 0 || trimmed.length > IP_MAX_LENGTH) {
    return null
  }

  // An IPv4-mapped IPv6 address is the same client; store the readable IPv4 form.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)
  return mapped?.[1] ?? trimmed
}

function parseBrowser(userAgent: string | null): { browser: string | null; os: string | null } {
  if (userAgent === null) {
    return { browser: null, os: null }
  }

  try {
    const parsed = Bowser.parse(userAgent.slice(0, USER_AGENT_PARSE_MAX_LENGTH))
    return {
      browser: boundedOrNull(parsed.browser.name, BROWSER_MAX_LENGTH),
      os: boundedOrNull(parsed.os.name, OPERATING_SYSTEM_MAX_LENGTH),
    }
  } catch {
    // A User-Agent is untrusted input; a parser failure must not fail the event.
    return { browser: null, os: null }
  }
}

function boundedOrNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  return trimmed.slice(0, maxLength)
}

/**
 * One normalized primary language tag from `Accept-Language`.
 *
 * The header is unbounded and client-controlled, so only the first tag is kept, in a
 * normalized `ll` / `ll-RR` form. It is a display hint only and never a country source.
 */
function parsePrimaryLanguage(header: string | null): string | null {
  if (header === null) {
    return null
  }

  const first = header.slice(0, ACCEPT_LANGUAGE_MAX_LENGTH).split(',')[0]?.trim() ?? ''
  if (first.length === 0 || first === '*') {
    return null
  }

  const match = /^([A-Za-z]{2,3})(?:-[A-Za-z]{2})?/.exec(first)
  if (match === null || match[1] === undefined) {
    return null
  }

  const language = match[1].toLowerCase()
  const region = /^[A-Za-z]{2,3}-([A-Za-z]{2})/.exec(first)?.[1]
  const tag = region === undefined ? language : `${language}-${region.toUpperCase()}`
  return tag.length <= LANGUAGE_MAX_LENGTH ? tag : null
}

export function extractAnalyticsMetadata(input: {
  headers: Record<string, string | string[] | undefined>
  ip: string | undefined
  mockCountry: string
  source: AnalyticsEventSource
}): AnalyticsRequestMetadata {
  const { browser, os } = parseBrowser(firstHeaderValue(input.headers['user-agent']))

  return {
    ipAddress: resolveIpAddress(input.ip),
    browser,
    operatingSystem: os,
    language: parsePrimaryLanguage(firstHeaderValue(input.headers['accept-language'])),
    // The country is a configured mock by decision: no IP, language or locale inference
    // happens anywhere in this pipeline, and the stored source records that fact.
    country: input.mockCountry,
    countrySource: 'MOCK',
    source: input.source,
  }
}
