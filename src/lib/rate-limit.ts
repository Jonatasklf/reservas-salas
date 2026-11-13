/**
 * Limitador simples de tentativas, em memória (por processo).
 * Suficiente para um único servidor. Para vários servidores, troque por
 * um armazenamento compartilhado (ex.: Redis) mantendo a mesma interface.
 */
import { tooManyRequests } from './errors';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  if (process.env.DISABLE_RATE_LIMIT === '1') return;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw tooManyRequests();
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
