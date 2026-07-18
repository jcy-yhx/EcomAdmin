import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto, QueryCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('父分类不存在');
    }
    const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('分类别名已存在');

    return this.prisma.category.create({ data: dto });
  }

  /** Get tree: top-level categories with nested children */
  async findTree() {
    const all = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return this.buildTree(all);
  }

  /** Flat paginated list */
  async findAll(query: QueryCategoryDto) {
    const { page = 1, pageSize = 10, keyword } = query;
    const where: any = { deletedAt: null };
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        include: { parent: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.category.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: { where: { deletedAt: null } } },
    });
    if (!cat || cat.deletedAt) throw new NotFoundException('分类不存在');
    return cat;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat || cat.deletedAt) throw new NotFoundException('分类不存在');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const cat = await this.prisma.category.findUnique({ where: { id }, include: { children: true } });
    if (!cat || cat.deletedAt) throw new NotFoundException('分类不存在');
    if (cat.children.length > 0) throw new ConflictException('请先删除子分类');
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: '分类已删除' };
  }

  private buildTree(items: any[], parentId: number | null = null): any[] {
    return items
      .filter((item) => item.parentId === parentId)
      .map((item) => ({ ...item, children: this.buildTree(items, item.id) }));
  }
}
