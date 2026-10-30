import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/auth.decorators';
import { TrustGraphClient } from '../governance/trustgraph.client';

type ComponentStatus = { status: 'ok' | 'error'; detail?: unknown };

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly trustGraph: TrustGraphClient,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Gateway, database and governance-engine health (public)' })
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, governance] = await Promise.all([this.checkDatabase(), this.checkGovernance()]);
    const healthy = database.status === 'ok' && governance.status === 'ok';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: healthy ? 'ok' : 'degraded',
      gateway: { status: 'ok', uptime_s: Math.round(process.uptime()) },
      database,
      governance,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return { status: 'error', detail: 'database unreachable' };
    }
  }

  private async checkGovernance(): Promise<ComponentStatus> {
    try {
      const result = await this.trustGraph.health();
      return { status: result.status === 'ok' ? 'ok' : 'error', detail: result };
    } catch {
      return { status: 'error', detail: 'TrustGraph governance service unavailable' };
    }
  }
}
