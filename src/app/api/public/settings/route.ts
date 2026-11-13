import { json } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { getSettings, publicSettings } from '@/server/services/settings';

export const dynamic = 'force-dynamic';

/** Configurações exibidas no cabeçalho e regras públicas. */
export const GET = publicRoute(async () => json(publicSettings(await getSettings())));
