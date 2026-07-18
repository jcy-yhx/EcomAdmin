import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('品牌已存在');
    return this.prisma.brand.create({ data: dto });
  }

  async findAll(page = 1, pageSize = 10) {
    const where = { deletedAt: null };
    const [list, total] = await Promise.all([
      this.prisma.brand.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { sortOrder: 'asc' } }),
      this.prisma.brand.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand || brand.deletedAt) throw new NotFoundException('品牌不存在');
    return brand;
  }

  async update(id: number, dto: UpdateBrandDto) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand || brand.deletedAt) throw new NotFoundException('品牌不存在');
    return this.prisma.brand.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand || brand.deletedAt) throw new NotFoundException('品牌不存在');
    await this.prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: '品牌已删除' };
  }
}
