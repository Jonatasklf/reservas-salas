import { publicRoute } from '@/lib/api-admin';
import { getSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

/** Logotipo enviado pela administração (404 quando não há). */
export const GET = publicRoute(async () => {
  const s = await getSettings();
  if (!s.logoData || !s.logoMimeType) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(s.logoData), {
    headers: { 'Content-Type': s.logoMimeType, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
});
