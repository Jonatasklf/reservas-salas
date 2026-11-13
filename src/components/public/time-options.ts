import { siteConfig } from '@/config/site';
import { minutesToTime, timeToMinutes } from '@/lib/time';

/** Horários oferecidos nos seletores (de `from` até `to`, no passo configurado). */
export function timeOptions(from: string, to: string, step: number = siteConfig.rules.timeStepMinutes): string[] {
  const out: string[] = [];
  for (let m = timeToMinutes(from); m <= timeToMinutes(to); m += step) out.push(minutesToTime(m));
  return out;
}
