// Clients module — CLI-API-001..006 (PH-05).
import { Module } from '@nestjs/common'
import { ClientsController } from './clients.controller'
import { ClientsService } from './clients.service'

@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
  // Exported so PH-06 (tasks) can inject the CLI-API-006 association invariant
  // (assertAssignable) without duplicating the archived-client check.
  exports: [ClientsService],
})
export class ClientsModule {}
