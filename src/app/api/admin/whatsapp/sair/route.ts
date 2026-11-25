import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { prisma } from '@/lib/db';
import { logoutWhatsApp } from '@/lib/whatsapp';
import { audit } from '@/server/services/audit';

/** Desconecta o número de WhatsApp do sistema (um QR Code novo é gerado). */
export const POST = adminRoute(async (_req, admin) => {
  const ok = await logoutWhatsApp();
  if (ok) {
    await audit(prisma, { adminId: admin.id, action: 'WHATSAPP_LOGOUT', entityType: 'Settings', entityId: '1', summary: 'Número de WhatsApp desconectado do sistema.' });
  }
  return json({ ok });
});
