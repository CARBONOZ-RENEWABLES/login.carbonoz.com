import { isIanaTimeZone } from './timezone';

describe('isIanaTimeZone', () => {
  it.each([
    'Europe/Berlin',
    'Africa/Kigali',
    'UTC',
    'America/New_York',
    'Asia/Kolkata',
    'Asia/Calcutta',
    'Asia/Kathmandu',
    'America/Argentina/Buenos_Aires',
    'America/Port-au-Prince',
    'Etc/GMT+2',
  ])('accepts %s', (tz) => expect(isIanaTimeZone(tz)).toBe(true));

  it.each([
    'Europe/Berlinn',
    'europe/berlin',
    'Europe/BERLIN',
    'utc',
    'CET',
    'EST',
    'GMT',
    '+02:00',
    'UTC+2',
    'Berlin',
    '',
    ' Europe/Berlin',
    null,
    undefined,
    2,
    `Europe/${'x'.repeat(80)}`,
  ])('rejects %p', (tz) => expect(isIanaTimeZone(tz)).toBe(false));
});
