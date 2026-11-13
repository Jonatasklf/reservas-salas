/**
 * Bloqueios administrativos: feriados, manutenção e indisponibilidades.
 * Um bloqueio impede novas reservas no período. Se já houver reservas
 * no período, o sistema avisa e pede confirmação (elas não são apagadas).
 */
import type { z } from 'zod';
import { prisma, transaction, lockRooms } from '@/lib/db';
import { AppError, notFound } from '@/lib/errors';
import { zonedToUtc } from '@/lib/time';
import type { blockSchema } from '@/lib/validation';
import { loadBusySlots } from '../occupancy';
import { audit } from './audit';

type BlockInput = z.infer<typeof blockSchema>;

export async function createBlock(input: BlockInput, adminId: string) {
  const startAt = zonedToUtc(input.startDate, input.startTime);
  const endAt = zonedToUtc(input.endDate, input.endTime);
  return transaction(async (tx) => {
    const roomIds = input.roomId ? [input.roomId] : (await tx.room.findMany({ select: { id: true } })).map((r) => r.id);
    await lockRooms(tx, roomIds);
    if (input.roomId && !(await tx.room.findUnique({ where: { id: input.roomId } }))) throw notFound('Sala');

    const affected = (await loadBusySlots(tx, { from: startAt, to: endAt, roomIds })).filter((b) => b.kind !== 'BLOCK');
    if (affected.length && !input.confirm) {
      throw new AppError(
        409,
        'NEEDS_CONFIRMATION',
        `Existem ${affected.length} reserva(s)/reunião(ões) neste período. Elas NÃO serão canceladas automaticamente. Deseja bloquear mesmo assim?`,
        { affected: affected.slice(0, 50).map((a) => ({ kind: a.kind, title: a.title, startAt: a.startAt, endAt: a.endAt, roomId: a.roomId })) },
      );
    }
    const block = await tx.availabilityBlock.create({
      data: { roomId: input.roomId, title: input.title, type: input.type, startAt, endAt, notes: input.notes, createdById: adminId },
    });
    await audit(tx, {
      adminId, action: 'BLOCK_CREATED', entityType: 'AvailabilityBlock', entityId: block.id,
      summary: `Bloqueio "${block.title}" criado${input.roomId ? '' : ' para todas as salas'}.`,
    });
    return block;
  });
}

export async function deleteBlock(id: string, adminId: string) {
  const block = await prisma.availabilityBlock.findUnique({ where: { id } });
  if (!block) throw notFound('Bloqueio');
  await prisma.availabilityBlock.delete({ where: { id } });
  await audit(prisma, {
    adminId, action: 'BLOCK_REMOVED', entityType: 'AvailabilityBlock', entityId: id,
    summary: `Bloqueio "${block.title}" removido.`,
    details: { startAt: block.startAt.toISOString(), endAt: block.endAt.toISOString(), roomId: block.roomId },
  });
}

export function listBlocks(opts: { from?: Date } = {}) {
  return prisma.availabilityBlock.findMany({
    where: opts.from ? { endAt: { gte: opts.from } } : undefined,
    include: { room: { select: { id: true, name: true } } },
    orderBy: { startAt: 'asc' },
  });
}
