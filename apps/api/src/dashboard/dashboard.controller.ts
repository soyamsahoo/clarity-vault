import { Controller, Get } from '@nestjs/common';
import type { User } from '@clarity/database';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.dashboard.get(user);
  }
}
