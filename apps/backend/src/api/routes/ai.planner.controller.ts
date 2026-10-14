import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { AiPlannerService } from '@gitroom/nestjs-libraries/ai-planner/ai.planner.service';
import { GeneratePlanDto } from '@gitroom/nestjs-libraries/dtos/ai-planner/ai.planner.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('AI Planner')
@Controller('/ai-planner')
export class AiPlannerController {
  constructor(private _aiPlannerService: AiPlannerService) {}

  @Get('/status')
  status() {
    return { configured: this._aiPlannerService.isConfigured() };
  }

  @Post('/generate')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async generate(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GeneratePlanDto,
    @Res({ passthrough: false }) res: Response
  ) {
    // a wrong range or channels is a normal 400, before the stream starts
    const plan = await this._aiPlannerService.preparePlan(org.id, body);

    // the user closed the planner: stop calling OpenAI and free the workspace
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // a plan takes longer than the proxy waits for a silent response
    const ping = setInterval(() => {
      if (!abort.signal.aborted) {
        res.write(JSON.stringify({ name: 'ping' }) + '\n');
      }
    }, 15000);

    try {
      for await (const event of this._aiPlannerService.generatePlan(
        org.id,
        plan,
        abort.signal
      )) {
        if (abort.signal.aborted) {
          break;
        }
        res.write(JSON.stringify(event) + '\n');
      }
    } catch (err) {
      // nothing was sent yet (another plan is running): a real status code
      if (!res.headersSent) {
        throw err;
      }

      // The stream has already started, so the error is the last event of it,
      // the same as the post generator
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong while planning your posts, please try again.';
      if (!abort.signal.aborted) {
        res.write(
          JSON.stringify({ name: 'error', error: true, message }) + '\n'
        );
      }
    } finally {
      clearInterval(ping);
    }

    res.end();
  }
}
