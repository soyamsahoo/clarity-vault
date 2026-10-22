import { Module } from '@nestjs/common';
import { AuthController, KycController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, KycController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
