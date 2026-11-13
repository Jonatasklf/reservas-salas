import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { dateStr, recurringSchema } from '@/lib/validation';
import { createRecurring, listRecurring } from '@/server/services/recurring';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => json({ meetings: await listRecurring() }));

const body = z.object({ data: recurringSchema, skipDates: z.array(dateStr).default([]) });

export const POST = adminRoute(async (req, admin) => {
  const { data, skipDates } = await parseJson(req, body);
  return json(await createRecurring(data, admin.id, skipDates), { status: 201 });
});
