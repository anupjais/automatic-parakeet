import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

describe('Admin RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = randomUUID();
  const customerEmail = `customer-${suffix}@example.com`;
  const adminEmail = `admin-${suffix}@example.com`;
  const password = 'TestPassword@123';

  let customerAccessToken: string;
  let adminAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    prisma = app.get(PrismaService);
    await app.init();

    // Register CUSTOMER.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'RBAC Customer',
        email: customerEmail,
        password,
      })
      .expect(201);

    // Login CUSTOMER.
    const customerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: customerEmail, password })
      .expect(200);

    customerAccessToken = customerLogin.body.accessToken;

    // Register a separate account for ADMIN.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'RBAC Admin',
        email: adminEmail,
        password,
      })
      .expect(201);

    // Promote the isolated test account to ADMIN.
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: UserRole.ADMIN },
    });

    // Login after promotion to obtain an ADMIN token.
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    adminAccessToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [customerEmail, adminEmail],
          },
        },
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('should reject requests without an access token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .expect(401);
  });

  it('should reject CUSTOMER access to the admin dashboard', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${customerAccessToken}`)
      .expect(403);
  });

  it('should allow ADMIN access to the admin dashboard', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(response.body.accessLevel).toBe('ADMIN');
    expect(response.body.message).toBe('Admin dashboard accessed successfully');
  });
});
