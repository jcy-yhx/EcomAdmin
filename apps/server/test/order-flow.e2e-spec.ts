import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('E2E: Order Flow (login → cart → order → status)', () => {
  let app: INestApplication;
  let accessToken: string;
  let orderId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts config
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // ──── Step 1: Login ────
  it('POST /api/v1/auth/login — returns JWT with roles', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@ecom.com', password: 'admin123' })
      .expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    accessToken = res.body.data.accessToken;

    // Verify JWT payload contains roles/permissions
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    expect(payload.roles).toBeDefined();
    expect(payload.permissions).toBeDefined();
  });

  // ──── Step 2: Browse products (public) ────
  it('GET /api/v1/products — public, no token needed', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products?status=on_sale').expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  // ──── Step 3: Add to cart ────
  it('POST /api/v1/cart — add items', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ skuId: 1, quantity: 1 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.items.length).toBe(1);
  });

  // ──── Step 4: Create Order ────
  it('POST /api/v1/orders — create from cart', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        address: {
          receiverName: 'E2E Test',
          phone: '13800138000',
          province: 'GD',
          city: 'SZ',
          detail: 'Test Address 123',
        },
      })
      .expect(201);

    expect(res.body.data.orderNo).toMatch(/^EC/);
    expect(res.body.data.status).toBe('pending_payment');
    expect(res.body.data.items.length).toBe(1);
    orderId = res.body.data.id;
  });

  // ──── Step 5: State transitions ────
  it('PATCH /api/v1/orders/:id/status — valid transitions', async () => {
    // pending_payment → paid
    let res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'paid' })
      .expect(200);
    expect(res.body.data.status).toBe('paid');

    // paid → shipped
    res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'shipped' })
      .expect(200);
    expect(res.body.data.status).toBe('shipped');

    // shipped → completed
    res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'completed' })
      .expect(200);
    expect(res.body.data.status).toBe('completed');
  });

  // ──── Step 6: Invalid transition rejected ────
  it('completed → pending_payment is rejected', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'pending_payment' })
      .expect(400);

    expect(res.body.code).toBe(400);
  });

  // ──── Step 7: 401 without token ────
  it('POST /api/v1/cart without token → 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/cart').send({ skuId: 1, quantity: 1 }).expect(401);
  });
});
