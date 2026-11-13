/**
 * Testes de INTEGRAÇÃO das reuniões recorrentes.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { addDays, todayString, utcMidnightToDateString, zonedToUtc } from '@/lib/time';
import { evaluateBooking } from '@/server/services/booking';
import { createPublicRequest } from '@/server/services/requests';
import { createAdminReservation } from '@/server/services/reservations';
import {
  addOccurrenceException, createRecurring, getRecurringDetail, previewRecurrence, removeOccurrenceException, updateRecurringFuture,
} from '@/server/services/recurring';
import { futureWeekday, makeAdmin, makeRoom, recurringInput, requestInput, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const busyAt = async (room: { id: string }, date: string, start = '19:00', end = '21:00') => {
  const r = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
  return !(await evaluateBooking(prisma, { room: r, startAt: zonedToUtc(date, start), endAt: zonedToUtc(date, end), participants: 5 })).available;
};

describe('reuniões recorrentes', () => {
  // Cenário 3
  it('semanal: ocupa automaticamente todas as terças futuras', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    await createRecurring(recurringInput(room.id), admin.id);
    for (const weeks of [1, 2, 10, 40]) expect(await busyAt(room, futureWeekday(2, weeks))).toBe(true);
    expect(await busyAt(room, futureWeekday(3, 1))).toBe(false); // quarta continua livre
    expect(await busyAt(room, futureWeekday(2, 1), '17:00', '19:00')).toBe(false); // antes, consecutivo
    // Nenhuma ocorrência é gravada no banco: só a regra.
    expect(await prisma.reservation.count()).toBe(0);

    // Pedido público no mesmo horário é recusado.
    const err = await createPublicRequest(requestInput(room.id, { date: futureWeekday(2, 3), startTime: '20:00', endTime: '21:30' })).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('A sala já está reservada neste horário.');
  });

  // Cenário 4
  it('cancelar uma ocorrência libera somente aquele horário', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const meeting = await createRecurring(recurringInput(room.id), admin.id);
    const target = futureWeekday(2, 2);
    await addOccurrenceException(meeting.id, { originalDate: target, type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason: 'Feriado' }, admin.id);
    expect(await busyAt(room, target)).toBe(false);
    expect(await busyAt(room, futureWeekday(2, 1))).toBe(true);
    expect(await busyAt(room, futureWeekday(2, 3))).toBe(true);
  });

  it('não sobrescreve reservas existentes: lista as datas conflitantes antes de salvar', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const date = futureWeekday(2, 2);
    await createAdminReservation(
      { roomId: room.id, title: 'Evento', publicTitle: null, showPublicTitle: false, responsible: 'X', date, startTime: '20:00', endTime: '22:00', participants: 5, equipmentIds: [], notes: null, reason: null },
      admin.id,
    );
    const preview = await previewRecurrence(prisma, recurringInput(room.id));
    expect(preview.conflicts.map((c) => c.date)).toEqual([date]);

    const err = await createRecurring(recurringInput(room.id), admin.id).catch((e) => e);
    expect(err.code).toBe('RECURRENCE_CONFLICTS');
    expect(await prisma.recurringMeeting.count()).toBe(0);

    // Confirmando que a data conflitante fica de fora, a série é criada e a reserva é mantida.
    const meeting = await createRecurring(recurringInput(room.id), admin.id, [date]);
    const detail = await getRecurringDetail(meeting.id);
    expect(detail.exceptions.map((e) => e.originalDate)).toEqual([date]);
    expect(await prisma.reservation.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  // Cenário 5
  it('alterar ocorrências futuras: preserva o histórico e as exceções', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const room2 = await makeRoom({ name: 'Sala Nova' });
    const start = addDays(todayString(), -21);
    const meeting = await createRecurring(recurringInput(room.id, { startDate: start }), admin.id);
    const cancelledLater = futureWeekday(2, 6);
    await addOccurrenceException(meeting.id, { originalDate: cancelledLater, type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason: 'Exceção futura' }, admin.id);

    const effectiveFrom = futureWeekday(2, 3);
    const next = await updateRecurringFuture(meeting.id, effectiveFrom, recurringInput(room2.id, { startDate: start, startTime: '18:00', endTime: '20:00' }), admin.id, { reason: 'Mudança de sala' });

    const old = await prisma.recurringMeeting.findUniqueOrThrow({ where: { id: meeting.id } });
    expect(old.status).toBe('ENDED');
    expect(utcMidnightToDateString(old.endDate!)).toBe(addDays(effectiveFrom, -1));
    expect(utcMidnightToDateString(old.startDate)).toBe(start); // histórico intacto
    expect(next.previousSeriesId).toBe(meeting.id);

    // Antes da data: série antiga na sala original. Depois: nova sala e horário.
    expect(await busyAt(room, futureWeekday(2, 1))).toBe(true);
    expect(await busyAt(room, futureWeekday(2, 4))).toBe(false);
    expect(await busyAt(room2, futureWeekday(2, 4), '18:00', '20:00')).toBe(true);

    // A exceção futura foi transferida para a nova série e continua valendo.
    const exceptions = await prisma.recurrenceException.findMany({ where: { recurringMeetingId: next.id } });
    expect(exceptions.map((e) => utcMidnightToDateString(e.originalDate))).toEqual([cancelledLater]);
    expect(await busyAt(room2, cancelledLater, '18:00', '20:00')).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'RECURRING_SPLIT' } })).toBe(1);
  });

  it('restaurar ocorrência cancelada só é possível se o horário continuar livre', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const meeting = await createRecurring(recurringInput(room.id), admin.id);
    const target = futureWeekday(2, 2);
    const ex = await addOccurrenceException(meeting.id, { originalDate: target, type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason: null }, admin.id);
    await createAdminReservation(
      { roomId: room.id, title: 'Ocupou o horário', publicTitle: null, showPublicTitle: false, responsible: 'X', date: target, startTime: '19:00', endTime: '20:00', participants: 5, equipmentIds: [], notes: null, reason: null },
      admin.id,
    );
    const err = await removeOccurrenceException(meeting.id, ex.id, admin.id).catch((e) => e);
    expect(err.code).toBe('UNAVAILABLE');
  });

  it('ocorrências passadas não podem ser alteradas', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const meeting = await createRecurring(recurringInput(room.id, { startDate: addDays(todayString(), -30) }), admin.id);
    const past = addDays(futureWeekday(2, 1), -28);
    const err = await addOccurrenceException(meeting.id, { originalDate: past, type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason: null }, admin.id).catch((e) => e);
    expect(err.code).toBe('CONFLICT');
  });
});
