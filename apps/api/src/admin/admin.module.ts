import { Module } from '@nestjs/common';
import { FeeSlipsModule } from '../fee-slips/fee-slips.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [FeeSlipsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
