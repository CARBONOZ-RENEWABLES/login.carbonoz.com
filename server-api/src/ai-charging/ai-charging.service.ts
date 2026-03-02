import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AiChargingService {
  constructor(private readonly redisService: RedisService) {}

  async getChargingStatus(userId: string) {
    const data = await this.redisService.get(`ai-charging:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async updateChargingStatus(data: any) {
    const { userId, status, mode, batteryLevel, targetSOC, lastCommandTime, lastCommandReason } = data;
    const chargingData = {
      userId,
      status,
      mode,
      batteryLevel,
      targetSOC,
      lastCommandTime,
      lastCommandReason,
      timestamp: new Date().toISOString()
    };
    await this.redisService.set(`ai-charging:${userId}`, JSON.stringify(chargingData), 3600);
    return { success: true };
  }
}
