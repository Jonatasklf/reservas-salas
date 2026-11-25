import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { getWhatsAppStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/** Situação da conexão do WhatsApp (inclui o QR Code quando precisa conectar). */
export const GET = adminRoute(async () => json(await getWhatsAppStatus()));
