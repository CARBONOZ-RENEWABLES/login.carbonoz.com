import { CanActivate, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from 'src/__shared__/interfaces';

/**
 * Closes the password / legacy-JWT flows (sign-in, sign-up, verification and
 * reset links, device client credentials, host listing) once
 * LEGACY_AUTH_ENABLED=false, so Keycloak is the only way in.
 */
@Injectable()
export class LegacyAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<IAppConfig>) {}

  canActivate(): boolean {
    if (this.config.get('legacyAuthEnabled') === false) {
      throw new GoneException(
        'Password sign-in is disabled; use CARBONOZ single sign-on',
      );
    }
    return true;
  }
}
