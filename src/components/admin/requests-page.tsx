'use client';
/**
 * Fila de solicitações — ordem cronológica de recebimento (mais antigas primeiro).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Inbox, Mail, Phone, Search, Swords, Users } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';
import { formatDateShort, formatDateTime, formatRange, utcToDateString } from '@/lib/time';
import type { RequestStatusKey } from '@/config/site';
import { ApiErrorAlert, HistoryList, RequestStatusBadge, useRooms, type HistoryEntry } from './common';

interface RequestDto {
  id: string;
  sequence: number;
  protocol: string;
  requesterName: string;
  purpose: string;
  startAt: string;
  endAt: string;
  participants: number;
  needsProjector: boolean;
  otherEquipmentNotes: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: RequestStatusKey;
  receivedAt: string;
  publicMessage: string | null;
  internalNotes: string | null;
  suggestion: string | null;
  availabilityLostAt: string | null;
  room: { id: string; name: string; capacity: number; active: boolean };
  equipment: { equipment: { id: string; name: string } }[];
  competitors: { id: string; protocol: string; sequence: number }[];
  isOldestInCompetition: boolean;
  currentIssues: { reason: string; message: string }[];
}

const TABS: { key: string; label: string; statuses: string }[] = [
  { key: 'abertas', label: 'Em aberto', statuses: 'PENDING,AWAITING_INFO' },
  { key: 'aprovadas', label: 'Aprovadas', statuses: 'APPROVED' },
  { key: 'rejeitadas', label: 'Rejeitadas', statuses: 'REJECTED' },
  { key: 'canceladas', label: 'Canceladas', statuses: 'CANCELLED' },
  { key: 'todas', label: 'Todas', statuses: '' },
];

export function RequestsPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState('abertas');
  const [roomId, setRoomId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(params.get('abrir'));
  const rooms = useRooms();

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      const statuses = TABS.find((x) => x.key === tab)!.statuses;
      if (statuses) q.set('status', statuses);
      if (roomId) q.set('roomId', roomId);
      if (search.trim()) q.set('search', search.trim());
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      setQuery(q.toString());
    }, 250);
    return () => clearTimeout(t);
  }, [tab, roomId, search, from, to]);

  const list = useFetch<{ requests: RequestDto[] }>(`/api/admin/requests?${query}`);
  const requests = list.data?.requests ?? [];

  return (
    <>
      <PageHeader title="Solicitações" description="Pedidos recebidos pela página pública, em ordem de chegada (horário registrado pelo servidor)." />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-mist-soft p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === t.key ? 'bg-surface font-medium text-primary shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Buscar" htmlFor="q-busca">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input id="q-busca" className="pl-9" placeholder="Nome, protocolo ou finalidade" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Sala" htmlFor="q-sala">
          <Select id="q-sala" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Todas as salas</option>
            {rooms.data?.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Reunião a partir de" htmlFor="q-de"><Input id="q-de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até" htmlFor="q-ate"><Input id="q-ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Card>

      {list.loading && !list.data ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhuma solicitação encontrada" description={tab === 'abertas' ? 'Não há pedidos aguardando análise.' : 'Ajuste os filtros para ver outros pedidos.'} />
      ) : (
        <ol className={`space-y-3 ${list.loading ? 'opacity-60' : ''}`}>
          {requests.map((r, i) => (
            <li key={r.id}>
              <button onClick={() => setOpenId(r.id)} className="block w-full text-left">
                <Card className={`p-4 transition-shadow hover:shadow-md ${r.currentIssues.length && ['PENDING', 'AWAITING_INFO'].includes(r.status) ? 'border-danger/40' : ''}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    {tab === 'abertas' && (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary" title="Posição na fila">{i + 1}º</span>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.protocol}</span>
                        <RequestStatusBadge status={r.status} />
                        {r.competitors.length > 0 && ['PENDING', 'AWAITING_INFO'].includes(r.status) && (
                          <Badge tone="warning"><Swords className="h-3 w-3" aria-hidden />Concorrência{r.isOldestInCompetition ? ' · mais antigo' : ''}</Badge>
                        )}
                        {r.currentIssues.length > 0 && ['PENDING', 'AWAITING_INFO'].includes(r.status) && (
                          <Badge tone="danger"><AlertTriangle className="h-3 w-3" aria-hidden />Indisponível</Badge>
                        )}
                      </div>
                      <p className="text-sm"><strong>{r.requesterName}</strong> — {r.purpose}</p>
                      <p className="text-sm text-ink-soft">
                        {r.room.name} · {formatDateShort(utcToDateString(new Date(r.startAt)))}, {formatRange(r.startAt, r.endAt)} ·{' '}
                        <span className={r.participants > r.room.capacity ? 'font-medium text-danger' : ''}>{r.participants}/{r.room.capacity} pessoas</span>
                      </p>
                    </div>
                    <p className="text-xs text-ink-soft sm:text-right">Recebida em<br /><span className="tabular-nums">{formatDateTime(r.receivedAt)}</span></p>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ol>
      )}

      {openId && <RequestDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </>
  );
}

type Action = 'approve' | 'reject' | 'request_info' | 'suggest' | 'cancel' | 'reopen' | 'note';

interface DetailDto extends Omit<RequestDto, 'competitors' | 'isOldestInCompetition'> {
  history: HistoryEntry[];
  competitors: { id: string; protocol: string; sequence: number; requesterName: string; receivedAt: string; status: RequestStatusKey }[];
  alternatives: { id: string; name: string; capacity: number; location: string | null }[];
  reservation: { id: string } | null;
}

function RequestDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const detail = useFetch<DetailDto>(`/api/admin/requests/${id}`);
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [showTitle, setShowTitle] = useState(false);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const d = detail.data;
  const open = d && ['PENDING', 'AWAITING_INFO'].includes(d.status);
  const earlier = d?.competitors.filter((c) => c.sequence < d.sequence) ?? [];

  function choose(a: Action) {
    setAction(a);
    setText('');
    setPublicMessage('');
    setError(null);
  }

  async function submit() {
    if (!action) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { action };
    if (action === 'approve') Object.assign(body, { priorityJustification: justification || null, publicMessage: publicMessage || null, publicTitle: publicTitle || null, showPublicTitle: showTitle });
    if (action === 'reject') Object.assign(body, { reason: text, publicMessage: publicMessage || null });
    if (action === 'request_info') body.message = text;
    if (action === 'suggest') body.suggestion = text;
    if (action === 'cancel') body.reason = text;
    if (action === 'reopen') body.note = text || null;
    if (action === 'note') body.note = text;
    try {
      await api(`/api/admin/requests/${id}/decision`, { body });
      const msg: Record<Action, string> = {
        approve: 'Solicitação aprovada. A reserva foi confirmada no calendário.', reject: 'Solicitação rejeitada.',
        request_info: 'Pedido de informações registrado.', suggest: 'Sugestão registrada.', cancel: 'Solicitação cancelada.',
        reopen: 'Solicitação voltou para análise.', note: 'Anotação registrada.',
      };
      toast('success', msg[action]);
      window.dispatchEvent(new Event('solicitacoes-alteradas'));
      setAction(null);
      detail.reload();
      onChanged();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const needsText = action && ['reject', 'request_info', 'suggest', 'cancel', 'note'].includes(action);
  const textLabel: Partial<Record<Action, string>> = {
    reject: 'Justificativa da rejeição (obrigatória)', request_info: 'Quais informações são necessárias?',
    suggest: 'Sugestão de outra sala ou horário', cancel: 'Motivo do cancelamento', note: 'Anotação interna', reopen: 'Observação (opcional)',
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={d ? `Solicitação ${d.protocol}` : 'Solicitação'} size="lg"
      footer={action ? (
        <>
          <Button variant="ghost" onClick={() => setAction(null)}>Voltar</Button>
          <Button variant={action === 'reject' || action === 'cancel' ? 'danger' : 'primary'} loading={saving}
            disabled={Boolean(needsText && !text.trim()) || (action === 'approve' && earlier.length > 0 && !justification.trim())}
            onClick={submit}>
            Confirmar
          </Button>
        </>
      ) : undefined}>
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={d.status} />
            <span className="text-sm text-ink-soft">Recebida em {formatDateTime(d.receivedAt)} · {d.sequence}º pedido registrado</span>
          </div>

          {open && d.currentIssues.length > 0 && (
            <Alert tone="danger" title="Este horário não está mais disponível">
              <ul className="list-disc pl-4">{d.currentIssues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>
            </Alert>
          )}
          {open && d.competitors.length > 0 && (
            <Alert tone="warning" title="Concorrência pelo mesmo horário">
              <ul className="space-y-0.5">
                {d.competitors.map((c) => (
                  <li key={c.id}>{c.sequence < d.sequence ? 'Anterior' : 'Posterior'}: {c.protocol} — {c.requesterName} ({formatDateTime(c.receivedAt)})</li>
                ))}
              </ul>
              {earlier.length > 0 && <p className="mt-1">Por padrão, analise primeiro o pedido mais antigo. Para priorizar este, será exigida justificativa.</p>}
            </Alert>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-soft">Solicitante</dt><dd className="font-medium">{d.requesterName}</dd></div>
            <div><dt className="text-ink-soft">Contato</dt><dd className="space-y-0.5">
              {d.contactPhone && <a href={`tel:${d.contactPhone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{d.contactPhone}</a>}
              {d.contactEmail && <a href={`mailto:${d.contactEmail}`} className="flex items-center gap-1 text-primary hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{d.contactEmail}</a>}
            </dd></div>
            <div><dt className="text-ink-soft">Sala</dt><dd className="font-medium">{d.room.name}{!d.room.active && ' (inativa)'}</dd></div>
            <div><dt className="text-ink-soft">Data e horário</dt><dd className="font-medium">{formatDateShort(utcToDateString(new Date(d.startAt)))}, {formatRange(d.startAt, d.endAt)}</dd></div>
            <div><dt className="text-ink-soft">Participantes / capacidade</dt><dd className="flex items-center gap-1 font-medium"><Users className="h-4 w-4" aria-hidden />{d.participants} / {d.room.capacity}</dd></div>
            <div><dt className="text-ink-soft">Equipamentos</dt><dd>
              {[d.needsProjector ? 'Projetor' : null, ...d.equipment.map((e) => e.equipment.name)].filter(Boolean).join(', ') || 'Nenhum'}
              {d.otherEquipmentNotes && <span className="block text-ink-soft">Outros: {d.otherEquipmentNotes}</span>}
            </dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-soft">Finalidade</dt><dd>{d.purpose}</dd></div>
            {d.publicMessage && <div className="sm:col-span-2"><dt className="text-ink-soft">Mensagem ao solicitante</dt><dd>{d.publicMessage}</dd></div>}
            {d.suggestion && <div className="sm:col-span-2"><dt className="text-ink-soft">Sugestão enviada</dt><dd>{d.suggestion}</dd></div>}
            {d.internalNotes && <div className="sm:col-span-2"><dt className="text-ink-soft">Justificativa interna</dt><dd>{d.internalNotes}</dd></div>}
          </dl>

          {action ? (
            <div className="space-y-3 rounded-xl border border-mist p-4">
              <ApiErrorAlert error={error} />
              {action === 'approve' && (
                <>
                  <p className="text-sm">A aprovação cria uma <strong>reserva confirmada</strong>. As regras de capacidade e conflito são verificadas novamente agora.</p>
                  {earlier.length > 0 && (
                    <Field label="Justificativa para priorizar este pedido (obrigatória)" htmlFor="d-just" required>
                      <Textarea id="d-just" value={justification} onChange={(e) => setJustification(e.target.value)} />
                    </Field>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Título público (opcional)" htmlFor="d-titulo" hint="Se vazio, o público vê apenas “Reservado”.">
                      <Input id="d-titulo" value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} />
                    </Field>
                    <div className="flex items-end pb-2"><Checkbox label="Exibir título publicamente" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} /></div>
                  </div>
                  <Field label="Mensagem ao solicitante (opcional)" htmlFor="d-msg"><Textarea id="d-msg" value={publicMessage} onChange={(e) => setPublicMessage(e.target.value)} /></Field>
                </>
              )}
              {action !== 'approve' && (
                <Field label={textLabel[action] ?? 'Texto'} htmlFor="d-texto" required={action !== 'reopen'}>
                  <Textarea id="d-texto" value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
              )}
              {action === 'suggest' && d.alternatives.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.alternatives.map((a) => (
                    <Button key={a.id} size="sm" variant="secondary" onClick={() => setText(`Sugerimos a sala ${a.name} (capacidade ${a.capacity}) no mesmo horário.`)}>{a.name}</Button>
                  ))}
                </div>
              )}
              {action === 'reject' && (
                <Field label="Mensagem ao solicitante (opcional — se vazia, a justificativa é exibida)" htmlFor="d-msg2"><Textarea id="d-msg2" value={publicMessage} onChange={(e) => setPublicMessage(e.target.value)} /></Field>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-mist pt-4">
              {open && <Button onClick={() => choose('approve')} disabled={d.currentIssues.length > 0}>Aprovar</Button>}
              {open && <Button variant="danger" onClick={() => choose('reject')}>Rejeitar</Button>}
              {open && <Button variant="outline" onClick={() => choose('request_info')}>Pedir informações</Button>}
              {open && <Button variant="outline" onClick={() => choose('suggest')}>Sugerir outra sala/horário</Button>}
              {d.status === 'AWAITING_INFO' && <Button variant="outline" onClick={() => choose('reopen')}>Voltar para análise</Button>}
              {(open || d.status === 'APPROVED') && <Button variant="ghost" onClick={() => choose('cancel')}>Cancelar solicitação</Button>}
              <Button variant="ghost" onClick={() => choose('note')}>Anotar</Button>
            </div>
          )}

          <div className="border-t border-mist pt-4">
            <p className="mb-2 text-sm font-medium">Histórico de decisões</p>
            <HistoryList entries={d.history} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
