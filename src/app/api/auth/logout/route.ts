import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api-admin';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const POST = publicRoute(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
