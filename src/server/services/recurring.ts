/**
 * REUNIÕES RECORRENTES (serviço)
 * =============================================================================
 * - Ao cadastrar, o sistema calcula as ocorrências futuras e lista as datas
 *   que conflitam com reservas, outras recorrências ou bloqueios. Uma
 *   recorrência NUNCA sobrescreve reservas existentes: o administrador deve
 *   ajustar a regra ou confirmar que essas datas fiquem de fora (o sistema
 *   cria exceções do tipo "cancelada" para elas).
 * - "Editar ocorrências futuras" divide a série: a antiga termina na véspera
 *   e uma nova começa na data escolhida. O histórico anterior fica intacto e
 *   as exceções futuras são transferidas para a nova série.
 * - Exceções de uma única ocorrência: cancelar, trocar sala, trocar horário.
 * - Ocorrências passadas não podem ser alteradas.
 * =============================================================================
 */
import type { Prisma, RecurringMeeting } from '@prisma/client';
import { prisma, transaction, lockRooms, type Db } from '@/lib/db';
import { AppError, badRequest, conflict, notFound } from '@/lib/errors';
import {
  addDays, dateStringToUtcMidnight, formatDateShort, todayString, utcMidnightToDateString, zonedToUtc,
} from '@/lib/time';
import { siteConfig } from '@/config/site';
import type { RecurringInput } from '@/lib/validation';
import { checkRoomAvailability } from '../availability';
import { loadBusySlots, loadOccurrences, toMeetingLike } from '../occupancy';
import { describeRule, expandOccurrences, ruleDates, toRRuleString, type RecurrenceRule } from '../recurrence';
import { toExceptionLike } from '../occupancy';
import { assertAvailable, evaluateBooking } from './booking';
import { audit } from './audit';
import { getSettings } from './settings';
import { toRoomRules } from './rooms';

export interface RecurrenceConflict {
  date: string;
  startTime: string;
  endTime: string;
  reasons: { kind: string; title: string; startAt: Date; endAt: Date }[];
}

export interface RecurrencePreview {
  description: string;
  rrule: string;
  checkedFrom: string;
  checkedUntil: string;
  occurrences: number;
  nextDates: string[];
  /** Problemas da regra em si (capacidade, horário de funcionamento, sala inativa). */
  ruleProblems: string[];
  /** Datas que conflitam com reservas, outras recorrências ou bloqueios. */
  conflicts: RecurrenceConflict[];
}

function ruleFromInput(input: RecurringInput): RecurrenceRule {
  return {
    frequency: input.frequency, interval: input.interval, weekdays: input.weekdays,
    monthDay: input.monthDay, nthWeek: input.nthWeek, startDate: input.startDate, endDate: input.endDate,
  };
}

/** Calcula as ocorrências futuras da regra e encontra os conflitos. */
export async function previewRecurrence(
  db: Db,
  input: RecurringInput,
  opts: { excludeMeetingIds?: string[]; now?: Date } = {},
): Promise<RecurrencePreview> {
  const now = opts.now ?? new Date();
  const today = todayString(now);
  const room = await db.room.findUnique({ where: { id: input.roomId } });
  if (!room) throw notFound('Sala');
  const settings = await getSettings(db);
  const hours = { defaultOpenTime: settings.defaultOpenTime, defaultCloseTime: settings.defaultCloseTime };

  const rule = ruleFromInput(input);
  const from = input.startDate > today ? input.startDate : today;
  const horizon = addDays(today, siteConfig.rules.recurrenceConflictHorizonDays);
  const until = input.endDate && input.endDate < horizon ? input.endDate : horizon;
  const dates = ruleDates(rule, from, until);

  const busy = await loadBusySlots(db, {
    from: zonedToUtc(from, '00:00'),
    to: zonedToUtc(addDays(until, 1), '00:00'),
    roomIds: [room.id],
    excludeMeetingIds: opts.excludeMeetingIds,
  });

  const ruleProblems = new Set<string>();
  const conflicts: RecurrenceConflict[] = [];
  for (const date of dates) {
    const startAt = zonedToUtc(date, input.startTime);
    const endAt = zonedToUtc(date, input.endTime);
    if (endAt <= now) continue; // ocorrência de hoje que já terminou
    const res = checkRoomAvailability({
      room: toRoomRules(room), startAt, endAt, participants: input.participants, busy, hours, now, allowPast: true,
    });
    const reasons: RecurrenceConflict['reasons'] = [];
    for (const issue of res.issues) {
      if (issue.reason === 'CONFLICT' || issue.reason === 'BLOCKED') {
        for (const c of issue.conflicts ?? []) reasons.push({ kind: c.kind, title: c.title, startAt: c.startAt, endAt: c.endAt });
      } else if (issue.reason === 'CLOSED_DAY' || issue.reason === 'OUTSIDE_HOURS') {
        ruleProblems.add(issue.message);
      } else {
        ruleProblems.add(issue.message);
      }
    }
    if (reasons.length) conflicts.push({ date, startTime: input.startTime, endTime: input.endTime, reasons });
  }

  return {
    description: describeRule({ ...rule, startTime: input.startTime, endTime: input.endTime }),
    rrule: toRRuleString(rule),
    checkedFrom: from,
    checkedUntil: until,
    occurrences: dates.length,
    nextDates: dates.slice(0, 8),
    ruleProblems: [...ruleProblems],
    conflicts,
  };
}

function assertPreviewAcceptable(preview: RecurrencePreview, skipDates: string[]) {
  if (preview.ruleProblems.length) {
    throw new AppError(400, 'RULE_PROBLEMS', preview.ruleProblems[0], { preview });
  }
  const skip = new Set(skipDates);
  const unresolved = preview.conflicts.filter((c) => !skip.has(c.date));
  if (unresolved.length) {
    throw new AppError(
      409,
      'RECURRENCE_CONFLICTS',
      `A recorrência conflita em ${unresolved.length} data(s). Ajuste a regra ou confirme que essas datas não serão reservadas.`,
      { preview },
    );
  }
}

async function createSkipExceptions(tx: Prisma.TransactionClient, meetingId: string, conflicts: RecurrenceConflict[], adminId: string) {
  for (const c of conflicts) {
    const reason = `Data não reservada por conflito: ${c.reasons.map((r) => r.title).join(', ')}`;
    await tx.recurrenceException.upsert({
      where: { recurringMeetingId_originalDate: { recurringMeetingId: meetingId, originalDate: dateStringToUtcMidnight(c.date) } },
      update: { type: 'CANCELLED', newRoomId: null, newStartTime: null, newEndTime: null, reason },
      create: { recurringMeetingId: meetingId, originalDate: dateStringToUtcMidnight(c.date), type: 'CANCELLED', reason, createdById: adminId },
    });
  }
}

function meetingData(input: RecurringInput) {
  return {
    name: input.name, description: input.description, publicTitle: input.publicTitle, showPublicTitle: input.showPublicTitle,
    roomId: input.roomId, frequency: input.frequency, interval: input.interval,
    weekdays: [...new Set(input.weekdays)].sort(), monthDay: input.frequency === 'MONTHLY_DAY' ? input.monthDay : null,
    nthWeek: input.frequency === 'MONTHLY_NTH_WEEKDAY' ? input.nthWeek : null,
    rrule: toRRuleString(ruleFromInput(input)), startTime: input.startTime, endTime: input.endTime,
    startDate: dateStringToUtcMidnight(input.startDate), endDate: input.endDate ? dateStringToUtcMidnight(input.endDate) : null,
    participants: input.participants,
  };
}

export async function createRecurring(input: RecurringInput, adminId: string, skipDates: string[] = [], now = new Date()) {
  return transaction(async (tx) => {
    await lockRooms(tx, [input.roomId]);
    const room = await tx.room.findUnique({ where: { id: input.roomId } });
    if (!room) throw notFound('Sala');
    if (!room.active) throw conflict('Esta sala está desativada e não pode receber novas reservas.');
    const preview = await previewRecurrence(tx, input, { now });
    assertPreviewAcceptable(preview, skipDates);

    const meeting = await tx.recurringMeeting.create({
      data: {
        ...meetingData(input),
        createdById: adminId,
        equipment: { create: [...new Set(input.equipmentIds)].map((equipmentId) => ({ equipmentId })) },
      },
    });
    await createSkipExceptions(tx, meeting.id, preview.conflicts, adminId);
    await audit(tx, {
      adminId, action: 'RECURRING_CREATED', entityType: 'RecurringMeeting', entityId: meeting.id,
      summary: `Reunião recorrente "${meeting.name}" cadastrada (${preview.description}).` +
        (preview.conflicts.length ? ` ${preview.conflicts.length} data(s) ficaram de fora por conflito.` : ''),
      details: { skipped: preview.conflicts.map((c) => c.date) },
    });
    return meeting;
  });
}

/**
 * Edita todas as ocorrências a partir de `effectiveFrom`, preservando o
 * histórico anterior (divisão da série) e as exceções futuras.
 */
export async function updateRecurringFuture(
  id: string,
  effectiveFrom: string,
  input: RecurringInput,
  adminId: string,
  opts: { skipDates?: string[]; reason?: string | null; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const today = todayString(now);
  if (effectiveFrom < today) throw badRequest('A alteração deve valer a partir de hoje ou de uma data futura.');

  return transaction(async (tx) => {
    const current = await tx.recurringMeeting.findUnique({ where: { id } });
    if (!current) throw notFound('Reunião recorrente');
    await lockRooms(tx, [current.roomId, input.roomId]);
    const room = await tx.room.findUnique({ where: { id: input.roomId } });
    if (!room?.active) throw conflict('A sala escolhida está desativada.');

    const currentStart = utcMidnightToDateString(current.startDate);
    // Se a alteração vale desde o início da série, nenhuma ocorrência
    // anterior é afetada e a série pode ser alterada diretamente.
    const inPlace = effectiveFrom <= currentStart;

    if (inPlace) {
      // A série ainda não começou: pode ser alterada diretamente.
      const preview = await previewRecurrence(tx, input, { excludeMeetingIds: [id], now });
      assertPreviewAcceptable(preview, opts.skipDates ?? []);
      await tx.recurringEquipment.deleteMany({ where: { recurringMeetingId: id } });
      const updated = await tx.recurringMeeting.update({
        where: { id },
        data: {
          ...meetingData(input),
          equipment: { create: [...new Set(input.equipmentIds)].map((equipmentId) => ({ equipmentId })) },
        },
      });
      await createSkipExceptions(tx, id, preview.conflicts, adminId);
      await audit(tx, {
        adminId, action: 'RECURRING_UPDATED', entityType: 'RecurringMeeting', entityId: id,
        summary: `Reunião recorrente alterada (${preview.description})${opts.reason ? ': ' + opts.reason : ''}.`,
      });
      return updated;
    }

    // Divisão da série: a atual termina na véspera de effectiveFrom.
    const newStart = input.startDate > effectiveFrom ? input.startDate : effectiveFrom;
    const newInput = { ...input, startDate: newStart };
    const preview = await previewRecurrence(tx, newInput, { excludeMeetingIds: [id], now });
    assertPreviewAcceptable(preview, opts.skipDates ?? []);

    await tx.recurringMeeting.update({
      where: { id },
      data: { endDate: dateStringToUtcMidnight(addDays(effectiveFrom, -1)), status: 'ENDED' },
    });
    const next = await tx.recurringMeeting.create({
      data: {
        ...meetingData(newInput),
        status: current.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        suspendedFrom: current.suspendedFrom,
        suspendedUntil: current.suspendedUntil,
        previousSeriesId: id,
        createdById: adminId,
        equipment: { create: [...new Set(input.equipmentIds)].map((equipmentId) => ({ equipmentId })) },
      },
    });
    // Exceções futuras passam para a nova série (o histórico fica na antiga).
    await tx.recurrenceException.updateMany({
      where: { recurringMeetingId: id, originalDate: { gte: dateStringToUtcMidnight(effectiveFrom) } },
      data: { recurringMeetingId: next.id },
    });
    await createSkipExceptions(tx, next.id, preview.conflicts, adminId);
    const summary = `Ocorrências a partir de ${formatDateShort(effectiveFrom)} alteradas${opts.reason ? ': ' + opts.reason : ''}.`;
    await audit(tx, { adminId, action: 'RECURRING_SPLIT', entityType: 'RecurringMeeting', entityId: id, summary: `${summary} Continua na nova série.`, details: { nextSeriesId: next.id } });
    await audit(tx, { adminId, action: 'RECURRING_CREATED', entityType: 'RecurringMeeting', entityId: next.id, summary: `${summary} (${preview.description})`, details: { previousSeriesId: id } });
    return next;
  });
}

async function getMeetingOrThrow(db: Db, id: string): Promise<RecurringMeeting> {
  const m = await db.recurringMeeting.findUnique({ where: { id } });
  if (!m) throw notFound('Reunião recorrente');
  return m;
}

export async function addOccurrenceException(
  id: string,
  input: { originalDate: string; type: 'CANCELLED' | 'MODIFIED'; newRoomId: string | null; newStartTime: string | null; newEndTime: string | null; reason: string | null },
  adminId: string,
  now = new Date(),
) {
  const today = todayString(now);
  if (input.originalDate < today) throw conflict('Ocorrências passadas não podem ser alteradas (histórico preservado).');
  return transaction(async (tx) => {
    const meeting = await getMeetingOrThrow(tx, id);
    const like = toMeetingLike(meeting);
    if (!ruleDates(like, input.originalDate, input.originalDate).length) {
      throw badRequest('A data informada não corresponde a uma ocorrência desta reunião.');
    }
    const newRoomId = input.type === 'MODIFIED' ? input.newRoomId ?? meeting.roomId : null;
    await lockRooms(tx, [meeting.roomId, ...(newRoomId ? [newRoomId] : [])]);

    if (input.type === 'MODIFIED') {
      const room = await tx.room.findUnique({ where: { id: newRoomId! } });
      if (!room) throw notFound('Sala');
      const startTime = input.newStartTime ?? meeting.startTime;
      const endTime = input.newEndTime ?? meeting.endTime;
      assertAvailable(
        await evaluateBooking(tx, {
          room, startAt: zonedToUtc(input.originalDate, startTime), endAt: zonedToUtc(input.originalDate, endTime),
          participants: meeting.participants, now, excludeMeetingIds: [id],
        }),
      );
    }

    const data = {
      type: input.type, newRoomId, reason: input.reason,
      newStartTime: input.type === 'MODIFIED' ? input.newStartTime : null,
      newEndTime: input.type === 'MODIFIED' ? input.newEndTime : null,
    };
    const ex = await tx.recurrenceException.upsert({
      where: { recurringMeetingId_originalDate: { recurringMeetingId: id, originalDate: dateStringToUtcMidnight(input.originalDate) } },
      update: data,
      create: { ...data, recurringMeetingId: id, originalDate: dateStringToUtcMidnight(input.originalDate), createdById: adminId },
    });
    await audit(tx, {
      adminId,
      action: input.type === 'CANCELLED' ? 'OCCURRENCE_CANCELLED' : 'OCCURRENCE_MODIFIED',
      entityType: 'RecurringMeeting',
      entityId: id,
      summary: `Ocorrência de ${formatDateShort(input.originalDate)} ${input.type === 'CANCELLED' ? 'cancelada' : 'alterada'}${input.reason ? ': ' + input.reason : ''}.`,
      details: data,
    });
    return ex;
  });
}

/** Desfaz uma exceção (a ocorrência volta ao normal), se o horário ainda estiver livre. */
export async function removeOccurrenceException(id: string, exceptionId: string, adminId: string, now = new Date()) {
  return transaction(async (tx) => {
    const meeting = await getMeetingOrThrow(tx, id);
    const ex = await tx.recurrenceException.findFirst({ where: { id: exceptionId, recurringMeetingId: id } });
    if (!ex) throw notFound('Exceção');
    const date = utcMidnightToDateString(ex.originalDate);
    if (date < todayString(now)) throw conflict('Ocorrências passadas não podem ser alteradas (histórico preservado).');
    await lockRooms(tx, [meeting.roomId]);
    const room = await tx.room.findUniqueOrThrow({ where: { id: meeting.roomId } });
    assertAvailable(
      await evaluateBooking(tx, {
        room, startAt: zonedToUtc(date, meeting.startTime), endAt: zonedToUtc(date, meeting.endTime),
        participants: meeting.participants, now, excludeMeetingIds: [id],
      }),
    );
    await tx.recurrenceException.delete({ where: { id: exceptionId } });
    await audit(tx, {
      adminId, action: 'OCCURRENCE_RESTORED', entityType: 'RecurringMeeting', entityId: id,
      summary: `Ocorrência de ${formatDateShort(date)} restaurada ao padrão da série.`,
    });
  });
}

export async function suspendRecurring(id: string, from: string, until: string | null, reason: string | null, adminId: string) {
  const meeting = await getMeetingOrThrow(prisma, id);
  const updated = await prisma.recurringMeeting.update({
    where: { id: meeting.id },
    data: { status: 'SUSPENDED', suspendedFrom: dateStringToUtcMidnight(from), suspendedUntil: until ? dateStringToUtcMidnight(until) : null },
  });
  await audit(prisma, {
    adminId, action: 'RECURRING_SUSPENDED', entityType: 'RecurringMeeting', entityId: id,
    summary: `Série suspensa de ${formatDateShort(from)}${until ? ` até ${formatDateShort(until)}` : ' por tempo indeterminado'}${reason ? ': ' + reason : ''}.`,
  });
  return updated;
}

/** Retoma a série. Datas que foram ocupadas durante a suspensão são listadas. */
export async function resumeRecurring(id: string, adminId: string, skipDates: string[] = [], now = new Date()) {
  return transaction(async (tx) => {
    const meeting = await getMeetingOrThrow(tx, id);
    if (meeting.status !== 'SUSPENDED') throw conflict('Esta série não está suspensa.');
    await lockRooms(tx, [meeting.roomId]);
    const like = toMeetingLike(meeting);
    const today = todayString(now);
    const windowStart = like.suspendedFrom && like.suspendedFrom > today ? like.suspendedFrom : today;
    let windowEnd = like.suspendedUntil ?? addDays(today, siteConfig.rules.recurrenceConflictHorizonDays);
    if (like.endDate && like.endDate < windowEnd) windowEnd = like.endDate;

    const existing = await tx.recurrenceException.findMany({ where: { recurringMeetingId: id, type: 'CANCELLED' } });
    const alreadyCancelled = new Set(existing.map((e) => utcMidnightToDateString(e.originalDate)));
    const preview =
      windowStart <= windowEnd
        ? await previewRecurrence(
            tx,
            {
              ...like, name: meeting.name, description: meeting.description, publicTitle: meeting.publicTitle,
              startDate: windowStart, endDate: windowEnd, equipmentIds: [],
            } as RecurringInput,
            { excludeMeetingIds: [id], now },
          )
        : null;
    if (preview) {
      preview.conflicts = preview.conflicts.filter((c) => !alreadyCancelled.has(c.date));
      assertPreviewAcceptable({ ...preview, ruleProblems: [] }, skipDates);
      await createSkipExceptions(tx, id, preview.conflicts, adminId);
    }
    const updated = await tx.recurringMeeting.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedFrom: null, suspendedUntil: null },
    });
    await audit(tx, {
      adminId, action: 'RECURRING_RESUMED', entityType: 'RecurringMeeting', entityId: id,
      summary: `Série retomada.${preview?.conflicts.length ? ` ${preview.conflicts.length} data(s) ficaram de fora por conflito.` : ''}`,
    });
    return updated;
  });
}

export async function endRecurring(id: string, endDate: string, reason: string | null, adminId: string, now = new Date()) {
  const meeting = await getMeetingOrThrow(prisma, id);
  const today = todayString(now);
  if (endDate < addDays(today, -1)) throw badRequest('Para preservar o histórico, a data de encerramento deve ser de ontem em diante.');
  if (endDate < utcMidnightToDateString(meeting.startDate)) throw badRequest('A data de encerramento é anterior ao início da série.');
  const updated = await prisma.recurringMeeting.update({
    where: { id },
    data: { endDate: dateStringToUtcMidnight(endDate), status: 'ENDED' },
  });
  await audit(prisma, {
    adminId, action: 'RECURRING_ENDED', entityType: 'RecurringMeeting', entityId: id,
    summary: `Série encerrada em ${formatDateShort(endDate)}${reason ? ': ' + reason : ''}.`,
  });
  return updated;
}

// -----------------------------------------------------------------------------
// Consultas
// -----------------------------------------------------------------------------
export async function listRecurring(now = new Date()) {
  const today = todayString(now);
  const meetings = await prisma.recurringMeeting.findMany({
    include: {
      room: { select: { id: true, name: true, active: true } },
      equipment: { include: { equipment: { select: { id: true, name: true } } } },
      exceptions: true,
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return meetings.map((m) => {
    const like = toMeetingLike(m);
    const next = expandOccurrences(like, m.exceptions.map(toExceptionLike), today, addDays(today, 120))
      .filter((o) => o.state === 'SCHEDULED' && o.endAt > now)
      .slice(0, 3);
    return {
      ...m,
      startDate: like.startDate,
      endDate: like.endDate,
      suspendedFrom: like.suspendedFrom,
      suspendedUntil: like.suspendedUntil,
      ruleText: describeRule({ ...like }),
      exceptionsCount: m.exceptions.length,
      exceptions: undefined,
      nextOccurrences: next.map((o) => ({ date: o.date, startTime: o.startTime, endTime: o.endTime, roomId: o.roomId })),
    };
  });
}

export async function getRecurringDetail(id: string, now = new Date()) {
  const m = await prisma.recurringMeeting.findUnique({
    where: { id },
    include: {
      room: true,
      equipment: { include: { equipment: true } },
      exceptions: { orderBy: { originalDate: 'asc' }, include: { newRoom: { select: { id: true, name: true } } } },
      previousSeries: { select: { id: true, name: true } },
      nextSeries: { select: { id: true, name: true } },
    },
  });
  if (!m) throw notFound('Reunião recorrente');
  const like = toMeetingLike(m);
  const today = todayString(now);
  const occurrences = expandOccurrences(like, m.exceptions.map(toExceptionLike), addDays(today, -30), addDays(today, 180));
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'RecurringMeeting', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { admin: { select: { name: true } } },
  });
  return {
    ...m,
    startDate: like.startDate,
    endDate: like.endDate,
    suspendedFrom: like.suspendedFrom,
    suspendedUntil: like.suspendedUntil,
    ruleText: describeRule(like),
    exceptions: m.exceptions.map((e) => ({ ...e, originalDate: utcMidnightToDateString(e.originalDate) })),
    occurrences,
    history,
  };
}

export { loadOccurrences };
