import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  MarketerRegisterDto,
  UpdateUserDto,
} from './dto/user.dto';
import {
  CreateSalaryPaymentDto,
  UpdateSalaryPaymentStatusDto,
} from './dto/payroll.dto';
import {
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register-marketer')
  registerMarketer(@Body() dto: MarketerRegisterDto) {
    return this.usersService.registerMarketer(dto);
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('roles')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  roles() {
    return this.usersService.listRoles();
  }

  @Get('pending-marketers')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  pending() {
    return this.usersService.pendingMarketers();
  }

  @Get('payroll/me')
  @ApiBearerAuth()
  myPayroll(@CurrentUser() user: AuthUser) {
    return this.usersService.myPayroll(user);
  }

  @Get('salary-payments')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  salaryPayments() {
    return this.usersService.listSalaryPayments();
  }

  @Post('salary-payments')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  createSalaryPayment(@Body() dto: CreateSalaryPaymentDto) {
    return this.usersService.createSalaryPayment(dto);
  }

  @Patch('salary-payments/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  updateSalaryPayment(
    @Param('id') id: string,
    @Body() dto: UpdateSalaryPaymentStatusDto,
  ) {
    return this.usersService.updateSalaryPaymentStatus(id, dto);
  }

  @Post(':id/approve-marketer')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.approveMarketer(user, id);
  }

  @Post(':id/reject-marketer')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.rejectMarketer(user, id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
