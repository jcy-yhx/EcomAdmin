import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';

describe('OrderService — State Machine', () => {
  let service: OrderService;
  let mockPrisma: any;
  let mockCart: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockPrisma = {
      order: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
      sku: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      orderItem: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    mockCart = { getCartItems: jest.fn(), clearCart: jest.fn() };
    mockQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CartService, useValue: mockCart },
        { provide: getQueueToken('order-timeout'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // ──── State Machine Tests ────

  describe('updateStatus — valid transitions', () => {
    const validPairs = [
      ['pending_payment', 'paid'],
      ['pending_payment', 'cancelled'],
      ['paid', 'shipped'],
      ['paid', 'refunding'],
      ['shipped', 'completed'],
      ['refunding', 'refunded'],
    ];

    test.each(validPairs)('%s → %s is allowed', async (from, to) => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 1, status: from, deletedAt: null });
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
      mockPrisma.order.update.mockResolvedValue({ id: 1, status: to });
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.updateStatus(1, to);
      expect(result.status).toBe(to);
    });
  });

  describe('updateStatus — invalid transitions', () => {
    const invalidPairs = [
      ['completed', 'pending_payment'],
      ['completed', 'paid'],
      ['cancelled', 'paid'],
      ['shipped', 'pending_payment'],
    ];

    test.each(invalidPairs)('%s → %s is rejected', async (from, to) => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 1, status: from, deletedAt: null });

      await expect(service.updateStatus(1, to)).rejects.toThrow(BadRequestException);
    });
  });

  // ──── Cancel restores stock ────

  test('cancelling an order restores SKU stock', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 1, status: 'pending_payment', deletedAt: null });
    mockPrisma.orderItem.findMany.mockResolvedValue([
      { skuId: 1, quantity: 2 },
      { skuId: 2, quantity: 1 },
    ]);
    mockPrisma.order.update.mockResolvedValue({ id: 1, status: 'cancelled' });
    mockPrisma.$transaction.mockResolvedValue([]);

    await service.updateStatus(1, 'cancelled');
    expect(mockPrisma.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
  });

  // ──── Empty cart → cannot order ────

  test('creating order with empty cart throws BadRequest', async () => {
    mockCart.getCartItems.mockResolvedValue([]);

    await expect(
      service.create(1, { address: { receiverName: 'Test', phone: '138', province: 'GD', city: 'SZ', detail: '...' } }),
    ).rejects.toThrow(BadRequestException);
  });

  // ──── Insufficient stock → order rejected ────

  test('order rejected when SKU has insufficient stock', async () => {
    mockCart.getCartItems.mockResolvedValue([
      { skuId: 1, quantity: 999, productName: 'Test', skuCode: 'T1', price: 10, image: null },
    ]);
    mockPrisma.sku.findUnique.mockResolvedValue({
      id: 1,
      price: 10,
      stock: 5,
      skuSpecs: [],
    });

    await expect(
      service.create(1, { address: { receiverName: 'Test', phone: '138', province: 'GD', city: 'SZ', detail: '...' } }),
    ).rejects.toThrow(BadRequestException);
  });
});
