/**
 * OCUPAÇÃO DAS SALAS (camada que lê o banco)
 * =============================================================================
 * Reúne, para um período, tudo o que ocupa as salas:
 *   1. reservas confirmadas (administrativas e solicitações aprovadas);
 *   2. ocorrências de reuniões recorrentes (já com exceções e suspensões);
 *   3. bloqueios administrativos (feriados, manutenção etc.).
 *
 * O resultado (BusySlot[]) alimenta as regras puras de ./availability.ts.
 * Solicitações PENDENTES não ocupam a sala — elas entram na fila de aprovação.
 * =============================================================================
 */
import type { RecurrenceException, RecurringMeeting } from '@prisma/client';
import type { Db } from '@/lib/db';
import { addDays, utcMidnightToDateString, utcToDateString } from '@/lib/time';
import type { BusySlot } from './availability';
import { expandOccurrences, type ExceptionLike, type Occurrence, type RecurringMeetingLike } from './recurrence';

export function toMeetingLike(m: RecurringMeeting): RecurringMeetingLike {
  return {
    id: m.id,
    name: m.name,
    publicTitle: m.publicTitle,
    showPublicTitle: m.showPublicTitle,
    roomId: m.roomId,
    frequency: m.frequency,
    interval: m.interval,
    weekdays: m.weekdays,
    monthDay: m.monthDay,
    nthWeek: m.nthWeek,
    startDate: utcMidnightToDateString(m.startDate),
    endDate: m.endDate ? utcMidnightToDateString(m.endDate) : null,
    startTime: m.startTime,
    endTime: m.endTime,
    participants: m.participants,
    status: m.status,
    suspendedFrom: m.suspendedFrom ? utcMidnightToDateString(m.suspendedFrom) : null,
    suspendedUntil: m.suspendedUntil ? utcMidnightToDateString(m.suspendedUntil) : null,
  };
}

export function toExceptionLike(e: RecurrenceException): ExceptionLike {
  return {
    id: e.id,
    originalDate: utcMidnightToDateString(e.originalDate),
    type: e.type,
    newRoomId: e.newRoomId,
    newStartTime: e.newStartTime,
    newEndTime: e.newEndTime,
    reason: e.reason,
  };
}

/**
 * Ocorrências (em todos os estados) de todas as reuniões recorrentes que
 * tocam o período [fromDate, toDate] (datas locais).
 */
export async function loadOccurrences(
  db: Db,
  fromDate: string,
  toDate: string,
  opts: { excludeMeetingIds?: string[] } = {},
): Promise<Occurrence[]> {
  const meetings = await db.recurringMeeting.findMany({
    where: {
      id: opts.excludeMeetingIds?.length ? { notIn: opts.excludeMeetingIds } : undefined,
      startDate: { lte: new Date(`${addDays(toDate, 1)}T00:00:00Z`) },
      OR: [{ endDate: null }, { endDate: { gte: new Date(`${addDays(fromDate, -1)}T00:00:00Z`) } }],
    },
    include: { exceptions: true },
  });
  return meetings.flatMap((m) =>
    expandOccurrences(toMeetingLike(m), m.exceptions.map(toExceptionLike), fromDate, toDate),
  );
}

export interface LoadBusyOptions {
  from: Date;
  to: Date;
  roomIds?: string[];
  excludeReservationIds?: string[];
  excludeMeetingIds?: string[];
}

export async function loadBusySlots(db: Db, opts: LoadBusyOptions): Promise<BusySlot[]> {
  const { from, to, roomIds } = opts;
  const roomFilter = roomIds?.length ? { in: roomIds } : undefined;

  const [reservations, blocks, occurrences] = await Promise.all([
    db.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        roomId: roomFilter,
        id: opts.excludeReservationIds?.length ? { notIn: opts.excludeReservationIds } : undefined,
        startAt: { lt: to },
        endAt: { gt: from },
      },
    }),
    db.availabilityBlock.findMany({
      where: {
        startAt: { lt: to },
        endAt: { gt: from },
        ...(roomFilter ? { OR: [{ roomId: null }, { roomId: roomFilter }] } : {}),
      },
    }),
    loadOccurrences(db, utcToDateString(from), utcToDateString(to), { excludeMeetingIds: opts.excludeMeetingIds }),
  ]);

  const slots: BusySlot[] = [];
  for (const r of reservations) {
    slots.push({
      kind: 'RESERVATION',
      roomId: r.roomId,
      startAt: r.startAt,
      endAt: r.endAt,
      title: r.title,
      publicTitle: r.showPublicTitle ? r.publicTitle || r.title : 'Reservado',
      refId: r.id,
      participants: r.participants,
    });
  }
  for (const o of occurrences) {
    if (o.state !== 'SCHEDULED') continue;
    if (roomIds?.length && !roomIds.includes(o.roomId)) continue;
    if (!(o.startAt < to && o.endAt > from)) continue;
    slots.push({
      kind: 'RECURRING',
      roomId: o.roomId,
      startAt: o.startAt,
      endAt: o.endAt,
      title: o.name,
      publicTitle: o.publicTitle,
      refId: o.meetingId,
      occurrenceDate: o.originalDate,
      participants: o.participants,
    });
  }
  for (const b of blocks) {
    slots.push({
      kind: 'BLOCK',
      roomId: b.roomId,
      startAt: b.startAt,
      endAt: b.endAt,
      title: b.title,
      publicTitle: b.title,
      refId: b.id,
    });
  }
  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
