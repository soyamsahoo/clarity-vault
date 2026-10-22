import { Controller, Get } from '@nestjs/common';
import { API_VERSION } from '@clarity/types';
import { PrismaService } from './prisma/prisma.module';
import { Public } from './common/decorators/public.decorator';
import { simulationMeta } from './common/simulation';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    let database = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'clarity-vault-api',
      version: API_VERSION,
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('meta')
  meta() {
    return simulationMeta();
  }
}
