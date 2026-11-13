/**
 * Reservas confirmadas criadas diretamente pela administração.
 * Também respeitam capacidade, horário de funcionamento, conflitos e bloqueios.
 * Toda criação/edição/cancelamento fica registrada na auditoria.
 */
import type { Prisma, ReservationStatus } from '@prisma/client';
import { prisma, transaction, lockRooms } from '@/lib/db';
import { AppError, conflict, notFound } from '@/lib/errors';
import { formatRange, utcToDateString, zonedToUtc } from '@/lib/time';
import type { AdminReservationInput } from '@/lib/validation';
import { assertAvailable, evaluateBooking } from './booking';
import { audit } from './audit';
import { OPEN_STATUSES } from './requests';

async function validateEquipment(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  const n = await tx.equipment.count({ where: { id: { in: ids } } });
  if (n !== new Set(ids).size) throw new AppError(400, 'INVALID_EQUIPMENT', 'Um ou mais equipamentos não existem.');
}

/** Marca pedidos em aberto que passaram a conflitar com uma nova reserva. */
export async function flagLostRequests(tx: Prisma.TransactionClient, roomId: string, startAt: Date, endAt: Date, adminId: string) {
  const lost = await tx.reservationRequest.findMany({
    where: { roomId, status: { in: OPEN_STATUSES }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { id: true },
  });
  if (!lost.length) return;
  await tx.reservationRequest.updateMany({ where: { id: { in: lost.map((l) => l.id) } }, data: { availabilityLostAt: new Date() } });
  for (const l of lost) {
    await audit(tx, {
      adminId, action: 'REQUEST_LOST_AVAILABILITY', entityType: 'ReservationRequest', entityId: l.id,
      summary: 'Horário deixou de estar disponível por causa de uma reserva administrativa.',
    });
  }
}

export async function createAdminReservation(input: AdminReservationInput, adminId: string, now = new Date()) {
  const startAt = zonedToUtc(input.date, input.startTime);
  const endAt = zonedToUtc(input.date, input.endTime);
  return transaction(async (tx) => {
    await lockRooms(tx, [input.roomId]);
    const room = await tx.room.findUnique({ where: { id: input.roomId } });
    if (!room) throw notFound('Sala');
    await validateEquipment(tx, input.equipmentIds);
    assertAvailable(await evaluateBooking(tx, { room, startAt, endAt, participants: input.participants, now }));

    const reservation = await tx.reservation.create({
      data: {
        roomId: room.id, title: input.title, publicTitle: input.publicTitle,
        showPublicTitle: input.showPublicTitle, responsible: input.responsible,
        startAt, endAt, participants: input.participants, notes: input.notes,
        source: 'ADMIN', createdById: adminId,
        equipment: { create: [...new Set(input.equipmentIds)].map((equipmentId) => ({ equipmentId })) },
      },
    });
    await audit(tx, {
      adminId, action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: reservation.id,
      summary: `Reserva "${reservation.title}" criada em ${room.name} (${input.date}, ${formatRange(startAt, endAt)}).`,
    });
    await flagLostRequests(tx, room.id, startAt, endAt, adminId);
    return reservation;
  });
}

export async function updateReservation(id: string, input: AdminReservationInput, adminId: string, now = new Date()) {
  const startAt = zonedToUtc(input.date, input.startTime);
  const endAt = zonedToUtc(input.date, input.endTime);
  return transaction(async (tx) => {
    const current = await tx.reservation.findUnique({ where: { id } });
    if (!current) throw notFound('Reserva');
    await lockRooms(tx, [current.roomId, input.roomId]);
    if (current.status !== 'CONFIRMED') throw conflict('Somente reservas confirmadas podem ser editadas.');
    if (current.endAt < now) throw conflict('Reservas que já aconteceram não podem ser alteradas (histórico preservado).');
    const room = await tx.room.findUnique({ where: { id: input.roomId } });
    if (!room) throw notFound('Sala');
    await validateEquipment(tx, input.equipmentIds);
    assertAvailable(
      await evaluateBooking(tx, { room, startAt, endAt, participants: input.participants, now, excludeReservationIds: [id] }),
    );

    await tx.reservationEquipment.deleteMany({ where: { reservationId: id } });
    const updated = await tx.reservation.update({
      where: { id },
      data: {
        roomId: room.id, title: input.title, publicTitle: input.publicTitle, showPublicTitle: input.showPublicTitle,
        responsible: input.responsible, startAt, endAt, participants: input.participants, notes: input.notes,
        equipment: { create: [...new Set(input.equipmentIds)].map((equipmentId) => ({ equipmentId })) },
      },
    });
    await audit(tx, {
      adminId, action: 'RESERVATION_UPDATED', entityType: 'Reservation', entityId: id,
      summary: `Reserva alterada${input.reason ? ': ' + input.reason : ''}.`,
      details: {
        before: { roomId: current.roomId, startAt: current.startAt.toISOString(), endAt: current.endAt.toISOString(), participants: current.participants, title: current.title },
        after: { roomId: room.id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), participants: input.participants, title: input.title },
      },
    });
    await flagLostRequests(tx, room.id, startAt, endAt, adminId);
    return updated;
  });
}

export async function cancelReservation(id: string, reason: string, adminId: string) {
  return transaction(async (tx) => {
    const current = await tx.reservation.findUnique({ where: { id }, include: { request: true } });
    if (!current) throw notFound('Reserva');
    if (current.status === 'CANCELLED') throw conflict('Esta reserva já foi cancelada.');
    const updated = await tx.reservation.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
    if (current.request) {
      await tx.reservationRequest.update({
        where: { id: current.request.id },
        data: { status: 'CANCELLED', publicMessage: `Reserva cancelada pela administração: ${reason}` },
      });
      await audit(tx, {
        adminId, action: 'REQUEST_CANCELLED', entityType: 'ReservationRequest', entityId: current.request.id,
        summary: `A reserva gerada por esta solicitação foi cancelada: ${reason}`,
      });
    }
    await audit(tx, { adminId, action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: id, summary: `Reserva cancelada: ${reason}` });
    return updated;
  });
}

export interface ReservationFilters {
  from?: string;
  to?: string;
  roomId?: string;
  status?: ReservationStatus;
  search?: string;
}

export function listReservations(f: ReservationFilters) {
  return prisma.reservation.findMany({
    where: {
      roomId: f.roomId || undefined,
      status: f.status || undefined,
      startAt: f.from ? { gte: zonedToUtc(f.from, '00:00') } : undefined,
      AND: f.to ? [{ startAt: { lt: zonedToUtc(f.to, '23:59') } }] : undefined,
      OR: f.search
        ? [
            { title: { contains: f.search, mode: 'insensitive' } },
            { responsible: { contains: f.search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    include: {
      room: { select: { id: true, name: true } },
      request: { select: { id: true, protocol: true } },
      equipment: { include: { equipment: { select: { id: true, name: true } } } },
    },
    orderBy: { startAt: 'asc' },
    take: 1000,
  });
}

export async function getReservation(id: string) {
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: { room: true, request: { select: { id: true, protocol: true } }, equipment: { include: { equipment: true } } },
  });
  if (!r) throw notFound('Reserva');
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'Reservation', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { admin: { select: { name: true } } },
  });
  return { ...r, date: utcToDateString(r.startAt), history };
}
