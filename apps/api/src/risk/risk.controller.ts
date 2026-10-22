import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  riskSimulationRequestSchema,
  stressMapRequestSchema,
  type RiskSimulationRequest,
  type StressMapRequest,
} from '@clarity/types';
import type { User } from '@clarity/database';
import { RiskService } from './risk.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post('simulate')
  simulate(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(riskSimulationRequestSchema)) input: RiskSimulationRequest,
  ) {
    return this.risk.simulate(user, input);
  }

  @Get('latest')
  latest(@CurrentUser() user: User) {
    return this.risk.latest(user);
  }

  @Post('stress-map')
  stressMap(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(stressMapRequestSchema)) input: StressMapRequest,
  ) {
    return this.risk.stressMap(user, input);
  }
}
