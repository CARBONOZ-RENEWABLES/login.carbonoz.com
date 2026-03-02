import { Global, Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';

@Global()
@Module({
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
