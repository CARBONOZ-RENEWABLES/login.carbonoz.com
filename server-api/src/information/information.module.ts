import { Global, Module } from '@nestjs/common';
import { InformationController } from './information.controller';
import { InformationService } from './information.service';

@Global()
@Module({
  controllers: [InformationController],
  providers: [InformationService],
  exports: [InformationService],
})
export class InformationModule {}
