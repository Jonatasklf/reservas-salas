import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { prisma } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { siteConfig } from '@/config/site';
import { audit } from '@/server/services/audit';
import { getSettings } from '@/server/services/settings';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/** Confere a assinatura real do arquivo (não confia só no tipo informado pelo navegador). */
function detectImageType(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Envio do logotipo (PNG, JPG ou WEBP, até 512 KB). Guardado no banco. */
export const POST = adminRoute(async (req, admin) => {
  const form = await req.formData();
  const file = form.get('logo');
  if (!(file instanceof File)) throw badRequest('Selecione um arquivo de imagem.');
  if (!ALLOWED.includes(file.type)) throw badRequest('Formato não suportado. Use PNG, JPG ou WEBP.');
  if (file.size > siteConfig.rules.maxLogoBytes) throw badRequest('A imagem deve ter no máximo 512 KB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const realType = detectImageType(bytes);
  if (!realType) throw badRequest('O arquivo não é uma imagem PNG, JPG ou WEBP válida.');
  await getSettings();
  await prisma.settings.update({ where: { id: 1 }, data: { logoData: bytes, logoMimeType: realType, logoUpdatedAt: new Date() } });
  await audit(prisma, { adminId: admin.id, action: 'LOGO_UPDATED', entityType: 'Settings', entityId: '1', summary: 'Logotipo atualizado.' });
  return json({ ok: true });
});

export const DELETE = adminRoute(async (_req, admin) => {
  await getSettings();
  await prisma.settings.update({ where: { id: 1 }, data: { logoData: null, logoMimeType: null, logoUpdatedAt: new Date() } });
  await audit(prisma, { adminId: admin.id, action: 'LOGO_REMOVED', entityType: 'Settings', entityId: '1', summary: 'Logotipo removido.' });
  return json({ ok: true });
});
