import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { adminCreateSchema } from '@/lib/validation';
import { createAdmin, listAdmins } from '@/server/services/admins';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (_req, admin) => json({ admins: await listAdmins(), currentId: admin.id }));

export const POST = adminRoute(async (req, admin) => {
  const input = await parseJson(req, adminCreateSchema);
  return json(await createAdmin(input, admin.id), { status: 201 });
});
