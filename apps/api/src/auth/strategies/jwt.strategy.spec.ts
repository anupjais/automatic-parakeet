import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const activeUser = {
    id: 'user-uuid-123',
    name: 'Test Customer',
    email: 'customer@example.com',
    role: 'CUSTOMER',
    status: UserStatus.ACTIVE,
  };

  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  const configMock = {
    getOrThrow: vi
      .fn()
      .mockReturnValue('test-access-secret-key-at-least-32-characters'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new JwtStrategy(
      configMock as unknown as ConfigService,
      prismaMock as unknown as PrismaService,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should validate an active user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser);

    const result = await strategy.validate({
      sub: activeUser.id,
      email: activeUser.email,
      role: 'CUSTOMER',
    });

    expect(result).toEqual({
      id: activeUser.id,
      name: activeUser.name,
      email: activeUser.email,
      role: activeUser.role,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: activeUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });
  });

  it('should reject a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'unknown-user',
        email: 'unknown@example.com',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a suspended user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...activeUser,
      status: UserStatus.SUSPENDED,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a payload without a subject', async () => {
    await expect(
      strategy.validate({
        sub: '',
        email: activeUser.email,
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
