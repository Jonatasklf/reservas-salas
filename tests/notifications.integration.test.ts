/**
 * Avisos ao solicitante: protocolo por WhatsApp e/ou e-mail, conforme o canal
 * escolhido em Configurações, com o outro canal como reserva.
 * O envio real é substituído por "espiões" que guardam as mensagens.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '@/lib/email';

const emails: EmailMessage[] = [];
const whats: { phone: string; text: string }[] = [];
let whatsappResult: 'sent' | 'failed' | 'no_whatsapp' = 'sent';

vi.mock('@/lib/email', () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async (msg: EmailMessage) => {
    emails.push(msg);
    return 'sent';
  }),
  sendTestEmail: vi.fn(),
}));

vi.mock('@/lib/whatsapp', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/whatsapp')>();
  return {
    ...real,
    sendWhatsApp: vi.fn(async (phone: string, text: string) => {
      whats.push({ phone, text });
      return whatsappResult;
    }),
  };
});

const { prisma } = await import('@/lib/db');
const { createPublicRequest, decideRequest, lookupProtocol } = await import('@/server/services/requests');
const { escapeHtml } = await import('@/server/emails');
const { normalizePhoneBR, formatPhoneBR } = await import('@/lib/whatsapp');
const { channelPlan } = await import('@/server/notifications');
const { makeAdmin, makeRoom, requestInput, resetDb } = await import('./helpers');

const setChannel = (requesterChannel: 'WHATSAPP' | 'EMAIL' | 'BOTH') =>
  prisma.settings.upsert({ where: { id: 1 }, update: { requesterChannel }, create: { id: 1, requesterChannel } });

beforeEach(async () => {
  emails.length = 0;
  whats.length = 0;
  whatsappResult = 'sent';
  await resetDb();
});
afterAll(() => prisma.$disconnect());

const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 60 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
};

describe('protocolo por WhatsApp (canal padrão)', () => {
  it('envia protocolo e código pelo WhatsApp; não envia e-mail', async () => {
    const room = await makeRoom({ name: 'Sala Azul' });
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '(11) 91234-5678', contactEmail: 'p@exemplo.local' }));

    expect(whats).toHaveLength(1);
    expect(emails).toHaveLength(0);
    expect(whats[0].phone).toBe('5511912345678');
    expect(whats[0].text).toContain(res.protocol);
    expect(whats[0].text).toContain(res.accessCode);
    expect(whats[0].text).toContain('Sala Azul');
    expect(whats[0].text).toContain('aguardando aprovação');
    expect(res.delivery).toMatchObject({ whatsapp: 'sent', email: 'not_attempted', phone: '(11) 91234-5678' });
    // O código enviado é o que permite consultar o protocolo.
    expect((await lookupProtocol(res.protocol, res.accessCode)).status).toBe('PENDING');
    // O link leva o protocolo, nunca o código.
    expect(whats[0].text).toContain(`/protocolo?protocolo=${res.protocol}`);
    expect(whats[0].text).not.toContain('codigo=');
  });

  it('se o WhatsApp falhar, usa o e-mail como reserva', async () => {
    whatsappResult = 'failed';
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: 'p@exemplo.local' }));
    expect(whats).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(emails[0].text).toContain(res.accessCode);
    expect(res.delivery).toMatchObject({ whatsapp: 'failed', email: 'sent', email_address: 'p@exemplo.local' });
  });

  it('se o número não tiver WhatsApp, usa o e-mail', async () => {
    whatsappResult = 'no_whatsapp';
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '(11) 3333-4444', contactEmail: 'p@exemplo.local' }));
    expect(res.delivery.email).toBe('sent');
  });

  it('sem telefone, envia por e-mail', async () => {
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: null, contactEmail: 'p@exemplo.local' }));
    expect(whats).toHaveLength(0);
    expect(emails).toHaveLength(1);
    expect(res.delivery.email).toBe('sent');
  });

  it('WhatsApp falhou e não há e-mail: a tela avisa para anotar o protocolo', async () => {
    whatsappResult = 'failed';
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: null }));
    expect(res.delivery).toMatchObject({ whatsapp: 'failed', email: 'not_attempted' });
  });

  it('atualização (rejeição) também vai pelo WhatsApp', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678' }));
    const req = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: res.protocol } });
    await decideRequest(req.id, { action: 'reject', reason: 'Sala em manutenção', publicMessage: null }, admin.id);
    await waitFor(() => whats.length >= 2);
    expect(whats[1].text).toContain('não aprovada');
    expect(whats[1].text).toContain('Sala em manutenção');
  });
});

describe('outros canais', () => {
  it('canal E-MAIL: envia por e-mail mesmo havendo telefone', async () => {
    await setChannel('EMAIL');
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: 'p@exemplo.local' }));
    expect(emails).toHaveLength(1);
    expect(whats).toHaveLength(0);
    expect(emails[0].html).toContain(res.accessCode);
  });

  it('canal E-MAIL sem e-mail informado: usa o WhatsApp como reserva', async () => {
    await setChannel('EMAIL');
    const room = await makeRoom();
    await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: null }));
    expect(whats).toHaveLength(1);
  });

  it('canal AMBOS: envia pelos dois', async () => {
    await setChannel('BOTH');
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactPhone: '11912345678', contactEmail: 'p@exemplo.local' }));
    expect(whats).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(res.delivery).toMatchObject({ whatsapp: 'sent', email: 'sent' });
  });

  it('ordem de tentativa por canal', () => {
    expect(channelPlan('WHATSAPP')).toEqual({ order: ['whatsapp', 'email'], both: false });
    expect(channelPlan('EMAIL')).toEqual({ order: ['email', 'whatsapp'], both: false });
    expect(channelPlan('BOTH').both).toBe(true);
  });
});

describe('conteúdo e números', () => {
  it('normaliza telefones brasileiros', () => {
    expect(normalizePhoneBR('(11) 91234-5678')).toBe('5511912345678');
    expect(normalizePhoneBR('11 3333-4444')).toBe('551133334444');
    expect(normalizePhoneBR('+55 (21) 99876-5432')).toBe('5521998765432');
    expect(normalizePhoneBR('005511912345678')).toBe('5511912345678');
    expect(normalizePhoneBR('12345')).toBeNull();
    expect(normalizePhoneBR('(01) 91234-5678')).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
    expect(formatPhoneBR('5511912345678')).toBe('(11) 91234-5678');
  });

  it('texto digitado pelo usuário não quebra a formatação do WhatsApp nem o HTML do e-mail', async () => {
    await setChannel('BOTH');
    const room = await makeRoom();
    await createPublicRequest(
      // A saudação usa o primeiro nome: o conteúdo malicioso está nele.
      requestInput(room.id, { requesterName: '*Negrito*<script>x</script> Silva', contactPhone: '11912345678', contactEmail: 'p@exemplo.local' }),
    );
    expect(whats[0].text).toContain('A paz de Deus, Irmão(a)');
    expect(whats[0].text).not.toContain('*Negrito*');
    expect(emails[0].html).not.toContain('<script>');
    expect(emails[0].html).toContain(escapeHtml('<script>'));
  });
});
