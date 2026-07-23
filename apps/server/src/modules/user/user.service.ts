import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';

/** Role hierarchy — higher number = higher privilege.
 *  super_admin (100) > admin (50) > no role (0)
 *  Rules: can only operate on users with STRICTLY LOWER level.
 */
const ROLE_LEVELS: Record<string, number> = {
  super_admin: 100,
  admin: 50,
};

function getUserLevel(user: { userRoles?: Array<{ role: { code: string } }> }): number {
  const codes = user.userRoles?.map((ur) => ur.role.code) ?? [];
  return Math.max(0, ...codes.map((c) => ROLE_LEVELS[c] ?? 0));
}

function getRoleLevel(roleId: number, roleMap: Map<number, { code: string }>): number {
  const code = roleMap.get(roleId)?.code;
  return code ? (ROLE_LEVELS[code] ?? 0) : 0;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a new user with hashed password */
  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('邮箱或用户名已存在');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: { id: true, email: true, username: true, avatar: true, isActive: true, createdAt: true },
    });
    return user;
  }

  /** Fetch user with roles (used for privilege checks) */
  private async findWithRoles(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('用户不存在');
    return user;
  }

  /** Paginated user list */
  async findAll(query: QueryUserDto) {
    const { page = 1, pageSize = 10, keyword, isActive } = query;
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (keyword) where.OR = [{ email: { contains: keyword } }, { username: { contains: keyword } }];
    if (isActive !== undefined) where.isActive = isActive;

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          userRoles: { include: { role: { select: { id: true, name: true, code: true } } } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      list: list.map(({ userRoles, ...u }) => ({
        ...u,
        roles: userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name, code: ur.role.code })),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Get user + roles hierarchy (used by auth) */
  async findById(id: number) {
    return this.findWithRoles(id);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });
  }

  async update(id: number, dto: UpdateUserDto, operatorId: number) {
    const target = await this.findWithRoles(id);
    const operator = await this.findWithRoles(operatorId);

    const opLvl = getUserLevel(operator);
    const tgtLvl = getUserLevel(target);

    if (opLvl <= tgtLvl) {
      throw new ForbiddenException('无权修改同级或更高级别的用户');
    }

    const data: Prisma.UserUpdateInput = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, username: true, avatar: true, isActive: true, updatedAt: true },
    });
  }

  async remove(id: number, operatorId: number) {
    const target = await this.findWithRoles(id);
    const operator = await this.findWithRoles(operatorId);

    if (getUserLevel(operator) <= getUserLevel(target)) {
      throw new ForbiddenException('无权删除同级或更高级别的用户');
    }

    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: '用户已删除' };
  }

  async assignRoles(userId: number, roleIds: number[], operatorId: number) {
    const target = await this.findWithRoles(userId);
    const operator = await this.findWithRoles(operatorId);

    const opLvl = getUserLevel(operator);
    const tgtLvl = getUserLevel(target);

    if (opLvl <= tgtLvl) {
      throw new ForbiddenException('无权修改同级或更高级别的用户的角色');
    }

    // Check that assigned role isn't higher than operator's own level
    const allRoles = await this.prisma.role.findMany();
    const roleMap = new Map(allRoles.map((r) => [r.id, r]));
    for (const rid of roleIds) {
      if (getRoleLevel(rid, roleMap) >= opLvl) {
        throw new ForbiddenException(`无法分配等于或高于自身等级的权限`);
      }
    }

    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
    return { message: '角色分配成功' };
  }

  async listRoles() {
    return this.prisma.role.findMany({ select: { id: true, name: true, code: true }, orderBy: { id: 'asc' } });
  }
}
