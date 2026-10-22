import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  approveConsentSchema,
  createConsentSchema,
  type ApproveConsentInput,
  type CreateConsentInput,
} from '@clarity/types';
import type { User } from '@clarity/database';
import { AccountAggregatorService } from './account-aggregator.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('aa')
export class AccountAggregatorController {
  constructor(private readonly aa: AccountAggregatorService) {}

  @Get('status')
  status(@CurrentUser() user: User) {
    return this.aa.status(user);
  }

  @Post('consents')
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createConsentSchema)) input: CreateConsentInput,
  ) {
    return this.aa.createConsent(user, input);
  }

  @Post('consents/:id/approve')
  approve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveConsentSchema)) input: ApproveConsentInput,
  ) {
    return this.aa.approve(user, id, input);
  }

  @Post('consents/:id/revoke')
  revoke(@CurrentUser() user: User, @Param('id') id: string) {
    return this.aa.revoke(user, id);
  }

  @Post('refresh')
  refresh(@CurrentUser() user: User) {
    return this.aa.refresh(user);
  }
}
