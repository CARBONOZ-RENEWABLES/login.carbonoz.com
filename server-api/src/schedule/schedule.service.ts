import { Injectable, OnModuleInit } from '@nestjs/common';
import * as schedule from 'node-schedule';
import { RedexService } from 'src/redex/redex.service';

@Injectable()
export class ScheduleService implements OnModuleInit {
  constructor(private readonly redexService: RedexService) {}

  onModuleInit() {
    schedule.scheduleJob('0 0 L * *', async () => {
      await this.runAtEndOfMonth();
    });
  }

  private async runAtEndOfMonth() {
    await this.redexService.getMonthlyData();
  }
}
