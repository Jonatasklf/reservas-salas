import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { prisma } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { siteConfig } from '@/config/site';
import { audit } from '@/server/services/audit';
import { getSettings } from '@/server/services/settings';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/** Envio do logotipo (PNG, JPG ou WEBP, até 512 KB). Guardado no banco. */
export const POST = adminRoute(async (req, admin) => {
  const form = await req.formData();
  const file = form.get('logo');
  if (!(file instanceof File)) throw badRequest('Selecione um arquivo de imagem.');
  if (!ALLOWED.includes(file.type)) throw badRequest('Formato não suportado. Use PNG, JPG ou WEBP.');
  if (file.size > siteConfig.rules.maxLogoBytes) throw badRequest('A imagem deve ter no máximo 512 KB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  await getSettings();
  await prisma.settings.update({ where: { id: 1 }, data: { logoData: bytes, logoMimeType: file.type, logoUpdatedAt: new Date() } });
  await audit(prisma, { adminId: admin.id, action: 'LOGO_UPDATED', entityType: 'Settings', entityId: '1', summary: 'Logotipo atualizado.' });
  return json({ ok: true });
});

export const DELETE = adminRoute(async (_req, admin) => {
  await getSettings();
  await prisma.settings.update({ where: { id: 1 }, data: { logoData: null, logoMimeType: null, logoUpdatedAt: new Date() } });
  await audit(prisma, { adminId: admin.id, action: 'LOGO_REMOVED', entityType: 'Settings', entityId: '1', summary: 'Logotipo removido.' });
  return json({ ok: true });
});
