import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import path from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClerkAuthGuard, RolesGuard } from './auth/auth.guard';
import { CatalogModule } from './catalog/catalog.module';
import { FeeSlipsModule } from './fee-slips/fee-slips.module';
import { CertificatesModule } from './certificates/certificates.module';
import { AccountAggregatorModule } from './account-aggregator/account-aggregator.module';
import { PreApprovalsModule } from './pre-approvals/pre-approvals.module';
import { RiskModule } from './risk/risk.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { StorageModule } from './storage/storage.module';
import { AppController } from './app.controller';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { SimulationHeaderInterceptor } from './common/interceptors/simulation-header.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '../../.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env.local'),
      ],
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    CatalogModule,
    FeeSlipsModule,
    CertificatesModule,
    AccountAggregatorModule,
    PreApprovalsModule,
    RiskModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SimulationHeaderInterceptor,
    },
  ],
})
export class AppModule {}
