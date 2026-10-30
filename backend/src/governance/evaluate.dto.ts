import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Mirrors `trustgraph.schemas.EvaluationRunBody`. */
export class EvaluationRunDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  repetitions?: number;
}
