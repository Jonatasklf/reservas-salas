'use client';
/**
 * Reservas confirmadas: consulta (inclusive histórico), criação direta,
 * edição, cancelamento e exportação.
 */
import { useEffect, useState } from 'react';
import { ClipboardList, Download, Pencil, Plus, Printer, Search, XCircle } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';
import { capacityMessage } from '@/server/availability';
import { addDays, formatDateShort, formatRange, todayString, utcToDateString, utcToTimeString } from '@/lib/time';
import { ApiErrorAlert, HistoryList, useEquipment, useRooms, type HistoryEntry, type RoomDto } from './common';

interface ReservationDto {
  id: string;
  roomId: string;
  title: string;
  publicTitle: string | null;
  showPublicTitle: boolean;
  responsible: string;
  startAt: string;
  endAt: string;
  participants: number;
  notes: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
  source: 'ADMIN' | 'REQUEST';
  cancelReason: string | null;
  room: { id: string; name: string };
  request: { id: string; protocol: string } | null;
  equipment: { equipment: { id: string; name: string } }[];
}

export function ReservationsPage() {
  const today = todayString();
  const [filters, setFilters] = useState({ from: today, to: addDays(today, 60), roomId: '', status: 'CONFIRMED', search: '' });
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ReservationDto | 'new' | null>(null);
  const [cancelling, setCancelling] = useState<ReservationDto | null>(null);
  const rooms = useRooms();

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
      setQuery(q.toString());
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  const list = useFetch<{ reservations: ReservationDto[] }>(query ? `/api/admin/reservations?${query}` : null);
  const reservations = list.data?.reservations ?? [];

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Reservas confirmadas (diretas ou de solicitações aprovadas). Reuniões recorrentes ficam em sua própria tela."
        actions={
          <>
            <a href={`/api/admin/export?from=${filters.from || today}&to=${filters.to || addDays(today, 60)}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-mist bg-surface px-4 text-sm font-medium hover:bg-mist-soft">
              <Download className="h-4 w-4" aria-hidden />CSV
            </a>
            <a href={`/admin/imprimir?from=${filters.from || today}&to=${filters.to || addDays(today, 30)}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-mist bg-surface px-4 text-sm font-medium hover:bg-mist-soft">
              <Printer className="h-4 w-4" aria-hidden />Imprimir / PDF
            </a>
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden />Nova reserva</Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Buscar" htmlFor="rf-busca">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input id="rf-busca" className="pl-9" placeholder="Título ou responsável" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          </div>
        </Field>
        <Field label="Sala" htmlFor="rf-sala">
          <Select id="rf-sala" value={filters.roomId} onChange={(e) => setFilters({ ...filters, roomId: e.target.value })}>
            <option value="">Todas</option>
            {rooms.data?.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Situação" htmlFor="rf-sit">
          <Select id="rf-sit" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="CONFIRMED">Confirmadas</option>
            <option value="CANCELLED">Canceladas</option>
            <option value="">Todas</option>
          </Select>
        </Field>
        <Field label="De" htmlFor="rf-de"><Input id="rf-de" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
        <Field label="Até" htmlFor="rf-ate"><Input id="rf-ate" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
      </Card>
      <p className="mb-3 text-xs text-ink-soft">Dica: para consultar reservas antigas (histórico), altere a data inicial para o passado.</p>

      {list.loading && !list.data ? (
        <Spinner />
      ) : reservations.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma reserva no período" action={<Button onClick={() => setEditing('new')}>Criar reserva</Button>} />
      ) : (
        <Card className={`divide-y divide-mist/60 ${list.loading ? 'opacity-60' : ''}`}>
          {reservations.map((r) => {
            const past = new Date(r.endAt) < new Date();
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="w-36 shrink-0">
                  <p className="font-medium">{formatDateShort(utcToDateString(new Date(r.startAt)))}</p>
                  <p className="tabular-nums text-ink-soft">{formatRange(r.startAt, r.endAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-ink-soft">{r.room.name} · {r.responsible} · {r.participants} pessoas</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.request && <Badge tone="primary">Solicitação {r.request.protocol}</Badge>}
                  {r.status === 'CANCELLED' ? <Badge tone="danger" title={r.cancelReason ?? ''}>Cancelada</Badge> : past ? <Badge>Realizada</Badge> : <Badge tone="success">Confirmada</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Editar / detalhes" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                  {r.status === 'CONFIRMED' && !past && (
                    <Button variant="ghost" size="icon" aria-label="Cancelar reserva" onClick={() => setCancelling(r)}><XCircle className="h-4 w-4 text-danger" /></Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {editing && (
        <ReservationDialog reservation={editing === 'new' ? null : editing} rooms={rooms.data?.rooms ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
      )}
      {cancelling && <CancelDialog reservation={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); list.reload(); }} />}
    </>
  );
}

export function ReservationDialog({
  reservation, rooms, onClose, onSaved, defaults,
}: {
  reservation: ReservationDto | null;
  rooms: RoomDto[];
  onClose: () => void;
  onSaved: () => void;
  defaults?: { date?: string; roomId?: string };
}) {
  const toast = useToast();
  const equipment = useEquipment();
  const history = useFetch<{ history: HistoryEntry[] }>(reservation ? `/api/admin/reservations/${reservation.id}` : null);
  const readOnly = Boolean(reservation && (reservation.status === 'CANCELLED' || new Date(reservation.endAt) < new Date()));
  const [form, setForm] = useState({
    roomId: reservation?.roomId ?? defaults?.roomId ?? '',
    title: reservation?.title ?? '',
    responsible: reservation?.responsible ?? '',
    date: reservation ? utcToDateString(new Date(reservation.startAt)) : defaults?.date ?? todayString(),
    startTime: reservation ? utcToTimeString(new Date(reservation.startAt)) : '',
    endTime: reservation ? utcToTimeString(new Date(reservation.endAt)) : '',
    participants: String(reservation?.participants ?? ''),
    equipmentIds: reservation?.equipment.map((e) => e.equipment.id) ?? [],
    publicTitle: reservation?.publicTitle ?? '',
    showPublicTitle: reservation?.showPublicTitle ?? false,
    notes: reservation?.notes ?? '',
    reason: '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const room = rooms.find((r) => r.id === form.roomId);
  const over = room && Number(form.participants) > room.capacity;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, participants: Number(form.participants) || 0, publicTitle: form.publicTitle || null, notes: form.notes || null, reason: form.reason || null };
      await api(reservation ? `/api/admin/reservations/${reservation.id}` : '/api/admin/reservations', { method: reservation ? 'PUT' : 'POST', body });
      toast('success', reservation ? 'Reserva atualizada.' : 'Reserva confirmada.');
      onSaved();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const fe = error?.fields ?? {};
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={reservation ? (readOnly ? 'Detalhes da reserva' : 'Editar reserva') : 'Nova reserva'} size="lg"
      footer={readOnly ? <Button variant="ghost" onClick={onClose}>Fechar</Button> : (
        <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} disabled={Boolean(over)} onClick={save}>{reservation ? 'Salvar alterações' : 'Confirmar reserva'}</Button></>
      )}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ApiErrorAlert error={error && error.code !== 'VALIDATION' ? error : null} /></div>
        {readOnly && reservation?.status === 'CANCELLED' && <p className="sm:col-span-2 text-sm text-danger">Cancelada: {reservation.cancelReason}</p>}
        <Field label="Sala" htmlFor="rv-sala" required error={fe.roomId}>
          <Select id="rv-sala" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
            <option value="">Selecione</option>
            {rooms.map((r) => <option key={r.id} value={r.id} disabled={!r.active}>{r.name} ({r.capacity} pessoas){r.active ? '' : ' — inativa'}</option>)}
          </Select>
        </Field>
        <Field label="Nome da reunião" htmlFor="rv-titulo" required error={fe.title}>
          <Input id="rv-titulo" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Responsável" htmlFor="rv-resp" required error={fe.responsible}>
          <Input id="rv-resp" value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
        </Field>
        <Field label="Participantes" htmlFor="rv-part" required error={fe.participants || (over ? capacityMessage(room!.capacity) : undefined)}>
          <Input id="rv-part" type="number" min={1} value={form.participants} onChange={(e) => set('participants', e.target.value)} />
        </Field>
        <Field label="Data" htmlFor="rv-data" required error={fe.date}>
          <Input id="rv-data" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início" htmlFor="rv-ini" required error={fe.startTime}><Input id="rv-ini" type="time" step={300} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field label="Término" htmlFor="rv-fim" required error={fe.endTime}><Input id="rv-fim" type="time" step={300} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
        </div>
        <fieldset className="sm:col-span-2 rounded-lg border border-mist p-3">
          <legend className="px-1 text-sm font-medium">Equipamentos necessários</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {equipment.data?.equipment.filter((e) => e.active).map((e) => (
              <Checkbox key={e.id} label={e.name} checked={form.equipmentIds.includes(e.id)}
                onChange={(ev) => set('equipmentIds', ev.target.checked ? [...form.equipmentIds, e.id] : form.equipmentIds.filter((x) => x !== e.id))} />
            ))}
          </div>
        </fieldset>
        <Field label="Título público (opcional)" htmlFor="rv-pub" hint="Se não exibido, o público vê “Reservado”.">
          <Input id="rv-pub" value={form.publicTitle} onChange={(e) => set('publicTitle', e.target.value)} />
        </Field>
        <div className="flex items-end pb-2"><Checkbox label="Exibir título na página pública" checked={form.showPublicTitle} onChange={(e) => set('showPublicTitle', e.target.checked)} /></div>
        <Field label="Observações" htmlFor="rv-obs" className="sm:col-span-2"><Textarea id="rv-obs" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        {reservation && !readOnly && (
          <Field label="Motivo da alteração (fica no histórico)" htmlFor="rv-motivo" className="sm:col-span-2"><Input id="rv-motivo" value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
        )}
      </fieldset>
      {reservation && (
        <div className="mt-5 border-t border-mist pt-4">
          <p className="mb-2 text-sm font-medium">Histórico</p>
          {history.data ? <HistoryList entries={history.data.history} /> : <Spinner className="py-2" />}
        </div>
      )}
    </Dialog>
  );
}

function CancelDialog({ reservation, onClose, onDone }: { reservation: ReservationDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function confirm() {
    setSaving(true);
    try {
      await api(`/api/admin/reservations/${reservation.id}/cancel`, { body: { reason } });
      toast('success', 'Reserva cancelada. O horário foi liberado.');
      onDone();
    } catch (e) {
      setError(e as ApiError);
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cancelar reserva" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant="danger" loading={saving} disabled={!reason.trim()} onClick={confirm}>Cancelar reserva</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={error} />
        <p className="text-sm">{reservation.title} — {reservation.room.name}, {formatDateShort(utcToDateString(new Date(reservation.startAt)))} {formatRange(reservation.startAt, reservation.endAt)}</p>
        {reservation.request && <p className="text-sm text-ink-soft">A solicitação {reservation.request.protocol} também será marcada como cancelada.</p>}
        <Field label="Motivo (obrigatório)" htmlFor="c-motivo" required><Textarea id="c-motivo" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
