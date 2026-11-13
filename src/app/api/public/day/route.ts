import { json, parseQuery } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { availabilityQuerySchema } from '@/lib/validation';
import { getDayAvailability } from '@/server/services/calendar';

export const dynamic = 'force-dynamic';

/** Situação de cada sala em uma data (com filtros opcionais de horário/participantes/equipamentos). */
export const GET = publicRoute(async (req) => {
  const q = parseQuery(req, availabilityQuerySchema);
  const rooms = await getDayAvailability(q.date, {
    startTime: q.startTime, endTime: q.endTime, participants: q.participants, equipment: q.equipment,
  });
  return json({ date: q.date, rooms });
});
