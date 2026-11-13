import { z } from 'zod';
import { json, parseJson, parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { adminReservationSchema, dateStr } from '@/lib/validation';
import { createAdminReservation, listReservations } from '@/server/services/reservations';

export const dynamic = 'force-dynamic';

const filters = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  roomId: z.string().optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const GET = adminRoute(async (req) => json({ reservations: await listReservations(parseQuery(req, filters)) }));

export const POST = adminRoute(async (req, admin) => {
  const input = await parseJson(req, adminReservationSchema);
  return json(await createAdminReservation(input, admin.id), { status: 201 });
});
