/**
 * Testes de INTEGRAÇÃO (banco de testes real): solicitações, fila,
 * aprovação e proteção contra concorrência.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { addDays, todayString, zonedToUtc } from '@/lib/time';
import { approveRequest, createPublicRequest, decideRequest, listQueue, lookupProtocol } from '@/server/services/requests';
import { createAdminReservation } from '@/server/services/reservations';
import { getDayAvailability } from '@/server/services/calendar';
import { evaluateBooking } from '@/server/services/booking';
import { futureWeekday, makeAdmin, makeRoom, requestInput, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe('solicitação pública', () => {
  // Cenário 1
  it('25 participantes em sala de capacidade 20: rejeita e sugere alternativas', async () => {
    const small = await makeRoom({ name: 'Sala Pequena', capacity: 20 });
    await makeRoom({ name: 'Salão Grande', capacity: 50 });
    const err = await expectAppError(createPublicRequest(requestInput(small.id, { participants: 25 })), 'UNAVAILABLE');
    expect(err.message).toBe('Esta sala possui capacidade máxima de 20 pessoas. Selecione uma sala com capacidade adequada.');
    const details = err.details as { alternatives: { name: string }[] };
    expect(details.alternatives.map((a) => a.name)).toEqual(['Salão Grande']);
    expect(await prisma.reservationRequest.count()).toBe(0);
  });

  it('pedido válido: grava com protocolo, horário do servidor e "Aguardando aprovação"', async () => {
    const room = await makeRoom();
    const before = Date.now();
    const res = await createPublicRequest(requestInput(room.id));
    expect(res.status).toBe('PENDING');
    expect(res.protocol).toMatch(/^\d{4}-\d{6}$/);
    expect(res.accessCode).toHaveLength(8);
    expect(res.receivedAt.getTime()).toBeGreaterThanOrEqual(before - 5000);
    // Consulta segura: precisa do código; código errado não revela nada.
    const found = await lookupProtocol(res.protocol, res.accessCode);
    expect(found.statusLabel).toBe('Aguardando aprovação');
    expect(found).not.toHaveProperty('contactPhone');
    await expectAppError(lookupProtocol(res.protocol, 'ERRADO12'), 'NOT_FOUND');
  });

  // Cenário 8
  it('sala desativada: impede novas solicitações e reservas', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom({ active: false });
    const err = await expectAppError(createPublicRequest(requestInput(room.id)), 'UNAVAILABLE');
    expect(err.message).toContain('desativada');
    const date = futureWeekday(4);
    await expectAppError(
      createAdminReservation(
        { roomId: room.id, title: 'X', publicTitle: null, showPublicTitle: false, responsible: 'Y', date, startTime: '09:00', endTime: '10:00', participants: 5, equipmentIds: [], notes: null, reason: null },
        admin.id,
      ),
      'UNAVAILABLE',
    );
  });

  // Cenário 12
  it('solicitação em horário passado: impede', async () => {
    const room = await makeRoom();
    const err = await expectAppError(createPublicRequest(requestInput(room.id, { date: addDays(todayString(), -1) })), 'UNAVAILABLE');
    expect(err.message).toContain('já passaram');
  });

  it('pedido conflitante com reserva confirmada: informa que a sala já está reservada', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(4);
    await createAdminReservation(
      { roomId: room.id, title: 'Interna', publicTitle: null, showPublicTitle: false, responsible: 'R', date, startTime: '14:00', endTime: '16:00', participants: 5, equipmentIds: [], notes: null, reason: null },
      admin.id,
    );
    const err = await expectAppError(createPublicRequest(requestInput(room.id, { date, startTime: '15:00', endTime: '17:00' })), 'UNAVAILABLE');
    expect(err.message).toBe('A sala já está reservada neste horário.');
    // Privacidade: o título interno não aparece para o público.
    expect(JSON.stringify(err.details)).not.toContain('Interna');
  });
});

describe('fila cronológica e concorrência', () => {
  // Cenário 6
  it('duas solicitações concorrentes: mantém a ordem cronológica e sinaliza a disputa', async () => {
    const room = await makeRoom();
    const date = futureWeekday(5);
    const first = await createPublicRequest(requestInput(room.id, { date, startTime: '09:00', endTime: '11:00', requesterName: 'Primeiro Solicitante' }));
    const second = await createPublicRequest(requestInput(room.id, { date, startTime: '10:00', endTime: '12:00', requesterName: 'Segundo Solicitante' }));
    expect(second.hasCompetition).toBe(true);

    const queue = await listQueue({ statuses: ['PENDING'] });
    expect(queue.map((q) => q.protocol)).toEqual([first.protocol, second.protocol]);
    expect(queue[0].isOldestInCompetition).toBe(true);
    expect(queue[1].isOldestInCompetition).toBe(false);
    expect(queue[1].competitors.map((c) => c.protocol)).toEqual([first.protocol]);
  });

  // Cenário 7
  it('aprovação: vira reserva confirmada e atualiza a disponibilidade automaticamente', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(5);
    const a = await createPublicRequest(requestInput(room.id, { date, startTime: '09:00', endTime: '11:00' }));
    const b = await createPublicRequest(requestInput(room.id, { date, startTime: '10:00', endTime: '12:00' }));
    const reqA = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: a.protocol } });

    const result = await approveRequest(reqA.id, {}, admin.id);
    expect(result.reservation.status).toBe('CONFIRMED');
    expect(result.lostAvailability).toEqual([b.protocol]);

    // A página pública passa a mostrar o horário como ocupado.
    const day = await getDayAvailability(date, { startTime: '09:30', endTime: '10:30', participants: 5 });
    const card = day.find((r) => r.id === room.id)!;
    expect(card.status?.available).toBe(false);
    expect(card.busy).toHaveLength(1);

    // O pedido B aparece como "perdeu a disponibilidade" e não pode mais ser aprovado.
    const queue = await listQueue({ statuses: ['PENDING'] });
    expect(queue[0].protocol).toBe(b.protocol);
    expect(queue[0].currentIssues[0].reason).toBe('CONFLICT');
    expect(queue[0].availabilityLostAt).not.toBeNull();
    const reqB = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: b.protocol } });
    await expectAppError(approveRequest(reqB.id, { priorityJustification: 'teste' }, admin.id), 'UNAVAILABLE');
  });

  it('aprovar pedido posterior exige justificativa e registra no histórico', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(5);
    await createPublicRequest(requestInput(room.id, { date, startTime: '09:00', endTime: '11:00' }));
    const b = await createPublicRequest(requestInput(room.id, { date, startTime: '10:00', endTime: '12:00' }));
    const reqB = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: b.protocol } });

    await expectAppError(approveRequest(reqB.id, {}, admin.id), 'EARLIER_REQUEST_PENDING');
    await approveRequest(reqB.id, { priorityJustification: 'Reunião urgente do conselho' }, admin.id);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: reqB.id, action: 'REQUEST_APPROVED_OUT_OF_ORDER' } });
    expect(log.summary).toContain('Reunião urgente do conselho');
  });

  // Cenário 10
  it('duas aprovações simultâneas: apenas uma reserva conflitante é confirmada', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(5);
    const a = await createPublicRequest(requestInput(room.id, { date, startTime: '09:00', endTime: '11:00' }));
    const b = await createPublicRequest(requestInput(room.id, { date, startTime: '09:30', endTime: '10:30' }));
    const ids = await prisma.reservationRequest.findMany({ where: { protocol: { in: [a.protocol, b.protocol] } }, orderBy: { sequence: 'asc' } });

    const results = await Promise.allSettled([
      approveRequest(ids[0].id, {}, admin.id),
      approveRequest(ids[1].id, { priorityJustification: 'Teste de concorrência' }, admin.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // A perdedora falha por regra de negócio (horário ocupado), não por erro de banco/deadlock.
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(AppError);
    expect(['UNAVAILABLE', 'EARLIER_REQUEST_PENDING']).toContain(loser.reason.code);
    expect(await prisma.reservation.count({ where: { roomId: room.id, status: 'CONFIRMED' } })).toBe(1);
  });

  it('rejeição exige justificativa e fica no histórico', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const a = await createPublicRequest(requestInput(room.id));
    const req = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: a.protocol } });
    await decideRequest(req.id, { action: 'reject', reason: 'Sala reservada para manutenção', publicMessage: null }, admin.id);
    const found = await lookupProtocol(a.protocol, a.accessCode);
    expect(found.status).toBe('REJECTED');
    expect(await prisma.auditLog.count({ where: { entityId: req.id, action: 'REQUEST_REJECTED' } })).toBe(1);
  });
});

describe('reservas confirmadas', () => {
  // Cenário 2
  it('duas reservas confirmadas simultâneas na mesma sala: impede', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(3);
    const input = { roomId: room.id, title: 'R', publicTitle: null, showPublicTitle: false, responsible: 'X', date, startTime: '14:00', endTime: '16:00', participants: 5, equipmentIds: [], notes: null, reason: null };
    const results = await Promise.allSettled([
      createAdminReservation(input, admin.id),
      createAdminReservation({ ...input, startTime: '15:00', endTime: '17:00' }, admin.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // A perdedora falha por regra de negócio (horário ocupado), não por erro de banco/deadlock.
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(AppError);
    expect(['UNAVAILABLE', 'EARLIER_REQUEST_PENDING']).toContain(loser.reason.code);
    expect(await prisma.reservation.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  it('restrição do banco impede sobreposição mesmo ignorando a aplicação', async () => {
    const room = await makeRoom();
    const date = futureWeekday(3);
    const data = { roomId: room.id, title: 'A', responsible: 'X', participants: 2, startAt: zonedToUtc(date, '14:00'), endAt: zonedToUtc(date, '16:00') };
    await prisma.reservation.create({ data });
    await expect(prisma.reservation.create({ data: { ...data, startAt: zonedToUtc(date, '15:00'), endAt: zonedToUtc(date, '17:00') } })).rejects.toThrow(
      /Reservation_no_overlap|23P01|exclusion/i,
    );
    // Consecutivo é permitido (intervalo semiaberto).
    await expect(prisma.reservation.create({ data: { ...data, startAt: zonedToUtc(date, '16:00'), endAt: zonedToUtc(date, '18:00') } })).resolves.toBeTruthy();
  });

  // Cenário 11 (integração)
  it('horários consecutivos sem sobreposição: permite ambos', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(3);
    const input = { roomId: room.id, title: 'R', publicTitle: null, showPublicTitle: false, responsible: 'X', date, startTime: '13:00', endTime: '14:00', participants: 5, equipmentIds: [], notes: null, reason: null };
    await createAdminReservation(input, admin.id);
    await createAdminReservation({ ...input, startTime: '14:00', endTime: '16:00' }, admin.id);
    await createAdminReservation({ ...input, startTime: '16:00', endTime: '18:00' }, admin.id);
    expect(await prisma.reservation.count({ where: { status: 'CONFIRMED' } })).toBe(3);
    const res = await evaluateBooking(prisma, { room, startAt: zonedToUtc(date, '15:00'), endAt: zonedToUtc(date, '17:00'), participants: 5 });
    expect(res.available).toBe(false);
  });
});
