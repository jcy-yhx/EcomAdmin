import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';

export interface JwtPayload {
  sub: number;
  email: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', 'default-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('令牌类型错误');
    }
    const user = await this.userService.findById(payload.sub);
    if (!user.isActive) {
      throw new UnauthorizedException('账户已被禁用');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      // Extract role & permission codes for RBAC
      roles: user.userRoles.map((ur) => ur.role.code),
      permissions: [
        ...new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))),
      ],
    };
  }
}
