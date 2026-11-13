/**
 * Cenário 9: usuário não autenticado não acessa a área administrativa.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { middleware } from '@/middleware';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { GET as dashboardGET } from '@/app/api/admin/dashboard/route';
import { POST as roomsPOST } from '@/app/api/admin/rooms/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { makeAdmin, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const ctx = { params: Promise.resolve({}) };

describe('proteção da área administrativa', () => {
  it('middleware redireciona páginas /admin para o login', async () => {
    const res = await middleware(new NextRequest('http://localhost:3000/admin/salas'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });

  it('middleware responde 401 para a API administrativa', async () => {
    const res = await middleware(new NextRequest('http://localhost:3000/api/admin/rooms'));
    expect(res.status).toBe(401);
  });

  it('a própria rota recusa requisição sem sessão (defesa em profundidade)', async () => {
    expect((await dashboardGET(new NextRequest('http://localhost:3000/api/admin/dashboard'), ctx)).status).toBe(401);
    const post = new NextRequest('http://localhost:3000/api/admin/rooms', { method: 'POST', body: JSON.stringify({ name: 'X', capacity: 5 }) });
    expect((await roomsPOST(post, ctx)).status).toBe(401);
    expect(await prisma.room.count()).toBe(0);
  });

  it('token falsificado ou de administrador desativado é recusado', async () => {
    const admin = await makeAdmin();
    const forged = new NextRequest('http://localhost:3000/api/admin/dashboard', { headers: { cookie: `${SESSION_COOKIE}=abc.def.ghi` } });
    expect((await dashboardGET(forged, ctx)).status).toBe(401);

    const token = await createSessionToken({ sub: admin.id, name: admin.name, ver: admin.sessionVersion });
    const ok = new NextRequest('http://localhost:3000/api/admin/dashboard', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect((await dashboardGET(ok, ctx)).status).toBe(200);

    await prisma.admin.update({ where: { id: admin.id }, data: { active: false, sessionVersion: { increment: 1 } } });
    const again = new NextRequest('http://localhost:3000/api/admin/dashboard', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect((await dashboardGET(again, ctx)).status).toBe(401);
  });

  it('login com senha errada falha; com senha correta cria cookie httpOnly', async () => {
    await makeAdmin('login@exemplo.local');
    const bad = new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'login@exemplo.local', password: 'errada' }) });
    expect((await loginPOST(bad, ctx)).status).toBe(401);
    const good = new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'login@exemplo.local', password: 'Senha123' }) });
    const res = await loginPOST(good, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/reservas_sessao=.*HttpOnly/i);
  });

  it('bloqueia requisições de outros sites (CSRF)', async () => {
    const req = new NextRequest('http://localhost:3000/api/public/requests', {
      method: 'POST', headers: { origin: 'https://site-malicioso.example', host: 'localhost:3000' },
    });
    expect((await middleware(req)).status).toBe(403);
  });
});
