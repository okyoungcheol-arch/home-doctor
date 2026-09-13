import { redirect } from 'next/navigation';
import { AdminPanel } from '@/components/AdminPanel';
import { getViewer } from '@/lib/server/auth/authorize';

export default async function AdminPage() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    redirect('/');
  }
  return <AdminPanel />;
}
