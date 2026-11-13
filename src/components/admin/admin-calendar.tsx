'use client';
/**
 * Calendário administrativo: ocupação de todas as salas (reservas,
 * recorrências, bloqueios e pedidos pendentes) + gestão de bloqueios.
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Ban, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Dialog, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';
import { addDays, formatDateLong, formatDateShort, formatDateTime, formatRange, todayString, utcToTimeString, weekdayOf } from '@/lib/time';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import { ApiErrorAlert, KindBadge, useRooms } from './common';
import { ReservationDialog } from './reservations-page';

interface EventDto {
  id: string;
  kind: 'RESERVATION' | 'RECURRING' | 'BLOCK' | 'REQUEST' | 'CANCELLED_OCCURRENCE';
  roomId: string | null;
  roomName: string;
  date: string;
  startAt: string;
  endAt: string;
  title: string;
  refId: string;
}

/** Cor do ponto exibido no celular (visão mensal). */
const dot: Record<EventDto['kind'], string> = {
  RESERVATION: 'bg-primary',
  RECURRING: 'bg-recurring',
  BLOCK: 'bg-danger',
  REQUEST: 'bg-warning',
  CANCELLED_OCCURRENCE: 'bg-mist',
};

const chip: Record<EventDto['kind'], string> = {
  RESERVATION: 'bg-primary-soft text-primary',
  RECURRING: 'bg-recurring-soft text-recurring',
  BLOCK: 'bg-danger-soft text-danger',
  REQUEST: 'bg-warning-soft text-warning border border-dashed border-warning/40',
  CANCELLED_OCCURRENCE: 'bg-mist-soft text-ink-soft line-through',
};

function linkFor(e: EventDto) {
  if (e.kind === 'REQUEST') return `/admin/solicitacoes?abrir=${e.refId}`;
  if (e.kind === 'RECURRING' || e.kind === 'CANCELLED_OCCURRENCE') return `/admin/recorrentes/${e.refId}`;
  if (e.kind === 'RESERVATION') return '/admin/reservas';
  return null;
}

export function AdminCalendar() {
  const today = todayString();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [roomId, setRoomId] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [newReservation, setNewReservation] = useState<string | null>(null);
  const dayPanelRef = useRef<HTMLDivElement>(null);
  const rooms = useRooms();

  const monthFirst = anchor.slice(0, 8) + '01';
  const gridStart = view === 'month' ? addDays(monthFirst, -weekdayOf(monthFirst)) : addDays(anchor, -weekdayOf(anchor));
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => addDays(gridStart, i));
  const cal = useFetch<{ events: EventDto[] }>(`/api/admin/calendar?from=${days[0]}&to=${days[days.length - 1]}`);

  const events = useMemo(
    () => (cal.data?.events ?? []).filter((e) => (!roomId || e.roomId === roomId || e.roomId === null) && (showCancelled || e.kind !== 'CANCELLED_OCCURRENCE')),
    [cal.data, roomId, showCancelled],
  );
  const byDay = (d: string) => events.filter((e) => e.date === d || (e.kind === 'BLOCK' && e.date <= d && utcToDateStringSafe(e.endAt) >= d));

  function move(dir: number) {
    if (view === 'month') {
      const [y, m] = anchor.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1 + dir, 1));
      setAnchor(next.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, 7 * dir));
  }

  /** Seleciona o dia; no celular, rola até a lista de ocupações daquele dia. */
  function pickDay(d: string) {
    setSelected(d);
    if (window.innerWidth < 1280) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => dayPanelRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }), 50);
    }
  }

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthFirst}T12:00:00Z`));
  const selectedEvents = byDay(selected);

  return (
    <>
      <PageHeader title="Calendário administrativo" description="Ocupação real das salas: reservas, recorrências, bloqueios e pedidos pendentes." />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { setAnchor(today); setSelected(today); }}>Hoje</Button>
          <Button variant="outline" size="icon" aria-label="Próximo" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="text-base font-semibold first-letter:uppercase">
          {view === 'month' ? monthLabel : `${formatDateShort(days[0])} a ${formatDateShort(days[6])}`}
        </span>
        <div className="flex w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto">
          <Checkbox label="Mostrar canceladas" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          <Select aria-label="Filtrar sala" className="h-9 w-full sm:w-48" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Todas as salas</option>
            {rooms.data?.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <div className="flex rounded-lg bg-mist-soft p-0.5 text-sm">
            {(['month', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-md px-3 py-1 ${view === v ? 'bg-surface font-medium text-primary shadow-sm' : 'text-ink-soft'}`}>
                {v === 'month' ? 'Mês' : 'Semana'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(['RESERVATION', 'RECURRING', 'BLOCK', 'REQUEST'] as const).map((k) => <KindBadge key={k} kind={k} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className={cn('overflow-hidden', cal.loading && 'opacity-70')}>
          {/* Cabeçalho dos dias: na visão semanal do celular os dias ficam empilhados e ele some. */}
          <div className={cn('grid-cols-7 border-b border-mist/70 bg-mist-soft/60 text-center text-xs font-semibold uppercase text-ink-soft', view === 'week' ? 'hidden sm:grid' : 'grid')}>
            {siteConfig.weekdayShort.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className={cn(view === 'week' ? 'grid grid-cols-1 sm:grid-cols-7' : 'grid grid-cols-7')}>
            {days.map((d) => {
              const evs = byDay(d);
              const outside = view === 'month' && d.slice(0, 7) !== monthFirst.slice(0, 7);
              const max = view === 'month' ? 3 : 20;
              const kinds = [...new Set(evs.map((e) => e.kind))];
              return (
                <button
                  key={d}
                  onClick={() => pickDay(d)}
                  aria-pressed={d === selected}
                  aria-label={`${formatDateLong(d)}: ${evs.length} item(ns)`}
                  className={cn(
                    'flex flex-col gap-1 border-b border-r border-mist/50 p-1.5 text-left align-top transition-colors hover:bg-mist-soft/50',
                    view === 'month' ? 'min-h-[64px] sm:min-h-[104px]' : 'min-h-[56px] sm:min-h-[320px]',
                    outside && 'bg-canvas/60 text-ink-soft',
                    d === selected && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', d === today && 'bg-primary font-semibold text-white')}>
                      {Number(d.slice(8))}
                    </span>
                    {view === 'week' && <span className="text-xs font-medium text-ink-soft sm:hidden">{siteConfig.weekdayLabels[weekdayOf(d)]}</span>}
                  </span>
                  {/* Celular, visão mensal: pontos coloridos por tipo + quantidade. */}
                  {view === 'month' && evs.length > 0 && (
                    <span className="flex flex-wrap items-center gap-0.5 sm:hidden" aria-hidden>
                      {kinds.slice(0, 3).map((k) => <span key={k} className={cn('h-1.5 w-1.5 rounded-full', dot[k])} />)}
                      <span className="text-[10px] text-ink-soft">{evs.length}</span>
                    </span>
                  )}
                  {evs.slice(0, max).map((e) => (
                    <span
                      key={e.id + d}
                      className={cn('truncate rounded px-1.5 py-0.5 text-[11px] leading-tight', chip[e.kind], view === 'month' && 'hidden sm:block')}
                      title={`${e.roomName}: ${e.title}`}
                    >
                      {e.kind !== 'BLOCK' && <span className="tabular-nums">{utcToTimeString(new Date(e.startAt))} </span>}
                      {view === 'week' ? `${e.roomName} · ${e.title}` : e.title}
                    </span>
                  ))}
                  {evs.length > max && <span className="hidden text-[11px] text-ink-soft sm:block">+ {evs.length - max}</span>}
                </button>
              );
            })}
          </div>
          {cal.loading && <Spinner className="py-3" />}
        </Card>

        <Card ref={dayPanelRef} className="h-fit scroll-mt-20 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{formatDateLong(selected)}</h2>
            {selected >= today && <Button size="sm" onClick={() => setNewReservation(selected)}><Plus className="h-4 w-4" aria-hidden />Reserva</Button>}
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhuma ocupação neste dia.</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e) => {
                const href = linkFor(e);
                const body = (
                  <div className={cn('rounded-lg px-3 py-2 text-sm', chip[e.kind])}>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs opacity-80">{formatRange(e.startAt, e.endAt)} · {e.roomName}</p>
                  </div>
                );
                return <li key={e.id}>{href ? <Link href={href}>{body}</Link> : body}</li>;
              })}
            </ul>
          )}
        </Card>
      </div>

      <BlocksManager rooms={rooms.data?.rooms ?? []} onChanged={cal.reload} />

      {newReservation && (
        <ReservationDialog reservation={null} rooms={rooms.data?.rooms ?? []} defaults={{ date: newReservation, roomId }} onClose={() => setNewReservation(null)} onSaved={() => { setNewReservation(null); cal.reload(); }} />
      )}
    </>
  );
}

function utcToDateStringSafe(iso: string) {
  // Último dia coberto por um bloqueio (fim é exclusivo).
  return new Intl.DateTimeFormat('en-CA', { timeZone: siteConfig.timeZone }).format(new Date(new Date(iso).getTime() - 1));
}

interface BlockDto { id: string; title: string; type: 'HOLIDAY' | 'MAINTENANCE' | 'OTHER'; startAt: string; endAt: string; notes: string | null; room: { name: string } | null }

function BlocksManager({ rooms, onChanged }: { rooms: { id: string; name: string }[]; onChanged: () => void }) {
  const toast = useToast();
  const blocks = useFetch<{ blocks: BlockDto[] }>('/api/admin/blocks');
  const [creating, setCreating] = useState(false);

  async function remove(b: BlockDto) {
    if (!window.confirm(`Remover o bloqueio "${b.title}"? As salas voltarão a ficar disponíveis nesse período.`)) return;
    try {
      await api(`/api/admin/blocks/${b.id}`, { method: 'DELETE' });
      toast('success', 'Bloqueio removido.');
      blocks.reload();
      onChanged();
    } catch (e) {
      toast('danger', (e as ApiError).message);
    }
  }

  return (
    <Card className="mt-8 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Ban className="h-4 w-4 text-danger" aria-hidden />Bloqueios e feriados</h2>
          <p className="text-sm text-ink-soft">Impedem novas reservas no período (feriados, manutenção, indisponibilidades).</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />Novo bloqueio</Button>
      </div>
      {!blocks.data ? <Spinner className="py-4" /> : blocks.data.blocks.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum bloqueio recente ou futuro.</p>
      ) : (
        <ul className="divide-y divide-mist/60">
          {blocks.data.blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <Badge tone="danger">{siteConfig.blockTypeLabels[b.type]}</Badge>
              <span className="font-medium">{b.title}</span>
              <span className="text-ink-soft">{b.room?.name ?? 'Todas as salas'}</span>
              <span className="text-ink-soft">{formatDateTime(b.startAt).slice(0, -3)} → {formatDateTime(b.endAt).slice(0, -3)}</span>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label={`Remover ${b.title}`} onClick={() => remove(b)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {creating && <BlockDialog rooms={rooms} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); blocks.reload(); onChanged(); }} />}
    </Card>
  );
}

function BlockDialog({ rooms, onClose, onSaved }: { rooms: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const today = todayString();
  const [form, setForm] = useState({ roomId: '', title: '', type: 'HOLIDAY', startDate: today, startTime: '00:00', endDate: today, endTime: '23:59', notes: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(confirm = false) {
    setSaving(true);
    setError(null);
    try {
      await api('/api/admin/blocks', { body: { ...form, roomId: form.roomId || null, notes: form.notes || null, confirm } });
      toast('success', 'Bloqueio criado.');
      onSaved();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'NEEDS_CONFIRMATION') setConfirmMsg(err);
      else setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Novo bloqueio" size="md"
      footer={confirmMsg ? (
        <><Button variant="ghost" onClick={() => setConfirmMsg(null)}>Voltar</Button><Button variant="danger" loading={saving} onClick={() => save(true)}>Bloquear mesmo assim</Button></>
      ) : (
        <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => save(false)}>Salvar</Button></>
      )}>
      {confirmMsg ? (
        <ApiErrorAlert error={confirmMsg} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><ApiErrorAlert error={error && error.code !== 'VALIDATION' ? error : null} /></div>
          <Field label="Título" htmlFor="b-titulo" required error={error?.fields.title} className="sm:col-span-2"><Input id="b-titulo" placeholder="Ex.: Feriado municipal" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Tipo" htmlFor="b-tipo">
            <Select id="b-tipo" value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(siteConfig.blockTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Sala" htmlFor="b-sala">
            <Select id="b-sala" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
              <option value="">Todas as salas</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Início (data)" htmlFor="b-di"><Input id="b-di" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Início (hora)" htmlFor="b-hi"><Input id="b-hi" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field label="Fim (data)" htmlFor="b-df" error={error?.fields.endDate}><Input id="b-df" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          <Field label="Fim (hora)" htmlFor="b-hf"><Input id="b-hf" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
          <Field label="Observações" htmlFor="b-obs" className="sm:col-span-2"><Textarea id="b-obs" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      )}
    </Dialog>
  );
}
