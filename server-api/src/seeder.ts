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
      const adminConfig = this.config.get('admin');
      if (!adminConfig?.email) {
        console.log('Admin email not configured, skipping seed');
        return;
      }

      const isUserExist = await this.prismaService.user.findUnique({
        where: {
          email: adminConfig.email,
        },
      });
      if (isUserExist) return;

      const password = await argon.hash(adminConfig.password);

      await this.prismaService.user.create({
        data: {
          email: adminConfig.email,
          password,
          role: ERole.ADMIN,
          active: true,
        },
      });
    } catch (error) {
      console.error('Seeder error:', error);
      throw new InternalServerErrorException(error);
    }
  }
}
