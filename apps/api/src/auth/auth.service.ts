import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { verify } from '@node-rs/argon2'
import { ApiException } from '../common/api-exception.js'
import type { AppEnvironment } from '../config/configuration.js'
import { JWT_AUDIENCE, JWT_ISSUER } from '../config/configuration.js'
import { Prisma } from '../generated/prisma/client.js'
import type { UserRole } from '../generated/prisma/enums.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { REFRESH_SESSION_LIFETIME_MS, REFRESH_TOKEN_BYTES } from './auth.constants.js'

export type AccessTokenClaims = {
  sub: string
  sid: string
  iss: string
  aud: string
  exp: number
  jti: string
}

type PublicUser = {
  id: string
  email: string
  role: UserRole
}

export type AuthenticatedActor = PublicUser & {
  companyId: string
}

type AuthResult = {
  accessToken: string
  expiresIn: number
  user: PublicUser
  refreshToken: string
}

type RefreshResult = {
  accessToken: string
  expiresIn: number
  refreshToken: string
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.'
const INVALID_REFRESH_MESSAGE = 'Invalid refresh token.'
const INVALID_ACCESS_MESSAGE = 'Invalid access token.'
// A real Argon2 hash keeps unknown-email verification work comparable to a known user.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$geBW+0cbzvshv8bKFaBi1A$5z4GAHZniJhveRzDD9gWnJ40kCp9kRxhykvB46WFJPA'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async login(email: string, password: string, requestId?: string): Promise<AuthResult> {
    const normalizedEmail = this.normalizeEmail(email)
    const user = await this.prisma.user.findUnique({ where: { normalizedEmail } })

    let passwordMatches = false
    try {
      passwordMatches = await verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password, {
        algorithm: 2,
      })
    } catch {
      passwordMatches = false
    }

    if (!user) {
      this.logLoginFailure('unknown_email', requestId)
      throw this.invalidCredentials()
    }

    if (!user.active) {
      this.logLoginFailure('inactive_user', requestId)
      throw this.invalidCredentials()
    }

    if (!passwordMatches) {
      this.logLoginFailure('invalid_password', requestId)
      throw this.invalidCredentials()
    }

    const refreshToken = this.newRefreshToken()
    const refreshDigest = this.digestRefreshToken(refreshToken)
    const sessionExpiresAt = new Date(Date.now() + REFRESH_SESSION_LIFETIME_MS)
    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.authSession.create({
        data: {
          userId: user.id,
          expiresAt: sessionExpiresAt,
        },
      })
      await tx.refreshToken.create({
        data: {
          sessionId: createdSession.id,
          digest: refreshDigest,
          expiresAt: sessionExpiresAt,
        },
      })
      return createdSession
    })

    return {
      accessToken: await this.issueAccessToken(user.id, session.id),
      expiresIn: this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    }
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const digest = this.digestRefreshToken(refreshToken)
    const rotation = await this.prisma.$transaction((tx) => this.rotateRefreshToken(tx, digest))
    if (rotation.kind === 'reused') {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'REUSED_REFRESH_TOKEN',
        'Refresh token reuse detected.',
      )
    }

    return {
      accessToken: await this.issueAccessToken(rotation.userId, rotation.sessionId),
      expiresIn: this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
      refreshToken: rotation.refreshToken,
    }
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return
    }

    const digest = this.digestRefreshToken(refreshToken)
    const token = await this.prisma.refreshToken.findUnique({ where: { digest } })
    if (!token) {
      return
    }

    await this.prisma.authSession.update({
      where: { id: token.sessionId },
      data: { revokedAt: new Date() },
    })
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const payload = await this.jwt.verifyAsync<Partial<AccessTokenClaims>>(token, {
        algorithms: ['HS256'],
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
      })
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.iss !== 'string' ||
        typeof payload.aud !== 'string' ||
        typeof payload.exp !== 'number' ||
        typeof payload.jti !== 'string'
      ) {
        throw new Error('Missing access token claims')
      }
      return payload as AccessTokenClaims
    } catch {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        INVALID_ACCESS_MESSAGE,
      )
    }
  }

  async resolveAccessTokenActor(claims: AccessTokenClaims): Promise<AuthenticatedActor> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            companyId: true,
            active: true,
          },
        },
      },
    })
    if (
      !session?.user ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_ACCESS_TOKEN',
        INVALID_ACCESS_MESSAGE,
      )
    }

    if (!session.user.active) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'USER_INACTIVE', 'User account is inactive.')
    }

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      companyId: session.user.companyId,
    }
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
  }

  digestRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('base64url')
  }

  private async rotateRefreshToken(
    tx: Prisma.TransactionClient,
    digest: string,
  ): Promise<
    | { kind: 'success'; refreshToken: string; sessionId: string; userId: string }
    | { kind: 'reused' }
  > {
    const tokenByDigest = await tx.refreshToken.findUnique({ where: { digest } })
    if (!tokenByDigest) {
      throw this.invalidRefresh()
    }

    await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "AuthSession"
      WHERE "id" = ${tokenByDigest.sessionId}
      FOR UPDATE
    `)

    const token = await tx.refreshToken.findUnique({
      where: { id: tokenByDigest.id },
      include: { session: { include: { user: true } } },
    })
    if (!token) {
      throw this.invalidRefresh()
    }

    if (token.usedAt !== null) {
      await tx.authSession.update({
        where: { id: token.sessionId },
        data: { revokedAt: new Date() },
      })
      return { kind: 'reused' }
    }

    if (!token.session.user.active) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'USER_INACTIVE', 'User account is inactive.')
    }

    const claimed = await tx.$executeRaw(Prisma.sql`
      UPDATE "RefreshToken" AS token
      SET "usedAt" = CURRENT_TIMESTAMP
      WHERE token."id" = ${token.id}
        AND token."sessionId" = ${token.sessionId}
        AND token."usedAt" IS NULL
        AND token."expiresAt" > CURRENT_TIMESTAMP
        AND EXISTS (
          SELECT 1
          FROM "AuthSession" AS session
          WHERE session."id" = token."sessionId"
            AND session."revokedAt" IS NULL
            AND session."expiresAt" > CURRENT_TIMESTAMP
        )
    `)

    if (claimed !== 1) {
      const currentToken = await tx.refreshToken.findUnique({
        where: { id: token.id },
        select: { usedAt: true, sessionId: true },
      })
      if (currentToken?.usedAt !== null && currentToken?.usedAt !== undefined) {
        return { kind: 'reused' }
      }
      throw this.invalidRefresh()
    }

    const refreshToken = this.newRefreshToken()
    const successor = await tx.refreshToken.create({
      data: {
        sessionId: token.sessionId,
        digest: this.digestRefreshToken(refreshToken),
        expiresAt: token.session.expiresAt,
      },
    })

    await tx.refreshToken.update({
      where: { id: token.id },
      data: {
        replacedBy: {
          connect: {
            id_sessionId: {
              id: successor.id,
              sessionId: token.sessionId,
            },
          },
        },
      },
    })

    return {
      kind: 'success',
      refreshToken,
      sessionId: token.sessionId,
      userId: token.session.userId,
    }
  }

  private async issueAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sid: sessionId },
      {
        algorithm: 'HS256',
        audience: JWT_AUDIENCE,
        expiresIn: this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
        issuer: JWT_ISSUER,
        jwtid: randomUUID(),
        subject: userId,
      },
    )
  }

  private newRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url')
  }

  private logLoginFailure(reason: string, requestId?: string): void {
    this.logger.warn(`Login failure requestId=${requestId ?? 'unknown'} reason=${reason}`)
  }
  private invalidCredentials(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      INVALID_CREDENTIALS_MESSAGE,
    )
  }

  private invalidRefresh(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_REFRESH_TOKEN',
      INVALID_REFRESH_MESSAGE,
    )
  }
}
