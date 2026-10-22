import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FeeSlipsModule } from '../fee-slips/fee-slips.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { AccountAggregatorModule } from '../account-aggregator/account-aggregator.module';
import { PreApprovalsModule } from '../pre-approvals/pre-approvals.module';
import { RiskModule } from '../risk/risk.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    CatalogModule,
    FeeSlipsModule,
    CertificatesModule,
    AccountAggregatorModule,
    PreApprovalsModule,
    RiskModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
