import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FacebookPagesService } from './facebook-pages.service';
import { FacebookPagesAnalyticsService } from './facebook-pages-analytics.service';
import {
  AssignEmployeesDto,
  AssignMemberDto,
  CreateFacebookPageDto,
  CreatePageStaffDto,
  UpdateFacebookPageDto,
  UpdateMemberEmploymentDto,
  UpsertShippingAccountDto,
  SetPageCredentialsDto,
} from './dto/facebook-page.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Facebook Pages')
@ApiBearerAuth()
@Controller('facebook-pages')
export class FacebookPagesController {
  constructor(
    private readonly facebookPagesService: FacebookPagesService,
    private readonly analytics: FacebookPagesAnalyticsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_VIEW)
  findAll(@CurrentUser() user: AuthUser) {
    return this.facebookPagesService.findAll(user);
  }

  /** Admin list with operational KPIs */
  @Get('admin/summary')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  summary() {
    return this.analytics.listSummaries();
  }

  @Get(':id/dashboard')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  dashboard(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.pageDashboard(id, from, to);
  }

  @Get(':id/employees-stats')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  employeesStats(@Param('id') id: string) {
    return this.analytics.pageEmployees(id);
  }

  @Get(':id/performance')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  performance(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.pagePerformance(id, from, to);
  }

  @Get(':id/report')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  report(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.pageReport(id, from, to);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_VIEW)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.facebookPagesService.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  create(@Body() dto: CreateFacebookPageDto) {
    return this.facebookPagesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateFacebookPageDto) {
    return this.facebookPagesService.update(id, dto);
  }

  @Post(':id/members')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  assignMember(@Param('id') id: string, @Body() dto: AssignMemberDto) {
    return this.facebookPagesService.assignMember(id, dto);
  }

  @Post(':id/staff')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  createStaff(@Param('id') id: string, @Body() dto: CreatePageStaffDto) {
    return this.facebookPagesService.createStaff(id, dto);
  }

  @Patch(':id/members/:userId')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberEmploymentDto,
  ) {
    return this.facebookPagesService.updateMemberEmployment(id, userId, dto);
  }

  @Delete(':id/members/:userId')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.facebookPagesService.removeMember(id, userId);
  }

  @Put(':id/credentials')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  setCredentials(@Param('id') id: string, @Body() dto: SetPageCredentialsDto) {
    return this.facebookPagesService.setCredentials(id, dto);
  }

  @Put(':id/employees')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  assignEmployees(@Param('id') id: string, @Body() dto: AssignEmployeesDto) {
    return this.facebookPagesService.assignEmployees(id, dto.userIds);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  remove(@Param('id') id: string) {
    return this.facebookPagesService.remove(id);
  }

  @Put(':id/shipping-account')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  upsertShippingAccount(
    @Param('id') id: string,
    @Body() dto: UpsertShippingAccountDto,
  ) {
    return this.facebookPagesService.upsertShippingAccount(id, dto);
  }

  @Delete(':id/shipping-account')
  @RequirePermissions(PERMISSIONS.FACEBOOK_PAGES_MANAGE)
  removeShippingAccount(@Param('id') id: string) {
    return this.facebookPagesService.removeShippingAccount(id);
  }
}
