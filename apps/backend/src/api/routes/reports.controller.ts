import { Body, Controller, Post, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ReportsService } from '@gitroom/nestjs-libraries/database/prisma/reports/reports.service';
import {
  EmailReportDto,
  ReportRequestDto,
} from '@gitroom/nestjs-libraries/dtos/reports/report.dto';

// Any member of the workspace can create a report, same as the Analytics page.
// POST so the list of channels travels in the body
@ApiTags('Reports')
@Controller('/reports')
export class ReportsController {
  constructor(private _reportsService: ReportsService) {}

  @Post('/pdf')
  async downloadPdf(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ReportRequestDto
  ) {
    const { buffer, filename } = await this._reportsService.generatePdf(
      org,
      body
    );

    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  // Rate limited per workspace and per user in the service
  @Post('/email')
  emailReport(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: EmailReportDto
  ) {
    return this._reportsService.emailReport(org, user.id, body);
  }
}
