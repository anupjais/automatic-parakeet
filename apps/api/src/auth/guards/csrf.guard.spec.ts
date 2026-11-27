import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard.js';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  const configMock = {
    getOrThrow: vi.fn().mockReturnValue('http://localhost:3001'),
  };

  const createContext = (origin?: string) => {
    const request = {
      headers: origin === undefined ? {} : { origin },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    guard = new CsrfGuard(configMock as unknown as ConfigService);
  });

  it('should allow the trusted frontend origin', () => {
    expect(guard.canActivate(createContext('http://localhost:3001'))).toBe(
      true,
    );
  });

  it('should reject an untrusted origin', () => {
    expect(() =>
      guard.canActivate(createContext('https://evil.example')),
    ).toThrow(ForbiddenException);
  });

  it('should reject a missing origin', () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      ForbiddenException,
    );
  });

  it('should reject a null origin', () => {
    expect(() => guard.canActivate(createContext('null'))).toThrow(
      ForbiddenException,
    );
  });

  it('should reject a malformed origin', () => {
    expect(() => guard.canActivate(createContext('not-a-valid-url'))).toThrow(
      ForbiddenException,
    );
  });
});
