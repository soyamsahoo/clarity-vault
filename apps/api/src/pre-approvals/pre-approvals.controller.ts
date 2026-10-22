import { Body, Controller, Get, Post } from '@nestjs/common';
import { preApprovalRequestSchema, type PreApprovalRequest } from '@clarity/types';
import type { User } from '@clarity/database';
import { PreApprovalsService } from './pre-approvals.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('pre-approvals')
export class PreApprovalsController {
  constructor(private readonly preApprovals: PreApprovalsService) {}

  @Post('run')
  run(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(preApprovalRequestSchema)) input: PreApprovalRequest,
  ) {
    return this.preApprovals.run(user, input);
  }

  @Get('latest')
  latest(@CurrentUser() user: User) {
    return this.preApprovals.latest(user);
  }
}
