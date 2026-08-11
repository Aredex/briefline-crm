// Tasks module — TASK-API-001..012 (PH-06).
import { Module } from '@nestjs/common'
import { ClientsModule } from '../clients/clients.module'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  imports: [ClientsModule], // CLI-API-006 association invariant (assertAssignable)
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
