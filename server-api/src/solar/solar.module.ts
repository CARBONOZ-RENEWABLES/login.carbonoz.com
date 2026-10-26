import { Module } from '@nestjs/common';
import { SolarAdminService } from './admin/solar-admin.service';
import { SolarIngestService } from './ingest/solar-ingest.service';
import { SolarStreamWorker } from './ingest/solar-stream.worker';
import { SolarEnergyService } from './read/solar-energy.service';
import { SolarEnergyHistoryService } from './read/solar-energy-history.service';
import { SolarLiveService } from './read/solar-live.service';
import { SolarIngestBridge } from './bridge/solar-ingest-bridge.service';
import { SolarReadService } from './read/solar-read.service';
import { SolarRollupService } from './read/solar-rollup.service';
import { SolarWeatherService } from './read/solar-weather.service';
import {
  AdminSolarController,
  SolarController,
  SolarIngestController,
} from './solar.controller';
import { SolarStoreService } from './store/solar-store.service';

@Module({
  controllers: [SolarController, SolarIngestController, AdminSolarController],
  providers: [
    SolarIngestService,
    SolarStoreService,
    SolarReadService,
    SolarStreamWorker,
    SolarEnergyService,
    SolarAdminService,
    SolarEnergyHistoryService,
    SolarLiveService,
    SolarIngestBridge,
    SolarRollupService,
    SolarWeatherService,
  ],
  exports: [SolarEnergyService, SolarReadService],
})
export class SolarModule {}
