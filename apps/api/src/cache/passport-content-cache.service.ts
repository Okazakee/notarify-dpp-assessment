import { createHash } from 'node:crypto'
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type RedisClientType } from '@redis/client'
import type { AppEnvironment } from '../config/configuration.js'
import {
  type PassportContent,
  parsePassportContent,
} from '../publication/passport-snapshot-content.js'

/**
 * Identifies the cached content shape, its interpretation and its envelope.
 *
 * A payload written by different interpretation code must never be read as if it were
 * current, so the value participates in the cache key: a change here naturally orphans
 * every previously written entry instead of silently serving a stale shape. It is bumped
 * whenever the envelope changes too, so entries from an older envelope are simply never
 * selected.
 */
export const PASSPORT_CONTENT_CACHE_SCHEMA = 2

/** Bounds a connection attempt so a dead cache cannot stall a request. */
const CONNECT_TIMEOUT_MS = 2_000

/**
 * Bounds how long a socket may stay silent once connected.
 *
 * The command-level `timeout` option is not sufficient here: this client removes that
 * listener as soon as the command is written, so it bounds queueing rather than the wait
 * for a reply. A connected server that stops answering is only caught by an inactivity
 * timeout on the socket itself, which is why this is configured. When it fires, the
 * pending command rejects and the caller falls back to PostgreSQL.
 */
const SOCKET_TIMEOUT_MS = 2_000

/** Bounds a single cache command, the last line of defence against a hung socket. */
const COMMAND_TIMEOUT_MS = 1_000

/** One outage must not become one log line per request. */
const FAILURE_LOG_INTERVAL_MS = 30_000

/** A cached entry is untrusted input; bound it before parsing it. */
const MAX_CACHED_PAYLOAD_BYTES = 512 * 1024

/** The stored envelope: the schema, the integrity checksum and the interpreted content. */
type CachedEntry = {
  schema: number
  checksum: string
  content: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A domain separator, so this checksum cannot be confused with any other use of SHA-256
 * in this file or be replayed from an unrelated construction.
 */
const BINDING_DOMAIN = 'notarify:passport-content-cache:v1'

/**
 * The integrity checksum that binds a cached entry to what it claims to be.
 *
 * It covers **both** inputs, and that is the whole point:
 *
 * 1. the exact immutable snapshot PostgreSQL selected for this version, so an entry from
 *    another passport, another version or a stale snapshot cannot be served; and
 * 2. the exact interpreted content being returned, so content that was edited, truncated
 *    or transplanted inside Redis cannot be served either.
 *
 * Covering only the snapshot would leave the content itself unverified: a shape-valid but
 * modified payload would still pass, and a disposable cache could silently change
 * published Passport content.
 *
 * This is an unkeyed checksum, and it is described as exactly that. It detects corruption
 * and inconsistency, including a payload copied from elsewhere. It is **not**
 * authentication: an actor who controls Redis and can recompute SHA-256 could forge a
 * consistent entry, and that is out of scope for this assessment, where Redis is a
 * disposable cache inside the trusted deployment rather than an adversary.
 *
 * Serialization is deterministic for this data: both values are plain JSON produced by
 * `JSON.stringify` over objects whose key order is stable — the snapshot as PostgreSQL
 * returns it, and the content either as `buildPassportContent` produced it or as it was
 * parsed back from the very string stored here.
 */
function bindingChecksum(snapshot: unknown, content: PassportContent): string {
  return createHash('sha256')
    .update(BINDING_DOMAIN)
    .update('\0')
    .update(JSON.stringify(snapshot) ?? 'null')
    .update('\0')
    .update(JSON.stringify(content) ?? 'null')
    .digest('hex')
}

/**
 * The disposable cache for the immutable content of a published Passport version.
 *
 * PostgreSQL stays authoritative for existence, visibility and which version is current;
 * this cache only ever holds the interpreted content of one already-selected immutable
 * version. Every method therefore fails soft: a disabled, unreachable, slow or corrupt
 * cache degrades to "not cached" and never to a wrong or unavailable Passport.
 */
@Injectable()
export class PassportContentCache implements OnModuleDestroy {
  private readonly logger = new Logger(PassportContentCache.name)
  private readonly client: RedisClientType | null
  private readonly ttlSeconds: number
  private connecting: Promise<unknown> | null = null
  private lastFailureLogAt = 0

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.ttlSeconds = config.getOrThrow<number>('REDIS_CACHE_TTL_SECONDS')
    const url = config.get<string>('REDIS_URL')

    this.client =
      url === undefined
        ? null
        : createClient({
            url,
            // A cache that is down must reject queued work instead of accumulating it
            // while it reconnects: correctness never depends on a cache command running.
            disableOfflineQueue: true,
            socket: {
              connectTimeout: CONNECT_TIMEOUT_MS,
              socketTimeout: SOCKET_TIMEOUT_MS,
              // No background reconnection loop. A request that finds the cache down fails
              // fast and falls back to PostgreSQL; the next request tries a fresh, bounded
              // connection, so recovery happens without a retry storm in between.
              reconnectStrategy: () => false,
            },
          })

    if (this.client !== null) {
      // An unhandled 'error' event would take the process down, and a cache outage must
      // never do that.
      this.client.on('error', (error: unknown) => this.logFailure('cache connection error', error))
    }
  }

  /** Whether a cache is configured at all. An absent `REDIS_URL` disables caching. */
  get enabled(): boolean {
    return this.client !== null
  }

  /**
   * The version-specific key.
   *
   * It carries the immutable identity of what is cached — passport, exact version and
   * content schema — so a republish selects a different key by construction and an old
   * entry can never be read as the current version. The public UUID alone would not be
   * enough, because it deliberately survives a republish.
   */
  key(input: { passportId: string; versionId: string }): string {
    return `notarify:passport:${input.passportId}:version:${input.versionId}:schema:${PASSPORT_CONTENT_CACHE_SCHEMA}`
  }

  /** Reads validated content, or `null` for a miss, a disabled cache or any failure. */
  async read(key: string, snapshot: unknown): Promise<PassportContent | null> {
    const client = this.client
    if (client === null) {
      return null
    }

    try {
      await this.ensureConnected(client)
      const raw = await client.withCommandOptions({ timeout: COMMAND_TIMEOUT_MS }).get(key)
      if (raw === null) {
        return null
      }

      if (raw.length > MAX_CACHED_PAYLOAD_BYTES) {
        this.logger.warn('Discarding an oversized cached Passport content entry')
        await this.delete(key)
        return null
      }

      const entry = parseCachedEntry(raw)
      if (entry === null || entry.checksum !== bindingChecksum(snapshot, entry.content)) {
        // The entry is unreadable, was written by another schema, belongs to a different
        // version or snapshot, or its content was modified after it was written. None of
        // those may be served: the stored snapshot is interpreted instead.
        this.logger.warn('Discarding a cached Passport content entry that does not match')
        await this.delete(key)
        return null
      }

      return entry.content
    } catch (error) {
      this.logFailure('cache read failed', error)
      return null
    }
  }

  /** Stores content best-effort. A failure is a cache miss later, never a request error. */
  async write(key: string, content: PassportContent, snapshot: unknown): Promise<void> {
    const client = this.client
    if (client === null) {
      return
    }

    try {
      await this.ensureConnected(client)
      const entry: CachedEntry = {
        schema: PASSPORT_CONTENT_CACHE_SCHEMA,
        checksum: bindingChecksum(snapshot, content),
        content,
      }
      await client
        .withCommandOptions({ timeout: COMMAND_TIMEOUT_MS })
        .set(key, JSON.stringify(entry), {
          expiration: { type: 'EX', value: this.ttlSeconds },
        })
    } catch (error) {
      this.logFailure('cache write failed', error)
    }
  }

  private async delete(key: string): Promise<void> {
    const client = this.client
    if (client === null) {
      return
    }

    try {
      await this.ensureConnected(client)
      await client.withCommandOptions({ timeout: COMMAND_TIMEOUT_MS }).del(key)
    } catch (error) {
      this.logFailure('cache delete failed', error)
    }
  }

  private async ensureConnected(client: RedisClientType): Promise<void> {
    if (client.isReady) {
      return
    }

    this.connecting ??= this.connectOnce(client).finally(() => {
      this.connecting = null
    })

    await this.connecting
  }

  /**
   * Opens a connection with a hard deadline.
   *
   * The library's own `connectTimeout` applies to the socket handshake; this deadline
   * bounds the whole attempt, so a cache that accepts a connection and then stalls can
   * never hold a public request open. A failed attempt tears the socket down so the next
   * request starts from a clean state instead of inheriting a half-open one.
   */
  private async connectOnce(client: RedisClientType): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        client.connect(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('cache connection timed out')),
            CONNECT_TIMEOUT_MS,
          )
        }),
      ])
    } catch (error) {
      try {
        client.destroy()
      } catch {
        // A socket that cannot be destroyed is already unusable; nothing else to do.
      }
      throw error
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }

  private logFailure(message: string, error: unknown): void {
    const now = Date.now()
    if (now - this.lastFailureLogAt < FAILURE_LOG_INTERVAL_MS) {
      return
    }
    this.lastFailureLogAt = now
    // Safe diagnostics only: no cached payload, no credentials, no connection string.
    const reason = error instanceof Error ? error.message : 'unknown error'
    this.logger.warn(`${message}: ${reason}`)
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client
    if (client === null || !client.isOpen) {
      return
    }

    // A graceful close is preferred, but shutdown must not be able to hang on a cache
    // that stopped answering: after a short grace period the socket is destroyed.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        client.close(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('cache close timed out')), CONNECT_TIMEOUT_MS)
        }),
      ])
    } catch {
      client.destroy()
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Validates the stored envelope, including the content shape it carries. */
function parseCachedEntry(raw: string): { checksum: string; content: PassportContent } | null {
  const parsed = safeJsonParse(raw)
  if (!isRecord(parsed) || parsed.schema !== PASSPORT_CONTENT_CACHE_SCHEMA) {
    return null
  }
  if (typeof parsed.checksum !== 'string') {
    return null
  }

  const content = parsePassportContent(parsed.content)
  return content === null ? null : { checksum: parsed.checksum, content }
}
