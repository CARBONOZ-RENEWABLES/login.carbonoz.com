import { ForbiddenException, Injectable } from '@nestjs/common';
import { Partners, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterPartnerDto } from './dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prismaService: PrismaService) {}

  async registerPartner(
    dto: RegisterPartnerDto,
    user: User,
  ): Promise<Partners> {
    const partner = await this.prismaService.partners.create({
      data: {
        status: true,
        userId: user.id,
        partner: dto.partner,
      },
    });
    return partner;
  }

  async getPartners(user: User) {
    return await this.prismaService.partners.findFirst({
      where: {
        userId: user.id,
      },
    });
  }

  async updateExistingPartners(dto: RegisterPartnerDto, user: User) {
    const existingUser = await this.prismaService.partners.findFirst({
      where: {
        userId: user.id,
      },
    });
    if (!existingUser)
      throw new ForbiddenException('User does not have partners');

    const updatedPartners: Array<string> = [
      ...existingUser.partner,
      ...dto.partner,
    ];

    const updatedPartner = await this.prismaService.partners.update({
      where: {
        id: existingUser.id,
      },
      data: {
        partner: updatedPartners,
      },
    });

    return updatedPartner;
  }
}
