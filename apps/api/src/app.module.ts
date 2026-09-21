import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AuthModule } from './auth/auth.module.js'
import { ApiExceptionFilter } from './common/api-exception.js'
import { ValidatedConfigModule } from './config/config.module.js'
import { PrismaModule } from './prisma/prisma.module.js'

@Module({
  imports: [ValidatedConfigModule, PrismaModule, AuthModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
