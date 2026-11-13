import { NextResponse } from 'next/server';
import { clientIp, parseJson } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { loginSchema } from '@/lib/validation';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { login } from '@/server/services/admins';

export const POST = publicRoute(async (req) => {
  const { email, password } = await parseJson(req, loginSchema);
  const admin = await login(email, password, clientIp(req));
  const token = await createSessionToken({ sub: admin.id, name: admin.name, ver: admin.sessionVersion });
  const res = NextResponse.json({ ok: true, name: admin.name });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
