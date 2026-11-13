'use client';
/**
 * Estrutura da área administrativa: menu lateral (recolhível no celular),
 * indicador de solicitações pendentes e botão de sair.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock, CalendarDays, ClipboardList, DoorOpen, ExternalLink, Inbox, LayoutDashboard, LogOut, Menu, Repeat, Settings, X,
} from 'lucide-react';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Painel geral', icon: LayoutDashboard },
  { href: '/admin/salas', label: 'Salas', icon: DoorOpen },
  { href: '/admin/recorrentes', label: 'Reuniões recorrentes', icon: Repeat },
  { href: '/admin/reservas', label: 'Reservas', icon: ClipboardList },
  { href: '/admin/solicitacoes', label: 'Solicitações pendentes', icon: Inbox, badge: true },
  { href: '/admin/calendario', label: 'Calendário administrativo', icon: CalendarDays },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

export function AdminShell({ adminName, unitName, children }: { adminName: string; unitName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);

  // Indicador de solicitações em aberto, atualizado a cada minuto.
  useEffect(() => {
    let alive = true;
    const load = () => api<{ open: number }>('/api/admin/requests/count').then((r) => alive && setPending(r.open)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    // As telas avisam quando uma decisão muda a fila (evento do navegador).
    window.addEventListener('solicitacoes-alteradas', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('solicitacoes-alteradas', load); };
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
  }

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Menu administrativo">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            isActive(item.href) ? 'bg-white/12 font-medium text-white' : 'text-white/75 hover:bg-white/8 hover:text-white',
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{item.label}</span>
          {item.badge && pending ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-primary" aria-label={`${pending} pendentes`}>{pending}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-3 text-sm">
      <Link href="/" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-white/75 hover:bg-white/8 hover:text-white">
        <ExternalLink className="h-4 w-4" aria-hidden />Ver página pública
      </Link>
      <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-white/75 hover:bg-white/8 hover:text-white">
        <LogOut className="h-4 w-4" aria-hidden />Sair
      </button>
      <p className="truncate px-3 pt-1 text-xs text-white/50">Conectado como {adminName}</p>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Menu lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between bg-primary px-3 py-4 lg:flex no-print">
        <div className="space-y-6">
          <Link href="/admin" className="flex items-center gap-2 px-3 text-white">
            <CalendarClock className="h-5 w-5" aria-hidden />
            <span className="truncate text-sm font-semibold">{unitName}</span>
          </Link>
          {nav}
        </div>
        {footer}
      </aside>

      {/* Barra superior (celular/tablet) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-primary px-4 py-3 text-white lg:hidden no-print">
        <span className="truncate text-sm font-semibold">{unitName}</span>
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="relative rounded-md p-1.5 hover:bg-white/10">
          <Menu className="h-5 w-5" />
          {pending ? <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-[10px] font-bold text-primary">{pending}</span> : null}
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-primary px-3 py-4 animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-3 text-white">
                <span className="text-sm font-semibold">Menu</span>
                <button onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
              </div>
              {nav}
            </div>
            {footer}
          </div>
        </div>
      )}

      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
