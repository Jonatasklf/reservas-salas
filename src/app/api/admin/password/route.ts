import { NextResponse } from 'next/server';
import { parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { changePasswordSchema } from '@/lib/validation';
import { changePassword } from '@/server/services/admins';

/** Troca a própria senha e renova a sessão (as demais sessões são encerradas). */
export const POST = adminRoute(async (req, admin) => {
  const { currentPassword, newPassword } = await parseJson(req, changePasswordSchema);
  const updated = await changePassword(admin.id, currentPassword, newPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ sub: updated.id, name: updated.name, ver: updated.sessionVersion }), sessionCookieOptions());
  return res;
});
