/**
 * Wrapper das rotas administrativas: exige administrador autenticado e
 * entrega os parâmetros da rota já resolvidos.
 */
import type { NextRequest } from 'next/server';
import { requireAdmin, type CurrentAdmin } from './auth/guard';
import { handle } from './api';

type Params = Record<string, string>;

export function adminRoute<P extends Params = Params>(
  fn: (req: NextRequest, admin: CurrentAdmin, params: P) => Promise<Response>,
) {
  return handle<{ params: Promise<P> }>(async (req, ctx) => {
    const admin = await requireAdmin(req);
    return fn(req, admin, ((await ctx?.params) ?? {}) as P);
  });
}

export function publicRoute<P extends Params = Params>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return handle<{ params: Promise<P> }>(async (req, ctx) => fn(req, ((await ctx?.params) ?? {}) as P));
}
