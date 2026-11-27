import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../database/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';

import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '../generated/prisma/enums.js';
import { LoginDto } from './dto/login.dto.js';

import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';

import {
  generateRefreshToken,
  hashRefreshToken,
} from './utils/refresh-token.util.js';

import { parseDurationMs } from './utils/duration.util.js';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new ConflictException(
        'Password exceeds the maximum supported length',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL', '7d');

    const expiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));

    const sessionFamilyId = randomUUID();

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        sessionFamilyId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();

    const nextRefreshToken = generateRefreshToken();
    const nextTokenHash = hashRefreshToken(nextRefreshToken);

    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL', '7d');

    const expiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!session) {
        return { status: 'INVALID' as const };
      }

      // Reuse of an already-revoked token:
      // revoke every session belonging to its family.
      if (session.revokedAt) {
        await tx.refreshSession.updateMany({
          where: {
            sessionFamilyId: session.sessionFamilyId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        return { status: 'REUSED' as const };
      }

      if (session.expiresAt <= now) {
        await tx.refreshSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        return { status: 'INVALID' as const };
      }

      if (session.user.status !== UserStatus.ACTIVE) {
        await tx.refreshSession.updateMany({
          where: {
            sessionFamilyId: session.sessionFamilyId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        return { status: 'INVALID' as const };
      }

      // Atomic compare-and-set prevents two requests from
      // successfully rotating the same session.
      const revoked = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        await tx.refreshSession.updateMany({
          where: {
            sessionFamilyId: session.sessionFamilyId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        return { status: 'REUSED' as const };
      }

      await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: nextTokenHash,
          sessionFamilyId: session.sessionFamilyId,
          expiresAt,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
        },
      });

      return {
        status: 'SUCCESS' as const,
        user: session.user,
      };
    });

    if (result.status !== 'SUCCESS') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: result.user.id,
      email: result.user.email,
      role: result.user.role,
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return { message: 'Logged out successfully' };
    }

    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: 'Logged out successfully' };
  }
}
