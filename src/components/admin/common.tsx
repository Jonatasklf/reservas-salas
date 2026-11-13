'use client';
/**
 * Peças compartilhadas pelas telas administrativas.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Alert, Badge } from '@/components/ui';
import { ApiError, useFetch } from '@/lib/client';
import { formatDateShort, formatDateTime, formatRange, utcToDateString } from '@/lib/time';
import { siteConfig, type RequestStatusKey } from '@/config/site';

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number;
  openTime: string | null;
  closeTime: string | null;
  weekdays: number[];
  adminNotes: string | null;
  active: boolean;
  sortOrder: number;
  equipment: { equipmentId: string; quantity: number; equipment: { id: string; name: string; key: string } }[];
}
export interface EquipmentDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  _count?: { rooms: number };
}

export function useRooms() {
  return useFetch<{ rooms: RoomDto[] }>('/api/admin/rooms');
}
export function useEquipment() {
  return useFetch<{ equipment: EquipmentDto[] }>('/api/admin/equipment');
}

const statusTone: Record<RequestStatusKey, 'warning' | 'primary' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  AWAITING_INFO: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function RequestStatusBadge({ status }: { status: RequestStatusKey }) {
  return <Badge tone={statusTone[status]}>{siteConfig.requestStatusLabels[status]}</Badge>;
}

export function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, [string, 'primary' | 'recurring' | 'danger' | 'warning' | 'neutral']> = {
    RESERVATION: ['Reserva', 'primary'],
    RECURRING: ['Recorrente', 'recurring'],
    BLOCK: ['Bloqueio', 'danger'],
    REQUEST: ['Pendente', 'warning'],
    CANCELLED_OCCURRENCE: ['Cancelada', 'neutral'],
  };
  const [label, tone] = map[kind] ?? [kind, 'neutral'];
  return <Badge tone={tone}>{label}</Badge>;
}

export interface HistoryEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  admin: { name: string } | null;
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="text-sm text-ink-soft">Nenhum registro no histórico.</p>;
  return (
    <ol className="relative space-y-3 border-l border-mist pl-4">
      {entries.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary-muted" />
          <p className="text-sm text-ink">{h.summary}</p>
          <p className="text-xs text-ink-soft">
            {formatDateTime(h.createdAt)}
            {h.admin ? ` · ${h.admin.name}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

type Conflict = { kind: string; title: string; startAt: string; endAt: string };

/**
 * Mostra um erro da API com os detalhes úteis (conflitos, pedidos anteriores,
 * reservas afetadas, impacto de alteração de sala etc.).
 */
export function ApiErrorAlert({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const d = (error.details ?? {}) as {
    issues?: { message: string; conflicts?: Conflict[] }[];
    earlier?: { protocol: string; requesterName: string; receivedAt: string }[];
    impact?: { title: string; date: string; time: string; problem: string }[];
    affected?: Conflict[];
  };
  return (
    <Alert tone="danger" title={error.message}>
      {d.issues && d.issues.length > 1 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {d.issues.slice(1).map((i) => <li key={i.message}>{i.message}</li>)}
        </ul>
      )}
      {d.issues?.flatMap((i) => i.conflicts ?? []).length ? (
        <ul className="mt-2 space-y-0.5">
          {d.issues.flatMap((i) => i.conflicts ?? []).map((c, idx) => (
            <li key={idx}>
              <KindBadge kind={c.kind} /> {formatDateShort(utcToDateString(new Date(c.startAt)))} {formatRange(c.startAt, c.endAt)} — {c.title}
            </li>
          ))}
        </ul>
      ) : null}
      {d.earlier && (
        <ul className="mt-2 space-y-0.5">
          {d.earlier.map((e) => (
            <li key={e.protocol}>Protocolo {e.protocol} — {e.requesterName} (recebido em {formatDateTime(e.receivedAt)})</li>
          ))}
        </ul>
      )}
      {d.impact && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
          {d.impact.map((i, idx) => (
            <li key={idx}>{formatDateShort(i.date)} {i.time} — {i.title}: {i.problem}</li>
          ))}
        </ul>
      )}
      {d.affected && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
          {d.affected.map((c, idx) => (
            <li key={idx}><KindBadge kind={c.kind} /> {formatDateShort(utcToDateString(new Date(c.startAt)))} {formatRange(c.startAt, c.endAt)} — {c.title}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

export function WeekdayPicker({ value, onChange, single }: { value: number[]; onChange: (v: number[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
      {siteConfig.weekdayShort.map((label, d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(single ? [d] : on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`h-9 min-w-11 rounded-lg border px-2 text-sm transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-mist bg-surface text-ink hover:bg-mist-soft'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'primary', icon: Icon }: { label: string; value: number | string; hint?: string; tone?: 'primary' | 'warning' | 'success' | 'recurring'; icon: React.ElementType }) {
  const tones = { primary: 'bg-primary-soft text-primary', warning: 'bg-warning-soft text-warning', success: 'bg-success-soft text-success', recurring: 'bg-recurring-soft text-recurring' };
  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-mist/80 bg-surface p-4">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <div>
        <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-sm text-ink-soft">{label}</p>
        {hint && <p className="text-xs text-ink-soft/80">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Painel de filtros: no celular mostra só o filtro principal e um botão
 * "Mais filtros"; a partir de tablets, mostra tudo lado a lado.
 */
export function FilterPanel({
  primary,
  children,
  activeCount = 0,
  columns = 'lg:grid-cols-4',
}: {
  primary: React.ReactNode;
  children: React.ReactNode;
  activeCount?: number;
  columns?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mb-4 grid gap-3 rounded-[var(--radius-card)] border border-mist/80 bg-surface p-4 sm:grid-cols-2 ${columns}`}>
      {primary}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between rounded-lg border border-mist px-3 py-2 text-sm font-medium text-ink sm:hidden"
      >
        <span>Mais filtros{activeCount > 0 ? ` (${activeCount} ativo${activeCount > 1 ? 's' : ''})` : ''}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className={`${open ? 'grid' : 'hidden'} gap-3 sm:contents`}>{children}</div>
    </div>
  );
}
