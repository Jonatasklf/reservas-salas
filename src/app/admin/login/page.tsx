import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminFromCookies } from '@/lib/auth/guard';
import { getSettings } from '@/server/services/settings';
import { LoginForm } from '@/components/admin/login-form';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const target = voltar?.startsWith('/admin') ? voltar : '/admin';
  if (await getAdminFromCookies()) redirect(target);
  const s = await getSettings();
  return (
    <main id="conteudo" className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-primary">{s.unitName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Área administrativa</h1>
        </div>
        <LoginForm redirectTo={target} />
        <p className="mt-6 text-center text-sm"><Link href="/" className="text-primary hover:underline">Voltar ao calendário público</Link></p>
      </div>
    </main>
  );
}
