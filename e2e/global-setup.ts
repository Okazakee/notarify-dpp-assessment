import { hash } from '@node-rs/argon2'
import { Client } from 'pg'

/**
 * Seeds the single e2e account. The password is a test fixture for a disposable
 * local database, not a real credential, and it is hashed at run time so no
 * credential material is committed.
 */
export const E2E_EMAIL = 'e2e@example.test'
export const E2E_PASSWORD = 'E2ePassw0rd!'

export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the e2e account')
  }

  const client = new Client({ connectionString })
  await client.connect()
  try {
    const passwordHash = await hash(E2E_PASSWORD)
    await client.query(
      `INSERT INTO "Company" (id, "displayName", "createdAt", "updatedAt")
       VALUES ('00000000-0000-4000-8000-00000000e001', 'E2E Company', now(), now())
       ON CONFLICT (id) DO NOTHING`,
    )
    await client.query(
      `INSERT INTO "User" (id, "companyId", email, "normalizedEmail", "passwordHash", role, active, "createdAt", "updatedAt")
       VALUES ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001', $1, $1, $2, 'EDITOR', true, now(), now())
       ON CONFLICT (id) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", active = true`,
      [E2E_EMAIL, passwordHash],
    )
  } finally {
    await client.end()
  }
}
