import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { suspendSchema } from '@/lib/validation';
import { suspendRecurring } from '@/server/services/recurring';

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { from, until, reason } = await parseJson(req, suspendSchema);
  return json(await suspendRecurring(id, from, until, reason, admin.id));
});
