import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { countOpenRequests } from '@/server/services/requests';

export const dynamic = 'force-dynamic';

/** Indicador de solicitações em aberto (menu administrativo). */
export const GET = adminRoute(async () => json({ open: await countOpenRequests() }));
