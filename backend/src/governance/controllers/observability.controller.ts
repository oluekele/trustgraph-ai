import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedRequest, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/roles';
import { EvaluationRunDto } from '../evaluate.dto';
import { GovernanceProxy, pyPath } from '../governance-proxy.service';

@ApiTags('observability')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class ObservabilityController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview from the governance engine' })
  overview(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/overview');
  }

  @Get('audit')
  @ApiOperation({ summary: 'Tamper-evident audit log' })
  @ApiQuery({ name: 'actor_id', required: false })
  @ApiQuery({ name: 'event_type', required: false })
  @ApiQuery({ name: 'decision', required: false })
  @ApiQuery({ name: 'request_id', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  audit(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/audit');
  }

  @Get('audit/verify')
  @ApiOperation({ summary: 'Verify the audit hash chain' })
  verifyAudit(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/audit/verify');
  }

  @Get('graph')
  @ApiOperation({ summary: 'Authority/delegation graph snapshot' })
  @ApiQuery({ name: 'activity', required: false, type: Number })
  graph(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/graph');
  }

  @Get('provenance')
  @ApiOperation({ summary: 'Provenance of a permission for an agent' })
  @ApiQuery({ name: 'agent_id', required: true })
  @ApiQuery({ name: 'capability', required: true })
  @ApiQuery({ name: 'resource', required: true })
  @ApiQuery({ name: 'action', required: true })
  provenance(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/provenance');
  }

  @Post('graph/sync')
  @Roles(Role.Operator)
  @HttpCode(200)
  @ApiOperation({ summary: 'Force a Neo4j projection sync' })
  syncGraph(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/graph/sync');
  }

  @Get('graph/neo4j/chains/:agentId')
  @ApiOperation({ summary: 'Delegation chains and blast radius from Neo4j' })
  chains(@Param('agentId') agentId: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', pyPath`/graph/neo4j/chains/${agentId}`);
  }

  @Get('risk/config')
  @ApiOperation({ summary: 'Risk model configuration' })
  riskConfig(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/risk/config');
  }

  @Get('evaluation/latest')
  @ApiOperation({ summary: 'Latest controlled-experiment results' })
  latestEvaluation(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/evaluation/latest');
  }

  @Post('evaluation/run')
  @Roles(Role.Operator)
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the controlled experiment (isolated in-memory databases)' })
  runEvaluation(@Body() body: EvaluationRunDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/evaluation/run', body);
  }
}

@ApiTags('admin')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rebuild the demonstration environment (drops all governance data)' })
  reset(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/admin/reset');
  }

  @Get('seed-keys')
  @ApiOperation({ summary: 'API keys issued to seeded demo agents' })
  seedKeys(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/admin/seed-keys');
  }
}
