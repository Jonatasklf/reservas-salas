'use client';
/**
 * Cartão de uma sala na página pública: capacidade, equipamentos, horários
 * ocupados e livres e a situação no horário escolhido.
 */
import { CheckCircle2, Clock, Hourglass, MapPin, Repeat, Users, XCircle, Ban } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { formatRange, formatTime } from '@/lib/time';

export interface DayRoom {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number;
  hours: { open: string; close: string };
  openToday: boolean;
  equipment: { id: string; key: string; name: string; quantity: number }[];
  busy: { kind: 'RESERVATION' | 'RECURRING' | 'BLOCK'; startAt: string; endAt: string; title: string }[];
  free: { startAt: string; endAt: string }[];
  pendingCount: number;
  missingEquipment: string[];
  status: { available: boolean; messages: string[] } | null;
}

const kindInfo = {
  RECURRING: { label: 'Reunião recorrente', tone: 'recurring' as const, icon: Repeat },
  RESERVATION: { label: 'Reserva confirmada', tone: 'primary' as const, icon: CheckCircle2 },
  BLOCK: { label: 'Bloqueio', tone: 'danger' as const, icon: Ban },
};

export function RoomCard({ room, onRequest, highlight }: { room: DayRoom; onRequest: () => void; highlight: boolean }) {
  const status = room.status;
  return (
    <Card className={`animate-fade-in overflow-hidden ${highlight && status ? (status.available ? 'ring-1 ring-success/40' : '') : ''}`}>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink">{room.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              {room.location && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />{room.location}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden />Capacidade: {room.capacity} pessoas</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{formatTime(room.hours.open)} às {formatTime(room.hours.close)}</span>
            </div>
          </div>
          {status &&
            (status.available ? (
              <Badge tone="success" className="text-sm"><CheckCircle2 className="h-4 w-4" aria-hidden />Disponível no horário</Badge>
            ) : (
              <Badge tone="danger" className="text-sm"><XCircle className="h-4 w-4" aria-hidden />Indisponível</Badge>
            ))}
        </div>

        {room.description && <p className="-mt-2 text-sm text-ink-soft">{room.description}</p>}

        {room.equipment.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Equipamentos">
            {room.equipment.map((e) => (
              <Badge key={e.id}>{e.name}{e.quantity > 1 ? ` (${e.quantity})` : ''}</Badge>
            ))}
          </div>
        )}

        {status && !status.available && (
          <ul className="space-y-1 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {status.messages.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}

        {!room.openToday ? (
          <p className="rounded-lg bg-mist-soft px-3 py-2 text-sm text-ink-soft">Esta sala não funciona neste dia da semana.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Horários ocupados</p>
              {room.busy.length === 0 ? (
                <p className="text-sm text-ink-soft">Nenhuma reserva neste dia.</p>
              ) : (
                <ul className="space-y-1.5">
                  {room.busy.map((b, i) => {
                    const info = kindInfo[b.kind];
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <info.icon className={`mt-0.5 h-4 w-4 shrink-0 ${b.kind === 'BLOCK' ? 'text-danger' : b.kind === 'RECURRING' ? 'text-recurring' : 'text-primary'}`} aria-hidden />
                        <span>
                          <span className="font-medium tabular-nums">{formatRange(b.startAt, b.endAt)}</span>
                          <span className="text-ink-soft"> — {b.title}</span>
                          <span className="sr-only"> ({info.label})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Horários disponíveis</p>
              {room.free.length === 0 ? (
                <p className="text-sm text-ink-soft">Sem horários livres neste dia.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {room.free.map((f, i) => (
                    <Badge key={i} tone="success" className="tabular-nums">{formatRange(f.startAt, f.endAt)}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-mist/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-soft">
            {room.pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <Hourglass className="h-3.5 w-3.5" aria-hidden />
                {room.pendingCount} solicitação(ões) em análise {highlight ? 'neste horário' : 'neste dia'}. Os pedidos são analisados por ordem de chegada.
              </span>
            ) : (
              'Os pedidos são analisados pela administração por ordem de chegada.'
            )}
          </p>
          <Button onClick={onRequest} disabled={Boolean(status && !status.available)} className="sm:w-auto">
            Solicitar reserva
          </Button>
        </div>
      </div>
    </Card>
  );
}
