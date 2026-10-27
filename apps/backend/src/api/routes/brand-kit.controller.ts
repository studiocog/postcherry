import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, Role } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { BrandKitService } from '@gitroom/nestjs-libraries/database/prisma/brand-kit/brand-kit.service';
import { BrandKitDto } from '@gitroom/nestjs-libraries/dtos/brand-kit/brand-kit.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Brand Kit')
@Controller('/brand-kit')
export class BrandKitController {
  constructor(private _brandKitService: BrandKitService) {}

  @Get('/')
  async getBrandKit(@GetOrgFromRequest() org: Organization) {
    return (await this._brandKitService.getBrandKit(org.id)) || {};
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  saveBrandKit(
    @GetOrgFromRequest() org: Organization & { users?: Array<{ role: Role }> },
    @Body() body: BrandKitDto
  ) {
    // CheckPolicies lets every role through when billing is off, and the brand
    // voice steers the AI of the whole workspace, so the role is checked here too
    if (!['ADMIN', 'SUPERADMIN'].includes(org.users?.[0]?.role || '')) {
      throw new HttpException(
        'Only workspace admins can change the brand kit',
        403
      );
    }

    return this._brandKitService.saveBrandKit(org.id, body);
  }

  @Post('/learn-voice')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  learnVoice(@GetOrgFromRequest() org: Organization) {
    return this._brandKitService.learnVoice(org.id);
  }
}
