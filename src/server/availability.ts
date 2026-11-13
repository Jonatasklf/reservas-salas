/**
 * REGRAS CENTRAIS DE DISPONIBILIDADE
 * =============================================================================
 * Este arquivo contém apenas funções puras (sem banco de dados), para que as
 * regras possam ser lidas, testadas e reaproveitadas no frontend e no backend.
 *
 * Uma sala está DISPONÍVEL para um pedido somente quando:
 *   1. está ativa;
 *   2. sua capacidade comporta o número de participantes;
 *   3. o intervalo inteiro está dentro do horário de funcionamento da sala
 *      (e o dia da semana é atendido);
 *   4. não há reserva confirmada, ocorrência de reunião recorrente ou
 *      bloqueio administrativo sobreposto ao intervalo.
 *
 * Intervalos são semiabertos [início, fim): uma reunião das 14h às 16h NÃO
 * conflita com outra das 16h às 18h (horários consecutivos são permitidos).
 * =============================================================================
 */
import { siteConfig } from '@/config/site';
import { timeToMinutes, utcToDateString, utcToTimeString, weekdayOf } from '@/lib/time';

export type BusyKind = 'RESERVATION' | 'RECURRING' | 'BLOCK';

/** Um período ocupado em uma sala (ou em todas, quando roomId = null). */
export interface BusySlot {
  kind: BusyKind;
  /** null = bloqueio que vale para todas as salas. */
  roomId: string | null;
  startAt: Date;
  endAt: Date;
  /** Título interno (somente administração). */
  title: string;
  /** Título que pode ser exibido publicamente. */
  publicTitle: string;
  /** Identificador de origem (reserva, reunião recorrente ou bloqueio). */
  refId: string;
  /** Para ocorrências recorrentes: data original da ocorrência. */
  occurrenceDate?: string;
  participants?: number;
}

export interface RoomRules {
  id: string;
  name: string;
  capacity: number;
  active: boolean;
  openTime: string | null;
  closeTime: string | null;
  weekdays: number[];
}

export interface OpeningHours {
  defaultOpenTime: string;
  defaultCloseTime: string;
}

export type UnavailableReason =
  | 'INVALID_RANGE'
  | 'TOO_SHORT'
  | 'PAST'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'INACTIVE'
  | 'CAPACITY'
  | 'INVALID_PARTICIPANTS'
  | 'CLOSED_DAY'
  | 'OUTSIDE_HOURS'
  | 'MULTI_DAY'
  | 'CONFLICT'
  | 'BLOCKED';

export interface AvailabilityIssue {
  reason: UnavailableReason;
  message: string;
  conflicts?: BusySlot[];
}

export interface AvailabilityResult {
  available: boolean;
  issues: AvailabilityIssue[];
}

/** Verdadeiro quando [aStart, aEnd) e [bStart, bEnd) se sobrepõem. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Períodos ocupados que afetam a sala no intervalo informado. */
export function findConflicts(roomId: string, startAt: Date, endAt: Date, busy: BusySlot[]): BusySlot[] {
  return busy
    .filter((b) => (b.roomId === null || b.roomId === roomId) && overlaps(startAt, endAt, b.startAt, b.endAt))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function roomHours(room: Pick<RoomRules, 'openTime' | 'closeTime'>, hours: OpeningHours) {
  return {
    open: room.openTime ?? hours.defaultOpenTime,
    close: room.closeTime ?? hours.defaultCloseTime,
  };
}

export function capacityMessage(capacity: number): string {
  return `Esta sala possui capacidade máxima de ${capacity} pessoas. Selecione uma sala com capacidade adequada.`;
}

export interface CheckOptions {
  room: RoomRules;
  startAt: Date;
  endAt: Date;
  participants: number;
  busy: BusySlot[];
  hours: OpeningHours;
  now?: Date;
  /** Regras extras para pedidos públicos (antecedência mínima e máxima). */
  publicLimits?: { minAdvanceMinutes: number; maxAdvanceDays: number };
  /** Ignora estes itens ao checar conflitos (ex.: a própria reserva sendo editada). */
  ignoreRefIds?: string[];
  /** Permite intervalos no passado (ex.: edição administrativa de histórico). */
  allowPast?: boolean;
}

/**
 * Verifica TODAS as regras e devolve a lista de problemas encontrados.
 * Usada pelo filtro público, pelo formulário, pela aprovação e pelas
 * reservas administrativas — a mesma regra em todos os lugares.
 */
export function checkRoomAvailability(opts: CheckOptions): AvailabilityResult {
  const { room, startAt, endAt, participants, busy, hours } = opts;
  const now = opts.now ?? new Date();
  const issues: AvailabilityIssue[] = [];

  if (!(endAt.getTime() > startAt.getTime())) {
    issues.push({ reason: 'INVALID_RANGE', message: 'O horário de término deve ser posterior ao horário de início.' });
    return { available: false, issues };
  }

  const durationMin = (endAt.getTime() - startAt.getTime()) / 60000;
  if (durationMin < siteConfig.rules.minDurationMinutes) {
    issues.push({ reason: 'TOO_SHORT', message: `A reserva deve ter pelo menos ${siteConfig.rules.minDurationMinutes} minutos.` });
  }

  if (!opts.allowPast && startAt.getTime() < now.getTime()) {
    issues.push({ reason: 'PAST', message: 'Não é possível reservar datas ou horários que já passaram.' });
  } else if (opts.publicLimits) {
    const minStart = now.getTime() + opts.publicLimits.minAdvanceMinutes * 60000;
    if (startAt.getTime() < minStart) {
      issues.push({
        reason: 'TOO_SOON',
        message: `As solicitações devem ser feitas com pelo menos ${opts.publicLimits.minAdvanceMinutes} minutos de antecedência.`,
      });
    }
    const maxStart = now.getTime() + opts.publicLimits.maxAdvanceDays * 86400000;
    if (startAt.getTime() > maxStart) {
      issues.push({
        reason: 'TOO_FAR',
        message: `As solicitações podem ser feitas com até ${opts.publicLimits.maxAdvanceDays} dias de antecedência.`,
      });
    }
  }

  if (!room.active) {
    issues.push({ reason: 'INACTIVE', message: 'Esta sala está desativada e não pode receber novas reservas.' });
  }

  if (!Number.isInteger(participants) || participants < 1) {
    issues.push({ reason: 'INVALID_PARTICIPANTS', message: 'Informe pelo menos 1 participante.' });
  } else if (participants > room.capacity) {
    issues.push({ reason: 'CAPACITY', message: capacityMessage(room.capacity) });
  }

  // Horário de funcionamento (no fuso local)
  const startDate = utcToDateString(startAt);
  const endDate = utcToDateString(new Date(endAt.getTime() - 1));
  if (startDate !== endDate) {
    issues.push({ reason: 'MULTI_DAY', message: 'A reserva deve começar e terminar no mesmo dia.' });
  } else {
    const weekday = weekdayOf(startDate);
    if (!room.weekdays.includes(weekday)) {
      issues.push({
        reason: 'CLOSED_DAY',
        message: `A sala não funciona às ${siteConfig.weekdayLabels[weekday].toLowerCase()}s.`,
      });
    }
    const { open, close } = roomHours(room, hours);
    const s = timeToMinutes(utcToTimeString(startAt));
    const endTime = utcToTimeString(endAt);
    const e = endTime === '00:00' ? 24 * 60 : timeToMinutes(endTime);
    if (s < timeToMinutes(open) || e > timeToMinutes(close)) {
      issues.push({
        reason: 'OUTSIDE_HOURS',
        message: `Fora do horário de funcionamento da sala (${open.replace(':', 'h')} às ${close.replace(':', 'h')}).`,
      });
    }
  }

  const ignore = new Set(opts.ignoreRefIds ?? []);
  const conflicts = findConflicts(room.id, startAt, endAt, busy).filter((b) => !ignore.has(b.refId));
  const blocks = conflicts.filter((c) => c.kind === 'BLOCK');
  const occupied = conflicts.filter((c) => c.kind !== 'BLOCK');
  if (blocks.length) {
    issues.push({
      reason: 'BLOCKED',
      message: `A sala está bloqueada neste período (${blocks.map((b) => b.publicTitle).join(', ')}).`,
      conflicts: blocks,
    });
  }
  if (occupied.length) {
    issues.push({
      reason: 'CONFLICT',
      message: 'A sala já está reservada neste horário.',
      conflicts: occupied,
    });
  }

  return { available: issues.length === 0, issues };
}

/**
 * Calcula os intervalos livres de uma sala em um dia, a partir do horário
 * de funcionamento e dos períodos ocupados. Usado nos cartões públicos.
 */
export function freeIntervals(
  room: RoomRules,
  date: string,
  busy: BusySlot[],
  hours: OpeningHours,
  toUtc: (date: string, time: string) => Date,
): { startAt: Date; endAt: Date }[] {
  if (!room.active || !room.weekdays.includes(weekdayOf(date))) return [];
  const { open, close } = roomHours(room, hours);
  const dayStart = toUtc(date, open);
  const dayEnd = close === '24:00' ? toUtc(date, '23:59') : toUtc(date, close);
  const relevant = findConflicts(room.id, dayStart, dayEnd, busy);
  const out: { startAt: Date; endAt: Date }[] = [];
  let cursor = dayStart.getTime();
  for (const b of relevant) {
    if (b.startAt.getTime() > cursor) out.push({ startAt: new Date(cursor), endAt: b.startAt });
    cursor = Math.max(cursor, b.endAt.getTime());
  }
  if (cursor < dayEnd.getTime()) out.push({ startAt: new Date(cursor), endAt: dayEnd });
  return out.filter((i) => i.endAt.getTime() - i.startAt.getTime() >= siteConfig.rules.minDurationMinutes * 60000);
}

/**
 * Pedidos concorrentes: dado um conjunto de solicitações pendentes, devolve
 * para cada uma os ids das solicitações (da mesma sala) que disputam um
 * horário sobreposto. A ordem cronológica é dada por `sequence`.
 */
export function findCompetingRequests<T extends { id: string; roomId: string; startAt: Date; endAt: Date; sequence: number }>(
  requests: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const a of requests) {
    const competitors = requests
      .filter((b) => b.id !== a.id && b.roomId === a.roomId && overlaps(a.startAt, a.endAt, b.startAt, b.endAt))
      .sort((x, y) => x.sequence - y.sequence);
    if (competitors.length) map.set(a.id, competitors);
  }
  return map;
}
