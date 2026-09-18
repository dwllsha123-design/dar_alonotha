import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderSource } from '@prisma/client';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('source') source?: OrderSource,
    @Query('status') status?: string,
    @Query('facebookPageId') facebookPageId?: string,
    @Query('pagePublicCode') pagePublicCode?: string,
    @Query('mine') mine?: string,
  ) {
    return this.ordersService.findAll(user, {
      source,
      status,
      facebookPageId,
      pagePublicCode: pagePublicCode ? Number(pagePublicCode) : undefined,
      mine: mine === '1' || mine === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user, id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.remove(user, id);
  }
}
