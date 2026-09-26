import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { UsersController } from './users.controller.js'
import { UsersService } from './users.service.js'

/**
 * Owns company user administration.
 *
 * `AuthModule` supplies the access-token guard and the email normalization login already
 * uses, so an account created here is addressable by the same login path; `AuditModule`
 * supplies the transactional append that every administrative change commits with.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
