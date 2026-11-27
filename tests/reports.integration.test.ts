/**
 * Relatórios e registro de atividades.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { addDays, todayString, weekdayOf, zonedToUtc } from '@/lib/time';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { getReport } from '@/server/services/reports';
import { listActivity } from '@/server/services/activity';
import { createAdminReservation } from '@/server/services/reservations';
import { createRecurring } from '@/server/services/recurring';
import { createPublicRequest, decideRequest, approveRequest } from '@/server/services/requests';
import { audit } from '@/server/services/audit';
import { makeAdmin, makeRoom, recurringInput, requestInput, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

/** Sala que funciona todos os dias das 08h às 18h (10 h por dia). */
async function roomOpen8to18(name: string) {
  return prisma.room.create({ data: { name, capacity: 20, openTime: '08:00', closeTime: '18:00' } });
}

describe('relatórios', () => {
  it('calcula horas ocupadas, disponíveis e taxa de ocupação de uma sala', async () => {
    const admin = await makeAdmin();
    const room = await roomOpen8to18('Sala A');
    const day = addDays(todayString(), 3);
    // 2 h de reserva + 1 h de reunião recorrente no mesmo dia = 3 h de 10 h.
    await createAdminReservation(
      { roomId: room.id, title: 'Reunião', publicTitle: null, showPublicTitle: false, responsible: 'X', date: day, startTime: '09:00', endTime: '11:00', participants: 5, equipmentIds: [], notes: null, reason: null },
      admin.id,
    );
    await createRecurring(recurringInput(room.id, { weekdays: [weekdayOf(day)], startTime: '14:00', endTime: '15:00', startDate: day, endDate: day }), admin.id);

    const r = await getReport({ from: day, to: day, roomId: room.id });
    expect(r.perRoom).toHaveLength(1);
    expect(r.perRoom[0]).toMatchObject({ reservations: 1, recurring: 1, occupiedHours: 3, availableHours: 10 });
    expect(r.perRoom[0].occupancyRate).toBeCloseTo(0.3);
    expect(r.usage.occupiedHours).toBe(3);
    // Por dia da semana e por hora (09h, 10h e 14h com 1 h cada).
    expect(r.byWeekday[weekdayOf(day)]).toBe(3);
    expect(r.byHour[9]).toBe(1);
    expect(r.byHour[10]).toBe(1);
    expect(r.byHour[11]).toBe(0);
    expect(r.byHour[14]).toBe(1);
  });

  it('reservas canceladas não contam como horas ocupadas', async () => {
    const admin = await makeAdmin();
    const room = await roomOpen8to18('Sala B');
    const day = addDays(todayString(), 3);
    const res = await createAdminReservation(
      { roomId: room.id, title: 'R', publicTitle: null, showPublicTitle: false, responsible: 'X', date: day, startTime: '09:00', endTime: '12:00', participants: 5, equipmentIds: [], notes: null, reason: null },
      admin.id,
    );
    await prisma.reservation.update({ where: { id: res.id }, data: { status: 'CANCELLED' } });
    const r = await getReport({ from: day, to: day, roomId: room.id });
    expect(r.perRoom[0].occupiedHours).toBe(0);
  });

  it('conta solicitações por situação, taxa de aprovação e tempo de resposta', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = addDays(todayString(), 7);
    const a = await createPublicRequest(requestInput(room.id, { date, startTime: '09:00', endTime: '10:00' }));
    const b = await createPublicRequest(requestInput(room.id, { date, startTime: '11:00', endTime: '12:00' }));
    await createPublicRequest(requestInput(room.id, { date, startTime: '13:00', endTime: '14:00' }));
    const ra = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: a.protocol } });
    const rb = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: b.protocol } });
    await approveRequest(ra.id, {}, admin.id);
    await decideRequest(rb.id, { action: 'reject', reason: 'Indisponível', publicMessage: null }, admin.id);

    const today = todayString();
    const r = await getReport({ from: today, to: today });
    expect(r.requests.total).toBe(3);
    expect(r.requests.byStatus).toMatchObject({ APPROVED: 1, REJECTED: 1, PENDING: 1 });
    expect(r.requests.approvalRate).toBe(0.5);
    expect(r.requests.avgResponseHours).not.toBeNull();
    expect(r.usage.reservationsFromRequests).toBe(0); // a reserva é em outra data (fora do período)
  });

  it('conta mensagens enviadas e com falha por canal', async () => {
    const make = (action: string, status: string) =>
      audit(prisma, { action, entityType: 'ReservationRequest', entityId: 'x', summary: 's', details: { status, kind: 'confirmacao' } });
    await make('NOTIFICATION_WHATSAPP', 'sent');
    await make('NOTIFICATION_WHATSAPP', 'sent');
    await make('NOTIFICATION_WHATSAPP', 'failed');
    await make('NOTIFICATION_EMAIL', 'sent');
    const today = todayString();
    const r = await getReport({ from: today, to: today });
    expect(r.notifications).toEqual({ whatsappSent: 2, whatsappFailed: 1, emailSent: 1, emailFailed: 0 });
  });

  it('exporta CSV com acentos (BOM) e protegido contra fórmulas', async () => {
    const admin = await makeAdmin();
    await prisma.room.create({ data: { name: '=CMD()', capacity: 5 } });
    const token = await createSessionToken({ sub: admin.id, name: admin.name, ver: admin.sessionVersion });
    const today = todayString();
    const { GET } = await import('@/app/api/admin/relatorios/export/route');
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/admin/relatorios/export?de=${today}&ate=${today}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 (acentos no Excel)
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"\'=CMD()"');
    expect(text).toContain('Taxa de ocupação');
  });

  it('recusa período invertido ou longo demais', async () => {
    const admin = await makeAdmin();
    const token = await createSessionToken({ sub: admin.id, name: admin.name, ver: admin.sessionVersion });
    const { GET } = await import('@/app/api/admin/relatorios/route');
    const call = (de: string, ate: string) =>
      GET(new NextRequest(`http://localhost:3000/api/admin/relatorios?de=${de}&ate=${ate}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), { params: Promise.resolve({}) });
    expect((await call('2026-05-10', '2026-05-01')).status).toBe(400);
    expect((await call('2024-01-01', '2026-01-01')).status).toBe(400);
    expect((await call('2026-05-01', '2026-05-31')).status).toBe(200);
  });
});

describe('registro de atividades', () => {
  it('filtra por categoria, autor, texto e período, com paginação', async () => {
    const admin = await makeAdmin();
    await audit(prisma, { adminId: admin.id, action: 'ADMIN_LOGIN', entityType: 'Admin', entityId: admin.id, summary: 'Login realizado (IP 1).' });
    await audit(prisma, { action: 'NOTIFICATION_WHATSAPP', entityType: 'ReservationRequest', entityId: 'r1', summary: 'Protocolo enviado por WhatsApp para (11) 91234-5678.', details: { status: 'sent' } });
    await audit(prisma, { action: 'REQUEST_RECEIVED', entityType: 'ReservationRequest', entityId: 'r1', summary: 'Solicitação recebida pela página pública.' });
    for (let i = 0; i < 5; i++) {
      await audit(prisma, { adminId: admin.id, action: 'ROOM_UPDATED', entityType: 'Room', entityId: `s${i}`, summary: `Sala ${i} atualizada.` });
    }

    expect((await listActivity({})).total).toBe(8);
    const mensagens = await listActivity({ category: 'mensagens' });
    expect(mensagens.items.map((i) => i.action)).toEqual(['NOTIFICATION_WHATSAPP']);
    const solicitacoes = await listActivity({ category: 'solicitacoes' });
    expect(solicitacoes.items.map((i) => i.action)).toEqual(['REQUEST_RECEIVED']); // mensagens ficam fora
    expect((await listActivity({ category: 'acesso' })).total).toBe(1);
    expect((await listActivity({ adminId: 'sistema' })).total).toBe(2);
    expect((await listActivity({ search: 'whatsapp' })).total).toBe(1);

    const p1 = await listActivity({ category: 'salas', pageSize: 2, page: 1 });
    expect(p1).toMatchObject({ total: 5, pages: 3 });
    expect(p1.items[0].summary).toBe('Sala 4 atualizada.'); // mais recentes primeiro
    expect((await listActivity({ category: 'salas', pageSize: 2, page: 3 })).items).toHaveLength(1);

    const tomorrow = addDays(todayString(), 1);
    expect((await listActivity({ from: tomorrow })).total).toBe(0);
  });

  it('o envio do protocolo fica registrado no histórico da solicitação', async () => {
    // Em testes os canais não estão configurados: nada é tentado e nada é registrado como falha.
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: 'p@exemplo.local' }));
    expect(res.delivery).toMatchObject({ whatsapp: 'not_attempted', email: 'not_attempted' });
    const req = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: res.protocol } });
    const actions = (await prisma.auditLog.findMany({ where: { entityId: req.id } })).map((l) => l.action);
    expect(actions).toEqual(['REQUEST_RECEIVED']);
    // zonedToUtc usado só para garantir que o fuso está carregado nos testes
    expect(zonedToUtc(todayString(), '00:00')).toBeInstanceOf(Date);
  });
});
