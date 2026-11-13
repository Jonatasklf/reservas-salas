/**
 * Salas e equipamentos.
 *
 * Regras:
 *  - Sala desativada não recebe novas reservas, mas o histórico é mantido
 *    (salas nunca são apagadas).
 *  - Reduzir a capacidade ou o horário de funcionamento é bloqueado quando
 *    há reservas/reuniões futuras que deixariam de caber; o sistema lista
 *    quais são, para o administrador resolver antes.
 */
import type { Room, RoomEquipment, Equipment } from '@prisma/client';
import { prisma, transaction, lockRooms, type Db } from '@/lib/db';
import { AppError, conflict, notFound } from '@/lib/errors';
import { addDays, formatDateShort, todayString, utcToDateString, utcToTimeString } from '@/lib/time';
import { siteConfig } from '@/config/site';
import type { RoomInput } from '@/lib/validation';
import { checkRoomAvailability, type RoomRules } from '../availability';
import { loadOccurrences } from '../occupancy';
import { audit } from './audit';
import { getSettings } from './settings';

export type RoomWithEquipment = Room & { equipment: (RoomEquipment & { equipment: Equipment })[] };

export function toRoomRules(room: Room): RoomRules {
  return {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    active: room.active,
    openTime: room.openTime,
    closeTime: room.closeTime,
    weekdays: room.weekdays,
  };
}

const roomInclude = { equipment: { include: { equipment: true }, orderBy: { equipment: { name: 'asc' as const } } } };

export function listRooms(db: Db = prisma, opts: { includeInactive?: boolean } = {}): Promise<RoomWithEquipment[]> {
  return db.room.findMany({
    where: opts.includeInactive ? undefined : { active: true },
    include: roomInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getRoom(id: string, db: Db = prisma): Promise<RoomWithEquipment> {
  const room = await db.room.findUnique({ where: { id }, include: roomInclude });
  if (!room) throw notFound('Sala');
  return room;
}

async function validateEquipmentIds(db: Db, ids: string[]) {
  if (!ids.length) return;
  const found = await db.equipment.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw new AppError(400, 'INVALID_EQUIPMENT', 'Um ou mais equipamentos não existem.');
}

export async function createRoom(input: RoomInput, adminId: string) {
  return transaction(async (tx) => {
    await validateEquipmentIds(tx, input.equipment.map((e) => e.equipmentId));
    const room = await tx.room.create({
      data: {
        name: input.name,
        description: input.description,
        location: input.location,
        capacity: input.capacity,
        openTime: input.openTime,
        closeTime: input.closeTime,
        weekdays: input.weekdays,
        adminNotes: input.adminNotes,
        active: input.active,
        sortOrder: input.sortOrder,
        equipment: { create: input.equipment.map((e) => ({ equipmentId: e.equipmentId, quantity: e.quantity })) },
      },
    });
    await audit(tx, { adminId, action: 'ROOM_CREATED', entityType: 'Room', entityId: room.id, summary: `Sala "${room.name}" cadastrada.` });
    return room;
  });
}

export interface RoomImpact {
  kind: 'RESERVATION' | 'RECURRING';
  id: string;
  title: string;
  date: string;
  time: string;
  problem: string;
}

/**
 * Lista reservas e reuniões futuras que ficariam inconsistentes se a sala
 * passasse a ter as regras `next` (capacidade, dias e horários).
 */
export async function findRoomChangeImpact(db: Db, room: Room, next: RoomRules): Promise<RoomImpact[]> {
  const settings = await getSettings(db);
  const hours = { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime };
  const now = new Date();
  const today = todayString(now);
  const impacts: RoomImpact[] = [];
  const relevant = new Set(['CAPACITY', 'CLOSED_DAY', 'OUTSIDE_HOURS']);

  const reservations = await db.reservation.findMany({
    where: { roomId: room.id, status: 'CONFIRMED', endAt: { gt: now } },
    orderBy: { startAt: 'asc' },
  });
  for (const r of reservations) {
    const res = checkRoomAvailability({
      room: { ...next, active: true }, startAt: r.startAt, endAt: r.endAt, participants: r.participants, busy: [], hours, allowPast: true,
    });
    const issues = res.issues.filter((i) => relevant.has(i.reason));
    if (issues.length)
      impacts.push({
        kind: 'RESERVATION', id: r.id, title: r.title, date: utcToDateString(r.startAt),
        time: `${utcToTimeString(r.startAt)}–${utcToTimeString(r.endAt)}`, problem: issues.map((i) => i.message).join(' '),
      });
  }

  const occurrences = await loadOccurrences(db, today, addDays(today, 365));
  for (const o of occurrences) {
    if (o.roomId !== room.id || o.state !== 'SCHEDULED' || o.endAt <= now) continue;
    const res = checkRoomAvailability({
      room: { ...next, active: true }, startAt: o.startAt, endAt: o.endAt, participants: o.participants, busy: [], hours, allowPast: true,
    });
    const issues = res.issues.filter((i) => relevant.has(i.reason));
    if (issues.length)
      impacts.push({
        kind: 'RECURRING', id: o.meetingId, title: o.name, date: o.date,
        time: `${o.startTime}–${o.endTime}`, problem: issues.map((i) => i.message).join(' '),
      });
  }
  return impacts;
}

export async function updateRoom(id: string, input: RoomInput, adminId: string) {
  return transaction(async (tx) => {
    await lockRooms(tx, [id]);
    const room = await tx.room.findUnique({ where: { id } });
    if (!room) throw notFound('Sala');
    await validateEquipmentIds(tx, input.equipment.map((e) => e.equipmentId));

    const next: RoomRules = {
      id, name: input.name, capacity: input.capacity, active: input.active,
      openTime: input.openTime, closeTime: input.closeTime, weekdays: input.weekdays,
    };
    const scheduleChanged =
      input.capacity < room.capacity ||
      input.openTime !== room.openTime ||
      input.closeTime !== room.closeTime ||
      input.weekdays.join() !== room.weekdays.join();
    if (scheduleChanged) {
      const impact = await findRoomChangeImpact(tx, room, next);
      if (impact.length) {
        throw conflict(
          `A alteração deixaria ${impact.length} reserva(s)/reunião(ões) futura(s) inconsistente(s). Ajuste-as antes de salvar.`,
          { impact: impact.slice(0, 50) },
        );
      }
    }

    if (room.active && !input.active && !input.confirm) {
      const future = await tx.reservation.count({ where: { roomId: id, status: 'CONFIRMED', startAt: { gt: new Date() } } });
      const meetings = await tx.recurringMeeting.count({ where: { roomId: id, status: { not: 'ENDED' } } });
      if (future || meetings) {
        throw new AppError(409, 'NEEDS_CONFIRMATION',
          `Esta sala possui ${future} reserva(s) futura(s) e ${meetings} reunião(ões) recorrente(s) ativa(s). ` +
          'Ao desativá-la, elas continuarão registradas e aparecerão como pendência no painel. Deseja continuar?',
          { future, meetings });
      }
    }

    await tx.roomEquipment.deleteMany({ where: { roomId: id } });
    const updated = await tx.room.update({
      where: { id },
      data: {
        name: input.name, description: input.description, location: input.location, capacity: input.capacity,
        openTime: input.openTime, closeTime: input.closeTime, weekdays: input.weekdays, adminNotes: input.adminNotes,
        active: input.active, sortOrder: input.sortOrder,
        equipment: { create: input.equipment.map((e) => ({ equipmentId: e.equipmentId, quantity: e.quantity })) },
      },
    });
    const changes: string[] = [];
    if (room.capacity !== input.capacity) changes.push(`capacidade ${room.capacity} → ${input.capacity}`);
    if (room.active !== input.active) changes.push(input.active ? 'reativada' : 'desativada');
    if (room.name !== input.name) changes.push(`nome "${room.name}" → "${input.name}"`);
    await audit(tx, {
      adminId,
      action: room.active && !input.active ? 'ROOM_DEACTIVATED' : 'ROOM_UPDATED',
      entityType: 'Room',
      entityId: id,
      summary: `Sala "${updated.name}" atualizada${changes.length ? ': ' + changes.join(', ') : ''}.`,
    });
    return updated;
  });
}

// -----------------------------------------------------------------------------
// Equipamentos (tipos cadastráveis pelo administrador)
// -----------------------------------------------------------------------------
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function listEquipment(db: Db = prisma, opts: { includeInactive?: boolean } = {}) {
  return db.equipment.findMany({
    where: opts.includeInactive ? undefined : { active: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { rooms: true } } },
  });
}

export async function createEquipment(input: { name: string; key?: string; description: string | null; active: boolean }, adminId: string) {
  const key = input.key || slugify(input.name);
  if (!key) throw new AppError(400, 'INVALID_KEY', 'Informe um nome válido para o equipamento.');
  const eq = await prisma.equipment.create({ data: { name: input.name, key, description: input.description, active: input.active } });
  await audit(prisma, { adminId, action: 'EQUIPMENT_CREATED', entityType: 'Equipment', entityId: eq.id, summary: `Equipamento "${eq.name}" cadastrado.` });
  return eq;
}

export async function updateEquipment(id: string, input: { name: string; description: string | null; active: boolean }, adminId: string) {
  const eq = await prisma.equipment.update({ where: { id }, data: { name: input.name, description: input.description, active: input.active } });
  await audit(prisma, { adminId, action: 'EQUIPMENT_UPDATED', entityType: 'Equipment', entityId: id, summary: `Equipamento "${eq.name}" atualizado.` });
  return eq;
}

/** Texto curto para listas de impacto: "20/11/2026 19:00–21:00 — Título". */
export function describeImpact(i: RoomImpact) {
  return `${formatDateShort(i.date)} ${i.time} — ${i.title}`;
}

export const weekdayNames = siteConfig.weekdayLabels;
