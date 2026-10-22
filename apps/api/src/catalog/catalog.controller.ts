import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  universityListQuerySchema,
  type UniversityListQuery,
} from '@clarity/types';
import { CatalogService } from './catalog.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('universities')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query(new ZodValidationPipe(universityListQuerySchema)) query: UniversityListQuery) {
    return this.catalog.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.catalog.detail(id);
  }

  @Get(':id/programs/:programId/cost')
  cost(@Param('id') id: string, @Param('programId') programId: string) {
    return this.catalog.allInCost(id, programId);
  }

  @Get(':id/outcomes')
  outcome(@Param('id') id: string, @Query('programId') programId?: string) {
    return this.catalog.outcome(id, programId);
  }
}
