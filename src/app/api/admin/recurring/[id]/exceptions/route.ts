import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { occurrenceExceptionSchema } from '@/lib/validation';
import { addOccurrenceException } from '@/server/services/recurring';

/** Cancela ou altera (sala/horário) UMA ocorrência. */
export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const input = await parseJson(req, occurrenceExceptionSchema);
  return json(await addOccurrenceException(id, input, admin.id), { status: 201 });
});
