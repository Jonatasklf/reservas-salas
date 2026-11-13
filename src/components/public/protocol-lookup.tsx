'use client';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';
import { api, type ApiError } from '@/lib/client';
import { formatDateTime, formatRange, formatDateShort, utcToDateString } from '@/lib/time';

interface Result {
  protocol: string;
  status: 'PENDING' | 'AWAITING_INFO' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  statusLabel: string;
  room: string;
  location: string | null;
  startAt: string;
  endAt: string;
  participants: number;
  receivedAt: string;
  decidedAt: string | null;
  publicMessage: string | null;
  suggestion: string | null;
}

const tone = { PENDING: 'warning', AWAITING_INFO: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;

export function ProtocolLookup() {
  const [protocol, setProtocol] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!protocol.trim() || !code.trim()) {
      setError('Informe o protocolo e o código de acesso.');
      return;
    }
    setLoading(true);
    try {
      setResult(await api<Result>('/api/public/protocol', { body: { protocol, code } }));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Protocolo" htmlFor="p-protocolo" hint="Ex.: 2026-000123">
            <Input id="p-protocolo" value={protocol} onChange={(e) => setProtocol(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Código de acesso" htmlFor="p-codigo" hint="8 letras/números">
            <Input id="p-codigo" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" className="font-mono uppercase tracking-wider" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={loading} className="w-full sm:w-auto">Consultar</Button>
          </div>
        </form>
      </Card>
      {error && <Alert tone="danger">{error}</Alert>}
      {result && (
        <Card className="animate-fade-in space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">Protocolo <strong className="text-ink">{result.protocol}</strong></p>
            <Badge tone={tone[result.status]} className="text-sm">{result.statusLabel}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-soft">Sala</dt><dd className="font-medium">{result.room}</dd></div>
            <div><dt className="text-ink-soft">Data</dt><dd className="font-medium">{formatDateShort(utcToDateString(new Date(result.startAt)))}</dd></div>
            <div><dt className="text-ink-soft">Horário</dt><dd className="font-medium">{formatRange(result.startAt, result.endAt)}</dd></div>
            <div><dt className="text-ink-soft">Participantes</dt><dd className="font-medium">{result.participants}</dd></div>
            <div className="col-span-2"><dt className="text-ink-soft">Recebido em</dt><dd>{formatDateTime(result.receivedAt)}</dd></div>
          </dl>
          {result.status === 'APPROVED' && <Alert tone="success" title="Reserva confirmada">A sala está reservada para você neste horário.</Alert>}
          {result.status === 'PENDING' && <Alert tone="info">Seu pedido aguarda análise da administração.</Alert>}
          {result.publicMessage && <Alert tone={result.status === 'REJECTED' ? 'danger' : 'info'} title="Mensagem da administração">{result.publicMessage}</Alert>}
          {result.suggestion && <Alert tone="warning" title="Sugestão da administração">{result.suggestion}</Alert>}
        </Card>
      )}
    </div>
  );
}
