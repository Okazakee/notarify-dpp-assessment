import 'reflect-metadata'
import {
  PASSPORT_CONTENT_CACHE_SCHEMA,
  PassportContentCache,
} from '../src/cache/passport-content-cache.service.js'

/**
 * The disabled-cache contract, proven at the port rather than by re-configuring a running
 * application.
 *
 * The validated environment is loaded once per process, so an integration test cannot
 * reliably remove `REDIS_URL` from an application that already started. What matters is
 * the behaviour of the port itself: with no URL configured it must report itself disabled
 * and treat every operation as a miss instead of failing a caller. The unreachable-cache
 * fallback against a real server is proven separately in the integration suite.
 */
function configWith(redisUrl: string | undefined) {
  return {
    get: (key: string) => (key === 'REDIS_URL' ? redisUrl : undefined),
    getOrThrow: (key: string) => {
      if (key === 'REDIS_CACHE_TTL_SECONDS') {
        return 300
      }
      throw new Error(`unexpected configuration key ${key}`)
    },
  } as never
}

describe('PassportContentCache configuration', () => {
  it('is disabled with no REDIS_URL, and every operation becomes a harmless miss', async () => {
    const cache = new PassportContentCache(configWith(undefined))

    expect(cache.enabled).toBe(false)
    expect(await cache.read('notarify:passport:p:version:v:schema:1', { product: {} })).toBeNull()
    await expect(
      cache.write('notarify:passport:p:version:v:schema:1', {} as never, {}),
    ).resolves.toBeUndefined()
    // Shutdown must also be a no-op rather than an error.
    await expect(cache.onModuleDestroy()).resolves.toBeUndefined()
  })

  it('is enabled with a REDIS_URL and keys by immutable identity', () => {
    const cache = new PassportContentCache(configWith('redis://127.0.0.1:6390'))

    expect(cache.enabled).toBe(true)
    // The key carries the passport, the exact version and the content schema, so a
    // republish selects a different key by construction.
    expect(cache.key({ passportId: 'passport-1', versionId: 'version-1' })).toBe(
      `notarify:passport:passport-1:version:version-1:schema:${PASSPORT_CONTENT_CACHE_SCHEMA}`,
    )
    expect(cache.key({ passportId: 'passport-1', versionId: 'version-2' })).not.toBe(
      cache.key({ passportId: 'passport-1', versionId: 'version-1' }),
    )
  })
})
