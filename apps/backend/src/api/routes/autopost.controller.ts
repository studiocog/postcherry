import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';

@ApiTags('Autopost')
@Controller('/autopost')
export class AutopostController {
  constructor(
    private _autopostsService: AutopostService,
    private _subscriptionService: SubscriptionService
  ) {}

  // turning a feed on needs a plan with RSS auto-posting, turning it off never does
  private async checkCanRun(org: Organization, active: boolean) {
    if (active && !(await this._subscriptionService.canRunAutoPost(org.id))) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.AUTOPOST,
      });
    }
  }

  @Get('/')
  async getAutoposts(@GetOrgFromRequest() org: Organization) {
    return this._autopostsService.getAutoposts(org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.AUTOPOST])
  async createAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto
  ) {
    return this._autopostsService.createAutopost(org.id, body);
  }

  @Put('/:id')
  async updateAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto,
    @Param('id') id: string
  ) {
    await this.checkCanRun(org, body.active);

    // it only edits an existing auto-post, a new one goes through POST (and its plan check)
    const data = await this._autopostsService.updateAutopost(org.id, id, body);
    if (!data) {
      throw new HttpException('Autopost not found', 404);
    }

    return data;
  }

  @Delete('/:id')
  async deleteAutopost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._autopostsService.deleteAutopost(org.id, id);
  }

  @Post('/:id/active')
  async changeActive(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('active') active: boolean
  ) {
    await this.checkCanRun(org, active);
    return this._autopostsService.changeActive(org.id, id, active);
  }

  @Post('/send')
  async sendWebhook(@Query() query: OnlyURL) {
    return this._autopostsService.loadXML(query.url);
  }
}
