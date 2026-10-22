import { Injectable } from '@nestjs/common';
import { Asset, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterUserAssetsDto } from './dto';

@Injectable()
export class AssetService {
  constructor(private prismaService: PrismaService) {}

  async registerAssets(dto: RegisterUserAssetsDto, user: User): Promise<Asset> {
    const data = {
      ...dto,
      ...(dto.codDate && { codDate: new Date(dto.codDate) }),
    };
    // One record per customer: saving again updates it (onboarding sections save separately).
    const existing = await this.prismaService.asset.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    return existing
      ? this.prismaService.asset.update({ where: { id: existing.id }, data })
      : this.prismaService.asset.create({ data: { userId: user.id, ...data } });
  }

  async getAllAssets(user: User): Promise<Asset> {
    return await this.prismaService.asset.findFirst({
      where: {
        userId: user.id,
      },
    });
  }
}
