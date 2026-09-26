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

/**
 * Nest's exceptions zone calls `process.exit(1)` when an async error escapes, and this script
 * runs the application with logging disabled so that message would be invisible — the process
 * would simply exit non-zero with no explanation. Report it instead, and leave the exit code
 * to the checks below.
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unexpected failure while generating the OpenAPI document:')
  console.error(reason)
  process.exitCode = 1
})

// Configuration errors are reported rather than swallowed: this script boots the real
// application, so a missing JWT_SECRET or origin should explain itself instead of exiting
// non-zero with no output. Informational startup logs stay quiet.
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
configureApplication(app)

try {
  const document = buildOpenApiDocument(app)
  // Stable indentation and a trailing newline, so the artifact is diffable and the drift
  // check compares content rather than formatting.
  const serialized = `${JSON.stringify(document, null, 2)}\n`

  if (checkOnly) {
    let committed = null
    try {
      committed = readFileSync(OUTPUT, 'utf8')
    } catch {
      console.error('docs/openapi.json is missing. Run `pnpm openapi:generate`.')
      process.exitCode = 1
    }

    if (committed !== null && committed !== serialized) {
      console.error(
        'docs/openapi.json is stale: the API contract changed without regenerating it.\n' +
          'Run `pnpm openapi:generate` and commit the result.',
      )
      process.exitCode = 1
    }

    if (process.exitCode !== 1) {
      console.info('OpenAPI artifact is up to date.')
    }
  } else {
    mkdirSync(resolve(OUTPUT, '..'), { recursive: true })
    writeFileSync(OUTPUT, serialized, 'utf8')
    console.info(
      `Wrote docs/openapi.json with ${Object.keys(document.paths).length} documented paths.`,
    )
  }
} finally {
  // Shutting the context down is best-effort. The process is about to exit, and a disconnect
  // failure from a client that never connected must not become the exit code CI reads — that
  // is exactly the mistake this script used to make, silently.
  await app.close().catch((error) => {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`warning: the Nest context did not shut down cleanly: ${reason}`)
  })
}
