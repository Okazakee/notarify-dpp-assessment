import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configureApplication } from './application.js'

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  configureApplication(app)
  await app.listen(Number(process.env.PORT ?? 3000))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrap()
}
