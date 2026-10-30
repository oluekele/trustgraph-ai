import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { HealthController } from './health.controller';

@Module({
  imports: [GovernanceModule],
  controllers: [HealthController],
})
export class HealthModule {}
