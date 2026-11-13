import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { decisionSchema } from '@/lib/validation';
import { decideRequest } from '@/server/services/requests';

/** Aprovar, rejeitar, pedir informações, sugerir, cancelar, reabrir ou anotar. */
export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const input = await parseJson(req, decisionSchema);
  return json(await decideRequest(id, input, admin.id));
});
