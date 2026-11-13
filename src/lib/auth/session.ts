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

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET ausente ou muito curto (mínimo de 32 caracteres). Configure o arquivo .env.');
  }
  return new TextEncoder().encode(secret);
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
