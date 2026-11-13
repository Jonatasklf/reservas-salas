import { json, parseQuery } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { badRequest } from '@/lib/errors';
import { rangeQuerySchema } from '@/lib/validation';
import { getEvents, getMonthSummary } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

/** Indicadores por dia e eventos públicos de um período (máx. 62 dias). */
export const GET = publicRoute(async (req) => {
  const { from, to } = parseQuery(req, rangeQuerySchema);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw badRequest('Período inválido.');
  const [days, events] = await Promise.all([getMonthSummary(from, to), getEvents(from, to)]);
  return json({ days, events });
});
