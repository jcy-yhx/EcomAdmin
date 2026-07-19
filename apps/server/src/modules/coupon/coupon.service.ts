import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto, IssueCouponDto } from './dto/coupon.dto';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    return this.prisma.coupon.create({ data: { ...dto, isActive: true } });
  }

  async findAll(page = 1, pageSize = 10) {
    const where = { deletedAt: null };
    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c || c.deletedAt) throw new NotFoundException('优惠券不存在');
    return c;
  }

  async update(id: number, dto: UpdateCouponDto) {
    return this.prisma.coupon.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.prisma.coupon.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: '优惠券已删除' };
  }

  /** Admin issues coupons to users */
  async issue(couponId: number, dto: IssueCouponDto) {
    const coupon = await this.findById(couponId);
    if (coupon.usedCount + dto.userIds.length > coupon.totalCount) {
      throw new BadRequestException('优惠券发放数量超过总量');
    }
    await this.prisma.userCoupon.createMany({
      data: dto.userIds.map((uid) => ({ userId: uid, couponId })),
    });
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: dto.userIds.length } },
    });
    return { message: `已向 ${dto.userIds.length} 位用户发放优惠券` };
  }

  /** Get user's available coupons */
  async getUserCoupons(userId: number) {
    return this.prisma.userCoupon.findMany({
      where: {
        userId,
        isUsed: false,
        coupon: { isActive: true, deletedAt: null, startAt: { lte: new Date() }, endAt: { gte: new Date() } },
      },
      include: { coupon: true },
    });
  }

  /** Validate & calculate discount for a coupon at order time */
  async validateAndApply(userCouponId: number, orderAmount: number, userId: number) {
    const uc = await this.prisma.userCoupon.findUnique({
      where: { id: userCouponId },
      include: { coupon: true },
    });
    if (!uc || uc.userId !== userId) throw new BadRequestException('优惠券不存在');
    if (uc.isUsed) throw new BadRequestException('优惠券已使用');
    if (!uc.coupon.isActive || uc.coupon.deletedAt) throw new BadRequestException('优惠券已失效');
    if (new Date() < uc.coupon.startAt || new Date() > uc.coupon.endAt)
      throw new BadRequestException('优惠券不在有效期内');
    if (Number(orderAmount) < Number(uc.coupon.minAmount))
      throw new BadRequestException(`订单金额不满足优惠券最低消费 ¥${uc.coupon.minAmount}`);

    let discount = 0;
    if (uc.coupon.type === 'fixed') {
      discount = Number(uc.coupon.value);
    } else {
      discount = Math.round(((Number(orderAmount) * Number(uc.coupon.value)) / 100) * 100) / 100;
    }
    return { discount, userCouponId: uc.id, couponId: uc.couponId };
  }

  /** Mark coupon as used */
  async markUsed(userCouponId: number, orderId: number) {
    await this.prisma.userCoupon.update({
      where: { id: userCouponId },
      data: { isUsed: true, usedAt: new Date(), orderId },
    });
  }
}
