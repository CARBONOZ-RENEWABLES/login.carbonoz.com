import { Module } from '@nestjs/common';
import { SystemstepsController } from './systemsteps.controller';
import { SystemstepsService } from './systemsteps.service';

@Module({
  controllers: [SystemstepsController],
  providers: [SystemstepsService]
})
export class SystemstepsModule {}
