import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, QueryProductDto } from './dto/product.dto';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const { skus, images, ...productData } = dto;
    const product = await this.prisma.product.create({
      data: {
        ...productData,
        skus: skus?.length
          ? {
              create: skus.map((sku) => ({
                skuCode: sku.skuCode,
                price: sku.price,
                stock: sku.stock,
                image: sku.image,
                skuSpecs: sku.specIds
                  ? { create: sku.specIds.map(([specId, specValueId]) => ({ specId, specValueId })) }
                  : undefined,
              })),
            }
          : undefined,
        images: images?.length ? { create: images.map((url, i) => ({ url, sortOrder: i })) } : undefined,
      },
      include: { skus: { include: { skuSpecs: { include: { spec: true, specValue: true } } } }, images: true },
    });
    return product;
  }

  async findAll(query: QueryProductDto) {
    const { page = 1, pageSize = 10, keyword, status, categoryId, brandId } = query;
    const where: Prisma.ProductWhereInput = { deletedAt: null };

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (keyword) {
      where.OR = [{ name: { contains: keyword } }, { slug: { contains: keyword } }];
    }

    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          skus: { select: { id: true, skuCode: true, price: true, stock: true, image: true } },
          images: { select: { id: true, url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        skus: { include: { skuSpecs: { include: { spec: true, specValue: true } } } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product || product.deletedAt) throw new NotFoundException('商品不存在');
    return product;
  }

  async update(id: number, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) throw new NotFoundException('商品不存在');

    const { skus, images, ...productData } = dto;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(skus
          ? {
              skus: {
                deleteMany: {},
                create: skus.map((s) => ({
                  skuCode: s.skuCode,
                  price: s.price,
                  stock: s.stock,
                  image: s.image,
                  skuSpecs: s.specIds
                    ? { create: s.specIds.map(([specId, specValueId]) => ({ specId, specValueId })) }
                    : undefined,
                })),
              },
            }
          : {}),
        ...(images ? { images: { deleteMany: {}, create: images.map((url, i) => ({ url, sortOrder: i })) } } : {}),
      },
      include: {
        skus: { include: { skuSpecs: { include: { spec: true, specValue: true } } } },
        images: true,
        category: true,
        brand: true,
      },
    });
  }

  async remove(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) throw new NotFoundException('商品不存在');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: '商品已删除' };
  }
}
