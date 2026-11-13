/**
 * Ponto único de verificação de disponibilidade com dados do banco.
 * Todas as operações que ocupam uma sala (solicitação pública, aprovação,
 * reserva administrativa, exceção de recorrência) passam por aqui.
 */
import type { Room } from '@prisma/client';
import type { Db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { checkRoomAvailability, type AvailabilityResult } from '../availability';
import { loadBusySlots } from '../occupancy';
import { toRoomRules } from './rooms';
import { getSettings } from './settings';

export interface EvaluateOptions {
  room: Room;
  startAt: Date;
  endAt: Date;
  participants: number;
  now?: Date;
  publicRequest?: boolean;
  excludeReservationIds?: string[];
  excludeMeetingIds?: string[];
  allowPast?: boolean;
}

export async function evaluateBooking(db: Db, opts: EvaluateOptions): Promise<AvailabilityResult> {
  const settings = await getSettings(db);
  const busy = await loadBusySlots(db, {
    from: opts.startAt,
    to: opts.endAt,
    roomIds: [opts.room.id],
    excludeReservationIds: opts.excludeReservationIds,
    excludeMeetingIds: opts.excludeMeetingIds,
  });
  return checkRoomAvailability({
    room: toRoomRules(opts.room),
    startAt: opts.startAt,
    endAt: opts.endAt,
    participants: opts.participants,
    busy,
    hours: { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime },
    now: opts.now,
    publicLimits: opts.publicRequest
      ? { minAdvanceMinutes: settings.minAdvanceMinutes, maxAdvanceDays: settings.maxAdvanceDays }
      : undefined,
    allowPast: opts.allowPast,
  });
}

/** Converte o resultado em erro HTTP 409 com a lista de problemas. */
export function assertAvailable(
  result: AvailabilityResult,
  extra?: Record<string, unknown>,
  opts: { publicView?: boolean } = {},
): void {
  if (result.available) return;
  const first = result.issues[0];
  throw new AppError(409, 'UNAVAILABLE', first.message, {
    issues: result.issues.map((i) => ({
      reason: i.reason,
      message: i.message,
      // Na área pública, apenas o título público (nunca dados internos).
      conflicts: i.conflicts?.map((c) => ({
        kind: c.kind,
        title: opts.publicView ? c.publicTitle : c.title,
        startAt: c.startAt,
        endAt: c.endAt,
      })),
    })),
    ...extra,
  });
}
