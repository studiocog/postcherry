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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { AdminService } from '@gitroom/nestjs-libraries/database/prisma/admin/admin.service';
import {
  AdminCodeDto,
  AdminCustomerStatus,
  adminCustomerStatuses,
  AdminFreePlanDto,
  AdminNoteDto,
  AdminProfileDto,
  AdminSetupDto,
  AdminSort,
  adminSorts,
  AdminStage,
  AdminStageDto,
  adminStages,
  AdminTagsDto,
  AdminTaskDoneDto,
  AdminTaskDto,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';
import {
  assertSuperAdmin,
  checkAdminSession,
  clearAdminSession,
  requestUserId,
  setAdminSession,
  setImpersonateCookie,
} from '@gitroom/backend/services/auth/admin.session';
import { AdminSessionGuard } from '@gitroom/backend/services/auth/admin.session.guard';
import { ThrottlerRealIpGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import dayjs from 'dayjs';

const toPage = (page?: string) => Math.max(0, parseInt(page || '0', 10) || 0);

// the filters of the customers list (unknown values are ignored)
const listFilters = (query: {
  search?: string;
  status?: string;
  tag?: string;
  stage?: string;
  sort?: string;
}) => ({
  search: query.search || undefined,
  status: adminCustomerStatuses.includes(query.status as AdminCustomerStatus)
    ? (query.status as AdminCustomerStatus)
    : undefined,
  tag: query.tag || undefined,
  stage: adminStages.includes(query.stage as AdminStage)
    ? (query.stage as AdminStage)
    : undefined,
  sort: adminSorts.includes(query.sort as AdminSort)
    ? (query.sort as AdminSort)
    : undefined,
});

@ApiTags('Admin')
@Controller('/admin')
export class AdminController {
  constructor(
    private _errorsService: ErrorsService,
    private _adminStatsService: AdminStatsService,
    private _adminService: AdminService
  ) {}

  // ---------- the second login step ----------

  // the id of the admin who is really signed in (not of a customer being viewed)
  private adminId(req: Request) {
    const adminId = requestUserId(req);
    if (!adminId) {
      throw new HttpException('Unauthorized', 400);
    }
    return adminId;
  }

  @Get('/session')
  async session(@GetUserFromRequest() user: User, @Req() req: Request) {
    assertSuperAdmin(user);
    return this._adminService.sessionState(
      this.adminId(req),
      !!(await checkAdminSession(this._adminService, req))
    );
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Post('/session/setup')
  async setup(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Body() body: AdminSetupDto
  ) {
    assertSuperAdmin(user);
    const adminId = this.adminId(req);
    // while viewing the app as a customer, user is that customer
    if (adminId !== user.id) {
      throw new HttpException('Stop viewing the app as a customer first', 400);
    }
    return this._adminService.startSetup(adminId, user.email, body.setupCode);
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Post('/session/verify')
  async verify(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: AdminCodeDto
  ) {
    assertSuperAdmin(user);
    const adminId = this.adminId(req);
    const nonce = await this._adminService.checkCode(adminId, body.code);
    if (!nonce) {
      throw new HttpException('Wrong code, try the new one in the app', 400);
    }
    setAdminSession(res, adminId, nonce);
    await this._adminService.logAction(adminId, 'signed_in');
    return { verified: true };
  }

  // behind the guard too, so another website can't end the HQ session
  @UseGuards(AdminSessionGuard)
  @Post('/session/logout')
  async logout(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    assertSuperAdmin(user);
    await this._adminService.endSessions(this.adminId(req));
    clearAdminSession(res);
    return { verified: false };
  }

  // ---------- overview and customers ----------

  @UseGuards(AdminSessionGuard)
  @Get('/overview')
  async overview(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return this._adminService.overview();
  }

  @UseGuards(AdminSessionGuard)
  @Get('/customers')
  async customers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('stage') stage?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string
  ) {
    return this._adminService.listCustomers({
      ...listFilters({ search, status, tag, stage, sort }),
      page: toPage(page),
    });
  }

  // the customers list with the same filters, as a CSV file (up to 5,000 rows)
  @UseGuards(AdminSessionGuard)
  @Get('/customers/export')
  async exportCustomers(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('stage') stage?: string,
    @Query('sort') sort?: string
  ) {
    const csv = await this._adminService.exportCustomers(
      listFilters({ search, status, tag, stage, sort })
    );
    await this._adminService.logAction(this.adminId(req), 'customers_exported');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="postcherry-customers-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`
    );
    return csv;
  }

  @UseGuards(AdminSessionGuard)
  @Get('/board')
  async board() {
    return this._adminService.board();
  }

  @UseGuards(AdminSessionGuard)
  @Get('/tasks')
  async tasks(@Query('done') done?: string) {
    return this._adminService.tasks({ done: done === 'true' });
  }

  @UseGuards(AdminSessionGuard)
  @Put('/tasks/:taskId')
  async setTaskDone(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Body() body: AdminTaskDoneDto
  ) {
    await this._adminService.setTaskDone(this.adminId(req), taskId, body.done);
    return { done: body.done };
  }

  @UseGuards(AdminSessionGuard)
  @Delete('/tasks/:taskId')
  async deleteTask(@Req() req: Request, @Param('taskId') taskId: string) {
    await this._adminService.deleteTask(this.adminId(req), taskId);
    return { ok: true };
  }

  @UseGuards(AdminSessionGuard)
  @Post('/customers/:id/tasks')
  async addTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminTaskDto
  ) {
    await this._adminService.addTask(
      this.adminId(req),
      id,
      body.title,
      body.dueAt
    );
    return { ok: true };
  }

  @UseGuards(AdminSessionGuard)
  @Put('/customers/:id/stage')
  async setStage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminStageDto
  ) {
    await this._adminService.setStage(this.adminId(req), id, body.stage);
    return { stage: body.stage };
  }

  @UseGuards(AdminSessionGuard)
  @Put('/customers/:id/profile')
  async setProfile(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AdminProfileDto
  ) {
    await this._adminService.setProfile(this.adminId(req), id, body);
    return { ok: true };
  }

  @UseGuards(AdminSessionGuard)
  @Get('/tags')
  async tags(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return this._adminService.allTags();
  }

  @UseGuards(AdminSessionGuard)
  @Get('/customers/:id')
  async customer(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string
  ) {
    return this._adminService.customer(id);
  }

  @UseGuards(AdminSessionGuard)
  @Put('/customers/:id/free-plan')
  async freePlan(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: AdminFreePlanDto
  ) {
    const adminId = this.adminId(req);
    await this._adminService.setFreePlan(adminId, id, body.enabled);
    return { enabled: body.enabled };
  }

  @UseGuards(AdminSessionGuard)
  @Post('/customers/:id/notes')
  async addNote(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: AdminNoteDto
  ) {
    const adminId = this.adminId(req);
    await this._adminService.addNote(adminId, id, body.text);
    return { ok: true };
  }

  @UseGuards(AdminSessionGuard)
  @Delete('/customers/:id/notes/:noteId')
  async deleteNote(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Param('noteId') noteId: string
  ) {
    const adminId = this.adminId(req);
    await this._adminService.deleteNote(adminId, id, noteId);
    return { ok: true };
  }

  @UseGuards(AdminSessionGuard)
  @Put('/customers/:id/tags')
  async setTags(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: AdminTagsDto
  ) {
    const adminId = this.adminId(req);
    return { tags: await this._adminService.setTags(adminId, id, body.tags) };
  }

  // Opens the app as the owner of the workspace (the same cookie as
  // POST /user/impersonate), the app shows a bar to stop it
  @UseGuards(AdminSessionGuard)
  @Post('/customers/:id/login-as')
  async loginAs(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string
  ) {
    const adminId = this.adminId(req);
    const memberId = await this._adminService.loginMember(adminId, id);
    setImpersonateCookie(res, memberId);
    return { url: process.env.FRONTEND_URL };
  }

  @UseGuards(AdminSessionGuard)
  @Get('/log')
  async log(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('page') page?: string
  ) {
    return this._adminService.log({ page: toPage(page) });
  }

  // ---------- stats and errors ----------

  @UseGuards(AdminSessionGuard)
  @Get('/errors')
  async listErrors(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('email') email?: string,
    @Query('unknownFirst') unknownFirst?: string
  ) {
    return this._errorsService.listErrors({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      platform: platform || undefined,
      email: email || undefined,
      unknownFirst: unknownFirst === 'true' || unknownFirst === '1',
    });
  }

  @UseGuards(AdminSessionGuard)
  @Get('/errors/platforms')
  async listPlatforms(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return this._errorsService.listPlatforms();
  }

  @UseGuards(AdminSessionGuard)
  @Get('/stats')
  async getStats(
    @GetUserFromRequest() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unknownOnly') unknownOnly?: string
  ) {

    const fromDate = from ? dayjs(from) : dayjs().subtract(30, 'day');
    const toDate = to ? dayjs(to) : dayjs();

    return this._adminStatsService.getStats({
      from: fromDate.startOf('day').toDate(),
      to: toDate.endOf('day').toDate(),
      unknownOnly: unknownOnly === 'true' || unknownOnly === '1',
    });
  }
}
