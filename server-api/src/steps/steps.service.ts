import { Injectable } from '@nestjs/common';
import { ESteps, User, UserSteps } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterStep } from './dto';

@Injectable()
export class StepsService {
  constructor(private readonly prismaService: PrismaService) {}

  async registerStep(dto: RegisterStep, user: User): Promise<UserSteps> {
    if (dto.step === ESteps.LAST_STEP) {
      return await this.prismaService.userSteps.create({
        data: {
          ...dto,
          userId: user.id,
          status: true,
        },
      });
    } else {
      return await this.prismaService.userSteps.create({
        data: {
          ...dto,
          userId: user.id,
        },
      });
    }
  }

  async getUserStep(user: User): Promise<Array<UserSteps>> {
    return await this.prismaService.userSteps.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async skipStep(dto: RegisterStep, user: User) {
    return await this.prismaService.userSteps.create({
      data: {
        ...dto,
        userId: user.id,
        hasSkipped: true,
      },
    });
  }
}
