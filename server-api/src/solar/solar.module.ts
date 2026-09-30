import { Module } from '@nestjs/common';
import { SolarAdminService } from './admin/solar-admin.service';
import { SolarIngestService } from './ingest/solar-ingest.service';
import { SolarStreamWorker } from './ingest/solar-stream.worker';
import { SolarEnergyService } from './read/solar-energy.service';
import { SolarEnergyHistoryService } from './read/solar-energy-history.service';
import { SolarReadService } from './read/solar-read.service';
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
  ],
  exports: [SolarEnergyService],
})
export class SolarModule {}
