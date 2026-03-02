import { ConflictException, Injectable } from '@nestjs/common';
import { ERole, Logs, Prisma, RedexRegisterDevice, User } from '@prisma/client';
import * as argon from 'argon2';
import { EUserStatus } from 'src/__shared__/enums';
import { IPagination } from 'src/__shared__/interfaces/pagination-interface';
import { paginate } from 'src/__shared__/utils/pagination';
import { AuthService } from 'src/auth/auth.service';
import { MailsService } from 'src/mails/mails.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AdminSignUserDto,
  DeactivateUsersDto,
  FilterRedexInfoDto,
  FilterUsers,
} from './dto';
import { TransformedUser, UserTransformation } from './interface';

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
    private readonly mail: MailsService,
  ) {}

  private generateRandomPassword(length = 5): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = lowercase + uppercase + numbers + specialChars;

    const passwordChars = [
      lowercase[Math.floor(Math.random() * lowercase.length)],
      uppercase[Math.floor(Math.random() * uppercase.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      specialChars[Math.floor(Math.random() * specialChars.length)],
    ];

    while (passwordChars.length < length) {
      passwordChars.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }

    return passwordChars.sort(() => Math.random() - 0.5).join('');
  }

  async getUsers({ page, size }: IPagination, dto?: FilterUsers) {
    const status =
      dto.status === EUserStatus.ENABLED
        ? true
        : dto.status === EUserStatus.DISABLED
        ? false
        : true;

    const whereConditions: Prisma.UserWhereInput = {};

    if (dto?.status) {
      whereConditions.activeStatus = status;
    }

    if (dto?.name) {
      whereConditions.UserInformation = {
        some: {
          OR: [
            {
              firstName: {
                contains: dto.name,
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: dto.name,
                mode: 'insensitive',
              },
            },
          ],
        },
      };
    }

    if (dto?.email) {
      whereConditions.email = {
        contains: dto.email,
        mode: 'insensitive',
      };
    }

    const result = await paginate<User, Prisma.UserFindManyArgs>(
      this.prismaService.user,
      {
        orderBy: { createdAt: 'desc' },
        where: {
          role: {
            not: ERole.ADMIN,
          },
          ...whereConditions,
        },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          activeStatus: true,
          manualAccessOverride: true,
          manualAccessExpiry: true,
          UserInformation: {
            select: {
              firstName: true,
              lastName: true,
              customerTimezone: true,
            },
          },
        },
      },
      +page,
      +size,
    );

    const newResult = result.items.map((user: UserTransformation) => {
      const transformedUser: TransformedUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        active: user.active,
        activeStatus: user.activeStatus,
        manualAccessOverride: user.manualAccessOverride,
        manualAccessExpiry: user.manualAccessExpiry,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        firstName: user.UserInformation[0]?.firstName ?? 'N/A',
        lastName: user.UserInformation[0]?.lastName ?? 'N/A',
        customerTimezone: user.UserInformation[0]?.customerTimezone ?? 'N/A',
      };
      return transformedUser;
    });

    const filteredResults = {
      items: newResult,
      totalItems: result.totalItems,
      itemCount: result.itemCount,
      itemsPerPage: result.itemsPerPage,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
    };

    return filteredResults;
  }

  async toogleUsersActivation(dto: DeactivateUsersDto) {
    const status = dto.status === EUserStatus.ENABLED ? true : false;
    const result = await this.prismaService.user.updateMany({
      where: {
        id: { in: dto.userIds },
      },
      data: {
        activeStatus: status,
      },
    });

    if (result.count > 0) {
      return {
        message: 'Users  deactivated successfully',
        affectedAccount: result.count,
      };
    } else {
      return {
        message: 'No users were deactivated. Check if the IDs are valid.',
      };
    }
  }

  async signUsersUp(dto: AdminSignUserDto) {
    const isEmailExists = await this.prismaService.user.findUnique({
      where: { email: dto.email },
    });
    if (isEmailExists) {
      throw new ConflictException('User with this email already exists');
    }
    const generatedPassword = this.generateRandomPassword();
    const password = await argon.hash(generatedPassword);
    const imageBase64 = await this.authService.convertImageToBase64();
    await this.prismaService.user.create({
      data: {
        ...dto,
        password,
        role: ERole.USER,
      },
    });
    const result = await this.mail.sendMail(
      `${dto.email}`,
      'Account creation',
      '"No Reply" <solar-autopilot@carbonoz.com>',
      {
        email: dto.email,
        password: generatedPassword,
      },
      'admin.createuser.template.hbs',
      [
        {
          filename: 'image.png',
          content: Buffer.from(imageBase64, 'base64'),
          contentDisposition: 'inline',
          cid: 'logo@carbonoz',
        },
      ],
    );
    if (result) return { message: 'User created successfully' };
  }

  async getLogs({ page, size }: IPagination) {
    const result = await paginate<Logs, Prisma.LogsFindManyArgs>(
      this.prismaService.logs,
      {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          eventType: true,
          description: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          requestUrl: true,
          method: true,
          responseTime: true,
          statusCode: true,
        },
      },
      +page,
      +size,
    );
    return result;
  }

  async getRedexFiles({ page, size }: IPagination, dto?: FilterRedexInfoDto) {
    const status =
      dto.registered == 'true'
        ? true
        : dto.registered == 'false'
        ? false
        : false;
    const whereConditions: Prisma.RedexRegisterDeviceWhereInput = {};
    if (dto?.registered) {
      whereConditions.deviceRegistered = status;
    }
    const result = await paginate<
      RedexRegisterDevice,
      Prisma.RedexRegisterDeviceFindManyArgs
    >(
      this.prismaService.redexRegisterDevice,
      {
        orderBy: { createdAt: 'desc' },
        where: {
          ...whereConditions,
        },
        select: {
          id: true,
          countryCode: true,
          groupedEnglishName: true,
          groupedLocalName: true,
          province: true,
          timezone: true,
          generationDataFrequency: true,
          deviceRegistered: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      +page,
      +size,
    );
    return result;
  }

  async grantManualAccess(userId: string) {
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1); // 1 year from now
    
    await this.prismaService.user.update({
      where: { id: userId },
      data: { 
        manualAccessOverride: true,
        manualAccessExpiry: endDate
      },
    });
    return { message: 'Manual access granted for 1 year' };
  }

  async revokeManualAccess(userId: string) {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { 
        manualAccessOverride: false,
        manualAccessExpiry: null
      },
    });
    return { message: 'Manual access revoked' };
  }
}
