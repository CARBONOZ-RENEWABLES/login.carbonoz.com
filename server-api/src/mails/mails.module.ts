import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Global, Module } from '@nestjs/common';
import { join } from 'path';
import { MailsService } from './mails.service';

@Global()
@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: '192.168.160.66',
        port: 465,
        secure: true,
        tls: {
          rejectUnauthorized: false,
        },
        auth: {
          user: 'solar-autopilot@carbonoz.com',
          pass: 'wY1GhyGa95b9O0kSRgiBSY3488NwDrqLH',
        },
      },
      defaults: {
        from: '"No Reply" <solar-autopilot@carbonoz.com>',
      },
      template: {
        dir: join(__dirname, 'templates'), // Directory where the email templates are stored
        adapter: new HandlebarsAdapter(), // Handlebars adapter for rendering email templates
        options: {
          strict: true,
        },
      },
    }),
  ],
  providers: [MailsService],
  exports: [MailsService],
})
export class MailsModule {}
