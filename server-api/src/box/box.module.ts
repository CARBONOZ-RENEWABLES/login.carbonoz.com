import { Global, Module } from '@nestjs/common';
import { BoxController } from './box.controller';
import { BoxService } from './box.service';

@Global()
@Module({
  controllers: [BoxController],
  providers: [BoxService],
  exports: [BoxService],
})
export class BoxModule {}
