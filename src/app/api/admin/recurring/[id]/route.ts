import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { dateStr, recurringUpdateSchema } from '@/lib/validation';
import { getRecurringDetail, updateRecurringFuture } from '@/server/services/recurring';

export const dynamic = 'force-dynamic';

export const GET = adminRoute<{ id: string }>(async (_req, _admin, { id }) => json(await getRecurringDetail(id)));

const body = recurringUpdateSchema.and(z.object({ skipDates: z.array(dateStr).default([]) }));

/** Edita todas as ocorrências a partir de effectiveFrom (preserva histórico). */
export const PUT = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { effectiveFrom, data, reason, skipDates } = await parseJson(req, body);
  return json(await updateRecurringFuture(id, effectiveFrom, data, admin.id, { skipDates, reason }));
});
