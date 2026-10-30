import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedRequest, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/roles';
import { DelegationRequestDto } from '../dto/delegation.dto';
import { RevokeDto } from '../dto/registry.dto';
import { GovernanceProxy, pyPath } from '../governance-proxy.service';

@ApiTags('delegation')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('delegations')
export class DelegationsController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get()
  @ApiOperation({ summary: 'List delegations' })
  @ApiQuery({ name: 'principal_id', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'revoked', 'expired'] })
  list(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/delegations');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Delegation with its full chain and children' })
  get(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', pyPath`/delegations/${id}`);
  }

  @Post()
  @Roles(Role.Operator)
  @ApiOperation({ summary: 'Request a delegation (validated by the governance engine)' })
  @ApiResponse({ status: 201, description: 'Delegation accepted.' })
  @ApiResponse({ status: 200, description: 'Delegation rejected: `{accepted: false, reason, violations}`.' })
  create(@Body() body: DelegationRequestDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/delegations', body);
  }

  @Post(':id/revoke')
  @Roles(Role.Operator)
  @ApiOperation({ summary: 'Revoke a delegation (cascades to re-delegations)' })
  revoke(
    @Param('id') id: string,
    @Body() body: RevokeDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'POST', pyPath`/delegations/${id}/revoke`, body);
  }
}
