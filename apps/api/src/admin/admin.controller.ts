import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  reviewFeeSlipSchema,
  updateBankPolicySchema,
  upsertCostScheduleSchema,
  type ReviewFeeSlipInput,
  type UpdateBankPolicyInput,
  type UpsertCostScheduleInput,
} from '@clarity/types';
import type { User } from '@clarity/database';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const feeSlipQuerySchema = z.object({
  status: z.string().max(40).optional(),
  universityId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
type FeeSlipQuery = z.infer<typeof feeSlipQuerySchema>;

@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('universities')
  universities() {
    return this.admin.universities();
  }

  @Get('fee-slips')
  feeSlips(@Query(new ZodValidationPipe(feeSlipQuerySchema)) query: FeeSlipQuery) {
    return this.admin.listFeeSlips(query);
  }

  @Patch('fee-slips/:id/review')
  reviewFeeSlip(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewFeeSlipSchema)) input: ReviewFeeSlipInput,
  ) {
    return this.admin.reviewFeeSlip(user, id, input);
  }

  @Get('policies')
  policies() {
    return this.admin.policies();
  }

  @Patch('policies/:id')
  updatePolicy(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBankPolicySchema)) input: UpdateBankPolicyInput,
  ) {
    return this.admin.updatePolicy(user, id, input);
  }

  @Post('cost-schedules')
  upsertCostSchedule(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(upsertCostScheduleSchema)) input: UpsertCostScheduleInput,
  ) {
    return this.admin.upsertCostSchedule(user, input);
  }
}
