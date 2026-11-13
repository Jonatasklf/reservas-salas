import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { cancelSchema } from '@/lib/validation';
import { cancelReservation } from '@/server/services/reservations';

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { reason } = await parseJson(req, cancelSchema);
  return json(await cancelReservation(id, reason, admin.id));
});
