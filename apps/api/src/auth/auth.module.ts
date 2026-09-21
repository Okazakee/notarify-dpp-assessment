import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import type { AppEnvironment } from '../config/configuration.js'
import { JWT_AUDIENCE, JWT_ISSUER } from '../config/configuration.js'
import { AccessTokenGuard } from './access-token.guard.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          audience: JWT_AUDIENCE,
          expiresIn: config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
          issuer: JWT_ISSUER,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AccessTokenGuard, AuthService],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
