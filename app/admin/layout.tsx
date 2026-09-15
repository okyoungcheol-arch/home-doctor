import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    redirect('/');
  }
  return (
    <div className="flex flex-col">
      <AdminNav />
      {children}
    </div>
  );
}
