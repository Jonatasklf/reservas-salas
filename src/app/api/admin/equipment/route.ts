import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { equipmentSchema } from '@/lib/validation';
import { createEquipment, listEquipment } from '@/server/services/rooms';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => json({ equipment: await listEquipment(prisma, { includeInactive: true }) }));

export const POST = adminRoute(async (req, admin) => {
  const input = await parseJson(req, equipmentSchema);
  return json(await createEquipment(input, admin.id), { status: 201 });
});
