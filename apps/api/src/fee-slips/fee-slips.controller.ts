import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createFeeSlipSchema,
  reviewFeeSlipSchema,
  type CreateFeeSlipInput,
  type ReviewFeeSlipInput,
} from '@clarity/types';
import type { User } from '@clarity/database';
import { FeeSlipsService } from './fee-slips.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('fee-slips')
export class FeeSlipsController {
  constructor(private readonly feeSlips: FeeSlipsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(createFeeSlipSchema)) input: CreateFeeSlipInput,
  ) {
    return this.feeSlips.upload(user, file, input);
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.feeSlips.listMine(user.id);
  }

  @Get('stats')
  stats(@CurrentUser() user: User) {
    return this.feeSlips.stats(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.feeSlips.get(user, id);
  }

  @Post(':id/simulate-review')
  @HttpCode(200)
  simulateReview(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewFeeSlipSchema)) input: ReviewFeeSlipInput,
  ) {
    return this.feeSlips.review(user, id, input, { allowOwner: true });
  }
}
