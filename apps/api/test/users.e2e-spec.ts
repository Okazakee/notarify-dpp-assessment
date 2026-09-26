import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApplication } from '../src/application.js'
import { REFRESH_COOKIE_NAME } from '../src/auth/auth.constants.js'
import { UserRole } from '../src/generated/prisma/enums.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

/**
 * Stage 6 pass B: administrative user management.
 *
 * The decisive proofs are that authorization state is server-owned (a role change is
 * observed by an existing token, and a disable cannot be waited out), that the last active
 * Admin survives concurrent removal attempts, and that the company boundary holds on every
 * route.
 */

type Fixture = {
  companyId: string
  userId: string
  email: string
  password: string
  role: UserRole
}

let app: INestApplication
let prisma: PrismaService

const fixtures: Fixture[] = []

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}

function refreshCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie']
  if (!Array.isArray(cookies)) {
    throw new Error('expected a refresh cookie')
  }
  const cookie = cookies.find((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`))
  if (!cookie) {
    throw new Error('expected a refresh_token cookie')
  }
  return cookie.split(';', 1)[0] as string
}

async function createFixture(role: UserRole = UserRole.ADMIN): Promise<Fixture> {
  const company = await prisma.company.create({
    data: { displayName: `Users test ${randomUUID()}` },
  })
  const email = `users-${randomUUID()}@example.test`
  const password = `UsersPassword-${randomUUID()}`
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email,
      normalizedEmail: email,
      passwordHash: await hash(password, { algorithm: 2 }),
      role,
      active: true,
    },
  })
  const fixture = { companyId: company.id, userId: user.id, email, password, role }
  fixtures.push(fixture)
  return fixture
}

/** Adds a second user to an existing company, so role behaviour is proved in one scope. */
async function addUserToCompany(companyId: string, role: UserRole): Promise<Fixture> {
  const email = `users-${randomUUID()}@example.test`
  const password = `UsersPassword-${randomUUID()}`
  const user = await prisma.user.create({
    data: {
      companyId,
      email,
      normalizedEmail: email,
      passwordHash: await hash(password, { algorithm: 2 }),
      role,
      active: true,
    },
  })
  return { companyId, userId: user.id, email, password, role }
}

async function login(fixture: Fixture): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: fixture.email, password: fixture.password })
  expect(response.status).toBe(200)
  return response.body.accessToken as string
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  configureApplication(app)
  await app.init()
  prisma = app.get(PrismaService)
})

afterAll(async () => {
  const companyIds = fixtures.map((fixture) => fixture.companyId)
  if (companyIds.length > 0) {
    await prisma.auditEvent.deleteMany({ where: { actor: { companyId: { in: companyIds } } } })
    await prisma.refreshToken.deleteMany({
      where: { session: { user: { companyId: { in: companyIds } } } },
    })
    await prisma.authSession.deleteMany({ where: { user: { companyId: { in: companyIds } } } })
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  }
  await app.close()
})

describe('User administration', () => {
  it('lists, creates and updates users without exposing credential state', async () => {
    const admin = await createFixture()
    const token = await login(admin)

    const list = await request(app.getHttpServer()).get('/users').set(auth(token))
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    const listed = (list.body.items as Array<Record<string, unknown>>)[0]
    expect(listed?.email).toBe(admin.email)
    expect(Object.hasOwn(listed ?? {}, 'passwordHash')).toBe(false)
    expect(Object.hasOwn(listed ?? {}, 'normalizedEmail')).toBe(false)

    const created = await request(app.getHttpServer())
      .post('/users')
      .set(auth(token))
      .send({
        email: `Created-${randomUUID()}@Example.Test`,
        role: 'EDITOR',
        password: 'InitialPassw0rd!',
      })
    expect(created.status).toBe(201)
    expect(created.body.role).toBe('EDITOR')
    expect(created.body.active).toBe(true)
    expect(JSON.stringify(created.body)).not.toContain('passwordHash')

    // The email is stored with the same normalization login uses, so the account is
    // addressable by its lower-cased form.
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id as string },
      select: { normalizedEmail: true, passwordHash: true, companyId: true },
    })
    expect(stored.normalizedEmail).toBe(stored.normalizedEmail.toLowerCase())
    expect(stored.companyId).toBe(admin.companyId)
    expect(stored.passwordHash).not.toContain('InitialPassw0rd!')

    // A duplicate address is a controlled conflict rather than a second account.
    const duplicate = await request(app.getHttpServer())
      .post('/users')
      .set(auth(token))
      .send({ email: created.body.email as string, role: 'EDITOR', password: 'InitialPassw0rd!' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('USER_EMAIL_CONFLICT')

    const renamed = await request(app.getHttpServer())
      .patch(`/users/${created.body.id as string}`)
      .set(auth(token))
      .send({ role: 'ADMIN' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.role).toBe('ADMIN')

    const audit = await prisma.auditEvent.findMany({
      where: { entityId: created.body.id as string },
      orderBy: { occurredAt: 'asc' },
    })
    expect(audit.map((row) => row.action)).toEqual(['USER_CREATED', 'USER_ROLE_CHANGED'])
    expect(JSON.stringify(audit.map((row) => row.safeMetadata))).not.toContain('InitialPassw0rd!')
  })

  it('lets a created user authenticate with the initial credential', async () => {
    const admin = await createFixture()
    const token = await login(admin)
    const email = `Loginable-${randomUUID()}@example.test`
    const password = 'InitialPassw0rd!'

    const created = await request(app.getHttpServer())
      .post('/users')
      .set(auth(token))
      .send({ email, role: 'EDITOR', password })
    expect(created.status).toBe(201)

    const signIn = await request(app.getHttpServer()).post('/auth/login').send({ email, password })
    expect(signIn.status).toBe(200)
    // Login returns the stored address; the normalized form is the lookup key, not the
    // display value.
    expect(signIn.body.user.email).toBe(email)
  })

  it('applies a role change to an existing token on the next request', async () => {
    const actor = await createFixture(UserRole.ADMIN)
    const target = await addUserToCompany(actor.companyId, UserRole.ADMIN)
    const actorToken = await login(actor)
    const targetToken = await login(target)

    // The target is an Admin while their token is in hand.
    expect((await request(app.getHttpServer()).get('/users').set(auth(targetToken))).status).toBe(
      200,
    )

    const demoted = await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set(auth(actorToken))
      .send({ role: 'EDITOR' })
    expect(demoted.status).toBe(200)

    // The same token is now refused for an Admin-only route, and still accepted where an
    // Editor is allowed — no new login, and no role claim in the token.
    expect((await request(app.getHttpServer()).get('/users').set(auth(targetToken))).status).toBe(
      403,
    )
    expect(
      (await request(app.getHttpServer()).get('/products').set(auth(targetToken))).status,
    ).toBe(200)
  })

  it('revokes live sessions on deactivation and cannot be waited out', async () => {
    const actor = await createFixture(UserRole.ADMIN)
    const target = await addUserToCompany(actor.companyId, UserRole.EDITOR)
    const actorToken = await login(actor)

    const signIn = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: target.email, password: target.password })
    expect(signIn.status).toBe(200)
    const targetToken = signIn.body.accessToken as string
    const cookie = refreshCookie(signIn)

    expect(
      (await request(app.getHttpServer()).get('/products').set(auth(targetToken))).status,
    ).toBe(200)

    const disabled = await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set(auth(actorToken))
      .send({ active: false })
    expect(disabled.status).toBe(200)
    expect(disabled.body.active).toBe(false)

    // The access token fails immediately: the session was revoked with the disable.
    expect(
      (await request(app.getHttpServer()).get('/products').set(auth(targetToken))).status,
    ).toBe(401)
    // Refresh fails as well. The account is inactive, which is the existing contract's
    // refusal for this state, and the revoked family cannot restore access either way.
    const refreshed = await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie)
    expect(refreshed.status).toBe(403)
    expect(refreshed.body.code).toBe('USER_INACTIVE')
    const replayed = await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie)
    expect(replayed.status).toBe(403)

    // Sessions were revoked in the same transaction as the disable.
    expect(
      await prisma.authSession.count({ where: { userId: target.userId, revokedAt: null } }),
    ).toBe(0)
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: target.userId, action: 'USER_DEACTIVATED' },
    })
    expect(audit.safeMetadata).toMatchObject({
      activeBefore: true,
      activeAfter: false,
      revokedSessionCount: 1,
    })
  })

  it('reactivates without restoring the revoked session', async () => {
    const actor = await createFixture(UserRole.ADMIN)
    const target = await addUserToCompany(actor.companyId, UserRole.EDITOR)
    const actorToken = await login(actor)

    await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set(auth(actorToken))
      .send({ active: false })
      .expect(200)
    const disabledAt = await prisma.authSession.count({
      where: { userId: target.userId, revokedAt: null },
    })
    expect(disabledAt).toBe(0)

    const reactivated = await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set(auth(actorToken))
      .send({ active: true })
    expect(reactivated.status).toBe(200)
    expect(reactivated.body.active).toBe(true)
    // Reactivation is not a session restore.
    expect(
      await prisma.authSession.count({ where: { userId: target.userId, revokedAt: null } }),
    ).toBe(0)

    // A fresh login works.
    const signIn = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: target.email, password: target.password })
    expect(signIn.status).toBe(200)

    const actions = await prisma.auditEvent.findMany({
      where: { entityId: target.userId },
      orderBy: { occurredAt: 'asc' },
      select: { action: true },
    })
    expect(actions.map((row) => row.action)).toEqual(['USER_DEACTIVATED', 'USER_ACTIVATED'])
  })

  it('refuses to remove the last active administrator', async () => {
    const admin = await createFixture(UserRole.ADMIN)
    const token = await login(admin)

    const demote = await request(app.getHttpServer())
      .patch(`/users/${admin.userId}`)
      .set(auth(token))
      .send({ role: 'EDITOR' })
    expect(demote.status).toBe(409)
    expect(demote.body.code).toBe('LAST_ADMIN_PROTECTED')

    const disable = await request(app.getHttpServer())
      .patch(`/users/${admin.userId}`)
      .set(auth(token))
      .send({ active: false })
    expect(disable.status).toBe(409)

    const still = await prisma.user.findUniqueOrThrow({
      where: { id: admin.userId },
      select: { role: true, active: true },
    })
    expect(still).toEqual({ role: UserRole.ADMIN, active: true })
    expect(await prisma.auditEvent.count({ where: { entityId: admin.userId } })).toBe(0)
  })

  it('keeps at least one active administrator under a concurrent removal race', async () => {
    const actor = await createFixture(UserRole.ADMIN)
    const other = await addUserToCompany(actor.companyId, UserRole.ADMIN)
    const token = await login(actor)

    // Both requests would together leave zero active Admins, so at most one may commit.
    const [demoteOther, demoteSelf] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/users/${other.userId}`)
        .set(auth(token))
        .send({ role: 'EDITOR' }),
      request(app.getHttpServer())
        .patch(`/users/${actor.userId}`)
        .set(auth(token))
        .send({ role: 'EDITOR' }),
    ])

    const statuses = [demoteOther.status, demoteSelf.status].sort()
    expect(statuses).toEqual([200, 409])

    const activeAdmins = await prisma.user.count({
      where: { companyId: actor.companyId, role: UserRole.ADMIN, active: true },
    })
    expect(activeAdmins).toBeGreaterThanOrEqual(1)

    // Audit rows correspond only to the change that actually committed.
    const roleChanges = await prisma.auditEvent.count({
      where: {
        action: 'USER_ROLE_CHANGED',
        actor: { companyId: actor.companyId },
      },
    })
    expect(roleChanges).toBe(1)
  })
})

describe('User administration authorization and isolation', () => {
  it('refuses an Editor on every user route', async () => {
    const admin = await createFixture(UserRole.ADMIN)
    const editor = await createFixture(UserRole.EDITOR)
    const editorToken = await login(editor)

    expect((await request(app.getHttpServer()).get('/users').set(auth(editorToken))).status).toBe(
      403,
    )
    expect(
      (
        await request(app.getHttpServer())
          .post('/users')
          .set(auth(editorToken))
          .send({
            email: `nope-${randomUUID()}@example.test`,
            role: 'EDITOR',
            password: 'Passw0rd!!',
          })
      ).status,
    ).toBe(403)
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/users/${admin.userId}`)
          .set(auth(editorToken))
          .send({ role: 'EDITOR' })
      ).status,
    ).toBe(403)
  })

  it('never lets one company reach another company’s users', async () => {
    const actor = await createFixture(UserRole.ADMIN)
    const foreign = await createFixture(UserRole.ADMIN)
    const actorToken = await login(actor)

    const list = await request(app.getHttpServer()).get('/users').set(auth(actorToken))
    expect(list.status).toBe(200)
    expect(
      (list.body.items as Array<{ id: string }>).some((item) => item.id === foreign.userId),
    ).toBe(false)

    // A foreign id and an unknown id are the same safe 404.
    const foreignKnown = await request(app.getHttpServer())
      .patch(`/users/${foreign.userId}`)
      .set(auth(actorToken))
      .send({ active: false })
    const unknown = await request(app.getHttpServer())
      .patch(`/users/${randomUUID()}`)
      .set(auth(actorToken))
      .send({ active: false })
    expect(foreignKnown.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(foreignKnown.body.code).toBe(unknown.body.code)

    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: foreign.userId },
      select: { active: true, role: true },
    })
    expect(untouched.active).toBe(true)
  })
})
