import { Module } from '@nestjs/common';
import { CarbonIntensityController } from './carbon-intensity.controller';
import { CarbonIntensityService } from './carbon-intensity.service';

@Module({
  controllers: [CarbonIntensityController],
  providers: [CarbonIntensityService],
})
export class CarbonIntensityModule {}
