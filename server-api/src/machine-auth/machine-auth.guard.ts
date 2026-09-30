import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MachineAuthService, MachinePrincipal } from './machine-auth.service';

/**
 * Machine authentication for ingestion routes. Sets `req.machine`, never
 * `req.user`, so machine credentials can't reach any human-only handler.
 */
@Injectable()
export class MachineAuthGuard implements CanActivate {
  constructor(private readonly machines: MachineAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    try {
      req.machine = await this.machines.authenticate(req.headers.authorization);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Credential store unreachable: tell the device to retry (contract: 503).
      throw new ServiceUnavailableException(
        'Ingestion temporarily unavailable, retry later',
      );
    }
    return true;
  }
}

export const GetMachine = createParamDecorator(
  (_data, ctx: ExecutionContext): MachinePrincipal =>
    ctx.switchToHttp().getRequest().machine,
);
