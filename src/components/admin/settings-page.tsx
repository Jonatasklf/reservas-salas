'use client';
/**
 * Configurações gerais, logotipo, administradores e troca de senha.
 */
import { useEffect, useRef, useState } from 'react';
import { ImageUp, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { WhatsAppSettings } from './whatsapp-settings';
import { api, ApiError, useFetch } from '@/lib/client';
import { formatDateTime } from '@/lib/time';

interface SettingsDto {
  unitName: string;
  headerSubtitle: string | null;
  footerText: string | null;
  defaultOpenTime: string;
  defaultCloseTime: string;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  showPublicTitles: boolean;
  emailNotifications: boolean;
  notificationEmail: string | null;
  requesterChannel: 'WHATSAPP' | 'EMAIL' | 'BOTH';
  hasLogo: boolean;
  logoUpdatedAt: string | null;
}

export function SettingsPage() {
  const data = useFetch<{ settings: SettingsDto; emailConfigured: boolean }>('/api/admin/settings');
  if (!data.data) return <Spinner />;
  return (
    <>
      <PageHeader title="Configurações" description="Identificação da unidade, regras gerais e acesso administrativo." />
      <div className="grid gap-6 lg:grid-cols-2">
        <GeneralSettings initial={data.data.settings} emailConfigured={data.data.emailConfigured} onSaved={data.reload} />
        <div className="space-y-6">
          <WhatsAppSettings />
          <LogoSettings settings={data.data.settings} onChanged={data.reload} />
          <AdminsSettings />
          <PasswordSettings />
        </div>
      </div>
    </>
  );
}

function GeneralSettings({ initial, emailConfigured, onSaved }: { initial: SettingsDto; emailConfigured: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    ...initial,
    headerSubtitle: initial.headerSubtitle ?? '',
    footerText: initial.footerText ?? '',
    notificationEmail: initial.notificationEmail ?? '',
    minAdvanceMinutes: String(initial.minAdvanceMinutes),
    maxAdvanceDays: String(initial.maxAdvanceDays),
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          unitName: form.unitName, headerSubtitle: form.headerSubtitle || null, footerText: form.footerText || null,
          defaultOpenTime: form.defaultOpenTime, defaultCloseTime: form.defaultCloseTime,
          minAdvanceMinutes: Number(form.minAdvanceMinutes), maxAdvanceDays: Number(form.maxAdvanceDays),
          showPublicTitles: form.showPublicTitles, emailNotifications: form.emailNotifications, notificationEmail: form.notificationEmail || null,
          requesterChannel: form.requesterChannel,
        },
      });
      toast('success', 'Configurações salvas.');
      onSaved();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const fe = error?.fields ?? {};

  return (
    <Card className="p-5">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold">Gerais</h2>
        {error && error.code !== 'VALIDATION' && <Alert tone="danger">{error.message}</Alert>}
        <Field label="Nome da unidade administrativa" htmlFor="cfg-nome" required error={fe.unitName}><Input id="cfg-nome" value={form.unitName} onChange={(e) => set('unitName', e.target.value)} /></Field>
        <Field label="Texto do cabeçalho (subtítulo)" htmlFor="cfg-sub" error={fe.headerSubtitle}><Input id="cfg-sub" value={form.headerSubtitle} onChange={(e) => set('headerSubtitle', e.target.value)} /></Field>
        <Field label="Texto do rodapé" htmlFor="cfg-rod" hint="Ex.: endereço e telefone da secretaria."><Textarea id="cfg-rod" value={form.footerText} onChange={(e) => set('footerText', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Abertura padrão das salas" htmlFor="cfg-abre"><Input id="cfg-abre" type="time" value={form.defaultOpenTime} onChange={(e) => set('defaultOpenTime', e.target.value)} /></Field>
          <Field label="Fechamento padrão" htmlFor="cfg-fecha" error={fe.defaultCloseTime}><Input id="cfg-fecha" type="time" value={form.defaultCloseTime} onChange={(e) => set('defaultCloseTime', e.target.value)} /></Field>
          <Field label="Antecedência mínima (minutos)" htmlFor="cfg-min" hint="Para pedidos públicos." error={fe.minAdvanceMinutes}><Input id="cfg-min" type="number" min={0} value={form.minAdvanceMinutes} onChange={(e) => set('minAdvanceMinutes', e.target.value)} /></Field>
          <Field label="Antecedência máxima (dias)" htmlFor="cfg-max" error={fe.maxAdvanceDays}><Input id="cfg-max" type="number" min={1} value={form.maxAdvanceDays} onChange={(e) => set('maxAdvanceDays', e.target.value)} /></Field>
        </div>
        <Checkbox label="Exibir títulos das reuniões na página pública (quando autorizado em cada reserva)" checked={form.showPublicTitles} onChange={(e) => set('showPublicTitles', e.target.checked)} />
        <div className="space-y-2 rounded-lg border border-mist p-3">
          <Field
            label="Como o solicitante recebe o protocolo e as atualizações"
            htmlFor="cfg-canal"
            hint="Se o canal escolhido falhar ou a pessoa não informar esse contato, o sistema usa o outro."
          >
            <Select id="cfg-canal" value={form.requesterChannel} onChange={(e) => set('requesterChannel', e.target.value as SettingsDto['requesterChannel'])}>
              <option value="WHATSAPP">WhatsApp (e-mail como reserva)</option>
              <option value="EMAIL">E-mail (WhatsApp como reserva)</option>
              <option value="BOTH">WhatsApp e e-mail</option>
            </Select>
          </Field>
        </div>
        <div className="space-y-2 rounded-lg border border-mist p-3">
          <p className="text-sm font-medium">E-mails</p>
          <p className="text-xs text-ink-soft">
            Usado conforme o canal escolhido acima: protocolo, código de acesso e atualizações (aprovação, rejeição etc.).
          </p>
          {emailConfigured ? (
            <p className="text-xs text-success">Servidor de e-mail (SMTP) configurado.</p>
          ) : (
            <p className="text-xs text-warning">Nenhum servidor de e-mail (SMTP) configurado no arquivo .env. O sistema funciona normalmente, mas os e-mails não são enviados (em desenvolvimento, ficam salvos na pasta .emails-enviados). Veja como configurar na seção “E-mail” do HOSPEDAGEM.md.</p>
          )}
          <TestEmailButton />
          <Checkbox label="Avisar a administração por e-mail a cada nova solicitação" checked={form.emailNotifications} onChange={(e) => set('emailNotifications', e.target.checked)} />
          <Field label="E-mail que recebe avisos de novas solicitações" htmlFor="cfg-email" error={fe.notificationEmail}><Input id="cfg-email" type="email" value={form.notificationEmail} onChange={(e) => set('notificationEmail', e.target.value)} /></Field>
        </div>
        <Button type="submit" loading={saving}>Salvar configurações</Button>
      </form>
    </Card>
  );
}

function TestEmailButton() {
  const [state, setState] = useState<{ loading: boolean; message?: string; tone?: 'success' | 'danger' | 'info' }>({ loading: false });
  async function send() {
    setState({ loading: true });
    try {
      const r = await api<{ result: string; error?: string }>('/api/admin/settings/test-email', { method: 'POST' });
      if (r.result === 'sent') setState({ loading: false, tone: 'success', message: 'E-mail de teste enviado para o seu endereço de administrador.' });
      else if (r.result === 'saved') setState({ loading: false, tone: 'info', message: `SMTP não configurado: a mensagem foi salva em ${r.error}` });
      else if (r.result === 'skipped') setState({ loading: false, tone: 'info', message: 'SMTP não configurado: nenhuma mensagem foi enviada.' });
      else setState({ loading: false, tone: 'danger', message: `Falha no envio: ${r.error ?? 'erro desconhecido'}` });
    } catch (e) {
      setState({ loading: false, tone: 'danger', message: (e as ApiError).message });
    }
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" loading={state.loading} onClick={send}>Enviar e-mail de teste</Button>
      {state.message && <Alert tone={state.tone}>{state.message}</Alert>}
    </div>
  );
}

function LogoSettings({ settings, onChanged }: { settings: SettingsDto; onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const form = new FormData();
    form.append('logo', file);
    setBusy(true);
    try {
      await api('/api/admin/settings/logo', { form });
      toast('success', 'Logotipo atualizado.');
      onChanged();
    } catch (e) {
      toast('danger', (e as ApiError).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api('/api/admin/settings/logo', { method: 'DELETE' });
      toast('success', 'Logotipo removido.');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Logotipo</h2>
      <p className="mt-1 text-sm text-ink-soft">PNG, JPG ou WEBP de até 512 KB. Use apenas imagens que você tem autorização para utilizar, sem modificações indevidas.</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-mist bg-canvas">
          {settings.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/public/logo?v=${settings.logoUpdatedAt ?? ''}`} alt="Logotipo atual" className="max-h-14 max-w-24 object-contain" />
          ) : <span className="text-xs text-ink-soft">Sem logotipo</span>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="logo-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="outline" loading={busy} onClick={() => input.current?.click()}><ImageUp className="h-4 w-4" aria-hidden />Enviar imagem</Button>
        {settings.hasLogo && <Button variant="ghost" size="icon" aria-label="Remover logotipo" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </Card>
  );
}

function AdminsSettings() {
  const toast = useToast();
  const list = useFetch<{ admins: { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null }[]; currentId: string }>('/api/admin/admins');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/admin/admins', { body: form });
      setForm({ name: '', email: '', password: '' });
      toast('success', 'Administrador cadastrado.');
      list.reload();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await api(`/api/admin/admins/${id}`, { method: 'PATCH', body: { active } });
      list.reload();
    } catch (err) {
      toast('danger', (err as ApiError).message);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Administradores</h2>
      <ul className="mt-3 divide-y divide-mist/60">
        {list.data?.admins.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{a.name} {a.id === list.data?.currentId && <Badge tone="primary">você</Badge>}</p>
              <p className="text-xs text-ink-soft">{a.email}{a.lastLoginAt ? ` · último acesso ${formatDateTime(a.lastLoginAt)}` : ''}</p>
            </div>
            {!a.active && <Badge>Inativo</Badge>}
            {a.id !== list.data?.currentId && <Button size="sm" variant="outline" onClick={() => toggle(a.id, !a.active)}>{a.active ? 'Desativar' : 'Reativar'}</Button>}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 grid gap-3 border-t border-mist pt-4 sm:grid-cols-2">
        <p className="sm:col-span-2 flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" aria-hidden />Novo administrador</p>
        {error && error.code !== 'VALIDATION' && <div className="sm:col-span-2"><Alert tone="danger">{error.message}</Alert></div>}
        <Field label="Nome" htmlFor="ad-nome" error={error?.fields.name}><Input id="ad-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="E-mail" htmlFor="ad-email" error={error?.fields.email}><Input id="ad-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Senha inicial" htmlFor="ad-senha" error={error?.fields.password} hint="Mín. 8 caracteres, com letras e números." className="sm:col-span-2"><Input id="ad-senha" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Button type="submit" loading={saving}>Cadastrar administrador</Button></div>
      </form>
    </Card>
  );
}

function PasswordSettings() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setError(''), [form]);
  const [revoking, setRevoking] = useState(false);

  async function revokeOthers() {
    setRevoking(true);
    try {
      await api('/api/admin/sessions/revoke', { method: 'POST' });
      toast('success', 'Sessões em outros aparelhos encerradas.');
    } catch (err) {
      toast('danger', (err as ApiError).message);
    } finally {
      setRevoking(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setError('A confirmação não confere com a nova senha.');
    setSaving(true);
    try {
      await api('/api/admin/password', { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      toast('success', 'Senha alterada. Outras sessões abertas foram encerradas.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      const e2 = err as ApiError;
      setError(Object.values(e2.fields)[0] ?? e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4" aria-hidden />Alterar minha senha</h2>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Senha atual" htmlFor="pw-atual"><Input id="pw-atual" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="Nova senha" htmlFor="pw-nova"><Input id="pw-nova" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Field label="Confirmar nova senha" htmlFor="pw-conf"><Input id="pw-conf" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
        <Button type="submit" loading={saving}>Alterar senha</Button>
      </form>
      <div className="mt-5 space-y-2 border-t border-mist pt-4">
        <p className="text-sm font-medium">Sessões em outros aparelhos</p>
        <p className="text-xs text-ink-soft">
          Use se perdeu o celular ou esqueceu o sistema aberto em outro computador. Você continua conectado aqui.
        </p>
        <Button type="button" variant="outline" size="sm" loading={revoking} onClick={revokeOthers}>Encerrar sessões em outros aparelhos</Button>
      </div>
    </Card>
  );
}
