import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service.js';
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
    emailVerifiedAt: new Date(),
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
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
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
    user: {
      findUnique: vi.fn(),
    },
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

  const emailMock = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
      emailMock as unknown as EmailService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Registration and email verification

  it('should register a user and send a verification email', async () => {
    const createdUser = {
      id: activeUser.id,
      name: activeUser.name,
      email: activeUser.email,
      role: activeUser.role,
      status: activeUser.status,
      createdAt: new Date(),
    };

    prismaMock.user.findUnique.mockResolvedValue(null);
    txMock.user.create.mockResolvedValue(createdUser);
    txMock.emailVerificationToken.create.mockResolvedValue({});

    const result = await service.register({
      name: ' Test Customer ',
      email: ' CUSTOMER@EXAMPLE.COM ',
      password: 'TestPassword@123',
    });

    expect(result.message).toBe(
      'Registration successful. Please verify your email address.',
    );

    expect(result.user).toEqual(createdUser);

    expect(txMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Test Customer',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      }),
      select: expect.any(Object),
    });

    expect(txMock.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: activeUser.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });

    const sentToken = emailMock.sendVerificationEmail.mock.calls[0][1];

    expect(typeof sentToken).toBe('string');
    expect(sentToken).toBeTruthy();

    const expectedHash = createHash('sha256').update(sentToken).digest('hex');

    expect(txMock.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: expectedHash,
      }),
    });

    expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith(
      'customer@example.com',
      sentToken,
    );
  });

  it('should reject registration when the email already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: activeUser.id,
    });

    await expect(
      service.register({
        name: 'Test Customer',
        email: 'customer@example.com',
        password: 'TestPassword@123',
      }),
    ).rejects.toThrow('An account with this email already exists');

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should verify an email using a valid token', async () => {
    const rawToken = 'valid-verification-token';

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    txMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'verification-token-123',
      userId: activeUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
      user: activeUser,
    });

    txMock.emailVerificationToken.updateMany.mockResolvedValue({
      count: 1,
    });

    txMock.user.update.mockResolvedValue({
      ...activeUser,
      emailVerifiedAt: new Date(),
    });

    const result = await service.verifyEmail(rawToken);

    expect(result.message).toBe(
      'Email verified successfully. You can now log in.',
    );

    expect(txMock.emailVerificationToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash },
      include: { user: true },
    });

    expect(txMock.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'verification-token-123',
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        usedAt: expect.any(Date),
      },
    });

    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: activeUser.id },
      data: {
        emailVerifiedAt: expect.any(Date),
      },
    });
  });

  it('should reject an empty verification token', async () => {
    await expect(service.verifyEmail('')).rejects.toThrow(BadRequestException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject an expired verification token', async () => {
    txMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'expired-token-123',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      user: activeUser,
    });

    await expect(
      service.verifyEmail('expired-verification-token'),
    ).rejects.toThrow(BadRequestException);

    expect(txMock.emailVerificationToken.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('should reject an already-used verification token', async () => {
    txMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'used-token-123',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(),
      user: activeUser,
    });

    await expect(service.verifyEmail('already-used-token')).rejects.toThrow(
      BadRequestException,
    );

    expect(txMock.emailVerificationToken.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('should reject verification when another request consumes the token first', async () => {
    txMock.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'verification-token-123',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
      user: activeUser,
    });

    txMock.emailVerificationToken.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.verifyEmail('verification-token-race'),
    ).rejects.toThrow(BadRequestException);

    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  // Login restrictions

  it('should reject login when the email is not verified', async () => {
    const password = 'TestPassword@123';
    const passwordHash = await bcrypt.hash(password, 4);

    prismaMock.user.findUnique.mockResolvedValue({
      ...activeUser,
      passwordHash,
      emailVerifiedAt: null,
    });

    await expect(
      service.login({
        email: activeUser.email,
        password,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  // Resend verification

  it('should resend verification and invalidate previous unused tokens', async () => {
    const unverifiedUser = {
      id: activeUser.id,
      email: activeUser.email,
      emailVerifiedAt: null,
    };

    txMock.user.findUnique.mockResolvedValue(unverifiedUser);
    txMock.emailVerificationToken.deleteMany.mockResolvedValue({
      count: 1,
    });
    txMock.emailVerificationToken.create.mockResolvedValue({});

    const result = await service.resendVerificationEmail(
      ' CUSTOMER@EXAMPLE.COM ',
    );

    expect(result.message).toBe(
      'If an unverified account exists for this email, a verification link will be sent.',
    );

    expect(txMock.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: activeUser.id,
        usedAt: null,
      },
    });

    expect(txMock.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: activeUser.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });

    expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith(
      activeUser.email,
      expect.any(String),
    );
  });

  it('should return the same response when the email does not exist', async () => {
    txMock.user.findUnique.mockResolvedValue(null);

    const result = await service.resendVerificationEmail('unknown@example.com');

    expect(result.message).toBe(
      'If an unverified account exists for this email, a verification link will be sent.',
    );

    expect(txMock.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should return the same response for an already-verified account', async () => {
    txMock.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      email: activeUser.email,
      emailVerifiedAt: new Date(),
    });

    const result = await service.resendVerificationEmail(activeUser.email);

    expect(result.message).toBe(
      'If an unverified account exists for this email, a verification link will be sent.',
    );

    expect(txMock.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should not expose email delivery failures from resend verification', async () => {
    txMock.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      email: activeUser.email,
      emailVerifiedAt: null,
    });

    txMock.emailVerificationToken.deleteMany.mockResolvedValue({
      count: 0,
    });

    txMock.emailVerificationToken.create.mockResolvedValue({});

    emailMock.sendVerificationEmail.mockRejectedValue(
      new Error('Email provider unavailable'),
    );

    await expect(
      service.resendVerificationEmail(activeUser.email),
    ).resolves.toEqual({
      message:
        'If an unverified account exists for this email, a verification link will be sent.',
    });
  });

  // Refresh-token tests

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
