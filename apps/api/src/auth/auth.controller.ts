import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { updateProfileSchema, kycSubmitSchema, type UpdateProfileInput, type KycSubmitInput } from '@clarity/types';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { User } from '@clarity/database';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  sync(@CurrentUser() user: User) {
    return this.authService.toAuthUser(user);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.authService.toAuthUser(user);
  }

  @Patch('me')
  update(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
  ) {
    return this.authService.updateProfile(user, input);
  }
}

@Controller('kyc')
export class KycController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.authService.getKyc(user);
  }

  @Post('simulate')
  simulate(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(kycSubmitSchema)) input: KycSubmitInput,
  ) {
    return this.authService.submitKyc(user.id, input);
  }
}
