import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { IAppConfig } from 'src/__shared__/interfaces';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(private readonly config: ConfigService<IAppConfig>) {
    super({
      clientID: config.get('appleClientId'),
      teamID: config.get('appleTeamId'),
      keyID: config.get('appleKeyId'),
      key: config.get('applePrivateKey'),
      callbackURL: `${config.get('backendUrl')}/auth/apple/callback`,
      scope: ['email', 'name'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ): Promise<any> {
    const { email, name } = profile;
    const user = {
      email: email,
      name: name?.firstName + ' ' + name?.lastName,
      accessToken,
    };
    done(null, user);
  }
}
