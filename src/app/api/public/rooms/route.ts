import { json } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { listEquipment, listRooms } from '@/server/services/rooms';

export const dynamic = 'force-dynamic';

/** Salas ativas e equipamentos (para filtros e formulário). Sem dados internos. */
export const GET = publicRoute(async () => {
  const [rooms, equipment] = await Promise.all([listRooms(), listEquipment()]);
  return json({
    rooms: rooms.map((r) => ({
      id: r.id, name: r.name, location: r.location, capacity: r.capacity, description: r.description,
      equipment: r.equipment.map((e) => ({ id: e.equipmentId, name: e.equipment.name, key: e.equipment.key })),
    })),
    equipment: equipment.map((e) => ({ id: e.id, key: e.key, name: e.name })),
  });
});
