import type { MetadataRoute } from 'next';
import { getSettings } from '@/server/services/settings';

/**
 * Permite "Adicionar à tela inicial" no celular: o sistema abre em tela
 * cheia, como um aplicativo.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings().catch(() => null);
  const name = s?.unitName ?? 'Reservas de Salas';
  return {
    name,
    short_name: name.length > 14 ? 'Reservas' : name,
    description: s?.headerSubtitle ?? 'Agenda de salas de reuniões',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fa',
    theme_color: '#033D60',
    lang: 'pt-BR',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
