import { redirect } from 'next/navigation';
import { getAdminFromCookies } from '@/lib/auth/guard';
import { getSettings } from '@/server/services/settings';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

/** Todas as páginas administrativas passam por aqui: sem sessão válida → login. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminFromCookies();
  if (!admin) redirect('/admin/login');
  const s = await getSettings();
  return (
    <AdminShell adminName={admin.name} unitName={s.unitName}>
      {children}
    </AdminShell>
  );
}
