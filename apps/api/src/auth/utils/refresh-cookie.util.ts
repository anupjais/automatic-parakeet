import type { ConfigService } from '@nestjs/config';

export function getRefreshCookieOptions(config: ConfigService) {
  const secure = config.get<boolean>('COOKIE_SECURE', false);
  const refreshTtl = config.get<string>('JWT_REFRESH_TTL', '7d');

  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    maxAge: parseDurationMs(refreshTtl),
  };
}

export function getRefreshCookieName(config: ConfigService): string {
  return config.get<boolean>('COOKIE_SECURE', false)
    ? '__Host-refresh_token'
    : 'refresh_token';
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);

  if (!match) {
    throw new Error(`Invalid refresh-token duration: ${value}`);
  }

  const units: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return Number(match[1]) * units[match[2]];
}
