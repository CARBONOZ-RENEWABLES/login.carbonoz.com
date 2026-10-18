import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { User } from '@prisma/client';
import 'dotenv/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IAppConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtPayload } from '../interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService<IAppConfig>,
    private readonly prismaService: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('jwt').secret,
    });
  }

  async validate(payload: JwtPayload & { exp?: number }): Promise<User> {
    // passport-jwt rejects expired tokens; tokens issued without an expiry
    // (before JWT_EXPIRES_IN) would otherwise stay valid forever.
    if (typeof payload?.exp !== 'number') throw new UnauthorizedException();
    const { id } = payload;
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
