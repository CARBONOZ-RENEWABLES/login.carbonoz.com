import { Global, Module } from '@nestjs/common';
import { MachineAuthGuard } from './machine-auth.guard';
import { MachineAuthService } from './machine-auth.service';

@Global()
@Module({
  providers: [MachineAuthService, MachineAuthGuard],
  exports: [MachineAuthService, MachineAuthGuard],
})
export class MachineAuthModule {}
