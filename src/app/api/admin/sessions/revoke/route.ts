import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/api-admin';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { revokeSessions } from '@/server/services/admins';

/**
 * Encerra as sessões deste administrador em TODOS os aparelhos e renova
 * apenas a sessão atual (quem clicou continua conectado).
 */
export const POST = adminRoute(async (_req, admin) => {
  const updated = await revokeSessions(admin.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken({ sub: updated.id, name: updated.name, ver: updated.sessionVersion }), sessionCookieOptions());
  return res;
});
