import { Controller, Post, Get, Body, Param, ParseIntPipe, Req, Headers, RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';
import { Request } from 'express';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout/:orderId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 Stripe 支付会话' })
  checkout(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.paymentService.createCheckout(orderId);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe Webhook 回调（无需鉴权）' })
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.paymentService.handleWebhook(req.rawBody!, signature);
  }
}
