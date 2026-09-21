import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 configuration.
 *
 * Named `prisma7.config.ts` rather than the auto-detected `prisma.config.ts` so the
 * layout is explicit. Every project script passes `--config prisma7.config.ts`, and
 * the future NestJS application must call Prisma the same way.
 *
 * Prisma 7 no longer reads `.env` on its own, hence the explicit `dotenv/config`
 * import above. A missing DATABASE_URL fails fast here instead of failing later
 * with an opaque connection error.
 *
 * The driver adapter (`@prisma/adapter-pg`) is *not* configured here: this file is
 * loaded by the CLI for validate/generate/migrate, which use the datasource URL
 * below. The API constructs `PrismaPg` from the same DATABASE_URL at runtime.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
