import { AttemptCounter, clientIp } from './http-security';

describe('AttemptCounter', () => {
  it('allows `limit` attempts per window, then reports the wait', () => {
    const c = new AttemptCounter(60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(c.hit('k', 3, t0)).toBe(0);
    expect(c.hit('k', 3, t0 + 1000)).toBe(59);
    expect(c.hit('other', 3, t0 + 1000)).toBe(0); // keys are independent
  });

  it('starts a new window after it expires', () => {
    const c = new AttemptCounter(60_000);
    for (let i = 0; i < 5; i++) c.hit('k', 3, 0);
    expect(c.hit('k', 3, 60_000)).toBe(0);
  });
});

describe('clientIp', () => {
  const req = (peer: string, headers: Record<string, string> = {}, ip = peer) =>
    ({ socket: { remoteAddress: peer }, headers, ip } as never);
  afterEach(() => delete process.env.CLIENT_IP_HEADER);

  it('uses req.ip unless a client-IP header is configured', () => {
    expect(
      clientIp(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' }, '9.9.9.9')),
    ).toBe('9.9.9.9');
  });

  it('trusts the configured header only from the local proxy', () => {
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    expect(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' }))).toBe(
      '1.2.3.4',
    );
    expect(clientIp(req('10.0.0.7', { 'cf-connecting-ip': '1.2.3.4' }))).toBe(
      '10.0.0.7',
    );
  });
});
