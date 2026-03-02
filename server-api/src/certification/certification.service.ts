import { Injectable } from '@nestjs/common';
import { Certification, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CertificationDto } from './dto';

@Injectable()
export class CertificationService {
  constructor(private readonly prismaService: PrismaService) {}

  async addCertificates(
    dto: CertificationDto,
    user: User,
  ): Promise<Certification> {
    return await this.prismaService.certification.create({
      data: {
        ...dto,
        userId: user.id,
      },
    });
  }

  async getCertificates(user: User): Promise<Certification> {
    return await this.prismaService.certification.findFirst({
      where: {
        userId: user.id,
      },
    });
  }
}
