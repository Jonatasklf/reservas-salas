import { clientIp, json, parseJson } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { rateLimit } from '@/lib/rate-limit';
import { publicRequestSchema } from '@/lib/validation';
import { createPublicRequest } from '@/server/services/requests';

/** Envio de solicitação pública (sem cadastro). Limite: 10 por hora por IP. */
export const POST = publicRoute(async (req) => {
  rateLimit(`request:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const input = await parseJson(req, publicRequestSchema);
  const result = await createPublicRequest(input);
  return json(result, { status: 201 });
});
