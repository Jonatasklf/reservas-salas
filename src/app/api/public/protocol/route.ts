import { clientIp, json, parseJson } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { rateLimit } from '@/lib/rate-limit';
import { protocolLookupSchema } from '@/lib/validation';
import { lookupProtocol } from '@/server/services/requests';

/** Consulta da situação: exige protocolo + código de acesso. Limite contra tentativas. */
export const POST = publicRoute(async (req) => {
  rateLimit(`protocol:${clientIp(req)}`, 20, 15 * 60 * 1000);
  const { protocol, code } = await parseJson(req, protocolLookupSchema);
  return json(await lookupProtocol(protocol, code));
});
