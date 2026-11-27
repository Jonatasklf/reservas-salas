import { parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { csvResponse, toCsv } from '@/lib/csv';
import { formatDateTime, todayString } from '@/lib/time';
import { activityQuerySchema } from '@/lib/validation';
import { ACTIVITY_CATEGORIES, activityFiltersFromQuery, exportActivity } from '@/server/services/activity';

export const dynamic = 'force-dynamic';

/** Exporta o registro de atividades filtrado em CSV (abre no Excel). */
export const GET = adminRoute(async (req) => {
  const f = activityFiltersFromQuery(parseQuery(req, activityQuerySchema));
  const rows = await exportActivity(f);
  const csv = toCsv([
    ['Data e hora', 'Categoria', 'Ação', 'Descrição', 'Administrador'],
    ...rows.map((r) => [formatDateTime(r.createdAt), ACTIVITY_CATEGORIES[r.category].label, r.action, r.summary, r.admin?.name ?? 'Sistema / público']),
  ]);
  return csvResponse(csv, `registro-de-atividades-${f.from ?? 'inicio'}-a-${f.to ?? todayString()}.csv`);
});
