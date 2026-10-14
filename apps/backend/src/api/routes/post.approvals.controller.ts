import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { PostApprovalsService } from '@gitroom/nestjs-libraries/database/prisma/post-approvals/post.approvals.service';
import {
  CreatePostApprovalDto,
  PostApprovalStatusesDto,
} from '@gitroom/nestjs-libraries/dtos/post-approvals/post.approval.dto';

@ApiTags('Post Approvals')
@Controller('/post-approvals')
export class PostApprovalsController {
  constructor(private _postApprovalsService: PostApprovalsService) {}

  // a POST because a month in the calendar can hold hundreds of posts
  @Post('/statuses')
  async getStatuses(
    @GetOrgFromRequest() org: Organization,
    @Body() body: PostApprovalStatusesDto
  ) {
    return this._postApprovalsService.getStatuses(org.id, body.postIds);
  }

  @Get('/post/:postId')
  async listForPost(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string
  ) {
    return this._postApprovalsService.listForPost(org.id, postId);
  }

  @Post('/post/:postId')
  async createRequest(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('postId') postId: string,
    @Body() body: CreatePostApprovalDto
  ) {
    return this._postApprovalsService.createRequest(
      org.id,
      user.id,
      postId,
      body
    );
  }

  @Put('/:id/revoke')
  async revoke(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postApprovalsService.revoke(org.id, id);
  }
}
