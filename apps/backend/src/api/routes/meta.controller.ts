import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MetaCallbacksService } from '@gitroom/nestjs-libraries/database/prisma/meta/meta.callbacks.service';
import { MetaSignedRequestDto } from '@gitroom/nestjs-libraries/dtos/meta/meta.signed.request.dto';

// Public (no auth) callbacks set in the Meta app dashboards (Facebook Login,
// Instagram Login and Threads apps): Deauthorize callback URL and Data
// Deletion Request URL. They always answer 200.
@ApiTags('Meta')
@Controller('/public/meta')
export class MetaController {
  constructor(private _metaCallbacksService: MetaCallbacksService) {}

  @Post('/deauthorize')
  @HttpCode(200)
  deauthorize(@Body() body: MetaSignedRequestDto) {
    return this._metaCallbacksService.deauthorize(body?.signed_request);
  }

  @Post('/data-deletion')
  @HttpCode(200)
  dataDeletion(@Body() body: MetaSignedRequestDto) {
    return this._metaCallbacksService.dataDeletion(body?.signed_request);
  }

  @Get('/deletion-status')
  @Header('Content-Type', 'text/html; charset=utf-8')
  deletionStatus(@Query('code') code: string) {
    const status = this._metaCallbacksService.deletionStatus(code);

    const message = status
      ? `<p>We received your data deletion request on ${status.requestedAt.toUTCString()} and processed it.</p>
         <p>The Facebook, Instagram and Threads channels linked to your Meta account, their access tokens and their posts were deleted from PostCherry.</p>
         <p>Confirmation code: <strong>${status.code}</strong></p>`
      : `<p>We could not find a data deletion request with this confirmation code.</p>`;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PostCherry - Data deletion status</title>
  </head>
  <body style="font-family: sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; line-height: 1.5; color: #1f1f1f;">
    <h1>Data deletion status</h1>
    ${message}
    <p>Questions? Read <a href="https://postcherry.com/data-deletion">postcherry.com/data-deletion</a>.</p>
  </body>
</html>`;
  }
}
