/**
 * Cabeçalho público: logotipo e nome da unidade vêm das Configurações.
 */
import Link from 'next/link';
import { CalendarDays, FileSearch, LockKeyhole } from 'lucide-react';
import { getSettings } from '@/server/services/settings';
import { siteConfig } from '@/config/site';

export async function SiteHeader() {
  const s = await getSettings();
  return (
    <header className="border-b border-mist/70 bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {s.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/public/logo?v=${s.logoUpdatedAt?.getTime() ?? 0}`} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold leading-tight text-primary">{s.unitName}</span>
            {s.headerSubtitle && <span className="block truncate text-xs text-ink-soft">{s.headerSubtitle}</span>}
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Principal">
          <Link href="/" className="hidden rounded-lg px-3 py-2 text-ink-soft hover:bg-mist-soft hover:text-ink sm:inline-flex">
            Calendário
          </Link>
          <Link href="/protocolo" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-ink-soft hover:bg-mist-soft hover:text-ink">
            <FileSearch className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Consultar protocolo</span>
            <span className="sm:hidden">Protocolo</span>
          </Link>
          <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-ink-soft hover:bg-mist-soft hover:text-ink" title="Área administrativa">
            <LockKeyhole className="h-4 w-4" aria-hidden />
            <span className="sr-only">Área administrativa</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const s = await getSettings();
  return (
    <footer className="mt-12 border-t border-mist/70 bg-surface">
      <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-ink-soft">
        {s.footerText && <p>{s.footerText}</p>}
        <p>{siteConfig.disclaimer}</p>
        <p>Horários exibidos no horário de Brasília.</p>
      </div>
    </footer>
  );
}
