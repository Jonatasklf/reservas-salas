import { json, parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { activityQuerySchema } from '@/lib/validation';
import { activityFiltersFromQuery, listActivity } from '@/server/services/activity';

export const dynamic = 'force-dynamic';

/** Registro de atividades (mais recentes primeiro), com filtros. */
export const GET = adminRoute(async (req) => json(await listActivity(activityFiltersFromQuery(parseQuery(req, activityQuerySchema)))));
