import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AnalyticsModule } from './analytics/analytics.module.js'
import { AssetsModule } from './assets/assets.module.js'
import { AuthModule } from './auth/auth.module.js'
import { ApiExceptionFilter } from './common/api-exception.js'
import { ValidatedConfigModule } from './config/config.module.js'
import { PassportsModule } from './passports/passports.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'
import { PublicPassportModule } from './public-passport/public-passport.module.js'
import { PublicationModule } from './publication/publication.module.js'

@Module({
  imports: [
    ValidatedConfigModule,
    PrismaModule,
    AuthModule,
    AnalyticsModule,
    AssetsModule,
    ProductsModule,
    PublicationModule,
    PublicPassportModule,
    PassportsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
