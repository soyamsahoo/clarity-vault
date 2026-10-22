import { Module } from '@nestjs/common';
import { AccountAggregatorController } from './account-aggregator.controller';
import { AccountAggregatorService } from './account-aggregator.service';

@Module({
  controllers: [AccountAggregatorController],
  providers: [AccountAggregatorService],
  exports: [AccountAggregatorService],
})
export class AccountAggregatorModule {}
