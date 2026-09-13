import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { ManagerDashboard } from '@/components/ManagerDashboard';

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (viewer.role !== 'manager') {
    redirect('/');
  }
  return <ManagerDashboard />;
}
