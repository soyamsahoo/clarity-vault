import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FeeSlipsController } from './fee-slips.controller';
import { FeeSlipsService } from './fee-slips.service';
import { multerOptions } from '../storage/multer.config';

@Module({
  imports: [MulterModule.registerAsync(multerOptions)],
  controllers: [FeeSlipsController],
  providers: [FeeSlipsService],
  exports: [FeeSlipsService],
})
export class FeeSlipsModule {}
