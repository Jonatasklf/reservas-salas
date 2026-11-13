import { Suspense } from 'react';
import { RequestsPage } from '@/components/admin/requests-page';
import { Spinner } from '@/components/ui';
export const metadata = { title: 'Solicitações' };
export default function Page() {
  return <Suspense fallback={<Spinner />}><RequestsPage /></Suspense>;
}
