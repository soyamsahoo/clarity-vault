import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@clarity/database';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: User;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
