import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, IntersectionType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PRINCIPAL_KINDS = ['user', 'agent'] as const;
export const PRINCIPAL_STATUSES = ['active', 'suspended', 'decommissioned'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const POLICY_EFFECTS = ['allow', 'require_approval', 'deny'] as const;

/** Mirrors `trustgraph.schemas.PrincipalCreate`. */
export class PrincipalCreateDto {
  @ApiProperty({ example: 'agent-research', pattern: '^[a-z0-9][a-z0-9._-]{1,62}$' })
  @Matches(/^[a-z0-9][a-z0-9._-]{1,62}$/)
  id!: string;

  @ApiProperty({ enum: PRINCIPAL_KINDS })
  @IsIn(PRINCIPAL_KINDS)
  kind!: (typeof PRINCIPAL_KINDS)[number];

  @ApiProperty({ example: 'Research Agent' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  owner_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  parent_agent_id?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['web.search'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];
}

export class StatusUpdateDto {
  @ApiProperty({ enum: PRINCIPAL_STATUSES })
  @IsIn(PRINCIPAL_STATUSES)
  status!: (typeof PRINCIPAL_STATUSES)[number];
}

/** Mirrors `trustgraph.capability.models.Capability`. */
export class CapabilityDto {
  @ApiProperty({ example: 'payments.execute' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];
}

/** Mirrors `trustgraph.capability.models.Resource`. */
export class ResourceDto {
  @ApiProperty({ example: 'payments://vendor-payouts' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'payments' })
  @IsString()
  kind!: string;

  @ApiPropertyOptional({ enum: CLASSIFICATIONS })
  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: (typeof CLASSIFICATIONS)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sensitivity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_actions?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  owner_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

/** Mirrors `trustgraph.schemas.GrantCreate`. */
export class GrantCreateDto {
  @ApiProperty({ example: 'user-alice' })
  @IsString()
  principal_id!: string;

  @ApiProperty({ example: 'payments.execute' })
  @IsString()
  capability!: string;

  @ApiProperty({ example: 'payments://vendor-payouts' })
  @IsString()
  resource!: string;

  @ApiProperty({ example: 'execute' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  max_delegation_depth?: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  expires_at?: string | null;
}

/** Mirrors `trustgraph.schemas.RevokeBody`. */
export class RevokeDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Mirrors `trustgraph.policy.models.PolicyConditions`. */
export class PolicyConditionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  require_purpose?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  max_risk_score?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_delegation_hops?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  direct_authority_only?: boolean;

  @ApiPropertyOptional({ type: [Number], minItems: 2, maxItems: 2, nullable: true, example: [8, 18] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(24, { each: true })
  allowed_hours_utc?: [number, number] | null;
}

/** Mirrors `trustgraph.policy.models.Policy` (server-managed version/timestamps are ignored). */
export class PolicyDto {
  @ApiProperty({ example: 'pol-payments-approval' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: POLICY_EFFECTS })
  @IsOptional()
  @IsIn(POLICY_EFFECTS)
  effect?: (typeof POLICY_EFFECTS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  @ApiPropertyOptional({ type: PolicyConditionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PolicyConditionsDto)
  conditions?: PolicyConditionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** PUT body: `id` is taken from the path. */
export class UpdatePolicyDto extends IntersectionType(
  OmitType(PolicyDto, ['id'] as const),
  PartialType(PickType(PolicyDto, ['id'] as const)),
) {}
