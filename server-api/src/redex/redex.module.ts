import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { SolarModule } from 'src/solar/solar.module';
import { RedexController } from './redex.controller';
import { RedexService } from './redex.service';

@Global()
@Module({
  imports: [HttpModule, SolarModule],
  controllers: [RedexController],
  providers: [RedexService],
  exports: [RedexService],
})
export class RedexModule {}
