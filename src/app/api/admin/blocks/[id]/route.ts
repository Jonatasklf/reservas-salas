import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { deleteBlock } from '@/server/services/blocks';

export const DELETE = adminRoute<{ id: string }>(async (_req, admin, { id }) => {
  await deleteBlock(id, admin.id);
  return json({ ok: true });
});
