import { Injectable } from '@nestjs/common';
import { ESystemSteps, SystemSteps, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterSystemStep } from './dto';

@Injectable()
export class SystemstepsService {
  constructor(private readonly prismaService: PrismaService) {}

  async registerStep(
    dto: RegisterSystemStep,
    user: User,
  ): Promise<SystemSteps> {
    const existingStep = await this.prismaService.systemSteps.findFirst({
      where: {
        userId: user.id,
        step: dto.step,
      },
    });

    if (existingStep) {
      return await this.prismaService.systemSteps.update({
        where: { id: existingStep.id },
        data: {
          status: dto.step === ESystemSteps.LAST_STEP ? true : false,
        },
      });
    }

    if (dto.step === ESystemSteps.LAST_STEP) {
      return await this.prismaService.systemSteps.create({
        data: {
          ...dto,
          userId: user.id,
          status: true,
        },
      });
    } else {
      return await this.prismaService.systemSteps.create({
        data: {
          ...dto,
          userId: user.id,
        },
      });
    }
  }

  async getUserStep(user: User): Promise<Array<SystemSteps>> {
    return await this.prismaService.systemSteps.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
