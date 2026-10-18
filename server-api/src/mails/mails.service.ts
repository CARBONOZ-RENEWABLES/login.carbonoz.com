import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { Attachment } from 'nodemailer/lib/mailer';
import { redactText } from 'src/__shared__/utils/redact';

@Injectable()
export class MailsService {
  private readonly logger = new Logger(MailsService.name);
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
      // Logged with the SMTP reason (e.g. EAUTH, ETIMEDOUT, 553 sender
      // rejected), never with credentials; the caller still answers normally.
      this.logger.error(
        `Sending "${subject}" failed: ${redactText(
          [error?.code, error?.responseCode, error?.response ?? error?.message]
            .filter(Boolean)
            .join(' '),
          300,
        )}`,
      );
      return { message: 'Email could not be sent' };
    }
  }
}
