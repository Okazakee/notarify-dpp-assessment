import 'reflect-metadata'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Controller, Get, type INestApplication, Req, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import type { Response } from 'supertest'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import type { AuthenticatedRequest } from '../src/auth/access-token.guard.js'
import { AccessTokenGuard } from '../src/auth/access-token.guard.js'
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.constants.js'
import { AuthModule } from '../src/auth/auth.module.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

@Controller('test-probe')
class ProbeController {
  @Get('actor')
  @UseGuards(AccessTokenGuard)
  actor(@Req() request: AuthenticatedRequest) {
    if (!request.currentActor) {
      throw new Error('Guard did not attach an actor')
    }
    return request.currentActor
  }
}

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
}

const companyIds: string[] = []
const userIds: string[] = []

let app: INestApplication
let prisma: PrismaService

function cookieHeader(response: Response): string {
  const cookies = response.headers['set-cookie']
  if (!Array.isArray(cookies)) {
    throw new Error('Expected a refresh cookie')
  }
  const cookie = cookies.find((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`))
  if (!cookie) {
    throw new Error('Expected refresh_token cookie')
  }
  return cookie.split(';', 1)[0]
}

function errorBody(response: Response): {
  statusCode: number
  code: string
  message: string
} {
  expect(response.body.requestId).toEqual(expect.any(String))
  expect(response.headers['x-request-id']).toBe(response.body.requestId)
  const { requestId: _requestId, ...body } = response.body
  return body
}

function expectRefreshCookieCleared(response: Response): void {
  const cookies = response.headers['set-cookie']
  expect(Array.isArray(cookies)).toBe(true)
  expect(cookies?.some((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=;`))).toBe(true)
}

function rawCookieValue(cookie: string): string {
  return cookie.slice(`${REFRESH_COOKIE_NAME}=`.length)
}

function refreshDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

async function createFixture(active = true): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Auth test ${randomUUID()}` },
  })
  const email = `auth-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const user = await prisma.user.create({
    data: {
      active,
      companyId: company.id,
      email,
      passwordHash: await hash(password, { algorithm: 2 }),
      normalizedEmail: email.toLowerCase(),
      role: UserRole.EDITOR,
    },
  })
  companyIds.push(company.id)
  userIds.push(user.id)
  return { companyId: company.id, userId: user.id, email, password }
}

async function login(fixture: Fixture): Promise<Response> {
  return request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: fixture.email, password: fixture.password })
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, AuthModule],
    controllers: [ProbeController],
    providers: [AccessTokenGuard],
  }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)
})

afterAll(async () => {
  const sessions = await prisma.authSession.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const sessionIds = sessions.map(({ id }) => id)
  if (sessionIds.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { sessionId: { in: sessionIds } } })
    await prisma.authSession.deleteMany({ where: { id: { in: sessionIds } } })
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }
  if (companyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  }
  await app.close()
})

describe('authentication', () => {
  it('logs in and sets an HttpOnly refresh cookie', async () => {
    const fixture = await createFixture()
    const response = await login(fixture)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: 600,
      user: {
        id: fixture.userId,
        email: fixture.email,
        role: 'EDITOR',
      },
    })
    expect(JSON.stringify(response.body)).not.toContain('passwordHash')
    const cookie = cookieHeader(response)
    const token = rawCookieValue(cookie)
    const stored = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(token) },
      select: { digest: true },
    })
    if (!stored) {
      throw new Error('Expected stored refresh digest')
    }
    expect(stored.digest).toBe(refreshDigest(token))
    expect(stored.digest).not.toBe(token)
    expect(JSON.stringify(response.body)).not.toContain(token)
    expect(JSON.stringify(response.body)).not.toContain(stored.digest)
    expect(cookieHeader(response)).toMatch(/^refresh_token=[A-Za-z0-9_-]+$/)
    const setCookie = response.headers['set-cookie']
    const setCookieText = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '')
    expect(setCookieText).toContain('HttpOnly')
    expect(setCookieText).toContain('Path=/auth')
    expect(setCookieText).toContain('SameSite=Lax')
  })

  it('uses the same generic failure shape for unknown email, wrong password, and disabled accounts', async () => {
    const fixture = await createFixture()
    const disabledFixture = await createFixture(false)
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: `${fixture.password}-wrong` })
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `missing-${randomUUID()}@example.test`, password: fixture.password })
    const disabled = await login(disabledFixture)

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(disabled.status).toBe(401)
    expect(errorBody(wrongPassword)).toEqual(errorBody(unknownEmail))
    expect(errorBody(disabled)).toEqual(errorBody(wrongPassword))
    expect(errorBody(wrongPassword)).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    })
  })

  it('returns a request ID in the response header and public error body', async () => {
    const fixture = await createFixture()
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-request-id', 'integration-request-1')
      .send({ email: fixture.email, password: `${fixture.password}-wrong` })

    expect(response.status).toBe(401)
    expect(response.headers['x-request-id']).toBe('integration-request-1')
    expect(response.body.requestId).toBe('integration-request-1')
  })

  it('rejects an inactive user with the same generic credential error', async () => {
    const fixture = await createFixture(false)
    const response = await login(fixture)

    expect(response.status).toBe(401)
    expect(errorBody(response)).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    })
  })

  it('rejects an inactive user with a stable generic credential error', async () => {
    const fixture = await createFixture(false)
    const response = await login(fixture)

    expect(response.status).toBe(401)
    expect(errorBody(response)).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    })
  })

  it('re-reads session and user state for me after logout', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    const cookie = cookieHeader(loginResponse)
    const accessToken = loginResponse.body.accessToken as string

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, {
        id: fixture.userId,
        email: fixture.email,
        role: 'EDITOR',
        companyId: fixture.companyId,
      })

    await request(app.getHttpServer()).post('/auth/logout').set('Cookie', cookie).expect(204)

    const afterLogout = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
    expect(afterLogout.status).toBe(401)
    expect(afterLogout.body.code).toBe('INVALID_ACCESS_TOKEN')
  })

  it('rotates refresh tokens and returns an access token that can call me', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    const firstCookie = cookieHeader(loginResponse)
    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .send({})

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: 600,
    })
    const secondCookie = cookieHeader(refreshResponse)
    expect(secondCookie).not.toBe(firstCookie)

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(fixture.userId)
      })
  })

  it('allows exactly one winner when two requests rotate one token concurrently', async () => {
    const fixture = await createFixture()
    const firstCookie = cookieHeader(await login(fixture))

    const responses = await Promise.all([
      request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).send({}),
      request(app.getHttpServer()).post('/auth/refresh').set('Cookie', firstCookie).send({}),
    ])
    const statuses = responses.map(({ status }) => status).sort((left, right) => left - right)

    expect(statuses).toEqual([200, 401])
    const predecessor = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(rawCookieValue(firstCookie)) },
      select: { sessionId: true, usedAt: true, replacedById: true },
    })
    if (!predecessor) {
      throw new Error('Expected predecessor refresh token')
    }
    const sessionTokens = await prisma.refreshToken.findMany({
      where: { sessionId: predecessor.sessionId },
      select: { id: true, usedAt: true },
    })
    expect(sessionTokens).toHaveLength(2)
    expect(predecessor.usedAt).not.toBeNull()
    expect(predecessor.replacedById).not.toBeNull()
    expect(sessionTokens.filter(({ id }) => id !== predecessor.replacedById)).toHaveLength(1)
  })

  it('revokes the session when a consumed token is replayed', async () => {
    const fixture = await createFixture()
    const firstCookie = cookieHeader(await login(fixture))
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .send({})
    const secondCookie = cookieHeader(rotated)

    const replay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .send({})
    expect(replay.status).toBe(401)
    expect(replay.body.code).toBe('REUSED_REFRESH_TOKEN')

    const afterRevocation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', secondCookie)
      .send({})
    expect(afterRevocation.status).toBe(401)
    expect(afterRevocation.body.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('never gives a successor an expiry beyond its session absolute expiry', async () => {
    const fixture = await createFixture()
    const firstCookie = cookieHeader(await login(fixture))
    const firstToken = rawCookieValue(firstCookie)
    const firstRefresh = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(firstToken) },
      select: { id: true, sessionId: true },
    })
    if (!firstRefresh) {
      throw new Error('Expected fixture refresh token')
    }
    const absoluteExpiry = new Date(Date.now() + 60_000)
    await prisma.authSession.update({
      where: { id: firstRefresh.sessionId },
      data: { expiresAt: absoluteExpiry },
    })
    await prisma.refreshToken.update({
      where: { id: firstRefresh.id },
      data: { expiresAt: absoluteExpiry },
    })

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie)
      .send({})
    expect(rotated.status).toBe(200)

    const successor = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(rawCookieValue(cookieHeader(rotated))) },
      select: { expiresAt: true, sessionId: true },
    })
    if (!successor) {
      throw new Error('Expected successor refresh token')
    }
    const session = await prisma.authSession.findUnique({
      where: { id: successor.sessionId },
      select: { expiresAt: true },
    })
    if (!session) {
      throw new Error('Expected refresh session')
    }
    expect(successor.expiresAt.getTime()).toBeLessThanOrEqual(session.expiresAt.getTime())
  })

  it('allows a missing Origin for non-browser clients', async () => {
    const fixture = await createFixture()
    const response = await login(fixture)

    expect(response.status).toBe(200)
  })

  it('rejects an invalid Origin on login, refresh, and logout', async () => {
    const fixture = await createFixture()
    const invalidOrigin = 'https://evil.example'
    const invalidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', invalidOrigin)
      .send({ email: fixture.email, password: fixture.password })
    expect(invalidLogin.status).toBe(403)
    expect(errorBody(invalidLogin)).toEqual({
      statusCode: 403,
      code: 'INVALID_ORIGIN',
      message: 'Invalid request origin.',
    })

    const validLogin = await login(fixture)
    const cookie = cookieHeader(validLogin)
    const invalidRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', invalidOrigin)
      .set('Cookie', cookie)
      .send({})
    const invalidLogout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', invalidOrigin)
      .set('Cookie', cookie)
      .send({})

    expect(invalidRefresh.status).toBe(403)
    expect(errorBody(invalidRefresh)).toEqual(errorBody(invalidLogin))
    expect(invalidLogout.status).toBe(403)
    expect(errorBody(invalidLogout)).toEqual(errorBody(invalidLogin))
  })

  it('rejects an access token after its session is revoked', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    const token = loginResponse.body.accessToken as string
    const refresh = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(rawCookieValue(cookieHeader(loginResponse))) },
      select: { sessionId: true },
    })
    if (!refresh) {
      throw new Error('Expected refresh session')
    }
    await prisma.authSession.update({
      where: { id: refresh.sessionId },
      data: { revokedAt: new Date() },
    })

    const response = await request(app.getHttpServer())
      .get('/test-probe/actor')
      .set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(401)
    expect(errorBody(response)).toEqual({
      statusCode: 401,
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Invalid access token.',
    })
  })

  it('rejects an access token after its user is disabled', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    await prisma.user.update({ where: { id: fixture.userId }, data: { active: false } })

    const response = await request(app.getHttpServer())
      .get('/test-probe/actor')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`)
    expect(response.status).toBe(403)
    expect(errorBody(response)).toEqual({
      statusCode: 403,
      code: 'USER_INACTIVE',
      message: 'User account is inactive.',
    })
  })

  it('attaches an authoritative actor to an arbitrary protected endpoint', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    const response = await request(app.getHttpServer())
      .get('/test-probe/actor')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: fixture.userId,
      email: fixture.email,
      role: 'EDITOR',
      companyId: fixture.companyId,
    })
    expect(JSON.stringify(response.body)).not.toContain('passwordHash')
  })

  it('reflects a role change on the next protected request', async () => {
    const fixture = await createFixture()
    const loginResponse = await login(fixture)
    await prisma.user.update({ where: { id: fixture.userId }, data: { role: UserRole.ADMIN } })

    const response = await request(app.getHttpServer())
      .get('/test-probe/actor')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`)
    expect(response.status).toBe(200)
    expect(response.body.role).toBe('ADMIN')
    expect(response.body.companyId).toBe(fixture.companyId)
  })

  it('makes logout idempotent for active, revoked, consumed, unknown, and absent cookies', async () => {
    const active = await createFixture()
    const activeLogout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookieHeader(await login(active)))
      .send({})
    expect(activeLogout.status).toBe(204)
    expectRefreshCookieCleared(activeLogout)

    const revoked = await createFixture()
    const revokedCookie = cookieHeader(await login(revoked))
    const revokedToken = await prisma.refreshToken.findUnique({
      where: { digest: refreshDigest(rawCookieValue(revokedCookie)) },
      select: { sessionId: true },
    })
    if (!revokedToken) {
      throw new Error('Expected revoked-session token')
    }
    await prisma.authSession.update({
      where: { id: revokedToken.sessionId },
      data: { revokedAt: new Date() },
    })
    const alreadyRevokedLogout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', revokedCookie)
      .send({})
    expect(alreadyRevokedLogout.status).toBe(204)
    expectRefreshCookieCleared(alreadyRevokedLogout)

    const consumed = await createFixture()
    const consumedCookie = cookieHeader(await login(consumed))
    const rotation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', consumedCookie)
      .send({})
    expect(rotation.status).toBe(200)
    const consumedLogout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', consumedCookie)
      .send({})
    expect(consumedLogout.status).toBe(204)
    expectRefreshCookieCleared(consumedLogout)

    const unknownLogout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=unknown-${randomUUID()}`)
      .send({})
    expect(unknownLogout.status).toBe(204)
    expectRefreshCookieCleared(unknownLogout)

    const absentLogout = await request(app.getHttpServer()).post('/auth/logout').send({})
    expect(absentLogout.status).toBe(204)
    expectRefreshCookieCleared(absentLogout)
  })

  it('rejects unknown body fields through the global validation pipe', async () => {
    const fixture = await createFixture()
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: fixture.email, password: fixture.password, role: 'ADMIN' })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('BAD_REQUEST')
  })
})
