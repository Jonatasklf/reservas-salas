import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { adminReservationSchema } from '@/lib/validation';
import { getReservation, updateReservation } from '@/server/services/reservations';

export const dynamic = 'force-dynamic';

export const GET = adminRoute<{ id: string }>(async (_req, _admin, { id }) => json(await getReservation(id)));

export const PUT = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const input = await parseJson(req, adminReservationSchema);
  return json(await updateReservation(id, input, admin.id));
});
