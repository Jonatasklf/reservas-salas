'use client';
/**
 * Registro de atividades (log de uso): tudo o que acontece no sistema, com
 * data/hora, categoria, descrição e autor. Filtros + exportação CSV.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, History, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useFetch } from '@/lib/client';
import { addDays, formatDateTime, todayString } from '@/lib/time';
import { FilterPanel } from './common';

const CATEGORIES: Record<string, [string, 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'recurring']> = {
  solicitacoes: ['Solicitações', 'warning'],
  mensagens: ['Mensagens', 'success'],
  reservas: ['Reservas', 'primary'],
  recorrentes: ['Recorrentes', 'recurring'],
  salas: ['Salas', 'neutral'],
  bloqueios: ['Bloqueios', 'danger'],
  acesso: ['Acesso', 'neutral'],
  configuracoes: ['Configurações', 'neutral'],
};

interface Item {
  id: string;
  createdAt: string;
  action: string;
  category: string;
  entityType: string;
  entityId: string;
  summary: string;
  adminName: string | null;
}

/** Para onde o link "Abrir" leva, conforme o tipo de registro. */
function hrefFor(i: Item): string | null {
  switch (i.entityType) {
    case 'ReservationRequest': return `/admin/solicitacoes?abrir=${i.entityId}`;
    case 'RecurringMeeting': return `/admin/recorrentes/${i.entityId}`;
    case 'Reservation': return '/admin/reservas';
    case 'Room':
    case 'Equipment': return '/admin/salas';
    case 'AvailabilityBlock': return '/admin/calendario';
    case 'Admin':
    case 'Settings': return '/admin/configuracoes';
    default: return null;
  }
}

export function ActivityPage() {
  const today = todayString();
  const [filters, setFilters] = useState({ de: addDays(today, -29), ate: today, categoria: '', admin: '', busca: '' });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const admins = useFetch<{ admins: { id: string; name: string }[] }>('/api/admin/admins');

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
      setQuery(q.toString());
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);
  useEffect(() => setPage(1), [query]);

  const list = useFetch<{ total: number; page: number; pages: number; items: Item[] }>(query !== undefined ? `/api/admin/atividades?${query}&pagina=${page}` : null);
  const set = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const active = (filters.categoria ? 1 : 0) + (filters.admin ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Registro de atividades"
        description="Tudo o que acontece no sistema: solicitações, decisões, alterações, acessos e mensagens enviadas."
        actions={
          <a href={`/api/admin/atividades/export?${query}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-mist bg-surface px-4 text-sm font-medium hover:bg-mist-soft sm:h-10">
            <Download className="h-4 w-4" aria-hidden />Exportar CSV
          </a>
        }
      />

      <FilterPanel
        columns="lg:grid-cols-5"
        activeCount={active}
        primary={
          <Field label="Buscar" htmlFor="at-busca">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input id="at-busca" className="pl-9" placeholder="Protocolo, nome, sala…" value={filters.busca} onChange={(e) => set('busca', e.target.value)} />
            </div>
          </Field>
        }
      >
        <Field label="Categoria" htmlFor="at-cat">
          <Select id="at-cat" value={filters.categoria} onChange={(e) => set('categoria', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Feito por" htmlFor="at-admin">
          <Select id="at-admin" value={filters.admin} onChange={(e) => set('admin', e.target.value)}>
            <option value="">Todos</option>
            <option value="sistema">Sistema / público</option>
            {admins.data?.admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="De" htmlFor="at-de"><Input id="at-de" type="date" value={filters.de} onChange={(e) => set('de', e.target.value)} /></Field>
        <Field label="Até" htmlFor="at-ate"><Input id="at-ate" type="date" value={filters.ate} onChange={(e) => set('ate', e.target.value)} /></Field>
      </FilterPanel>

      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data || list.data.items.length === 0 ? (
        <EmptyState icon={History} title="Nenhuma atividade encontrada" description="Ajuste o período ou os filtros." />
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-soft">{list.data.total.toLocaleString('pt-BR')} registro(s) · mais recentes primeiro</p>
          <Card className={`divide-y divide-mist/60 ${list.loading ? 'opacity-60' : ''}`}>
            {list.data.items.map((i) => {
              const [label, tone] = CATEGORIES[i.category] ?? ['Outros', 'neutral'];
              const href = hrefFor(i);
              const failed = i.action.startsWith('NOTIFICATION_') && i.summary.startsWith('Falha');
              return (
                <div key={i.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-40 shrink-0 tabular-nums text-xs text-ink-soft">{formatDateTime(i.createdAt)}</span>
                  <span className="w-28 shrink-0"><Badge tone={failed ? 'danger' : tone}>{label}</Badge></span>
                  <span className="min-w-0 flex-1">{i.summary}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{i.adminName ?? 'Sistema / público'}</span>
                  {href && <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">Abrir</Link>}
                </div>
              );
            })}
          </Card>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" aria-hidden />Anterior</Button>
            <span className="text-sm text-ink-soft">Página {list.data.page} de {list.data.pages}</span>
            <Button variant="outline" size="sm" disabled={page >= list.data.pages} onClick={() => setPage((p) => p + 1)}>Próxima<ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </>
      )}
    </>
  );
}
