'use client';
/**
 * Salas e tipos de equipamento.
 */
import { useEffect, useState } from 'react';
import { Clock, DoorOpen, MapPin, Pencil, Plus, Users, Wrench } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Spinner, Textarea, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';
import { formatTime } from '@/lib/time';
import { siteConfig } from '@/config/site';
import { ApiErrorAlert, HistoryList, useEquipment, useRooms, WeekdayPicker, type EquipmentDto, type HistoryEntry, type RoomDto } from './common';

export function RoomsPage() {
  const rooms = useRooms();
  const equipment = useEquipment();
  const [editing, setEditing] = useState<RoomDto | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Salas"
        description="Cadastre, edite ou desative salas. Salas desativadas não recebem novas reservas, mas o histórico é preservado."
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden />Nova sala</Button>}
      />
      {rooms.loading && !rooms.data ? (
        <Spinner />
      ) : !rooms.data?.rooms.length ? (
        <EmptyState icon={DoorOpen} title="Nenhuma sala cadastrada" description="Cadastre a primeira sala para começar." action={<Button onClick={() => setEditing('new')}>Cadastrar sala</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rooms.data.rooms.map((r) => (
            <Card key={r.id} className={`p-4 ${r.active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{r.name}</h3>
                  {r.location && <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" aria-hidden />{r.location}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {r.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}
                  <Button variant="ghost" size="icon" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{r.capacity} pessoas</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4" aria-hidden />
                  {r.openTime ? `${formatTime(r.openTime)} às ${formatTime(r.closeTime!)}` : 'Horário padrão'}
                </span>
                <span>{r.weekdays.length === 7 ? 'Todos os dias' : r.weekdays.map((d) => siteConfig.weekdayShort[d]).join(', ')}</span>
              </div>
              {r.equipment.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.equipment.map((e) => <Badge key={e.equipmentId}>{e.equipment.name}{e.quantity > 1 ? ` (${e.quantity})` : ''}</Badge>)}
                </div>
              )}
              {r.adminNotes && <p className="mt-3 rounded-md bg-mist-soft px-2 py-1 text-xs text-ink-soft">Obs.: {r.adminNotes}</p>}
            </Card>
          ))}
        </div>
      )}

      <EquipmentManager equipment={equipment.data?.equipment ?? []} reload={() => { equipment.reload(); rooms.reload(); }} />

      {editing && (
        <RoomDialog
          room={editing === 'new' ? null : editing}
          equipment={equipment.data?.equipment ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); rooms.reload(); }}
        />
      )}
    </>
  );
}

function RoomDialog({ room, equipment, onClose, onSaved }: { room: RoomDto | null; equipment: EquipmentDto[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: room?.name ?? '',
    description: room?.description ?? '',
    location: room?.location ?? '',
    capacity: String(room?.capacity ?? ''),
    customHours: Boolean(room?.openTime),
    openTime: room?.openTime ?? '08:00',
    closeTime: room?.closeTime ?? '22:00',
    weekdays: room?.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    adminNotes: room?.adminNotes ?? '',
    active: room?.active ?? true,
    sortOrder: String(room?.sortOrder ?? 0),
    equipment: Object.fromEntries((room?.equipment ?? []).map((e) => [e.equipmentId, e.quantity])) as Record<string, number>,
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const history = useFetch<{ history: HistoryEntry[] }>(room ? `/api/admin/rooms/${room.id}` : null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(confirm = false) {
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      description: form.description || null,
      location: form.location || null,
      capacity: Number(form.capacity),
      openTime: form.customHours ? form.openTime : null,
      closeTime: form.customHours ? form.closeTime : null,
      weekdays: form.weekdays,
      adminNotes: form.adminNotes || null,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      equipment: Object.entries(form.equipment).map(([equipmentId, quantity]) => ({ equipmentId, quantity })),
      confirm,
    };
    try {
      await api(room ? `/api/admin/rooms/${room.id}` : '/api/admin/rooms', { method: room ? 'PUT' : 'POST', body });
      toast('success', room ? 'Sala atualizada.' : 'Sala cadastrada.');
      onSaved();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'NEEDS_CONFIRMATION') setNeedsConfirm(err.message);
      else setError(err);
    } finally {
      setSaving(false);
    }
  }

  const fe = error?.fields ?? {};
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={room ? `Editar ${room.name}` : 'Nova sala'} size="lg"
      footer={needsConfirm ? (
        <>
          <Button variant="ghost" onClick={() => setNeedsConfirm(null)}>Voltar</Button>
          <Button variant="danger" loading={saving} onClick={() => save(true)}>Confirmar desativação</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => save(false)}>Salvar</Button>
        </>
      )}>
      {needsConfirm ? (
        <Alert tone="warning" title="Confirmação necessária">{needsConfirm}</Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><ApiErrorAlert error={error && error.code !== 'VALIDATION' ? error : null} /></div>
          <Field label="Nome da sala" htmlFor="s-nome" required error={fe.name}>
            <Input id="s-nome" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Capacidade máxima (pessoas)" htmlFor="s-cap" required error={fe.capacity}>
            <Input id="s-cap" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label="Localização" htmlFor="s-local" error={fe.location} className="sm:col-span-2">
            <Input id="s-local" value={form.location} placeholder="Ex.: térreo, ao lado da secretaria" onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Descrição" htmlFor="s-desc" error={fe.description} className="sm:col-span-2">
            <Textarea id="s-desc" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <p className="text-sm font-medium">Dias de funcionamento</p>
            <WeekdayPicker value={form.weekdays} onChange={(v) => set('weekdays', v)} />
            {fe.weekdays && <p className="text-xs text-danger">{fe.weekdays}</p>}
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Checkbox label="Horário de funcionamento próprio (senão, usa o padrão das Configurações)" checked={form.customHours} onChange={(e) => set('customHours', e.target.checked)} />
            {form.customHours && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Abertura" htmlFor="s-abre"><Input id="s-abre" type="time" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} /></Field>
                <Field label="Fechamento" htmlFor="s-fecha" error={fe.closeTime}><Input id="s-fecha" type="time" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)} /></Field>
              </div>
            )}
          </div>
          <fieldset className="sm:col-span-2 rounded-lg border border-mist p-3">
            <legend className="px-1 text-sm font-medium">Equipamentos disponíveis</legend>
            {equipment.length === 0 ? (
              <p className="text-sm text-ink-soft">Cadastre tipos de equipamento abaixo, na página de salas.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {equipment.filter((e) => e.active || form.equipment[e.id]).map((e) => {
                  const on = form.equipment[e.id] !== undefined;
                  return (
                    <div key={e.id} className="flex items-center gap-2">
                      <Checkbox label={e.name} checked={on} onChange={(ev) => {
                        const next = { ...form.equipment };
                        if (ev.target.checked) next[e.id] = 1; else delete next[e.id];
                        set('equipment', next);
                      }} />
                      {on && (
                        <Input aria-label={`Quantidade de ${e.name}`} type="number" min={1} className="h-8 w-16" value={form.equipment[e.id]}
                          onChange={(ev) => set('equipment', { ...form.equipment, [e.id]: Math.max(1, Number(ev.target.value) || 1) })} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>
          <Field label="Observações administrativas (não aparecem ao público)" htmlFor="s-obs" className="sm:col-span-2">
            <Textarea id="s-obs" value={form.adminNotes} onChange={(e) => set('adminNotes', e.target.value)} />
          </Field>
          <Field label="Ordem de exibição" htmlFor="s-ordem" hint="Menor número aparece primeiro.">
            <Input id="s-ordem" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Sala ativa (aceita reservas)" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          </div>
          {room && (
            <div className="sm:col-span-2 border-t border-mist pt-4">
              <p className="mb-2 text-sm font-medium">Histórico</p>
              {history.data ? <HistoryList entries={history.data.history} /> : <Spinner className="py-2" />}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function EquipmentManager({ equipment, reload }: { equipment: EquipmentDto[]; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EquipmentDto | null>(null);
  const [editName, setEditName] = useState('');
  useEffect(() => setEditName(editing?.name ?? ''), [editing]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/admin/equipment', { body: { name, active: true } });
      setName('');
      toast('success', 'Equipamento cadastrado.');
      reload();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  async function update(eq: EquipmentDto, patch: Partial<EquipmentDto>) {
    try {
      await api(`/api/admin/equipment/${eq.id}`, { method: 'PUT', body: { name: eq.name, description: eq.description, active: eq.active, ...patch } });
      toast('success', 'Equipamento atualizado.');
      setEditing(null);
      reload();
    } catch (err) {
      toast('danger', (err as ApiError).message);
    }
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><Wrench className="h-4 w-4 text-primary-muted" aria-hidden />Tipos de equipamento</h2>
      <p className="mt-1 text-sm text-ink-soft">Cadastre novos tipos sem alterar o código. Equipamentos desativados deixam de aparecer no formulário público.</p>
      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Nome do novo equipamento" placeholder="Ex.: Caixa de som portátil" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={saving} disabled={!name.trim()}><Plus className="h-4 w-4" aria-hidden />Adicionar</Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error.fields.name ?? error.message}</p>}
      <ul className="mt-4 divide-y divide-mist/60">
        {equipment.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            {editing?.id === e.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(ev) => { ev.preventDefault(); void update(e, { name: editName }); }}>
                <Input aria-label="Novo nome" value={editName} onChange={(ev) => setEditName(ev.target.value)} className="h-8" />
                <Button size="sm" type="submit">Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              </form>
            ) : (
              <>
                <span className={`flex-1 ${e.active ? '' : 'text-ink-soft line-through'}`}>{e.name}</span>
                <span className="text-xs text-ink-soft">{e._count?.rooms ?? 0} sala(s)</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Renomear</Button>
                <Button size="sm" variant="outline" onClick={() => update(e, { active: !e.active })}>{e.active ? 'Desativar' : 'Reativar'}</Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
