import { json, parseJson } from '@/lib/api';
import { adminRoute } from '@/lib/api-admin';
import { blockSchema } from '@/lib/validation';
import { createBlock, listBlocks } from '@/server/services/blocks';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async (req) => {
  const all = req.nextUrl.searchParams.get('todos') === '1';
  return json({ blocks: await listBlocks(all ? {} : { from: new Date(Date.now() - 30 * 86400000) }) });
});

export const POST = adminRoute(async (req, admin) => {
  const input = await parseJson(req, blockSchema);
  return json(await createBlock(input, admin.id), { status: 201 });
});
