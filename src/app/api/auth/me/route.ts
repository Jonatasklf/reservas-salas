import { json } from '@/lib/api';
import { publicRoute } from '@/lib/api-admin';
import { getAdminFromRequest } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export const GET = publicRoute(async (req) => json({ admin: await getAdminFromRequest(req) }));
