import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { dateStr } from '@/lib/validation';
import { resumeRecurring } from '@/server/services/recurring';

const body = z.object({ skipDates: z.array(dateStr).default([]) });

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { skipDates } = await parseJson(req, body);
  return json(await resumeRecurring(id, admin.id, skipDates));
});
