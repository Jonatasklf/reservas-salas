'use client';
/**
 * Cartão "WhatsApp" em Configurações: mostra se o número do sistema está
 * conectado, exibe o QR Code para conectar, envia teste e desconecta.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Smartphone } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, useToast } from '@/components/ui';
import { api, ApiError, useFetch } from '@/lib/client';

interface Status {
  configured: boolean;
  reachable: boolean;
  estado: string;
  qr: string | null;
  numero: string | null;
  nome: string | null;
  erro: string | null;
}

const resultLabels: Record<string, [string, 'success' | 'danger' | 'info']> = {
  sent: ['Mensagem de teste enviada. Confira o WhatsApp do número informado.', 'success'],
  saved: ['Serviço de WhatsApp não configurado: a mensagem foi salva na pasta .whatsapp-enviados (modo de teste).', 'info'],
  skipped: ['Serviço de WhatsApp não configurado: nada foi enviado.', 'info'],
  no_whatsapp: ['Este número não tem WhatsApp.', 'danger'],
  invalid_number: ['Número inválido. Use DDD + número.', 'danger'],
  failed: ['Não foi possível enviar. Verifique se o WhatsApp do sistema está conectado.', 'danger'],
};

export function WhatsAppSettings() {
  const toast = useToast();
  const status = useFetch<Status>('/api/admin/whatsapp');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const s = status.data;

  // Enquanto aguarda conexão (QR na tela / iniciando), atualiza a cada 4 s.
  const waiting = s && ['qr', 'iniciando', 'autenticando', 'desconectado'].includes(s.estado);
  const reload = status.reload;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => reload(), 4000);
    return () => clearInterval(t);
  }, [waiting, reload]);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const r = await api<{ result: string }>('/api/admin/whatsapp/teste', { body: { phone } });
      setResult(r.result);
    } catch (err) {
      toast('danger', (err as ApiError).fields.phone ?? (err as ApiError).message);
    } finally {
      setSending(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o número de WhatsApp do sistema? Será preciso escanear um novo QR Code.')) return;
    await api('/api/admin/whatsapp/sair', { method: 'POST' }).catch(() => {});
    toast('success', 'Número desconectado. Aguarde o novo QR Code.');
    setTimeout(() => status.reload(), 2500);
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <MessageCircle className="h-4 w-4 text-success" aria-hidden />WhatsApp
      </h2>

      {!s ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Verificando…</p>
      ) : !s.configured ? (
        <Alert tone="info" className="mt-3" title="Serviço de WhatsApp não configurado">
          Defina WHATSAPP_URL e WHATSAPP_TOKEN no arquivo .env e inicie o serviço. Enquanto isso, as mensagens são salvas na pasta
          .whatsapp-enviados (desenvolvimento) e o sistema usa o e-mail como reserva. Passo a passo no HOSPEDAGEM.md, seção 10.
        </Alert>
      ) : !s.reachable ? (
        <Alert tone="warning" className="mt-3" title="Serviço de WhatsApp fora do ar">
          {s.erro} Enquanto isso, o sistema usa o e-mail como reserva.
        </Alert>
      ) : s.estado === 'conectado' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone="success" className="text-sm"><CheckCircle2 className="h-4 w-4" aria-hidden />Conectado</Badge>
          <span className="text-sm">+{s.numero}{s.nome ? ` (${s.nome})` : ''}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={disconnect}>Desconectar</Button>
        </div>
      ) : s.estado === 'qr' && s.qr ? (
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>No celular do número que vai <strong>enviar</strong> as mensagens, abra o WhatsApp.</li>
            <li>Toque em <strong>Aparelhos conectados → Conectar um aparelho</strong>.</li>
            <li>Aponte a câmera para o QR Code abaixo.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.qr} alt="QR Code para conectar o WhatsApp do sistema" className="mx-auto h-56 w-56 rounded-lg border border-mist bg-white p-2" />
          <p className="text-center text-xs text-ink-soft">O código muda a cada poucos segundos; esta tela se atualiza sozinha.</p>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {s.estado === 'autenticando' ? 'Conectando e carregando conversas…' : s.estado === 'falha_autenticacao' ? 'Falha na conexão. Desconecte e escaneie o QR Code de novo.' : 'Iniciando o WhatsApp do sistema…'}
          {s.erro && s.estado === 'erro' && <span className="text-danger"> {s.erro}</span>}
        </p>
      )}

      <form onSubmit={sendTest} className="mt-4 space-y-2 border-t border-mist pt-4">
        <Field label="Enviar mensagem de teste para" htmlFor="wa-teste" hint="Use o seu próprio número (com DDD).">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input id="wa-teste" type="tel" className="pl-9" placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" loading={sending} disabled={!phone.trim()}>Enviar teste</Button>
          </div>
        </Field>
        {result && <Alert tone={resultLabels[result]?.[1] ?? 'info'}>{resultLabels[result]?.[0] ?? result}</Alert>}
      </form>

      <p className="mt-4 text-xs text-ink-soft">
        Usa o WhatsApp Web de forma automatizada (whatsapp-web.js), que não é um serviço oficial do WhatsApp. Use um número
        dedicado ao sistema.
      </p>
    </Card>
  );
}
