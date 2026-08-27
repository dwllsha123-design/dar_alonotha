import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommissionsService } from './commissions.service';
import {
  CreateCommissionRuleDto,
  UpdateCommissionStatusDto,
} from './dto/commission.dto';
import { UpdatePerPieceRateDto } from './dto/per-piece.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Commissions')
@ApiBearerAuth()
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('rules')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_MANAGE)
  rules() {
    return this.commissionsService.listRules();
  }

  @Post('rules')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_MANAGE)
  createRule(@Body() dto: CreateCommissionRuleDto) {
    return this.commissionsService.createRule(dto);
  }

  @Get('per-piece-rate')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_VIEW)
  perPieceRate() {
    return this.commissionsService.getPerPieceRate().then((amount) => ({ amount }));
  }

  @Patch('per-piece-rate')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_MANAGE)
  setPerPieceRate(@Body() dto: UpdatePerPieceRateDto) {
    return this.commissionsService.setPerPieceRate(dto.amount);
  }

  @Get('entries')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_VIEW)
  entries(@CurrentUser() user: AuthUser) {
    return this.commissionsService.listEntries(user);
  }

  @Patch('entries/:id/status')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_MANAGE)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCommissionStatusDto) {
    return this.commissionsService.updateStatus(id, dto);
  }
}
