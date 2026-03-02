import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AiChargingService } from './ai-charging.service';

@Controller('v1/ai-charging')
export class AiChargingController {
  constructor(private readonly aiChargingService: AiChargingService) {}

  @Get('status/:userId')
  async getChargingStatus(@Param('userId') userId: string) {
    return this.aiChargingService.getChargingStatus(userId);
  }

  @Post('update')
  async updateChargingStatus(@Body() data: any) {
    return this.aiChargingService.updateChargingStatus(data);
  }
}
