import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PreApprovalsController } from './pre-approvals.controller';
import { PreApprovalsService } from './pre-approvals.service';

@Module({
  imports: [CatalogModule],
  controllers: [PreApprovalsController],
  providers: [PreApprovalsService],
  exports: [PreApprovalsService],
})
export class PreApprovalsModule {}
