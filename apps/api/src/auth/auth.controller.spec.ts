import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };

  const configServiceMock = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'COOKIE_SECURE') return false;
      if (key === 'JWT_REFRESH_TTL') return '7d';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the authenticated user profile', () => {
    const user = {
      id: 'user-uuid-123',
      name: 'Test Customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    };

    expect(controller.getProfile(user)).toEqual(user);
  });
});
