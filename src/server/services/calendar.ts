/**
 * Visões de calendário (pública e administrativa).
 *
 * A visão pública NUNCA expõe nomes, contatos ou justificativas: apenas a
 * sala, o horário e um título público (quando autorizado nas configurações
 * e na própria reserva/reunião).
 */
import { prisma } from '@/lib/db';
import { addDays, dayBoundsUtc, eachDate, utcToDateString, zonedToUtc } from '@/lib/time';
import { checkRoomAvailability, freeIntervals, type BusySlot } from '../availability';
import { loadBusySlots, loadOccurrences } from '../occupancy';
import { listRooms, toRoomRules } from './rooms';
import { getSettings } from './settings';
import { OPEN_STATUSES } from './requests';

export interface CalendarEvent {
  id: string;
  kind: BusySlot['kind'] | 'REQUEST' | 'CANCELLED_OCCURRENCE';
  roomId: string | null;
  roomName: string;
  date: string;
  startAt: Date;
  endAt: Date;
  title: string;
  refId: string;
  occurrenceDate?: string;
  participants?: number;
}

function rangeBounds(from: string, to: string) {
  return { start: dayBoundsUtc(from).start, end: dayBoundsUtc(to).end };
}

/** Eventos do período. `admin` = inclui títulos internos e pedidos pendentes. */
export async function getEvents(from: string, to: string, opts: { admin?: boolean } = {}): Promise<CalendarEvent[]> {
  const { start, end } = rangeBounds(from, to);
  const [settings, rooms, busy] = await Promise.all([
    getSettings(),
    prisma.room.findMany({ select: { id: true, name: true } }),
    loadBusySlots(prisma, { from: start, to: end }),
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const titleFor = (b: BusySlot) => {
    if (opts.admin) return b.title;
    if (b.kind === 'BLOCK') return b.publicTitle;
    return settings.showPublicTitles ? b.publicTitle : 'Reservado';
  };

  const events: CalendarEvent[] = busy.map((b) => ({
    id: `${b.kind}:${b.refId}:${b.occurrenceDate ?? ''}:${b.roomId ?? 'all'}`,
    kind: b.kind,
    roomId: b.roomId,
    roomName: b.roomId ? roomName.get(b.roomId) ?? 'Sala' : 'Todas as salas',
    date: utcToDateString(b.startAt),
    startAt: b.startAt,
    endAt: b.endAt,
    title: titleFor(b),
    refId: b.refId,
    occurrenceDate: b.occurrenceDate,
    participants: opts.admin ? b.participants : undefined,
  }));

  if (opts.admin) {
    const [requests, occurrences] = await Promise.all([
      prisma.reservationRequest.findMany({
        where: { status: { in: OPEN_STATUSES }, startAt: { lt: end }, endAt: { gt: start } },
        select: { id: true, protocol: true, roomId: true, startAt: true, endAt: true, purpose: true, participants: true },
      }),
      loadOccurrences(prisma, from, to),
    ]);
    for (const r of requests) {
      events.push({
        id: `REQUEST:${r.id}`, kind: 'REQUEST', roomId: r.roomId, roomName: roomName.get(r.roomId) ?? 'Sala',
        date: utcToDateString(r.startAt), startAt: r.startAt, endAt: r.endAt,
        title: `Pendente ${r.protocol}: ${r.purpose}`, refId: r.id, participants: r.participants,
      });
    }
    for (const o of occurrences.filter((x) => x.state !== 'SCHEDULED')) {
      events.push({
        id: `CANCELLED:${o.meetingId}:${o.originalDate}`, kind: 'CANCELLED_OCCURRENCE', roomId: o.roomId,
        roomName: roomName.get(o.roomId) ?? 'Sala', date: o.date, startAt: o.startAt, endAt: o.endAt,
        title: `${o.name} (${o.state === 'CANCELLED' ? 'cancelada' : 'suspensa'})`, refId: o.meetingId, occurrenceDate: o.originalDate,
      });
    }
  }

  return events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Resumo por dia para o calendário mensal (indicadores). */
export async function getMonthSummary(from: string, to: string, opts: { admin?: boolean } = {}) {
  const events = await getEvents(from, to, opts);
  const days: Record<string, { occupied: number; blocked: boolean; pending: number }> = {};
  for (const d of eachDate(from, to)) days[d] = { occupied: 0, blocked: false, pending: 0 };
  for (const e of events) {
    // Bloqueios de vários dias marcam todos os dias cobertos.
    const lastDay = utcToDateString(new Date(e.endAt.getTime() - 1));
    for (const d of eachDate(e.date < from ? from : e.date, lastDay > to ? to : lastDay)) {
      const day = days[d];
      if (!day) continue;
      if (e.kind === 'BLOCK') day.blocked = true;
      else if (e.kind === 'REQUEST') day.pending += 1;
      else if (e.kind !== 'CANCELLED_OCCURRENCE') day.occupied += 1;
    }
  }
  return days;
}

export interface DayFilters {
  startTime?: string;
  endTime?: string;
  participants?: number;
  equipment?: string[];
}

/** Situação de cada sala em um dia (cartões da página pública). */
export async function getDayAvailability(date: string, filters: DayFilters = {}, now = new Date()) {
  const settings = await getSettings();
  const hours = { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime };
  const { start, end } = dayBoundsUtc(date);
  const rooms = await listRooms(prisma);
  const busy = await loadBusySlots(prisma, { from: start, to: end, roomIds: rooms.map((r) => r.id) });
  const pending = await prisma.reservationRequest.findMany({
    where: { status: { in: OPEN_STATUSES }, startAt: { lt: end }, endAt: { gt: start } },
    select: { roomId: true, startAt: true, endAt: true },
  });

  const hasInterval = Boolean(filters.startTime && filters.endTime);
  const reqStart = hasInterval ? zonedToUtc(date, filters.startTime!) : null;
  const reqEnd = hasInterval ? zonedToUtc(date, filters.endTime!) : null;

  return rooms.map((room) => {
    const rules = toRoomRules(room);
    const roomBusy = busy.filter((b) => b.roomId === null || b.roomId === room.id);
    const equipmentIds = room.equipment.map((e) => e.equipmentId);
    const missingEquipment = (filters.equipment ?? []).filter((id) => !equipmentIds.includes(id));
    let status: { available: boolean; messages: string[] } | null = null;
    if (reqStart && reqEnd) {
      const res = checkRoomAvailability({
        room: rules, startAt: reqStart, endAt: reqEnd, participants: filters.participants ?? 1, busy: roomBusy, hours, now,
        publicLimits: { minAdvanceMinutes: settings.minAdvanceMinutes, maxAdvanceDays: settings.maxAdvanceDays },
      });
      status = { available: res.available, messages: res.issues.map((i) => i.message) };
    } else if (filters.participants && filters.participants > room.capacity) {
      status = { available: false, messages: [`Capacidade máxima de ${room.capacity} pessoas.`] };
    }
    const pendingHere = pending.filter(
      (p) => p.roomId === room.id && (!reqStart || !reqEnd || (p.startAt < reqEnd && p.endAt > reqStart)),
    ).length;

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      location: room.location,
      capacity: room.capacity,
      hours: { open: room.openTime ?? hours.defaultOpenTime, close: room.closeTime ?? hours.defaultCloseTime },
      openToday: room.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()),
      equipment: room.equipment.map((e) => ({ id: e.equipmentId, key: e.equipment.key, name: e.equipment.name, quantity: e.quantity })),
      busy: roomBusy.map((b) => ({
        kind: b.kind,
        startAt: b.startAt,
        endAt: b.endAt,
        title: b.kind === 'BLOCK' ? b.publicTitle : settings.showPublicTitles ? b.publicTitle : 'Reservado',
      })),
      free: freeIntervals(rules, date, roomBusy, hours, zonedToUtc),
      pendingCount: pendingHere,
      missingEquipment,
      status,
    };
  });
}

export { addDays };
