import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md and CLAUDE.md next to this config on every `next dev`.
  // This repository keeps a single, human-owned instruction file at the root, so the
  // framework-managed copies are disabled rather than regenerated on each run.
  agentRules: false,
}

export default nextConfig
