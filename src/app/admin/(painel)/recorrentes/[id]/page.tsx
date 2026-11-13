import { RecurringDetailPage } from '@/components/admin/recurring-page';
export const metadata = { title: 'Reunião recorrente' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecurringDetailPage id={id} />;
}
