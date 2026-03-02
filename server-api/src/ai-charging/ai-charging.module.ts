import { Module } from '@nestjs/common';
import { AiChargingController } from './ai-charging.controller';
import { AiChargingService } from './ai-charging.service';

@Module({
  controllers: [AiChargingController],
  providers: [AiChargingService],
  exports: [AiChargingService]
})
export class AiChargingModule {}
