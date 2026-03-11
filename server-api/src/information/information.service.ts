import { ConflictException, Injectable } from '@nestjs/common';
import { User, UserInformation } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterUserInfoDto } from './dto';

@Injectable()
export class InformationService {
  constructor(private readonly prismaService: PrismaService) {}

  async createAdditionalInformation(
    dto: RegisterUserInfoDto,
    user: User,
  ): Promise<UserInformation> {
    const isInfoThere = await this.prismaService.userInformation.findFirst({
      where: {
        userId: user.id,
      },
    });

    if (isInfoThere) {
      throw new ConflictException('Information  already exists for this user');
    } else {
      return await this.prismaService.userInformation.create({
        data: {
          userId: user.id,
          ...dto,
        },
      });
    }
  }

  async getAdditionalInformation(user: User): Promise<UserInformation & { id: string }> {
    const userInfo = await this.prismaService.userInformation.findFirst({
      where: {
        userId: user.id,
      },
    });
    
    // Return user info with the actual user ID from the User model
    return {
      ...userInfo,
      id: user.id, // This is the actual user ID, not the UserInformation ID
    };
  }
}
