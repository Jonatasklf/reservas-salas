import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { sendTestEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { testEmail } from '@/server/emails';
import { getSettings } from '@/server/services/settings';

/** Envia um e-mail de teste para o administrador conectado e devolve o erro real, se houver. */
export const POST = adminRoute(async (_req, admin) => {
  rateLimit(`test-email:${admin.id}`, 5, 10 * 60 * 1000);
  const s = await getSettings();
  return json(await sendTestEmail(testEmail(s.unitName, admin.email)));
});
