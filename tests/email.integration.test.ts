/**
 * E-mails: o protocolo e o código de acesso são enviados ao solicitante.
 * O envio real é substituído por um "espião" que guarda as mensagens.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '@/lib/email';

const sent: EmailMessage[] = [];
vi.mock('@/lib/email', () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async (msg: EmailMessage) => {
    sent.push(msg);
    return 'sent';
  }),
  sendTestEmail: vi.fn(),
}));

const { prisma } = await import('@/lib/db');
const { createPublicRequest, decideRequest, lookupProtocol } = await import('@/server/services/requests');
const { escapeHtml } = await import('@/server/emails');
const { makeAdmin, makeRoom, requestInput, resetDb } = await import('./helpers');

beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterAll(() => prisma.$disconnect());

const waitForEmails = async (n: number) => {
  for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 20));
};

describe('e-mail com o protocolo', () => {
  it('envia protocolo e código de acesso ao e-mail informado', async () => {
    const room = await makeRoom({ name: 'Sala Azul' });
    const res = await createPublicRequest(requestInput(room.id, { contactEmail: 'pessoa@exemplo.local', contactPhone: null }));

    expect(res.emailStatus).toBe('sent');
    expect(sent).toHaveLength(1);
    const [msg] = sent;
    expect(msg.to).toBe('pessoa@exemplo.local');
    expect(msg.subject).toContain(res.protocol);
    expect(msg.text).toContain(res.accessCode);
    expect(msg.html).toContain(res.accessCode);
    expect(msg.html).toContain('Sala Azul');
    expect(msg.text).toContain('AGUARDANDO APROVAÇÃO');
    // O código enviado é o mesmo que permite consultar o protocolo.
    expect((await lookupProtocol(res.protocol, res.accessCode)).status).toBe('PENDING');
    // O link de consulta leva o protocolo, mas nunca o código de acesso.
    expect(msg.html).toContain(`/protocolo?protocolo=${res.protocol}`);
    expect(msg.html).not.toContain(`codigo=`);
  });

  it('sem e-mail informado, nada é enviado', async () => {
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactEmail: null }));
    expect(res.emailStatus).toBe('not_requested');
    expect(sent).toHaveLength(0);
  });

  it('avisa o solicitante quando a solicitação é rejeitada', async () => {
    const admin = await makeAdmin();
    const room = await makeRoom();
    const res = await createPublicRequest(requestInput(room.id, { contactEmail: 'pessoa@exemplo.local' }));
    const req = await prisma.reservationRequest.findUniqueOrThrow({ where: { protocol: res.protocol } });
    await decideRequest(req.id, { action: 'reject', reason: 'Sala em manutenção', publicMessage: null }, admin.id);
    await waitForEmails(2);
    expect(sent[1].subject).toContain('não aprovada');
    expect(sent[1].text).toContain('Sala em manutenção');
  });

  it('conteúdo digitado pelo usuário é escapado no HTML', async () => {
    const room = await makeRoom();
    await createPublicRequest(requestInput(room.id, { requesterName: 'Fulano <script>alert(1)</script>', contactEmail: 'p@exemplo.local' }));
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).toContain(escapeHtml('<script>'));
  });
});
