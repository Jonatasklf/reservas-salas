import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { roomSchema } from '@/lib/validation';
import { getRoom, updateRoom } from '@/server/services/rooms';
import { listAudit } from '@/server/services/audit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = adminRoute<{ id: string }>(async (_req, _admin, { id }) =>
  json({ room: await getRoom(id), history: await listAudit(prisma, 'Room', id) }),
);

export const PUT = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const input = await parseJson(req, roomSchema);
  return json(await updateRoom(id, input, admin.id));
});
