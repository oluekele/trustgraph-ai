import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedRequest, Roles } from '../../common/decorators/auth.decorators';
import { Role } from '../../common/roles';
import {
  CapabilityDto,
  GrantCreateDto,
  PolicyDto,
  PrincipalCreateDto,
  ResourceDto,
  StatusUpdateDto,
  UpdatePolicyDto,
} from '../dto/registry.dto';
import { GovernanceProxy, pyPath } from '../governance-proxy.service';

@ApiTags('identity')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('principals')
export class PrincipalsController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get()
  @ApiOperation({ summary: 'List principals (users and agents)' })
  @ApiQuery({ name: 'kind', required: false, enum: ['user', 'agent'] })
  list(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/principals');
  }

  @Post()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Register a principal (returns its API key once)' })
  create(@Body() body: PrincipalCreateDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/principals', body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Principal detail with authority, grants, delegations and owned agents' })
  get(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', pyPath`/principals/${id}`);
  }

  @Get(':id/authority')
  @ApiOperation({ summary: 'Reconstructed effective authority of a principal' })
  authority(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', pyPath`/principals/${id}/authority`);
  }

  @Patch(':id/status')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Activate, suspend or decommission a principal' })
  setStatus(
    @Param('id') id: string,
    @Body() body: StatusUpdateDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'PATCH', pyPath`/principals/${id}/status`, body);
  }

  @Post(':id/rotate-key')
  @Roles(Role.Admin)
  @ApiOperation({ summary: "Rotate a principal's API key" })
  rotateKey(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', pyPath`/principals/${id}/rotate-key`);
  }
}

@ApiTags('catalogue')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class CatalogueController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get('capabilities')
  @ApiOperation({ summary: 'List technical capabilities' })
  listCapabilities(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/capabilities');
  }

  @Post('capabilities')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Register a capability' })
  createCapability(@Body() body: CapabilityDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/capabilities', body);
  }

  @Get('resources')
  @ApiOperation({ summary: 'List protected resources' })
  listResources(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/resources');
  }

  @Post('resources')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Register a protected resource' })
  createResource(@Body() body: ResourceDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/resources', body);
  }
}

@ApiTags('authority')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('grants')
export class GrantsController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get()
  @ApiOperation({ summary: 'List direct authority grants' })
  @ApiQuery({ name: 'principal_id', required: false })
  list(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/grants');
  }

  @Post()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Grant direct authority to a principal' })
  create(@Body() body: GrantCreateDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/grants', body);
  }

  @Post(':id/revoke')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Revoke a grant (cascades to dependent delegations)' })
  revoke(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', pyPath`/grants/${id}/revoke`);
  }
}

@ApiTags('policy')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('policies')
export class PoliciesController {
  constructor(private readonly proxy: GovernanceProxy) {}

  @Get()
  @ApiOperation({ summary: 'List organisational policies' })
  list(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'GET', '/policies');
  }

  @Post()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Create a policy' })
  create(@Body() body: PolicyDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'POST', '/policies', body);
  }

  @Put(':id')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Replace a policy (version is incremented by the engine)' })
  update(
    @Param('id') id: string,
    @Body() body: UpdatePolicyDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy.forward(req, res, 'PUT', pyPath`/policies/${id}`, { ...body, id });
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a policy' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.proxy.forward(req, res, 'DELETE', pyPath`/policies/${id}`);
  }
}
