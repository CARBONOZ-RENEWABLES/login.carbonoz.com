import { Global, Module } from '@nestjs/common';
import { TopicController } from './topic.controller';
import { TopicService } from './topic.service';

@Global()
@Module({
  providers: [TopicService],
  controllers: [TopicController],
  exports: [TopicService],
})
export class TopicModule {}
