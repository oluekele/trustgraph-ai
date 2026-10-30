import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Mirrors `trustgraph.capability.models.Permission`. */
export class PermissionDto {
  @ApiProperty({ example: 'payments.execute' })
  @IsString()
  @MinLength(1)
  capability!: string;

  @ApiProperty({ example: 'payments://vendor-payouts' })
  @IsString()
  @MinLength(1)
  resource!: string;

  @ApiProperty({ example: 'execute' })
  @IsString()
  @MinLength(1)
  action!: string;
}

/** Mirrors `trustgraph.delegation.models.DelegationRequest`. */
export class DelegationRequestDto {
  @ApiProperty({ example: 'user-alice' })
  @IsString()
  delegator_id!: string;

  @ApiProperty({ example: 'agent-finance' })
  @IsString()
  delegatee_id!: string;

  @ApiProperty({ type: [PermissionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  grants!: PermissionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  max_redelegation_depth?: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  expires_at?: string | null;
}
