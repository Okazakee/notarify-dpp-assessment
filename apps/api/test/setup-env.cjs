const { randomBytes } = require('node:crypto')

process.env.NODE_ENV ??= 'test'
process.env.JWT_SECRET ??= `integration-${randomBytes(32).toString('hex')}`

// A public origin distinct from the development default. Set here rather than in a test
// body because the config module validates the environment when it is imported, which
// happens before any `beforeAll` runs.
process.env.PUBLIC_APP_ORIGIN ??= 'https://public.example.test'
