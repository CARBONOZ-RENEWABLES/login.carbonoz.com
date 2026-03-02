import { Global, Module } from '@nestjs/common';
import { MeterController } from './meter.controller';
import { MeterService } from './meter.service';

@Global()
@Module({
  providers: [MeterService],
  controllers: [MeterController],
  exports: [MeterService],
})
export class MeterModule {}
