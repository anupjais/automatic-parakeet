
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const requestOrigin = request.headers.origin;
    const frontendOrigin =
      this.configService.getOrThrow<string>('FRONTEND_ORIGIN');

    if (!requestOrigin || requestOrigin === 'null') {
      throw new ForbiddenException('Missing request origin');
    }

    let trustedOrigin: string;
    let receivedOrigin: string;

    try {
      trustedOrigin = new URL(frontendOrigin).origin;
      receivedOrigin = new URL(requestOrigin).origin;
    } catch {
      throw new ForbiddenException('Invalid request origin');
    }

    if (receivedOrigin !== trustedOrigin) {
      throw new ForbiddenException('Untrusted request origin');
    }

    return true;
  }
}
