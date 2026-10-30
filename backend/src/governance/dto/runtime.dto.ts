import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Mirrors `trustgraph.authorization.models.RequestContext`. `source` is set by the engine for gateway calls. */
export class RequestContextDto {
  @ApiPropertyOptional({ nullable: true, example: 'Pay invoice 42' })
  @IsOptional()
  @IsString()
  purpose?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  untrusted_input?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  session_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

/** Mirrors `trustgraph.schemas.AuthorizeBody`. */
export class AuthorizeDto {
  @ApiProperty({ example: 'agent-finance' })
  @IsString()
  agent_id!: string;

  @ApiProperty({ example: 'payments.execute' })
  @IsString()
  capability!: string;

  @ApiProperty({ example: 'payments://vendor-payouts' })
  @IsString()
  resource!: string;

  @ApiProperty({ example: 'execute' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;

  @ApiPropertyOptional({ type: RequestContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestContextDto)
  context?: RequestContextDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  approval_id?: string | null;
}

/** Mirrors `trustgraph.schemas.ExecuteBody`. */
export class ExecuteDto {
  @ApiProperty({ example: 'agent-finance' })
  @IsString()
  agent_id!: string;

  @ApiProperty({ example: 'payment_transfer' })
  @IsString()
  tool!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { account: 'vendor-payouts', recipient: 'NW', amount: 120 },
  })
  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;

  @ApiPropertyOptional({ type: RequestContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestContextDto)
  context?: RequestContextDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  approval_id?: string | null;
}

/** Mirrors `trustgraph.schemas.ApprovalDecisionBody`. */
export class ApprovalDecisionDto {
  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export const PLANNERS = ['auto', 'scripted', 'gemini', 'openai', 'grok'] as const;

/** Mirrors `trustgraph.schemas.AgentRunBody`. */
export class AgentRunDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  task!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  purpose?: string | null;

  @ApiPropertyOptional({ enum: PLANNERS, default: 'auto' })
  @IsOptional()
  @IsIn(PLANNERS)
  planner?: (typeof PLANNERS)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_steps?: number;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    nullable: true,
    description: "Steps for the scripted planner: [{'tool': ..., 'arguments': {...}}].",
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  script?: Array<Record<string, unknown>> | null;
}
