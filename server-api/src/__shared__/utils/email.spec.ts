import { escapeRegex, normalizeEmail } from './email';

/** Same pattern findUsersByEmail sends to MongoDB (`^…$`, flag `i`). */
const matcher = (email: string) =>
  new RegExp(`^${escapeRegex(email.trim())}$`, 'i');

describe('email matching', () => {
  const accounts = [
    'a+b@example.com',
    'aab@example.com',
    'aaab@example.com',
    'a.b@example.com',
    'axb@example.com',
    'a*b@example.com',
    'ab@example.com',
    'a(b@example.com',
    'a|b@example.com',
    'b@example.com',
  ];

  it.each([
    'a+b@example.com',
    'a.b@example.com',
    'a*b@example.com',
    'a(b@example.com',
    'a|b@example.com',
  ])('%s matches only itself', (email) => {
    expect(accounts.filter((a) => matcher(email).test(a))).toEqual([email]);
  });

  it('is case-insensitive but exact', () => {
    expect(matcher('A+B@Example.COM').test('a+b@example.com')).toBe(true);
    expect(matcher('a+b@example.com').test('xa+b@example.com')).toBe(false);
    expect(matcher('a+b@example.com').test('a+b@example.com.evil')).toBe(false);
  });

  it('never lets an address act as a wildcard', () => {
    for (const evil of ['.*', 'x*|a@example.com', '.*|b@example.com', '(?:)']) {
      expect(accounts.some((a) => matcher(evil).test(a))).toBe(false);
    }
  });

  it('normalizes stored addresses', () => {
    expect(normalizeEmail('  A+B@Example.com ')).toBe('a+b@example.com');
  });
});
