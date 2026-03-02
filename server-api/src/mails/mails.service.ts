import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Attachment } from 'nodemailer/lib/mailer';

@Injectable()
export class MailsService {
  constructor(private readonly mailerService: MailerService) {}
  async sendMail(
    to: string,
    subject: string,
    from: string,
    context: object,
    template?: string,
    attachments?: Attachment[],
  ) {
    try {
      const emailSent = await this.mailerService.sendMail({
        to,
        from,
        subject,
        context,
        template,
        attachments,
      });
      if (emailSent) return { message: 'Email sent successfully' };
    } catch (error) {
      throw new InternalServerErrorException({ error });
    }
  }
}
