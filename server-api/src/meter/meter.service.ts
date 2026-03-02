import { Injectable } from '@nestjs/common';
import { MeteringEvidence, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MeterDto } from './dto';

@Injectable()
export class MeterService {
  constructor(private readonly prismaService: PrismaService) {}

  async addMeter(dto: MeterDto, user: User): Promise<MeteringEvidence> {
    return await this.prismaService.meteringEvidence.create({
      data: {
        ...dto,
        userId: user.id,
      },
    });
  }

  async getMeter(user: User): Promise<MeteringEvidence> {
    return await this.prismaService.meteringEvidence.findFirst({
      where: {
        userId: user.id,
      },
    });
  }
}
