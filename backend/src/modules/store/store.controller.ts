import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StoreService } from './store.service';
import {
  StoreCheckoutDto,
  StoreRegisterDto,
  StoreTrackDto,
  UpdateStoreProfileDto,
} from './dto/store.dto';
import { Public } from '../../common/decorators/auth.decorators';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { AuthService } from '../auth/auth.service';
import { clientMetaFromRequest } from '../../common/client-context';

@ApiTags('Store')
@Controller('store')
export class StoreController {
  constructor(
    private readonly storeService: StoreService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Get('company')
  company() {
    return this.storeService.company();
  }

  @Public()
  @Get('delivery-options')
  deliveryOptions() {
    return this.storeService.deliveryOptions();
  }

  @Public()
  @Get('delivery-areas')
  deliveryAreas(@Query('city') city?: string) {
    return this.storeService.deliveryAreas(city);
  }

  @Public()
  @Get('delivery-quote')
  deliveryQuote(
    @Query('city') city?: string,
    @Query('area') area?: string,
    @Query('gender') gender?: string,
  ) {
    return this.storeService.resolveDelivery(city, area, gender);
  }

  @Public()
  @Get('categories')
  categories() {
    return this.storeService.categories();
  }

  @Public()
  @Get('products')
  products(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('collection') collection?: string,
  ) {
    return this.storeService.listProducts({ q, category, collection });
  }

  @Public()
  @Get('stock')
  stock(@Query('variants') variants?: string) {
    return this.storeService.variantStock((variants || '').split(','));
  }

  @Public()
  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.storeService.productById(id);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('auth/register')
  register(
    @Body() dto: StoreRegisterDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> },
  ) {
    return this.storeService.register(dto, clientMetaFromRequest(req));
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('auth/login')
  login(
    @Body() dto: LoginDto,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> },
  ) {
    return this.authService.login(dto, clientMetaFromRequest(req, dto));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('checkout')
  checkout(@Body() dto: StoreCheckoutDto) {
    return this.storeService.checkout(dto);
  }

  @Public()
  @Post('orders/track')
  track(@Body() dto: StoreTrackDto) {
    return this.storeService.track(dto.orderNumber, dto.phone);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.storeService.profile(user);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateStoreProfileDto) {
    return this.storeService.updateProfile(user, dto);
  }

  @ApiBearerAuth()
  @Get('me/orders')
  myOrders(@CurrentUser() user: AuthUser) {
    return this.storeService.myOrders(user);
  }

  @ApiBearerAuth()
  @Get('me/orders/:id')
  myOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storeService.myOrder(user, id);
  }

  @ApiBearerAuth()
  @Post('checkout/auth')
  checkoutAuth(@CurrentUser() user: AuthUser, @Body() dto: StoreCheckoutDto) {
    return this.storeService.checkout(dto, user);
  }
}
