/**
 * Indicadores do painel administrativo.
 */
import { prisma } from '@/lib/db';
import { addDays, todayString } from '@/lib/time';
import { findCompetingRequests } from '../availability';
import { getEvents } from './calendar';
import { OPEN_STATUSES, listQueue } from './requests';

export async function getDashboard(now = new Date()) {
  const today = todayString(now);
  const [rooms, activeRooms, confirmedFuture, pending, awaitingInfo, recurringActive, upcoming, queue, inactiveRoomFuture] =
    await Promise.all([
      prisma.room.count(),
      prisma.room.count({ where: { active: true } }),
      prisma.reservation.count({ where: { status: 'CONFIRMED', endAt: { gt: now } } }),
      prisma.reservationRequest.count({ where: { status: 'PENDING' } }),
      prisma.reservationRequest.count({ where: { status: 'AWAITING_INFO' } }),
      prisma.recurringMeeting.count({ where: { status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
      getEvents(today, addDays(today, 6), { admin: true }),
      listQueue({ statuses: OPEN_STATUSES }),
      prisma.reservation.findMany({
        where: { status: 'CONFIRMED', startAt: { gt: now }, room: { active: false } },
        include: { room: { select: { name: true } } },
        orderBy: { startAt: 'asc' },
        take: 20,
      }),
    ]);

  const competing = findCompetingRequests(queue);
  const attention = [
    ...queue
      .filter((r) => r.currentIssues.length > 0)
      .map((r) => ({
        type: 'LOST_AVAILABILITY' as const,
        id: r.id,
        title: `Solicitação ${r.protocol} perdeu a disponibilidade`,
        detail: r.currentIssues[0]?.message ?? '',
      })),
    ...queue
      .filter((r) => competing.has(r.id) && r.isOldestInCompetition)
      .map((r) => ({
        type: 'COMPETITION' as const,
        id: r.id,
        title: `Concorrência pelo horário da solicitação ${r.protocol}`,
        detail: `${(competing.get(r.id)?.length ?? 0) + 1} pedidos para a mesma sala e horário.`,
      })),
    ...inactiveRoomFuture.map((r) => ({
      type: 'INACTIVE_ROOM' as const,
      id: r.id,
      title: `Reserva futura em sala desativada (${r.room.name})`,
      detail: r.title,
    })),
  ];

  return {
    stats: { rooms, activeRooms, confirmedFuture, pending, awaitingInfo, recurringActive },
    upcoming: upcoming.filter((e) => e.kind !== 'CANCELLED_OCCURRENCE' && e.kind !== 'REQUEST' && e.endAt > now).slice(0, 40),
    attention,
    oldestPending: queue.slice(0, 5).map((r) => ({
      id: r.id, protocol: r.protocol, requesterName: r.requesterName, room: r.room.name,
      startAt: r.startAt, endAt: r.endAt, receivedAt: r.receivedAt, status: r.status,
    })),
  };
}
