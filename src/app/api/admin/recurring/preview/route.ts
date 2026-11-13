import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { prisma } from '@/lib/db';
import { recurringSchema } from '@/lib/validation';
import { previewRecurrence } from '@/server/services/recurring';

const body = z.object({ data: recurringSchema, excludeMeetingId: z.string().optional() });

/** Lista ocorrências e datas conflitantes ANTES de salvar. */
export const POST = adminRoute(async (req) => {
  const { data, excludeMeetingId } = await parseJson(req, body);
  return json(await previewRecurrence(prisma, data, { excludeMeetingIds: excludeMeetingId ? [excludeMeetingId] : [] }));
});
