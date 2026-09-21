import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { validateEnvironment } from './configuration.js'

@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')],
      isGlobal: true,
      validate: validateEnvironment,
    }),
  ],
  exports: [NestConfigModule],
})
export class ValidatedConfigModule {}
