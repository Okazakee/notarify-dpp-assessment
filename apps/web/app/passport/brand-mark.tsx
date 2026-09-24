/**
 * The bundled Notarify brand mark used by the public passport header.
 *
 * The recorded project decision is that the public passport's brand logo is satisfied by
 * a bundled application asset, so this mark is deliberately local markup: no remote
 * logo, no image host, no `Company.logoAssetId` dependency and no upload flow.
 *
 * It is decorative: the visible wordmark next to it carries the accessible name, so the
 * SVG is hidden from assistive technology rather than announced twice.
 */
export function NotarifyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      data-brand-mark="notarify"
      className={className}
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor" />
      {/* Document sheet with a folded corner, then a check: a passport, verified. */}
      <path d="M11 7.5h6.6L22 11.9v5.4h-2.6v-4.1h-3.8V9.9H11z" fill="var(--color-base-100)" />
      <path d="M9.4 12.6h1.4v11.9H9.4zM12.9 21.4h5.9v-1.4h-5.9z" fill="var(--color-base-100)" />
      <path d="M13.2 17.1 15.9 20l6.4-6.6-1.6-1.5-4.9 5.1-1.1-1.2z" fill="var(--color-base-100)" />
    </svg>
  )
}
