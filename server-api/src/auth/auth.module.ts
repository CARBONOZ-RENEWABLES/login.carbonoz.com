import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityService } from './oidc/identity.service';
import { OidcController } from './oidc/oidc.controller';
import { OidcService } from './oidc/oidc.service';
import { SessionService } from './session/session.service';
import { JwtStrategy } from './strategy/jwt.strategy';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, OidcController],
  providers: [
    AuthService,
    JwtStrategy,
    OidcService,
    IdentityService,
    SessionService,
  ],
  // SessionService is exported because JwtGuard is instantiated in every module that uses it.
  exports: [AuthService, SessionService, OidcService],
})
export class AuthModule {}
