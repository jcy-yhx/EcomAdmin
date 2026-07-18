import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new user with hashed password */
  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('邮箱或用户名已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: { id: true, email: true, username: true, avatar: true, isActive: true, createdAt: true },
    });
    return user;
  }

  /** Paginated user list with keyword search (excludes soft-deleted) */
  async findAll(query: QueryUserDto) {
    const { page = 1, pageSize = 10, keyword, isActive } = query;
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (keyword) {
      where.OR = [{ email: { contains: keyword } }, { username: { contains: keyword } }];
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, email: true, username: true, avatar: true, isActive: true, createdAt: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  /** Get single user by ID (returns full info for login purposes) */
  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  /** Get user by email (for auth) — includes deleted check */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    const data: Prisma.UserUpdateInput = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, username: true, avatar: true, isActive: true, updatedAt: true },
    });
  }

  /** Soft delete: set deletedAt timestamp */
  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: '用户已删除' };
  }

  /** Assign role(s) to a user */
  async assignRoles(userId: number, roleIds: number[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('用户不存在');

    // Remove existing roles, then create new ones
    await this.prisma.userRole.deleteMany({ where: { userId } });
    const data = roleIds.map((roleId) => ({ userId, roleId }));
    await this.prisma.userRole.createMany({ data });
    return { message: '角色分配成功' };
  }
}
