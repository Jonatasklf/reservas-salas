import { SiteFooter, SiteHeader } from '@/components/public/site-header';
import { PublicHome } from '@/components/public/public-home';
import { getSettings, publicSettings } from '@/server/services/settings';
import { listEquipment } from '@/server/services/rooms';
import { todayString } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [settings, equipment] = await Promise.all([getSettings(), listEquipment()]);
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6">
        <PublicHome
          today={todayString()}
          settings={publicSettings(settings)}
          equipment={equipment.map((e) => ({ id: e.id, key: e.key, name: e.name }))}
        />
      </main>
      <SiteFooter />
    </>
  );
}
