/**
 * Testes de segurança do acesso administrativo.
 *
 * O primeiro teste percorre TODAS as rotas em src/app/api/admin/** e garante
 * que cada método responde 401 sem sessão. Se alguém criar uma rota nova
 * esquecendo a proteção (adminRoute/requireAdmin), este teste falha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/db';
import { middleware } from '@/middleware';
import { authSecretProblem, createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { makeAdmin, makeRoom, requestInput, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const API_ADMIN = path.resolve(__dirname, '..', 'src', 'app', 'api', 'admin');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(full) : e.name === 'route.ts' ? [full] : [];
  });
}

describe('todas as rotas administrativas exigem login', () => {
  const files = routeFiles(API_ADMIN);

  it('encontra as rotas administrativas', () => {
    expect(files.length).toBeGreaterThan(25);
  });

  it.each(files.map((f) => [path.relative(API_ADMIN, f).replace(/\\/g, '/'), f]))('%s → 401 sem sessão', async (_name, file) => {
    const mod = await import(/* @vite-ignore */ file);
    const exported = METHODS.filter((m) => typeof mod[m] === 'function');
    expect(exported.length).toBeGreaterThan(0);
    for (const method of exported) {
      const req = new NextRequest('http://localhost:3000/api/admin/x', {
        method,
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
        headers: { 'content-type': 'application/json' },
      });
      const res: Response = await mod[method](req, { params: Promise.resolve({ id: 'x', exceptionId: 'x' }) });
      expect(res.status, `${method} ${file}`).toBe(401);
    }
  });

  it('nenhum dado foi alterado pelas chamadas sem sessão', async () => {
    expect(await prisma.room.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe('sessão', () => {
  const dashboard = async (cookie?: string) => {
    const { GET } = await import('@/app/api/admin/dashboard/route');
    const req = new NextRequest('http://localhost:3000/api/admin/dashboard', { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });
    return (await GET(req, { params: Promise.resolve({}) })).status;
  };

  it('token assinado com outro segredo é recusado', async () => {
    const admin = await makeAdmin();
    const forged = await new SignJWT({ name: 'x', ver: admin.sessionVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('outro-segredo-qualquer-com-mais-de-32-caracteres'));
    expect(await dashboard(forged)).toBe(401);
  });

  it('token sem assinatura (alg none) é recusado', async () => {
    const admin = await makeAdmin();
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: admin.id, ver: 1, exp: 9999999999 })}.`;
    expect(await dashboard(unsigned)).toBe(401);
  });

  it('token expirado é recusado', async () => {
    const admin = await makeAdmin();
    const expired = await new SignJWT({ name: 'x', ver: admin.sessionVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    expect(await dashboard(expired)).toBe(401);
  });

  it('"encerrar sessões em outros aparelhos" invalida os tokens antigos', async () => {
    const admin = await makeAdmin();
    const oldToken = await createSessionToken({ sub: admin.id, name: admin.name, ver: admin.sessionVersion });
    expect(await dashboard(oldToken)).toBe(200);
    const { POST } = await import('@/app/api/admin/sessions/revoke/route');
    const res = await POST(new NextRequest('http://localhost:3000/api/admin/sessions/revoke', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${oldToken}` } }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await dashboard(oldToken)).toBe(401);
    const newToken = res.headers.get('set-cookie')!.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
    expect(await dashboard(newToken)).toBe(200);
  });

  it('segredos de exemplo do repositório são rejeitados', () => {
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect(authSecretProblem('troque-por-um-segredo-aleatorio-com-mais-de-32-caracteres')).toMatch(/exemplo/);
      expect(authSecretProblem('gere-um-segredo-aleatorio-com-mais-de-32-caracteres')).toMatch(/exemplo/);
      expect(authSecretProblem('curto')).toMatch(/curto/);
      expect(authSecretProblem('Yq3v9Zr1Lm8Kp2Xw7Tn4Bc6Df0Gh5Js9Ae1Ru3Vo8')).toBeNull();
    } finally {
      env.NODE_ENV = original;
    }
  });
});

describe('login', () => {
  const login = async (email: string, password: string) => {
    const { POST } = await import('@/app/api/auth/login/route');
    return POST(new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }), { params: Promise.resolve({}) });
  };

  it('mesma mensagem para e-mail inexistente e senha errada (não revela quem é administrador)', async () => {
    await makeAdmin('existe@exemplo.local');
    const a = await (await login('existe@exemplo.local', 'errada123')).json();
    const b = await (await login('naoexiste@exemplo.local', 'errada123')).json();
    expect(a.error.message).toBe(b.error.message);
  });

  it('tentativas erradas e logins ficam na auditoria', async () => {
    const admin = await makeAdmin('aud@exemplo.local');
    await login('aud@exemplo.local', 'errada123');
    expect((await login('aud@exemplo.local', 'Senha123')).status).toBe(200);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: admin.id }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);
    expect(actions).toEqual(['ADMIN_LOGIN_FAILED', 'ADMIN_LOGIN']);
  });

  it('cookie de sessão é httpOnly e SameSite', async () => {
    await makeAdmin('cookie@exemplo.local');
    const cookie = (await login('cookie@exemplo.local', 'Senha123')).headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});

describe('outras proteções', () => {
  it('bloqueia envio vindo de outro site mesmo sem cabeçalho Origin', async () => {
    const req = new NextRequest('http://localhost:3000/api/public/requests', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
    expect((await middleware(req)).status).toBe(403);
  });

  it('recusa corpo de requisição grande demais', async () => {
    const room = await makeRoom();
    const { POST } = await import('@/app/api/public/requests/route');
    const huge = JSON.stringify({ ...requestInput(room.id), equipmentIds: Array.from({ length: 20000 }, (_, i) => `id-${i}`) });
    const res = await POST(new NextRequest('http://localhost:3000/api/public/requests', { method: 'POST', body: huge }), { params: Promise.resolve({}) });
    expect(res.status).toBe(413);
    expect(await prisma.reservationRequest.count()).toBe(0);
  });

  it('a API pública não expõe dados pessoais dos solicitantes', async () => {
    const room = await makeRoom();
    const { createPublicRequest, approveRequest } = await import('@/server/services/requests');
    const admin = await makeAdmin();
    const r = await createPublicRequest(requestInput(room.id, { requesterName: 'Nome Secreto Silva', contactPhone: '(11) 98888-7777', purpose: 'Assunto confidencial' }));
    const req = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: r.protocol } });
    await approveRequest(req.id, {}, admin.id);
    const date = requestInput(room.id).date;
    const { GET: day } = await import('@/app/api/public/day/route');
    const { GET: cal } = await import('@/app/api/public/calendar/route');
    const bodies = [
      await (await day(new NextRequest(`http://localhost:3000/api/public/day?date=${date}`), { params: Promise.resolve({}) })).text(),
      await (await cal(new NextRequest(`http://localhost:3000/api/public/calendar?from=${date}&to=${date}`), { params: Promise.resolve({}) })).text(),
    ];
    for (const body of bodies) {
      expect(body).not.toContain('Nome Secreto');
      expect(body).not.toContain('98888');
      expect(body).not.toContain('confidencial');
    }
  });
});
