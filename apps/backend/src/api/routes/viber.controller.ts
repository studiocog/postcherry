import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

// Public (no auth) webhook for Viber Channels. Viber only lets a Channel post
// through the API once a webhook is set, and checks it with a callback that
// must answer 200. Posts are never delivered to it, so nothing is processed.
@ApiTags('Viber')
@Controller('/public/viber')
export class ViberController {
  @Post('/webhook')
  @HttpCode(200)
  webhook() {
    return {};
  }
}
