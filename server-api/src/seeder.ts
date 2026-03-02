import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERole } from '@prisma/client';
import * as argon from 'argon2';
import { IAppConfig } from './__shared__/interfaces';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class SeedData implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly config: ConfigService<IAppConfig>,
  ) {}

  async onModuleInit() {
    await this.seedOnInit();
  }

  async seedOnInit() {
    try {
      const admin = await this.prismaService.user.findFirst({
        where: { role: ERole.ADMIN },
      });

      if (admin) return;
      const adminEmail = this.config.get('admin').email;

      const isUserExist = await this.prismaService.user.findUnique({
        where: {
          email: adminEmail,
        },
      });
      if (isUserExist) return;

      const password = await argon.hash(`${this.config.get('admin').password}`);

      await this.prismaService.user.create({
        data: {
          email: adminEmail,
          password,
          role: ERole.ADMIN,
          active: true,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
