import { smtpTransport } from './mails.module';
import { MailsService } from './mails.service';

describe('smtpTransport', () => {
  const base = { host: 'smtp.example.test', user: 'u', pass: 'p' };

  it('uses TLS from the start on 465 (also the default port)', () => {
    expect(smtpTransport(base).transport).toMatchObject({
      port: 465,
      secure: true,
    });
    expect(smtpTransport({ ...base, port: 465 }).transport.secure).toBe(true);
  });

  it('uses STARTTLS (secure=false) on 587 and 25', () => {
    expect(smtpTransport({ ...base, port: 587 }).transport.secure).toBe(false);
    expect(smtpTransport({ ...base, port: 25 }).transport.secure).toBe(false);
  });

  it('SMTP_SECURE overrides the port rule; SMTP_FROM sets the sender', () => {
    expect(
      smtpTransport({ ...base, port: 587, secure: true }).transport.secure,
    ).toBe(true);
    expect(
      smtpTransport({ ...base, from: '"Carbonoz" <no-reply@example.test>' })
        .defaults.from,
    ).toBe('"Carbonoz" <no-reply@example.test>');
    expect(smtpTransport(base).defaults.from).toBe('"No Reply" <u>');
  });
});

describe('MailsService', () => {
  it('logs a failed send with the SMTP reason, without credentials, and does not throw', async () => {
    const err = Object.assign(
      new Error('Invalid login: 535 auth failed for smtp://u:secretpw@host'), // secret-scan:allow (fake value)
      {
        code: 'EAUTH',
        responseCode: 535,
      },
    );
    const svc = new MailsService({
      sendMail: jest.fn().mockRejectedValue(err),
    } as never);
    const logged: string[] = [];
    (svc as unknown as { logger: { error: (m: string) => void } }).logger = {
      error: (m: string) => logged.push(m),
    };
    const r = await svc.sendMail(
      'a@example.test',
      'Confirm email',
      'x@example.test',
      {},
    );
    expect(r).toEqual({ message: 'Email could not be sent' });
    expect(logged[0]).toMatch(/Confirm email.*EAUTH 535/);
    expect(logged[0]).not.toContain('secretpw');
  });
});
