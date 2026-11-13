import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui';
import { getSettings } from '@/server/services/settings';
import { siteConfig } from '@/config/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  const name = s?.unitName ?? siteConfig.defaultUnitName;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: s?.headerSubtitle ?? siteConfig.defaultSubtitle,
    // Ao adicionar à tela inicial do iPhone, abre como aplicativo.
    appleWebApp: { capable: true, title: name, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#033D60', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
          Pular para o conteúdo
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
