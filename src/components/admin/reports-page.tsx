'use client';
/**
 * Relatórios: indicadores de um período, por sala, com exportação CSV e
 * impressão/PDF. Os cálculos ficam em src/server/services/reports.ts.
 */
import { useMemo, useState } from 'react';
import { CalendarCheck, Clock, Download, Inbox, MessageCircle, Percent, Printer, ThumbsUp } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useFetch } from '@/lib/client';
import { addDays, formatDateShort, todayString } from '@/lib/time';
import { siteConfig, type RequestStatusKey } from '@/config/site';
import { StatCard, useRooms } from './common';
import { ColumnChart, MeterList } from './charts';

interface ReportDto {
  period: { from: string; to: string; days: number };
  requests: { total: number; byStatus: Record<RequestStatusKey, number>; approvalRate: number | null; avgResponseHours: number | null };
  usage: { reservations: number; reservationsFromRequests: number; recurringOccurrences: number; occupiedHours: number; availableHours: number; occupancyRate: number };
  perRoom: { id: string; name: string; active: boolean; capacity: number; reservations: number; recurring: number; occupiedHours: number; availableHours: number; occupancyRate: number; requests: number }[];
  byWeekday: number[];
  byHour: number[];
  notifications: { whatsappSent: number; whatsappFailed: number; emailSent: number; emailFailed: number };
  access: { logins: number; failedLogins: number };
}

type Preset = 'mes' | 'mes-anterior' | '30-dias' | 'ano' | 'personalizado';

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const first = today.slice(0, 8) + '01';
  const [y, m] = today.split('-').map(Number);
  const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  switch (p) {
    case 'mes-anterior': {
      const prevLast = addDays(first, -1);
      return { from: prevLast.slice(0, 8) + '01', to: prevLast };
    }
    case '30-dias':
      return { from: addDays(today, -29), to: today };
    case 'ano':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: first, to: lastOfMonth };
  }
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const statusTone: Record<RequestStatusKey, 'warning' | 'primary' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning', AWAITING_INFO: 'primary', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral',
};

export function ReportsPage() {
  const today = todayString();
  const [preset, setPreset] = useState<Preset>('mes');
  const [custom, setCustom] = useState(presetRange('mes', today));
  const [roomId, setRoomId] = useState('');
  const rooms = useRooms();

  const range = preset === 'personalizado' ? custom : presetRange(preset, today);
  const invalid = range.to < range.from;
  const query = `de=${range.from}&ate=${range.to}${roomId ? `&sala=${roomId}` : ''}`;
  const report = useFetch<ReportDto>(invalid ? null : `/api/admin/relatorios?${query}`);
  const r = report.data;

  const hourData = useMemo(() => {
    if (!r) return [];
    // Mostra só a faixa de horas com uso (mínimo 7h às 22h) para o gráfico não ficar vazio nas pontas.
    const used = r.byHour.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
    const startH = Math.min(7, ...used);
    const endH = Math.max(21, ...used);
    return r.byHour.slice(startH, endH + 1).map((v, i) => ({ label: `${startH + i}h`, fullLabel: `${startH + i}h às ${startH + i + 1}h`, value: v }));
  }, [r]);

  const presets: [Preset, string][] = [['mes', 'Este mês'], ['mes-anterior', 'Mês anterior'], ['30-dias', 'Últimos 30 dias'], ['ano', 'Este ano'], ['personalizado', 'Personalizado']];
  const roomName = rooms.data?.rooms.find((x) => x.id === roomId)?.name;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Uso das salas, solicitações e mensagens em um período."
        actions={
          <>
            <a href={invalid ? undefined : `/api/admin/relatorios/export?${query}`} className="no-print inline-flex h-11 items-center gap-2 rounded-lg border border-mist bg-surface px-4 text-sm font-medium hover:bg-mist-soft sm:h-10">
              <Download className="h-4 w-4" aria-hidden />CSV
            </a>
            <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Imprimir / PDF</Button>
          </>
        }
      />

      {/* Filtros em uma linha acima dos gráficos */}
      <Card className="no-print mb-6 space-y-3 p-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-mist-soft p-1" role="tablist" aria-label="Período">
          {presets.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={preset === key} onClick={() => setPreset(key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${preset === key ? 'bg-surface font-medium text-primary shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {preset === 'personalizado' && (
            <>
              <Field label="De" htmlFor="rel-de"><Input id="rel-de" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
              <Field label="Até" htmlFor="rel-ate" error={invalid ? 'Deve ser igual ou posterior a "De".' : undefined}>
                <Input id="rel-ate" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Sala" htmlFor="rel-sala">
            <Select id="rel-sala" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Todas as salas</option>
              {rooms.data?.rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <p className="mb-4 text-sm text-ink-soft">
        Período: <strong className="text-ink">{formatDateShort(range.from)} a {formatDateShort(range.to)}</strong>
        {roomName ? <> · Sala: <strong className="text-ink">{roomName}</strong></> : ' · Todas as salas'}
      </p>

      {invalid ? null : report.loading && !r ? (
        <Spinner />
      ) : !r ? (
        <EmptyState title="Não foi possível gerar o relatório" description={report.error?.message} action={<Button onClick={report.reload}>Tentar novamente</Button>} />
      ) : (
        <div className={`space-y-6 ${report.loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon={Inbox} label="Solicitações recebidas" value={r.requests.total} tone="warning" />
            <StatCard icon={ThumbsUp} label="Taxa de aprovação" value={pct(r.requests.approvalRate)} hint="entre aprovadas e rejeitadas" tone="success" />
            <StatCard icon={Clock} label="Tempo médio de resposta" value={r.requests.avgResponseHours === null ? '—' : `${num(r.requests.avgResponseHours)} h`} hint="do recebimento à decisão" />
            <StatCard icon={CalendarCheck} label="Horas ocupadas" value={num(r.usage.occupiedHours)} hint={`${r.usage.reservations} reserva(s) · ${r.usage.recurringOccurrences} recorrência(s)`} tone="recurring" />
            <StatCard icon={Percent} label="Taxa de ocupação" value={pct(r.usage.occupancyRate)} hint={`de ${num(r.usage.availableHours)} h disponíveis`} />
            <StatCard icon={MessageCircle} label="Mensagens enviadas" value={r.notifications.whatsappSent + r.notifications.emailSent}
              hint={`${r.notifications.whatsappSent} WhatsApp · ${r.notifications.emailSent} e-mail`} tone="success" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <MeterList
                title="Ocupação por sala"
                subtitle="Horas ocupadas ÷ horas de funcionamento no período"
                items={r.perRoom.map((p) => ({
                  id: p.id,
                  label: `${p.name}${p.active ? '' : ' (inativa)'}`,
                  rate: p.occupancyRate,
                  muted: !p.active,
                  detail: `${num(p.occupiedHours)} h de ${num(p.availableHours)} h · ${p.reservations} reserva(s) · ${p.recurring} recorrência(s) · ${p.requests} solicitação(ões)`,
                }))}
              />
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Solicitações por situação</h2>
              <ul className="mt-3 divide-y divide-mist/60">
                {(Object.keys(siteConfig.requestStatusLabels) as RequestStatusKey[]).map((k) => (
                  <li key={k} className="flex items-center justify-between py-2 text-sm">
                    <Badge tone={statusTone[k]}>{siteConfig.requestStatusLabels[k]}</Badge>
                    <span className="tabular-nums font-medium">{r.requests.byStatus[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-soft">
                Reservas vindas de solicitações aprovadas: {r.usage.reservationsFromRequests} de {r.usage.reservations}.
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <ColumnChart
                title="Horas ocupadas por dia da semana"
                data={r.byWeekday.map((v, d) => ({ label: siteConfig.weekdayShort[d], fullLabel: siteConfig.weekdayLabels[d], value: v }))}
                unit=" h"
                valueHeader="Horas ocupadas"
              />
            </Card>
            <Card className="p-5">
              <ColumnChart title="Horas ocupadas por horário" subtitle="Soma de todas as salas em cada faixa de 1 hora" data={hourData} unit=" h" valueHeader="Horas ocupadas" labelEvery={2} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Mensagens ao solicitante</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-mist text-left text-xs text-ink-soft">
                    <th className="py-1.5 font-medium">Canal</th>
                    <th className="py-1.5 text-right font-medium">Enviadas</th>
                    <th className="py-1.5 text-right font-medium">Com falha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-mist/50"><td className="py-1.5">WhatsApp</td><td className="py-1.5 text-right tabular-nums">{r.notifications.whatsappSent}</td><td className="py-1.5 text-right tabular-nums">{r.notifications.whatsappFailed}</td></tr>
                  <tr><td className="py-1.5">E-mail</td><td className="py-1.5 text-right tabular-nums">{r.notifications.emailSent}</td><td className="py-1.5 text-right tabular-nums">{r.notifications.emailFailed}</td></tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs text-ink-soft">Quando um canal falha, o sistema tenta o outro. Detalhes em Registro de atividades → Mensagens.</p>
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Acessos administrativos</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-ink-soft">Logins</dt><dd className="text-2xl font-semibold">{r.access.logins}</dd></div>
                <div><dt className="text-ink-soft">Tentativas sem sucesso</dt><dd className="text-2xl font-semibold">{r.access.failedLogins}</dd></div>
              </dl>
            </Card>
          </div>

          <p className="text-xs text-ink-soft">
            A taxa de ocupação considera os dias e horários de funcionamento de cada sala; bloqueios (feriados, manutenção) não são descontados.
            Reservas canceladas e ocorrências canceladas ou suspensas não entram nas horas ocupadas.
          </p>
        </div>
      )}
    </>
  );
}
