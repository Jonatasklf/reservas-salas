import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { prisma } from '@/lib/db';
import { isEmailConfigured } from '@/lib/email';
import { settingsSchema } from '@/lib/validation';
import { audit } from '@/server/services/audit';
import { getSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const s = await getSettings();
  return json({ settings: { ...s, logoData: undefined, hasLogo: Boolean(s.logoData) }, emailConfigured: isEmailConfigured() });
});

export const PUT = adminRoute(async (req, admin) => {
  const input = await parseJson(req, settingsSchema);
  await getSettings();
  const s = await prisma.settings.update({ where: { id: 1 }, data: input });
  await audit(prisma, { adminId: admin.id, action: 'SETTINGS_UPDATED', entityType: 'Settings', entityId: '1', summary: 'Configurações gerais atualizadas.' });
  return json({ settings: { ...s, logoData: undefined, hasLogo: Boolean(s.logoData) } });
});
