import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@clarity/database';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.code === 'P2002') {
      response.status(409).json({
        statusCode: 409,
        message: 'A record with those details already exists.',
        code: exception.code,
      });
      return;
    }
    if (exception.code === 'P2025') {
      response.status(404).json({
        statusCode: 404,
        message: 'The requested record could not be found.',
        code: exception.code,
      });
      return;
    }
    response.status(500).json({
      statusCode: 500,
      message: 'A database error occurred.',
      code: exception.code,
    });
  }
}
