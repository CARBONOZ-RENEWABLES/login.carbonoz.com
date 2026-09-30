import { OidcService } from './oidc.service';

describe('OidcService.safeReturnTo', () => {
  const allowed = ['https://login.carbonoz.com', 'https://solar.carbonoz.com'];
  it.each([
    ['/ds/solar', '/ds/solar'],
    ['/ds?tab=1', '/ds?tab=1'],
    [
      'https://solar.carbonoz.com/ds/solar/abc',
      'https://solar.carbonoz.com/ds/solar/abc',
    ],
    ['https://login.carbonoz.com/ds', 'https://login.carbonoz.com/ds'],
  ])('allows %s', (input, out) =>
    expect(OidcService.safeReturnTo(input, allowed)).toBe(out),
  );

  it.each([
    [undefined],
    [''],
    ['//evil.example/x'],
    ['https://evil.example/ds'],
    ['https://solar.carbonoz.com.evil.example/ds'],
    ['https://solar.carbonoz.com@evil.example/ds'],
    ['http://solar.carbonoz.com/ds'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
  ])('rejects %s', (input) =>
    expect(OidcService.safeReturnTo(input, allowed)).toBe('/ds'),
  );
});
