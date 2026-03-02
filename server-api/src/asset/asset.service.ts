import { Injectable } from '@nestjs/common';
import { Asset, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterUserAssetsDto } from './dto';

@Injectable()
export class AssetService {
  constructor(private prismaService: PrismaService) {}

  async registerAssets(dto: RegisterUserAssetsDto, user: User): Promise<Asset> {
    const newDto = dto;
    newDto.codDate = new Date(newDto.codDate);
    return await this.prismaService.asset.create({
      data: {
        userId: user.id,
        ...newDto,
      },
    });
  }

  async getAllAssets(user: User): Promise<Asset> {
    return await this.prismaService.asset.findFirst({
      where: {
        userId: user.id,
      },
    });
  }
}
