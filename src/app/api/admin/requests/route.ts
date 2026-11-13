import { z } from 'zod';
import { json, parseQuery } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { dateStr } from '@/lib/validation';
import { listQueue } from '@/server/services/requests';

export const dynamic = 'force-dynamic';

const statuses = ['PENDING', 'AWAITING_INFO', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const filters = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((s): s is (typeof statuses)[number] => (statuses as readonly string[]).includes(s)) : [])),
  roomId: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  search: z.string().trim().max(100).optional(),
});

/** Fila em ordem cronológica de recebimento (mais antigas primeiro). */
export const GET = adminRoute(async (req) => {
  const f = parseQuery(req, filters);
  return json({ requests: await listQueue({ ...f, statuses: f.status }) });
});
