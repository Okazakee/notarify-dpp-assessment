import type { NextConfig } from 'next'

/**
 * The API origin used to resolve API-relative routes.
 *
 * Deliberately the same `NEXT_PUBLIC_API_URL` the browser client already uses, so the
 * frontend has one API origin rather than two that can drift apart.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md and CLAUDE.md next to this config on every `next dev`.
  // This repository keeps a single, human-owned instruction file at the root, so the
  // framework-managed copies are disabled rather than regenerated on each run.
  agentRules: false,

  /**
   * Routes the printed QR target to the API's resolver.
   *
   * A QR code encodes `{PUBLIC_APP_ORIGIN}/q/{uuid}`, which is this web origin, but QR
   * resolution belongs to Nest so that Stage 5 can record a hit in one place without
   * changing any printed URL. The source is an exact single-segment pattern and the
   * destination is pinned to the configured API origin, so this bridge cannot proxy
   * arbitrary paths or hosts.
   */
  async rewrites() {
    return [{ source: '/q/:uuid', destination: `${API_URL}/q/:uuid` }]
  },
}

export default nextConfig
