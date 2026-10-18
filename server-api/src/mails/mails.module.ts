import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { IAppConfig } from 'src/__shared__/interfaces';
import { MailsService } from './mails.service';

/** Nodemailer transport + default sender from the SMTP settings. */
export function smtpTransport(smtp: NonNullable<IAppConfig['smtp']>) {
  const port = smtp.port || 465;
  return {
    transport: {
      host: smtp.host,
      port,
      // 465 = TLS from the start; 587/25 = STARTTLS (secure must be false there).
      secure: smtp.secure ?? port === 465,
      tls: { rejectUnauthorized: false },
      auth: { user: smtp.user, pass: smtp.pass },
    },
    defaults: { from: smtp.from || `"No Reply" <${smtp.user}>` },
  };
}

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<IAppConfig>) => {
        const smtp = config.get('smtp');
        if (!smtp?.host || !smtp?.user) {
          return { transport: { jsonTransport: true } };
        }
        return {
          ...smtpTransport(smtp),
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  providers: [MailsService],
  exports: [MailsService],
})
export class MailsModule {}
