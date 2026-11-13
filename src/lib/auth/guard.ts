/**
 * Proteção das rotas administrativas da API.
 * Toda rota em src/app/api/admin/** chama `requireAdmin(req)` antes de
 * qualquer operação (defesa em profundidade, além do middleware).
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { unauthorized } from '@/lib/errors';
import { SESSION_COOKIE, verifySessionToken } from './session';

export interface CurrentAdmin {
  id: string;
  name: string;
  email: string;
}

export async function getAdminFromRequest(req: NextRequest): Promise<CurrentAdmin | null> {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const admin = await prisma.admin.findUnique({ where: { id: session.sub } });
  if (!admin || !admin.active || admin.sessionVersion !== session.ver) return null;
  return { id: admin.id, name: admin.name, email: admin.email };
}

export async function requireAdmin(req: NextRequest): Promise<CurrentAdmin> {
  const admin = await getAdminFromRequest(req);
  if (!admin) throw unauthorized();
  return admin;
}

/** Para páginas (Server Components): lê a sessão a partir dos cookies. */
export async function getAdminFromCookies(): Promise<CurrentAdmin | null> {
  const { cookies } = await import('next/headers');
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const admin = await prisma.admin.findUnique({ where: { id: session.sub } });
  if (!admin || !admin.active || admin.sessionVersion !== session.ver) return null;
  return { id: admin.id, name: admin.name, email: admin.email };
}
