import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /** Register a new user */
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('邮箱或用户名已存在');
    }

    const user = await this.userService.create(dto);
    const tokens = await this.generateTokens(user.id, user.email, [], []);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  /** Login: validate credentials → issue tokens */
  async login(dto: LoginDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const roles = user.userRoles.map((ur) => ur.role.code);
    const permissions = [
      ...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))),
    ];
    const tokens = await this.generateTokens(user.id, user.email, roles, permissions);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    const { password, ...userWithoutPwd } = user;
    return { user: userWithoutPwd, ...tokens };
  }

  /** Refresh access token using refresh token */
  async refreshToken(refreshToken: string) {
    // Verify the token signature first
    let payload: { sub: number; email: string; type: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('令牌类型错误');
    }

    // Check token exists in DB + Redis
    const storedInDb = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    const storedInRedis = await this.redisService.get(`refresh:${payload.sub}`);
    if (!storedInDb && !storedInRedis) {
      throw new UnauthorizedException('刷新令牌已失效');
    }

    // Invalidate old token, issue new pair
    await this.invalidateRefreshToken(refreshToken, payload.sub);

    // Re-query user to get latest roles/permissions
    const user = await this.userService.findById(payload.sub);
    const roles = user.userRoles.map((ur) => ur.role.code);
    const permissions = [
      ...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))),
    ];
    const tokens = await this.generateTokens(payload.sub, payload.email, roles, permissions);
    await this.storeRefreshToken(payload.sub, tokens.refreshToken);

    return tokens;
  }

  /** Logout: invalidate all refresh tokens for user */
  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      await this.invalidateRefreshToken(refreshToken, userId);
    }
    // Clear all user tokens from Redis too
    await this.redisService.del(`refresh:${userId}`);
    return { message: '已退出登录' };
  }

  /** Generate access + refresh token pair */
  private async generateTokens(userId: number, email: string, roles: string[] = [], permissions: string[] = []) {
    const accessExpiresIn = 15 * 60; // 15 minutes
    const refreshExpiresIn = 7 * 24 * 60 * 60; // 7 days

    const [accessToken, refreshTokenValue] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, type: 'access', roles, permissions },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: accessExpiresIn,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, type: 'refresh' },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: accessExpiresIn,
    };
  }

  /** Store refresh token in both DB (persistence) and Redis (fast lookup) */
  private async storeRefreshToken(userId: number, token: string): Promise<void> {
    // Decode to get expiry
    const decoded = this.jwtService.decode(token) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);
    const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);

    // Persist in DB
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    // Cache in Redis for fast read
    await this.redisService.set(`refresh:${userId}`, token, ttlSeconds);
  }

  /** Invalidate a specific refresh token */
  private async invalidateRefreshToken(token: string, userId: number): Promise<void> {
    await this.redisService.del(`refresh:${userId}`);
    await this.prisma.refreshToken.deleteMany({ where: { token } });
  }
}
