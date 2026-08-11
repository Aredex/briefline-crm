// Health module — OPS-006 (PH-12). Serves GET /api/v1/health.
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
