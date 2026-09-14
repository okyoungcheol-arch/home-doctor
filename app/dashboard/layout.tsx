import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { DashboardNav } from '@/components/DashboardNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.role !== 'manager') {
    redirect('/');
  }
  return (
    <div className="flex flex-col">
      <DashboardNav />
      {children}
    </div>
  );
}
