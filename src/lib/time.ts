/**
 * Utilitários de data e hora.
 *
 * Regra do projeto: todo instante é guardado em UTC no banco e convertido
 * para o fuso America/Sao_Paulo apenas para exibição ou quando o usuário
 * informa uma data local ("2026-11-20" + "19:00").
 *
 * Datas de calendário (sem hora) são representadas como string "YYYY-MM-DD".
 */
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import { siteConfig } from '@/config/site';

export const TIME_ZONE = siteConfig.timeZone;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** "HH:mm" -> minutos desde a meia-noite. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Converte data + hora locais (São Paulo) em um instante UTC. */
export function zonedToUtc(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TIME_ZONE);
}

/** Data local "YYYY-MM-DD" de um instante. */
export function utcToDateString(instant: Date): string {
  return formatInTimeZone(instant, TIME_ZONE, 'yyyy-MM-dd');
}

/** Hora local "HH:mm" de um instante. */
export function utcToTimeString(instant: Date): string {
  return formatInTimeZone(instant, TIME_ZONE, 'HH:mm');
}

/** Hoje, no fuso de São Paulo. */
export function todayString(now: Date = new Date()): string {
  return utcToDateString(now);
}

/** Início (00:00) e fim (00:00 do dia seguinte) de um dia local, em UTC. */
export function dayBoundsUtc(date: string): { start: Date; end: Date } {
  return { start: zonedToUtc(date, '00:00'), end: zonedToUtc(addDays(date, 1), '00:00') };
}

/** Soma dias a uma data "YYYY-MM-DD" (aritmética de calendário, sem fuso). */
export function addDays(date: string, days: number): string {
  const d = dateStringToUtcMidnight(date);
  d.setUTCDate(d.getUTCDate() + days);
  return utcMidnightToDateString(d);
}

/** Dia da semana (0 = domingo) de uma data "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  return dateStringToUtcMidnight(date).getUTCDay();
}

/**
 * Datas de calendário viajam como "meia-noite UTC" — é assim que o Prisma
 * representa colunas @db.Date. Estas duas funções fazem a ponte.
 */
export function dateStringToUtcMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcMidnightToDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lista de datas entre from e to (inclusive). */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Formatação para exibição (pt-BR)
// ---------------------------------------------------------------------------
export function formatDateLong(date: string): string {
  const text = formatInTimeZone(zonedToUtc(date, '12:00'), TIME_ZONE, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateShort(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(instant: Date | string): string {
  return formatInTimeZone(new Date(instant), TIME_ZONE, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

/** "19:00" -> "19h00" */
export function formatTime(time: string): string {
  return time.replace(':', 'h');
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatTime(utcToTimeString(new Date(start)))} às ${formatTime(utcToTimeString(new Date(end)))}`;
}

export function zonedNow(): Date {
  return toZonedTime(new Date(), TIME_ZONE);
}
