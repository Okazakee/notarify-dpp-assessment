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

  // The framework advertises itself in a response header by default. The API already runs
  // Helmet for its own origin; this is the web origin's equivalent minimum.
  poweredByHeader: false,

  /**
   * Baseline security headers for the web origin.
   *
   * A ZAP baseline against the anonymous Passport page reported these as missing. They are
   * safe for this application — it embeds nothing, is never framed, and needs no browser
   * capability beyond navigation — so they are set here rather than left as accepted noise.
   *
   * Deliberately **not** set, and recorded as limitations instead:
   *
   * * `Content-Security-Policy` — Next injects inline bootstrap scripts, so a real policy
   *   needs per-request nonces. A permissive `unsafe-inline` policy would look like protection
   *   without providing it, so the honest state is "not set" until nonces are wired in.
   * * `Cross-Origin-Embedder-Policy` — `require-corp` blocks the cross-origin API images the
   *   public Passport renders, so enabling it would break published content.
   * * `Subresource Integrity` — Next emits hashed, same-origin bundles; SRI adds value mainly
   *   for third-party scripts, and this application loads none.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
