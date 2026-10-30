import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { AuthenticatedUser, Role } from '../common/roles';
import { CreateUserDto, UpdateUserDto, UserView } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List dashboard operator accounts (admin)' })
  list(): Promise<UserView[]> {
    return this.users.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a dashboard operator account (admin)' })
  create(@Body() dto: CreateUserDto): Promise<UserView> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change an operator role or active flag (admin)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserView> {
    return this.users.update(id, dto, user.id);
  }
}
