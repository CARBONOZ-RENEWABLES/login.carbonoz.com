import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class RegisterBoxDto {
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: '190.160.10.0',
  })
  mqttIpAddress: string;
  @IsNotEmpty()
  @ApiProperty({ type: String, required: true, default: 'Akashi' })
  mqttUsername: string;
  @IsNotEmpty()
  @ApiProperty({
    type: String,
    required: true,
    default: 'Password!3aqr34#$',
  })
  mqttPassword: string;
  @IsNotEmpty()
  @ApiProperty({ type: Number, required: true, default: 78 })
  mqttPort: number;
}
