/**
 * The company settings a back-office Admin manages.
 *
 * Only mutable company state is exposed. Published Passport snapshots are immutable and
 * deliberately absent: changing a display name here changes future publications, never a
 * version that has already been published.
 */
export type CompanySettings = {
  displayName: string
  logoAssetId: string | null
  updatedAt: string
}
