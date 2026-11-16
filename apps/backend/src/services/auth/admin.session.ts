import crypto from 'crypto';
import { HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { sign, verify } from 'jsonwebtoken';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { AdminService } from '@gitroom/nestjs-libraries/database/prisma/admin/admin.service';

// The admin area (hq) needs a second login step: after an authenticator app
// code, the admin_session cookie is valid for 30 minutes and every admin
// request extends it, so 30 minutes without using the admin area signs out.
export const ADMIN_SESSION_MINUTES = 30;
const COOKIE = 'admin_session';

// Its own key: other tokens of the app are signed with JWT_SECRET over
// request bodies, so one of them must never pass as an admin session
const sessionKey = () =>
  crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET}:admin-session`)
    .digest('hex');

const cookieOptions = (expires: Date) => ({
  domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
  // hq and the API are the same site: a strict cookie can't be sent by
  // another website's form
  ...(!process.env.NOT_SECURED
    ? { secure: true, httpOnly: true, sameSite: 'strict' as const }
    : {}),
  expires,
});

// The user of the login token. While a super admin views the app as a
// customer, the request user is that customer, the token still says who is
// really signed in.
export const requestUserId = (req: Request): string | null => {
  try {
    const auth = (req.headers.auth as string) || req.cookies?.auth;
    const payload = AuthService.verifyJWT(auth) as { id?: string } | null;
    return payload?.id || null;
  } catch {
    return null;
  }
};

const readAdminSession = (req: Request) => {
  try {
    const token =
      req.cookies?.[COOKIE] ||
      // without https the frontend sends the cookies as headers
      (process.env.NOT_SECURED
        ? (req.headers['admin-session'] as string)
        : undefined);
    const payload = verify(token, sessionKey()) as {
      adminSession?: string;
      nonce?: string;
    };
    return payload?.adminSession && payload?.nonce
      ? { adminId: payload.adminSession, nonce: payload.nonce }
      : null;
  } catch {
    return null;
  }
};

export const setAdminSession = (
  res: Response,
  adminId: string,
  nonce: string
) => {
  const expires = new Date(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000);
  res.cookie(
    COOKIE,
    sign(
      {
        adminSession: adminId,
        nonce,
        exp: Math.floor(expires.getTime() / 1000),
      },
      sessionKey()
    ),
    cookieOptions(expires)
  );
};

export const clearAdminSession = (res: Response) => {
  res.cookie(COOKIE, '', { ...cookieOptions(new Date(0)), maxAge: -1 });
};

// The signed-in admin when the request has a live HQ session: the cookie
// belongs to the user of the login token and its nonce is the current one
export const checkAdminSession = async (
  adminService: AdminService,
  req: Request
) => {
  const session = readAdminSession(req);
  const adminId = requestUserId(req);
  if (!session || !adminId || session.adminId !== adminId) {
    return null;
  }
  return (await adminService.isSessionValid(adminId, session.nonce))
    ? session
    : null;
};

export const assertSuperAdmin = (user: User) => {
  if (!user?.isSuperAdmin) {
    throw new HttpException('Unauthorized', 400);
  }
};

// The cookie that makes a super admin see the app as a member of a workspace
// (a UserOrganization id), '' stops it
export const setImpersonateCookie = (res: Response, id: string) => {
  res.cookie('impersonate', id, {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          httpOnly: true,
          sameSite: 'none',
        }
      : {}),
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
  });
  if (process.env.NOT_SECURED) {
    res.header('impersonate', id);
  }
};
