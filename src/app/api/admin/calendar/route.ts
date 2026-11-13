import { json, parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { badRequest } from '@/lib/errors';
import { rangeQuerySchema } from '@/lib/validation';
import { getEvents, getMonthSummary } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (req) => {
  const { from, to } = parseQuery(req, rangeQuerySchema);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw badRequest('Período inválido.');
  const [days, events] = await Promise.all([getMonthSummary(from, to, { admin: true }), getEvents(from, to, { admin: true })]);
  return json({ days, events });
});
