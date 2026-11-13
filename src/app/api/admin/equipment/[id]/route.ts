import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { equipmentSchema } from '@/lib/validation';
import { updateEquipment } from '@/server/services/rooms';

export const PUT = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const input = await parseJson(req, equipmentSchema);
  return json(await updateEquipment(id, input, admin.id));
});
