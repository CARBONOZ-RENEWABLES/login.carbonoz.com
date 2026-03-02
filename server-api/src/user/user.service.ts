import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon from 'argon2';
import * as crypto from 'crypto';
import { MailsService } from 'src/mails/mails.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { resetPasswordDto } from './dto';
import { EditUserInfoDto } from './dto/editUserInfo.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailsService: MailsService,
  ) {}

  async resetPassword(dto: resetPasswordDto, user: User) {
    const password = await argon.hash(dto.password);
    dto.password = password;
    const newUser = await this.prismaService.user.update({
      where: {
        email: user.email,
      },
      data: {
        password: dto.password,
        defaultPassword: false,
      },
    });
    return newUser;
  }

  async sendTestEmail() {
    const result = await this.mailsService.sendMail(
      `christiannseko@gmail.com`,
      'Congratulations on your admission - March intake',
      '"John Austin" <solar-autopilot@carbonoz.com>',
      {
        username: '',
      },
      './email.t.hbs',
    );
    return result;
  }

  async generateCredentials(user: User) {
    let credentials = await this.prismaService.userCredentials.findFirst({
      where: {
        userId: user.id,
      },
    });
    if (!credentials) {
      const clientId = crypto.randomBytes(16).toString('hex');
      const clientSecret = crypto.randomBytes(32).toString('hex');

      credentials = await this.prismaService.userCredentials.create({
        data: {
          userId: user.id,
          clientId,
          clientSecret,
        },
      });
    }

    return credentials;
  }

  async editUserInformation(dto: EditUserInfoDto, user: User) {
    const infoToUpdate = await this.prismaService.userInformation.findFirst({
      where: {
        userId: user.id,
      },
    });
    const userUpdate = await this.prismaService.userInformation.update({
      where: {
        id: infoToUpdate.id,
      },
      data: {
        ...dto,
      },
    });
    return userUpdate;
  }
}
