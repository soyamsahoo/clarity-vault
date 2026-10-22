import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CertificatesController, VerifyController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [CatalogModule],
  controllers: [CertificatesController, VerifyController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
