'use client';
import Link from 'next/link';
import { AlertTriangle, CalendarCheck, DoorOpen, Inbox, Repeat } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useFetch } from '@/lib/client';
import { formatDateLong, formatDateTime, formatRange } from '@/lib/time';
import { KindBadge, RequestStatusBadge, StatCard } from './common';
import type { RequestStatusKey } from '@/config/site';

interface DashboardDto {
  stats: { rooms: number; activeRooms: number; confirmedFuture: number; pending: number; awaitingInfo: number; recurringActive: number };
  upcoming: { id: string; kind: string; roomName: string; date: string; startAt: string; endAt: string; title: string }[];
  attention: { type: string; id: string; title: string; detail: string }[];
  oldestPending: { id: string; protocol: string; requesterName: string; room: string; startAt: string; endAt: string; receivedAt: string; status: RequestStatusKey }[];
}

export function Dashboard() {
  const { data, loading, error, reload } = useFetch<DashboardDto>('/api/admin/dashboard');
  if (loading && !data) return <Spinner />;
  if (error || !data) return <EmptyState title="Não foi possível carregar o painel" description={error?.message} action={<Button onClick={reload}>Tentar novamente</Button>} />;

  const byDay = data.upcoming.reduce<Record<string, DashboardDto['upcoming']>>((acc, e) => ((acc[e.date] ||= []).push(e), acc), {});

  return (
    <>
      <PageHeader title="Painel geral" description="Visão rápida da ocupação das salas e das pendências." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DoorOpen} label="Salas cadastradas" value={data.stats.rooms} hint={`${data.stats.activeRooms} ativa(s)`} />
        <StatCard icon={CalendarCheck} label="Reservas confirmadas" value={data.stats.confirmedFuture} hint="futuras" tone="success" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data.stats.pending} hint={data.stats.awaitingInfo ? `+ ${data.stats.awaitingInfo} aguardando informações` : undefined} tone="warning" />
        <StatCard icon={Repeat} label="Reuniões recorrentes" value={data.stats.recurringActive} hint="ativas ou suspensas" tone="recurring" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">Próximas reuniões (7 dias)</h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhuma reunião nos próximos sete dias.</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(byDay).map(([date, events]) => (
                <div key={date}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{formatDateLong(date)}</p>
                  <ul className="divide-y divide-mist/60 rounded-lg border border-mist/70">
                    {events.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <span className="w-28 font-medium tabular-nums">{formatRange(e.startAt, e.endAt)}</span>
                        <span className="min-w-0 flex-1 truncate">{e.title}</span>
                        <span className="text-ink-soft">{e.roomName}</span>
                        <KindBadge kind={e.kind} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Requer atenção
            </h2>
            {data.attention.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhum conflito ou pendência no momento.</p>
            ) : (
              <ul className="space-y-2">
                {data.attention.map((a) => (
                  <li key={`${a.type}-${a.id}`}>
                    <Link
                      href={a.type === 'INACTIVE_ROOM' ? '/admin/reservas' : a.type === 'DEMO_ADMIN' || a.type === 'FAILED_LOGINS' ? '/admin/configuracoes' : `/admin/solicitacoes?abrir=${a.id}`}
                      className="block rounded-lg border border-warning/30 bg-warning-soft/60 px-3 py-2 text-sm hover:bg-warning-soft"
                    >
                      <p className="font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-ink-soft">{a.detail}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Fila de solicitações</h2>
              <Link href="/admin/solicitacoes" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
            </div>
            {data.oldestPending.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhuma solicitação aguardando análise.</p>
            ) : (
              <ol className="space-y-2">
                {data.oldestPending.map((r, i) => (
                  <li key={r.id}>
                    <Link href={`/admin/solicitacoes?abrir=${r.id}`} className="flex gap-3 rounded-lg px-2 py-1.5 hover:bg-mist-soft">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-medium">{r.protocol} · {r.room}</span>
                        <span className="block text-xs text-ink-soft">Recebida {formatDateTime(r.receivedAt)}</span>
                      </span>
                      <span className="ml-auto"><RequestStatusBadge status={r.status} /></span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
