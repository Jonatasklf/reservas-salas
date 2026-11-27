import { json, parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { reportQuerySchema } from '@/lib/validation';
import { checkReportPeriod, getReport } from '@/server/services/reports';

export const dynamic = 'force-dynamic';

/** Indicadores do período (solicitações, ocupação, mensagens, acessos). */
export const GET = adminRoute(async (req) => {
  const q = parseQuery(req, reportQuerySchema);
  checkReportPeriod(q.from, q.to);
  return json(await getReport(q));
});
