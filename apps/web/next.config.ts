import type { NextConfig } from 'next'

/**
 * The web application configuration.
 *
 * There is deliberately no `rewrites()` here any more. The `/q/:uuid` bridge used to be one,
 * and Next resolves rewrites during the build: the destination was baked into the routes
 * manifest, which pinned the container-internal API origin at image-build time. That bridge
 * now lives in `app/q/[uuid]/route.ts`, where the origin is read per request and native and
 * container topologies both work.
 */
const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md and CLAUDE.md next to this config on every `next dev`.
  // This repository keeps a single, human-owned instruction file at the root, so the
  // framework-managed copies are disabled rather than regenerated on each run.
  agentRules: false,
}

export default nextConfig
