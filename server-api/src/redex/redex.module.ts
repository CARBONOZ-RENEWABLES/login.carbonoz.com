import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { RedexController } from './redex.controller';
import { RedexService } from './redex.service';

@Global()
@Module({
  imports: [HttpModule],
  controllers: [RedexController],
  providers: [RedexService],
  exports: [RedexService],
})
export class RedexModule {}
