import { Module } from '@nestjs/common';
import { SolarIngestService } from './ingest/solar-ingest.service';
import { SolarStreamWorker } from './ingest/solar-stream.worker';
import { SolarEnergyService } from './read/solar-energy.service';
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
  ],
  exports: [SolarEnergyService],
})
export class SolarModule {}
