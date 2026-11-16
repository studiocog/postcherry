import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { AdminService } from '@gitroom/nestjs-libraries/database/prisma/admin/admin.service';
import {
  assertSuperAdmin,
  checkAdminSession,
  setAdminSession,
} from '@gitroom/backend/services/auth/admin.session';

// Every super admin power needs a live HQ session (the authenticator app
// code of the last 30 minutes of use). Extends the session on each request.
// 428 tells the hq pages to ask for the code (401 would sign the app out).
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private _adminService: AdminService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    // @ts-ignore
    assertSuperAdmin(req.user as User);

    const session = await checkAdminSession(this._adminService, req);
    if (!session) {
      throw new HttpException('admin_session_required', 428);
    }
    setAdminSession(res, session.adminId, session.nonce);
    return true;
  }
}
