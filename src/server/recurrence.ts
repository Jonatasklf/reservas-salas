/**
 * MOTOR DE REUNIÕES RECORRENTES
 * =============================================================================
 * Uma reunião recorrente é guardada UMA vez no banco, com sua regra
 * (frequência, dias da semana, horário, data inicial/final). As ocorrências
 * são calculadas sob demanda apenas para o período consultado — nunca são
 * criados registros infinitos.
 *
 * O cálculo das datas usa a biblioteca `rrule` (padrão iCalendar RFC 5545).
 * As datas são tratadas como "datas de calendário" (meia-noite UTC
 * representando o dia local) e só depois combinadas com o horário local de
 * São Paulo para virar instantes reais.
 *
 * Exceções (RecurrenceException) ajustam ocorrências individuais:
 *   - CANCELLED: aquela data não acontece (libera a sala).
 *   - MODIFIED: aquela data acontece em outra sala e/ou outro horário.
 * Suspensão temporária: datas entre suspendedFrom e suspendedUntil não ocorrem.
 * =============================================================================
 */
import { RRule, Weekday, type Options } from 'rrule';
import { addDays, dateStringToUtcMidnight, utcMidnightToDateString, weekdayOf, zonedToUtc } from '@/lib/time';

export type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY_DAY' | 'MONTHLY_NTH_WEEKDAY' | 'CUSTOM';

export interface RecurrenceRule {
  frequency: Frequency;
  interval: number;
  weekdays: number[]; // 0 = domingo
  monthDay: number | null;
  nthWeek: number | null; // 1..4 ou -1 (última)
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
}

export interface RecurringMeetingLike extends RecurrenceRule {
  id: string;
  name: string;
  publicTitle: string | null;
  showPublicTitle: boolean;
  roomId: string;
  startTime: string;
  endTime: string;
  participants: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  suspendedFrom: string | null;
  suspendedUntil: string | null;
}

export interface ExceptionLike {
  id: string;
  originalDate: string;
  type: 'CANCELLED' | 'MODIFIED';
  newRoomId: string | null;
  newStartTime: string | null;
  newEndTime: string | null;
  reason: string | null;
}

export type OccurrenceState = 'SCHEDULED' | 'CANCELLED' | 'SUSPENDED';

export interface Occurrence {
  meetingId: string;
  name: string;
  publicTitle: string;
  /** Data original da regra (chave da exceção). */
  originalDate: string;
  date: string;
  roomId: string;
  startTime: string;
  endTime: string;
  startAt: Date;
  endAt: Date;
  participants: number;
  state: OccurrenceState;
  modified: boolean;
  exceptionId?: string;
  exceptionReason?: string | null;
}

/** Converte o dia da semana JS (0 = domingo) para o índice do rrule (0 = segunda). */
const toRRuleWeekday = (jsDay: number) => (jsDay + 6) % 7;

/** Monta as opções do rrule a partir da regra cadastrada. */
export function buildRRuleOptions(rule: RecurrenceRule): Partial<Options> {
  const dtstart = dateStringToUtcMidnight(rule.startDate);
  const until = rule.endDate ? dateStringToUtcMidnight(rule.endDate) : null;
  const days = rule.weekdays.length ? rule.weekdays : [weekdayOf(rule.startDate)];
  const base: Partial<Options> = { dtstart, until, wkst: RRule.SU };

  switch (rule.frequency) {
    case 'DAILY':
      return { ...base, freq: RRule.DAILY, interval: Math.max(1, rule.interval) };
    case 'WEEKLY':
      return { ...base, freq: RRule.WEEKLY, interval: 1, byweekday: days.map(toRRuleWeekday) };
    case 'BIWEEKLY':
      return { ...base, freq: RRule.WEEKLY, interval: 2, byweekday: days.map(toRRuleWeekday) };
    case 'CUSTOM':
      return { ...base, freq: RRule.WEEKLY, interval: Math.max(1, rule.interval), byweekday: days.map(toRRuleWeekday) };
    case 'MONTHLY_DAY':
      return {
        ...base,
        freq: RRule.MONTHLY,
        interval: Math.max(1, rule.interval),
        bymonthday: rule.monthDay ?? dtstart.getUTCDate(),
      };
    case 'MONTHLY_NTH_WEEKDAY':
      return {
        ...base,
        freq: RRule.MONTHLY,
        interval: Math.max(1, rule.interval),
        byweekday: [new Weekday(toRRuleWeekday(days[0]), rule.nthWeek ?? 1)],
      };
  }
}

/** Texto RRULE (RFC 5545) equivalente, guardado para referência. */
export function toRRuleString(rule: RecurrenceRule): string {
  return new RRule(buildRRuleOptions(rule)).toString();
}

/** Datas (YYYY-MM-DD) em que a regra ocorre dentro de [from, to]. */
export function ruleDates(rule: RecurrenceRule, from: string, to: string): string[] {
  const start = from < rule.startDate ? rule.startDate : from;
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (start > end) return [];
  const rr = new RRule(buildRRuleOptions(rule));
  return rr
    .between(dateStringToUtcMidnight(start), dateStringToUtcMidnight(end), true)
    .map(utcMidnightToDateString);
}

function isSuspended(m: RecurringMeetingLike, date: string): boolean {
  if (!m.suspendedFrom) return false;
  return date >= m.suspendedFrom && (!m.suspendedUntil || date <= m.suspendedUntil);
}

/**
 * Calcula as ocorrências de uma reunião no período [from, to] (datas locais),
 * aplicando suspensões e exceções.
 */
export function expandOccurrences(
  meeting: RecurringMeetingLike,
  exceptions: ExceptionLike[],
  from: string,
  to: string,
): Occurrence[] {
  const byDate = new Map(exceptions.map((e) => [e.originalDate, e]));
  // Busca um dia antes/depois para não perder exceções que mudaram o horário
  // (o dia continua o mesmo; o intervalo extra é apenas uma margem segura).
  const dates = ruleDates(meeting, addDays(from, -1), addDays(to, 1));
  const out: Occurrence[] = [];

  for (const originalDate of dates) {
    const ex = byDate.get(originalDate);
    const roomId = ex?.type === 'MODIFIED' && ex.newRoomId ? ex.newRoomId : meeting.roomId;
    const startTime = ex?.type === 'MODIFIED' && ex.newStartTime ? ex.newStartTime : meeting.startTime;
    const endTime = ex?.type === 'MODIFIED' && ex.newEndTime ? ex.newEndTime : meeting.endTime;
    const date = originalDate;
    if (date < from || date > to) continue;

    let state: OccurrenceState = 'SCHEDULED';
    if (ex?.type === 'CANCELLED') state = 'CANCELLED';
    else if (isSuspended(meeting, date)) state = 'SUSPENDED';

    out.push({
      meetingId: meeting.id,
      name: meeting.name,
      publicTitle: meeting.showPublicTitle ? meeting.publicTitle || meeting.name : 'Reunião recorrente',
      originalDate,
      date,
      roomId,
      startTime,
      endTime,
      startAt: zonedToUtc(date, startTime),
      endAt: zonedToUtc(date, endTime),
      participants: meeting.participants,
      state,
      modified: ex?.type === 'MODIFIED',
      exceptionId: ex?.id,
      exceptionReason: ex?.reason ?? null,
    });
  }
  return out;
}

/** Descrição amigável da regra, em português. */
export function describeRule(rule: RecurrenceRule & { startTime?: string; endTime?: string }): string {
  const names = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const nth: Record<number, string> = { 1: 'primeira', 2: 'segunda', 3: 'terceira', 4: 'quarta', [-1]: 'última' };
  const days = (rule.weekdays.length ? rule.weekdays : [weekdayOf(rule.startDate)])
    .slice()
    .sort()
    .map((d) => names[d]);
  const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}` : days[0];
  // "Toda terça-feira" / "Todo sábado" / "Semanalmente: segunda-feira e quarta-feira"
  const every =
    days.length === 1 ? `${days[0] === 'sábado' || days[0] === 'domingo' ? 'Todo' : 'Toda'} ${days[0]}` : `Semanalmente: ${list}`;
  let text: string;
  switch (rule.frequency) {
    case 'DAILY':
      text = rule.interval > 1 ? `A cada ${rule.interval} dias` : 'Todos os dias';
      break;
    case 'WEEKLY':
      text = every;
      break;
    case 'BIWEEKLY':
      text = `Quinzenalmente: ${list}`;
      break;
    case 'CUSTOM':
      text = rule.interval > 1 ? `A cada ${rule.interval} semanas: ${list}` : every;
      break;
    case 'MONTHLY_DAY':
      text = `Todo dia ${rule.monthDay} do mês`;
      break;
    case 'MONTHLY_NTH_WEEKDAY':
      text = `${nth[rule.nthWeek ?? 1]} ${days[0]} de cada mês`;
      text = text[0].toUpperCase() + text.slice(1);
      break;
  }
  if (rule.startTime && rule.endTime) text += `, das ${rule.startTime.replace(':', 'h')} às ${rule.endTime.replace(':', 'h')}`;
  return text;
}
