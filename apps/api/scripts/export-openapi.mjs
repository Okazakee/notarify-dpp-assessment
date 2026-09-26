import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../dist/src/app.module.js'
import { configureApplication } from '../dist/src/application.js'
import { buildOpenApiDocument } from '../dist/src/openapi.js'

/**
 * Exports the OpenAPI document, or checks the committed one for drift.
 *
 * It runs against the **compiled** API, because the application's module graph uses ESM
 * `.js` specifiers that only resolve after a build; the root scripts therefore build the
 * API first. The application context is created without `listen()`, so nothing binds a TCP
 * port and no browser stack is involved. Prisma and the Redis client both connect lazily, so
 * no live PostgreSQL or Redis is required either — only the validated environment the API
 * already needs to start (`DATABASE_URL`, `JWT_SECRET` and the origins).
 *
 *   pnpm openapi:generate   rewrite docs/openapi.json
 *   pnpm openapi:check      fail when the committed artifact is stale
 *
 * The document is generated, never hand-edited: a controller or DTO change that is not
 * accompanied by a regenerated artifact fails the drift check in CI.
 */

const OUTPUT = resolve(import.meta.dirname, '../../../docs/openapi.json')
const checkOnly = process.argv.includes('--check')

const app = await NestFactory.create(AppModule, { logger: false })
configureApplication(app)

try {
  const document = buildOpenApiDocument(app)
  // Stable indentation and a trailing newline, so the artifact is diffable and the drift
  // check compares content rather than formatting.
  const serialized = `${JSON.stringify(document, null, 2)}\n`

  if (checkOnly) {
    let committed
    try {
      committed = readFileSync(OUTPUT, 'utf8')
    } catch {
      console.error('docs/openapi.json is missing. Run `pnpm openapi:generate`.')
      process.exit(1)
    }

    if (committed !== serialized) {
      console.error(
        'docs/openapi.json is stale: the API contract changed without regenerating it.\n' +
          'Run `pnpm openapi:generate` and commit the result.',
      )
      process.exit(1)
    }

    console.info('OpenAPI artifact is up to date.')
  } else {
    mkdirSync(resolve(OUTPUT, '..'), { recursive: true })
    writeFileSync(OUTPUT, serialized, 'utf8')
    console.info(
      `Wrote docs/openapi.json with ${Object.keys(document.paths).length} documented paths.`,
    )
  }
} finally {
  await app.close()
}
