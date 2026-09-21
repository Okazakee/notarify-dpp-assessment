const { randomBytes } = require('node:crypto')

process.env.NODE_ENV ??= 'test'
process.env.JWT_SECRET ??= `integration-${randomBytes(32).toString('hex')}`
