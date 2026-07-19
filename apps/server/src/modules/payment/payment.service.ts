import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.stripe = new Stripe(configService.get('STRIPE_SECRET_KEY', 'sk_test_placeholder'), {
      apiVersion: '2026-06-15' as any,
    });
  }

  /** Create Stripe Checkout Session and return URL */
  async createCheckout(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.status !== 'pending_payment') {
      throw new BadRequestException('订单不存在或状态不允许支付');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      metadata: { orderId: String(orderId) },
      line_items: order.items.map((item) => ({
        price_data: {
          currency: 'cny',
          product_data: { name: `${item.productName} (${item.skuCode})` },
          unit_amount: Math.round(Number(item.price) * 100), // Stripe uses cents
        },
        quantity: item.quantity,
      })),
      success_url: `${this.configService.get('APP_URL', 'http://localhost:3000')}/payment/success?orderId=${orderId}`,
      cancel_url: `${this.configService.get('APP_URL', 'http://localhost:3000')}/payment/cancel?orderId=${orderId}`,
    });

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  /** Handle Stripe webhook events */
  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET', 'whsec_placeholder');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Webhook 签名验证失败');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = Number(session.metadata?.orderId);
        if (orderId) {
          await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'paid' },
          });
          this.logger.log(`Order ${orderId} paid via Stripe webhook`);
        }
        break;
      }
      case 'checkout.session.expired': {
        // Handle expired checkout — order stays pending_payment until BullMQ cancels it
        break;
      }
    }
    return { received: true };
  }
}
