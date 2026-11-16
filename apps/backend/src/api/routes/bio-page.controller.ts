import {
  Body,
  Controller,
  Get,
  HttpException,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, Role } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { BioPageService } from '@gitroom/nestjs-libraries/database/prisma/bio-page/bio-page.service';
import {
  BioPageDto,
  BioSlugDto,
} from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Bio Page')
@Controller('/bio-page')
export class BioPageController {
  constructor(private _bioPageService: BioPageService) {}

  @Get('/')
  async getBioPage(@GetOrgFromRequest() org: Organization) {
    return (await this._bioPageService.getBioPage(org.id)) || {};
  }

  @Get('/channels')
  getChannels(@GetOrgFromRequest() org: Organization) {
    return this._bioPageService.getChannelOptions(org.id);
  }

  @Get('/slug')
  checkSlug(
    @GetOrgFromRequest() org: Organization,
    @Query() query: BioSlugDto
  ) {
    return this._bioPageService.checkSlug(org.id, query.slug);
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  saveBioPage(
    @GetOrgFromRequest() org: Organization & { users?: Array<{ role: Role }> },
    @Body() body: BioPageDto
  ) {
    // CheckPolicies lets every role through when billing is off, and the page
    // is public in the name of the whole workspace, so the role is checked here too
    if (!['ADMIN', 'SUPERADMIN'].includes(org.users?.[0]?.role || '')) {
      throw new HttpException(
        'Only workspace admins can change the link in bio page',
        403
      );
    }

    return this._bioPageService.saveBioPage(org.id, body);
  }
}
