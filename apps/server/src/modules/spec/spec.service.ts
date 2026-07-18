import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpecDto, UpdateSpecDto } from './dto/spec.dto';

@Injectable()
export class SpecService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSpecDto) {
    const spec = await this.prisma.spec.create({ data: { name: dto.name, sortOrder: dto.sortOrder } });
    if (dto.values?.length) {
      await this.prisma.specValue.createMany({
        data: dto.values.map((v) => ({ value: v, specId: spec.id })),
      });
    }
    return this.findById(spec.id);
  }

  async findAll() {
    return this.prisma.spec.findMany({
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: number) {
    const spec = await this.prisma.spec.findUnique({
      where: { id },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!spec) throw new NotFoundException('规格不存在');
    return spec;
  }

  async update(id: number, dto: UpdateSpecDto) {
    const spec = await this.prisma.spec.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('规格不存在');
    if (dto.name) await this.prisma.spec.update({ where: { id }, data: { name: dto.name } });
    if (dto.values) {
      await this.prisma.specValue.deleteMany({ where: { specId: id } });
      await this.prisma.specValue.createMany({ data: dto.values.map((v) => ({ value: v, specId: id })) });
    }
    return this.findById(id);
  }

  async remove(id: number) {
    const spec = await this.prisma.spec.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('规格不存在');
    await this.prisma.spec.delete({ where: { id } });
    return { message: '规格已删除' };
  }
}
