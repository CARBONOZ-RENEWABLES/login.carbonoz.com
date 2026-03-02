import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  planId: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  @IsEnum(['MONTHLY', 'YEARLY'])
  billingCycle: 'MONTHLY' | 'YEARLY';
}

export class PayPalWebhookDto {
  @ApiProperty()
  event_type: string;

  @ApiProperty()
  resource: any;
}
