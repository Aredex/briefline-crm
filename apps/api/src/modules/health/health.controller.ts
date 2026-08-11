// Health endpoint — OPS-006 (PH-12). Public liveness probe for the platform:
// Render healthCheckPath (/api/v1/health), post-deploy smoke tests (OPS-008)
// and the daily-reset workflow (OPS-007). No DB touch on purpose — a liveness
// probe must report on the process itself, not on external dependencies.
import { Controller, Get } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'

@Controller('health')
export class HealthController {
  // Bypasses the global JwtAuthGuard — health checks carry no session.
  @Public()
  @Get()
  check(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
