import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * Liveness and readiness for the container topology.
 *
 * Both routes are anonymous on purpose: a Compose health check or an orchestrator must be
 * able to ask without credentials, and neither response reveals anything about the
 * deployment beyond whether the process and its authoritative database are usable.
 *
 * The distinction matters for this application:
 *
 * - **Liveness** means the process is running. It deliberately does *not* touch PostgreSQL
 *   or Redis, so a dependency outage cannot cause an orchestrator to kill an otherwise
 *   healthy process.
 * - **Readiness** means the API can serve authoritative data, which requires PostgreSQL and
 *   nothing else. Redis is a disposable cache, so a Redis outage never makes the API
 *   unready — it only makes reads slower.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is running' })
  @ApiResponse({ status: 200, description: 'The process is running.' })
  live(): { status: 'ok' } {
    return { status: 'ok' }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: PostgreSQL is reachable' })
  @ApiResponse({ status: 200, description: 'PostgreSQL answered, so the API can serve.' })
  @ApiResponse({ status: 503, description: 'PostgreSQL is unavailable.' })
  async ready(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      // A controlled 503 with no internal detail: the health route is anonymous.
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'unavailable',
      })
    }

    return { status: 'ok', database: 'ok' }
  }
}
