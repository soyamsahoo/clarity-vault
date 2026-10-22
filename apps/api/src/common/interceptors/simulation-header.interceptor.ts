import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

@Injectable()
export class SimulationHeaderInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = _context.switchToHttp().getResponse<{ setHeader: (name: string, value: string) => void }>();
    response.setHeader('X-Clarity-Mode', 'simulation');
    return next.handle();
  }
}
