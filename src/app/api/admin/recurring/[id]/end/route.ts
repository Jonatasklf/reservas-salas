import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { endSeriesSchema } from '@/lib/validation';
import { endRecurring } from '@/server/services/recurring';

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { endDate, reason } = await parseJson(req, endSeriesSchema);
  return json(await endRecurring(id, endDate, reason, admin.id));
});
