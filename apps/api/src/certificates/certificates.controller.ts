import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { createCertificateSchema, type CreateCertificateInput } from '@clarity/types';
import type { User } from '@clarity/database';
import { CertificatesService } from './certificates.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post()
  issue(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createCertificateSchema)) input: CreateCertificateInput,
  ) {
    return this.certificates.issue(user, input);
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.certificates.listMine(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.certificates.get(user, id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.certificates.renderPdf(user, id);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return new StreamableFile(buffer);
  }
}

@Controller('verify')
export class VerifyController {
  constructor(private readonly certificates: CertificatesService) {}

  @Public()
  @Get(':code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }
}
