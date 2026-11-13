/**
 * Sessão administrativa: um token JWT assinado (HS256, biblioteca `jose`)
 * guardado em cookie httpOnly + SameSite=Lax + Secure (em produção).
 *
 * Este arquivo NÃO acessa o banco, para poder ser usado no middleware
 * (Edge Runtime). A verificação completa — administrador ainda ativo e
 * versão da sessão válida — é feita em `requireAdmin()` (./guard.ts).
 */
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'reservas_sessao';

export interface SessionPayload {
  sub: string; // id do administrador
  name: string;
  ver: number; // sessionVersion
}

/** Valores de exemplo publicados no repositório: nunca podem ser usados como segredo. */
const EXAMPLE_SECRETS = ['troque-por-um-segredo', 'gere-um-segredo', 'segredo-de-teste'];

export function authSecretProblem(secret = process.env.AUTH_SECRET): string | null {
  if (!secret || secret.length < 32) return 'AUTH_SECRET ausente ou muito curto (mínimo de 32 caracteres).';
  const isTestEnv = process.env.NODE_ENV === 'test';
  if (!isTestEnv && EXAMPLE_SECRETS.some((s) => secret.includes(s))) {
    return 'AUTH_SECRET ainda é o valor de exemplo do repositório. Gere um segredo aleatório.';
  }
  return null;
}

function secretKey(): Uint8Array {
  const problem = authSecretProblem();
  if (problem) {
    // Sem segredo válido ninguém consegue entrar (e ninguém consegue forjar sessões).
    console.error(`[segurança] ${problem} Execute: node scripts/preparar-env.mjs ou veja o README.`);
    throw new Error(problem);
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export function sessionMaxAgeSeconds(): number {
  const hours = Number(process.env.SESSION_HOURS ?? 12);
  return Math.max(1, Number.isFinite(hours) ? hours : 12) * 3600;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, ver: payload.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAgeSeconds()}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { sub: payload.sub, name: String(payload.name ?? ''), ver: Number(payload.ver ?? 0) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && !(process.env.APP_URL ?? '').startsWith('http://'),
    path: '/',
    maxAge: sessionMaxAgeSeconds(),
  };
}
