import { json } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { getRequestDetail } from '@/server/services/requests';

export const dynamic = 'force-dynamic';

export const GET = adminRoute<{ id: string }>(async (_req, _admin, { id }) => json(await getRequestDetail(id)));
