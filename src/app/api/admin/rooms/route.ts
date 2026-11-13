import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { roomSchema } from '@/lib/validation';
import { createRoom, listRooms } from '@/server/services/rooms';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => json({ rooms: await listRooms(prisma, { includeInactive: true }) }));

export const POST = adminRoute(async (req, admin) => {
  const input = await parseJson(req, roomSchema);
  return json(await createRoom(input, admin.id), { status: 201 });
});
