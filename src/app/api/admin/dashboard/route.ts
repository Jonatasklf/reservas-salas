import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { getDashboard } from '@/server/services/dashboard';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => json(await getDashboard()));
