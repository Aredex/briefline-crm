// Profile module — PROF-001 (PH-04).
import { Module } from '@nestjs/common'
import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
