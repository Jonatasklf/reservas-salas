import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/public/site-header';
import { ProtocolLookup } from '@/components/public/protocol-lookup';

export const metadata: Metadata = { title: 'Consultar protocolo' };
export const dynamic = 'force-dynamic';

export default async function ProtocolPage({ searchParams }: { searchParams: Promise<{ protocolo?: string }> }) {
  const { protocolo } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Consultar solicitação</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Informe o número do protocolo e o código de acesso recebidos ao enviar o pedido.
        </p>
        <ProtocolLookup initialProtocol={(protocolo ?? '').slice(0, 40)} />
      </main>
      <SiteFooter />
    </>
  );
}
