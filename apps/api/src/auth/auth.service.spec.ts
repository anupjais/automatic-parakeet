import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '../generated/prisma/enums.js';
import { hashRefreshToken } from './utils/refresh-token.util.js';

describe('AuthService', () => {
  let service: AuthService;

  const activeUser = {
    id: 'user-uuid-123',
    name: 'Test Customer',
    email: 'customer@example.com',
    role: 'CUSTOMER',
    status: UserStatus.ACTIVE,
  };

  const session = {
    id: 'session-uuid-123',
    userId: activeUser.id,
    tokenHash: hashRefreshToken('old-refresh-token'),
    sessionFamilyId: 'family-uuid-123',
    expiresAt: new Date(Date.now() + 7 * 86400000),
    revokedAt: null,
    userAgent: null,
    ipAddress: null,
    user: activeUser,
  };

  const txMock = {
    refreshSession: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };

  const prismaMock = {
    $transaction: vi.fn(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    ),
    refreshSession: {
      updateMany: vi.fn(),
    },
  };

  const jwtMock = {
    signAsync: vi.fn().mockResolvedValue('new-access-token'),
  };

  const configMock = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'JWT_REFRESH_TTL') return '7d';
      if (key === 'JWT_ACCESS_TTL') return '15m';
      return defaultValue;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should rotate a valid refresh token', async () => {
    txMock.refreshSession.findUnique.mockResolvedValue({
      ...session,
      revokedAt: null,
    });

    txMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    txMock.refreshSession.create.mockResolvedValue({});

    const result = await service.refresh('old-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe('old-refresh-token');

    expect(txMock.refreshSession.updateMany).toHaveBeenCalled();
    expect(txMock.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: activeUser.id,
        sessionFamilyId: session.sessionFamilyId,
      }),
    });

    expect(jwtMock.signAsync).toHaveBeenCalled();
  });

  it('should revoke the session family when a refresh token is reused', async () => {
    txMock.refreshSession.findUnique.mockResolvedValue({
      ...session,
      revokedAt: new Date(),
    });

    txMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(txMock.refreshSession.updateMany).toHaveBeenCalledWith({
      where: {
        sessionFamilyId: session.sessionFamilyId,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    expect(txMock.refreshSession.create).not.toHaveBeenCalled();
  });

  it('should revoke and reject an expired refresh token', async () => {
    txMock.refreshSession.findUnique.mockResolvedValue({
      ...session,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });

    txMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(txMock.refreshSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    expect(txMock.refreshSession.create).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('should revoke the session family for an inactive user', async () => {
    txMock.refreshSession.findUnique.mockResolvedValue({
      ...session,
      user: {
        ...activeUser,
        status: UserStatus.SUSPENDED,
      },
    });

    txMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(txMock.refreshSession.updateMany).toHaveBeenCalledWith({
      where: {
        sessionFamilyId: session.sessionFamilyId,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    expect(txMock.refreshSession.create).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('should revoke a refresh token during logout', async () => {
    prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.logout('old-refresh-token');

    expect(result).toEqual({
      message: 'Logged out successfully',
    });

    expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRefreshToken('old-refresh-token'),
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });
});
