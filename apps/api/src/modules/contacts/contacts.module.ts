// Contacts module — CONT-API-001..006 (PH-14, PC-01).
import { Module } from '@nestjs/common'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
