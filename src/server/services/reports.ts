/**
 * RELATÓRIOS
 * =============================================================================
 * Indicadores de um período (datas locais, inclusive), opcionalmente de uma sala:
 *  - Solicitações recebidas: por situação, taxa de aprovação e tempo médio de
 *    resposta (do recebimento à decisão).
 *  - Uso das salas: horas ocupadas por reservas confirmadas e por ocorrências
 *    de reuniões recorrentes, horas disponíveis e taxa de ocupação.
 *  - Distribuição por dia da semana e por hora do dia.
 *  - Mensagens enviadas (WhatsApp/e-mail) e acessos administrativos.
 *
 * Horas disponíveis = dias de funcionamento da sala no período × janela de
 * funcionamento (da sala ou o padrão das Configurações). Bloqueios não são
 * descontados (a taxa é uma aproximação).
 * =============================================================================
 */
import { prisma } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { dayBoundsUtc, eachDate, timeToMinutes, utcToDateString, utcToTimeString, weekdayOf } from '@/lib/time';
import { loadOccurrences } from '../occupancy';
import { getSettings } from './settings';

export interface ReportFilters {
  from: string;
  to: string;
  roomId?: string;
}

interface Interval {
  roomId: string;
  startAt: Date;
  endAt: Date;
  kind: 'reservation' | 'recurring';
}

const hours = (ms: number) => ms / 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Minutos locais (0–1440) de início e fim de um intervalo no mesmo dia. */
function localMinutes(i: Interval) {
  const s = timeToMinutes(utcToTimeString(i.startAt));
  const endStr = utcToTimeString(i.endAt);
  const sameDay = utcToDateString(i.startAt) === utcToDateString(i.endAt);
  const e = sameDay ? timeToMinutes(endStr) : 24 * 60;
  return { s, e: Math.max(e, s) };
}

export async function getReport(f: ReportFilters) {
  const { start } = dayBoundsUtc(f.from);
  const { end } = dayBoundsUtc(f.to);
  const roomFilter = f.roomId || undefined;
  const settings = await getSettings();

  const [rooms, requests, reservations, occurrences, notifications, logins] = await Promise.all([
    prisma.room.findMany({ where: { id: roomFilter }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.reservationRequest.findMany({
      where: { receivedAt: { gte: start, lt: end }, roomId: roomFilter },
      select: { status: true, receivedAt: true, decidedAt: true, roomId: true },
    }),
    prisma.reservation.findMany({
      where: { status: 'CONFIRMED', startAt: { gte: start, lt: end }, roomId: roomFilter },
      select: { roomId: true, startAt: true, endAt: true, source: true },
    }),
    loadOccurrences(prisma, f.from, f.to),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { action: { startsWith: 'NOTIFICATION_' }, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { action: { in: ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED'] }, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);

  // Falhas de envio são contadas à parte (o status fica em details).
  const notifFailed = await prisma.auditLog.groupBy({
    by: ['action'],
    where: { action: { startsWith: 'NOTIFICATION_' }, createdAt: { gte: start, lt: end }, details: { path: ['status'], equals: 'failed' } },
    _count: { _all: true },
  });

  // ---------------------------------------------------------------- solicitações
  const byStatus = { PENDING: 0, AWAITING_INFO: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 } as Record<string, number>;
  let decidedMs = 0;
  let decidedCount = 0;
  for (const r of requests) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.decidedAt && (r.status === 'APPROVED' || r.status === 'REJECTED')) {
      decidedMs += r.decidedAt.getTime() - r.receivedAt.getTime();
      decidedCount += 1;
    }
  }
  const decided = byStatus.APPROVED + byStatus.REJECTED;

  // ---------------------------------------------------------------- ocupação
  const intervals: Interval[] = [
    ...reservations.map((r) => ({ roomId: r.roomId, startAt: r.startAt, endAt: r.endAt, kind: 'reservation' as const })),
    ...occurrences
      .filter((o) => o.state === 'SCHEDULED' && (!roomFilter || o.roomId === roomFilter))
      .map((o) => ({ roomId: o.roomId, startAt: o.startAt, endAt: o.endAt, kind: 'recurring' as const })),
  ];

  const dates = eachDate(f.from, f.to);
  const perRoom = rooms.map((room) => {
    const own = intervals.filter((i) => i.roomId === room.id);
    const open = timeToMinutes(room.openTime ?? settings.defaultOpenTime);
    const close = timeToMinutes(room.closeTime ?? settings.defaultCloseTime);
    const openDays = dates.filter((d) => room.weekdays.includes(weekdayOf(d))).length;
    const available = room.active ? (openDays * Math.max(close - open, 0)) / 60 : 0;
    const occupied = own.reduce((acc, i) => acc + hours(i.endAt.getTime() - i.startAt.getTime()), 0);
    return {
      id: room.id,
      name: room.name,
      active: room.active,
      capacity: room.capacity,
      reservations: own.filter((i) => i.kind === 'reservation').length,
      recurring: own.filter((i) => i.kind === 'recurring').length,
      occupiedHours: round1(occupied),
      availableHours: round1(available),
      occupancyRate: available > 0 ? Math.min(1, occupied / available) : 0,
      requests: requests.filter((r) => r.roomId === room.id).length,
    };
  });

  // Por dia da semana (horas) e por hora do dia (horas somadas em cada faixa).
  const byWeekday = Array.from({ length: 7 }, () => 0);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const i of intervals) {
    byWeekday[weekdayOf(utcToDateString(i.startAt))] += hours(i.endAt.getTime() - i.startAt.getTime());
    const { s, e } = localMinutes(i);
    for (let h = Math.floor(s / 60); h < 24 && h * 60 < e; h++) {
      byHour[h] += Math.max(0, Math.min(e, (h + 1) * 60) - Math.max(s, h * 60)) / 60;
    }
  }

  const occupiedTotal = perRoom.reduce((a, r) => a + r.occupiedHours, 0);
  const availableTotal = perRoom.reduce((a, r) => a + r.availableHours, 0);
  const count = (list: { action: string; _count: { _all: number } }[], action: string) =>
    list.find((x) => x.action === action)?._count._all ?? 0;

  return {
    period: { from: f.from, to: f.to, days: dates.length },
    requests: {
      total: requests.length,
      byStatus,
      approvalRate: decided > 0 ? byStatus.APPROVED / decided : null,
      avgResponseHours: decidedCount > 0 ? round1(hours(decidedMs / decidedCount)) : null,
    },
    usage: {
      reservations: reservations.length,
      reservationsFromRequests: reservations.filter((r) => r.source === 'REQUEST').length,
      recurringOccurrences: intervals.filter((i) => i.kind === 'recurring').length,
      occupiedHours: round1(occupiedTotal),
      availableHours: round1(availableTotal),
      occupancyRate: availableTotal > 0 ? Math.min(1, occupiedTotal / availableTotal) : 0,
    },
    perRoom,
    byWeekday: byWeekday.map(round1),
    byHour: byHour.map(round1),
    notifications: {
      whatsappSent: count(notifications, 'NOTIFICATION_WHATSAPP') - count(notifFailed, 'NOTIFICATION_WHATSAPP'),
      whatsappFailed: count(notifFailed, 'NOTIFICATION_WHATSAPP'),
      emailSent: count(notifications, 'NOTIFICATION_EMAIL') - count(notifFailed, 'NOTIFICATION_EMAIL'),
      emailFailed: count(notifFailed, 'NOTIFICATION_EMAIL'),
    },
    access: { logins: count(logins, 'ADMIN_LOGIN'), failedLogins: count(logins, 'ADMIN_LOGIN_FAILED') },
  };
}

export type Report = Awaited<ReturnType<typeof getReport>>;

/** Garante período válido e de no máximo ~13 meses. */
export function checkReportPeriod(from: string, to: string) {
  if (to < from) throw badRequest('A data final deve ser igual ou posterior à inicial.');
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 400) throw badRequest('Escolha um período de até 400 dias.');
}
