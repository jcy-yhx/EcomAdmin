import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

const LOGGABLE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId: number; email: string } }>();
    const { method, url, user } = request;

    if (!LOGGABLE_METHODS.has(method) || !user) {
      return next.handle();
    }

    // Log after successful response
    return next.handle().pipe(
      tap(() => {
        const module = url.split('/')[3] || 'unknown';
        const actionMap: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
        const action = actionMap[method] || method;
        const detail = `${method} ${url}`;

        this.prisma.operationLog
          .create({
            data: {
              userId: user.userId,
              username: user.email,
              module,
              action,
              detail,
              ip: request.ip || (request.headers['x-forwarded-for'] as string) || '-',
              userAgent: request.headers['user-agent'],
            },
          })
          .catch(() => {}); // Fire-and-forget — don't block response
      }),
    );
  }
}
