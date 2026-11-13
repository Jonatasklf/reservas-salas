import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { removeOccurrenceException } from '@/server/services/recurring';

/** Desfaz a exceção: a ocorrência volta ao padrão da série (se o horário estiver livre). */
export const DELETE = adminRoute<{ id: string; exceptionId: string }>(async (_req, admin, { id, exceptionId }) => {
  await removeOccurrenceException(id, exceptionId, admin.id);
  return json({ ok: true });
});
