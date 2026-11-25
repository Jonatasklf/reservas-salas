import { z } from 'zod';
import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { badRequest } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { normalizePhoneBR, sendWhatsApp } from '@/lib/whatsapp';
import { testWhatsApp } from '@/server/whatsapp-mensagens';
import { getSettings } from '@/server/services/settings';

const body = z.object({ phone: z.string().trim().min(8, 'Informe o número com DDD.').max(30) });

/** Envia uma mensagem de teste para o número informado. */
export const POST = adminRoute(async (req, admin) => {
  rateLimit(`whatsapp-teste:${admin.id}`, 5, 10 * 60 * 1000);
  const { phone } = await parseJson(req, body);
  if (!normalizePhoneBR(phone)) throw badRequest('Número inválido. Use DDD + número, ex.: (11) 91234-5678.');
  const s = await getSettings();
  return json({ result: await sendWhatsApp(phone, testWhatsApp(s.unitName)) });
});
