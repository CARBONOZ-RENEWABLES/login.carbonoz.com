import { Global, Module } from '@nestjs/common';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

@Global()
@Module({
  controllers: [StepsController],
  providers: [StepsService],
  exports: [StepsService],
})
export class StepsModule {}
