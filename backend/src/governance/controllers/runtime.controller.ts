import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedRequest, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/roles';
import { AgentRunDto, ApprovalDecisionDto, AuthorizeDto, ExecuteDto } from '../dto/runtime.dto';
import { GovernanceProxy, pyPath } from '../governance-proxy.service';

@ApiTags('runtime')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class RuntimeController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Post('authorize')
  @Roles(Role.Operator)
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulate a policy decision for an agent request' })
  authorize(@Body() body: AuthorizeDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/authorize', body);
  }

  @Post('execute')
  @Roles(Role.Operator)
  @HttpCode(200)
  @ApiOperation({ summary: 'Governed tool execution on behalf of an agent' })
  execute(@Body() body: ExecuteDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/execute', body);
  }

  @Get('tools')
  @ApiOperation({ summary: 'Governed tool catalogue' })
  tools(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/tools');
  }

  @Get('sandbox')
  @ApiOperation({ summary: 'Side effects in the synthetic environment' })
  sandbox(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/sandbox');
  }

  @Post('agents/:id/run')
  @Roles(Role.Operator)
  @HttpCode(200)
  @ApiOperation({ summary: 'Run an agent task; every tool call is governed' })
  runAgent(
    @Param('id') id: string,
    @Body() body: AgentRunDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'POST', pyPath`/agents/${id}/run`, body);
  }
}

@ApiTags('approvals')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get()
  @ApiOperation({ summary: 'List human-approval requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected', 'expired', 'consumed'] })
  list(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/approvals');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Approval request detail' })
  get(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', pyPath`/approvals/${id}`);
  }

  @Post(':id/approve')
  @Roles(Role.Approver)
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve (recorded with the signed-in operator as approver)' })
  approve(
    @Param('id') id: string,
    @Body() body: ApprovalDecisionDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'POST', pyPath`/approvals/${id}/approve`, body);
  }

  @Post(':id/reject')
  @Roles(Role.Approver)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject (recorded with the signed-in operator as approver)' })
  reject(
    @Param('id') id: string,
    @Body() body: ApprovalDecisionDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'POST', pyPath`/approvals/${id}/reject`, body);
  }

  @Post(':id/execute')
  @Roles(Role.Approver)
  @HttpCode(200)
  @ApiOperation({ summary: 'Execute the approved action (authority, policy and risk are re-evaluated)' })
  execute(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', pyPath`/approvals/${id}/execute`);
  }
}
