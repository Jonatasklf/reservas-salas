import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { setAdminActive } from '@/server/services/admins';

export const PATCH = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const { active } = await parseJson(req, z.object({ active: z.boolean() }));
  await setAdminActive(id, active, admin.id);
  return json({ ok: true });
});
