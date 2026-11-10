import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server/auth/authorize';
import { listOrganizations } from '@/lib/server/organizations/repository';
import { DashboardNav } from '@/components/DashboardNav';
import { ActingOrganizationSelect } from '@/components/admin/ActingOrganizationSelect';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.role === 'guest') {
    redirect('/');
  }

  // 관리자는 모든 단체에 대해 매니저 권한을 가지므로, 어느 단체로 행동할지 고르는 콤보를 띄운다.
  const isAdmin = viewer.role === 'admin';
  const organizations = isAdmin
    ? (await listOrganizations()).map((org) => ({ id: org.id, name: org.name }))
    : [];

  return (
    <div className="flex flex-col">
      <DashboardNav isAdmin={isAdmin} />
      {isAdmin && (
        <ActingOrganizationSelect
          organizations={organizations}
          currentOrganizationId={viewer.organizationId}
        />
      )}
      {viewer.organizationId ? (
        // 단체가 바뀌면 key가 바뀌어 하위 화면(회원 목록 등)이 새 단체 기준으로 다시 마운트된다.
        <div key={viewer.organizationId} className="flex flex-col">
          {children}
        </div>
      ) : (
        <p className="mx-auto w-full max-w-3xl p-6 text-sm text-label-alternative">
          단체를 선택하면 해당 단체의 회원을 등록하거나 문진을 시작할 수 있습니다.
        </p>
      )}
    </div>
  );
}
