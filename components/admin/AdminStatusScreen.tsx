'use client';

import { useEffect, useState } from 'react';
import { formatPhoneNumber } from '@/lib/phone';

type Organization = { id: string; name: string };
type Member = { id: string; name: string };
type ManagerRow = { id: string; phoneNumber: string; position: string };

type PopupState = {
  title: string;
  status: 'loading' | 'ready' | 'error';
  isMember: boolean;
  notableFindings: string | null;
  recordDate: string | null;
};

const NOTABLE_FINDING_DISPLAY_LIMIT = 200;

function truncateForDisplay(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function AdminStatusScreen() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsStatus, setOrganizationsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    fetch('/api/admin/organizations')
      .then((response) => {
        if (!response.ok) throw new Error('단체 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => {
        setOrganizations(data.organizations);
        setOrgId((current) => current || data.organizations[0]?.id || '');
        setOrganizationsStatus('ready');
      })
      .catch(() => setOrganizationsStatus('error'));
  }, []);

  // orgId를 결과와 함께 묶어서, 단체를 바꾼 직후(새 목록이 아직 안 왔을 때) "로딩 중"을 파생시킨다
  // — effect 본문에서 동기적으로 상태를 리셋할 필요가 없다(InterviewStartScreen과 동일한 패턴).
  const [membersState, setMembersState] = useState<{
    orgId: string;
    status: 'ready' | 'error';
    members: Member[];
  }>({ orgId: '', status: 'ready', members: [] });
  const members = membersState.orgId === orgId ? membersState.members : [];
  const membersStatus = !orgId ? 'idle' : membersState.orgId === orgId ? membersState.status : 'loading';

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/admin/members?organizationId=${encodeURIComponent(orgId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('회원 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => setMembersState({ orgId, status: 'ready', members: data.members }))
      .catch(() => setMembersState({ orgId, status: 'error', members: [] }));
  }, [orgId]);

  const [managersState, setManagersState] = useState<{
    orgId: string;
    status: 'ready' | 'error';
    managers: ManagerRow[];
  }>({ orgId: '', status: 'ready', managers: [] });
  const managerList = managersState.orgId === orgId ? managersState.managers : [];
  const managersStatus = !orgId ? 'idle' : managersState.orgId === orgId ? managersState.status : 'loading';

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/admin/managers?organizationId=${encodeURIComponent(orgId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('매니저 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => setManagersState({ orgId, status: 'ready', managers: data.managers }))
      .catch(() => setManagersState({ orgId, status: 'error', managers: [] }));
  }, [orgId]);

  const [popup, setPopup] = useState<PopupState | null>(null);

  function openMemberPopup(member: Member) {
    const title = `${member.name}님 특이사항`;
    setPopup({ title, status: 'loading', isMember: true, notableFindings: null, recordDate: null });
    fetch(`/api/admin/members/notable-finding?memberId=${encodeURIComponent(member.id)}`)
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setPopup({ title, status: 'ready', isMember: true, notableFindings: data.notableFindings, recordDate: data.recordDate });
      })
      .catch(() => setPopup((current) => (current ? { ...current, status: 'error' } : current)));
  }

  function openManagerPopup(manager: ManagerRow) {
    const title = `${manager.position} (${formatPhoneNumber(manager.phoneNumber)})님 특이사항`;
    setPopup({ title, status: 'loading', isMember: true, notableFindings: null, recordDate: null });
    fetch(`/api/admin/managers/notable-finding?managerId=${encodeURIComponent(manager.id)}`)
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setPopup({
          title,
          status: 'ready',
          isMember: data.isMember,
          notableFindings: data.notableFindings,
          recordDate: data.recordDate,
        });
      })
      .catch(() => setPopup((current) => (current ? { ...current, status: 'error' } : current)));
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">단체별 조회</h1>

      <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        {organizationsStatus === 'loading' && (
          <p className="text-sm text-label-alternative">단체 목록을 불러오는 중입니다...</p>
        )}
        {organizationsStatus === 'error' && (
          <p className="text-sm text-status-negative">단체 목록을 불러오지 못했습니다.</p>
        )}
        {organizationsStatus === 'ready' && (
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="rounded-8 border border-line-normal p-2 text-sm"
          >
            {organizations.length === 0 && <option value="">등록된 단체가 없습니다</option>}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">회원</h2>
        {membersStatus === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
        {membersStatus === 'error' && <p className="text-sm text-status-negative">회원 목록을 불러오지 못했습니다.</p>}
        {membersStatus === 'ready' && members.length === 0 && (
          <p className="text-sm text-label-alternative">등록된 회원이 없습니다.</p>
        )}
        {membersStatus === 'ready' && members.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-normal">
            {members.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => openMemberPopup(member)}
                  className="w-full py-2 text-left text-sm hover:text-primary-normal"
                >
                  {member.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">매니저</h2>
        {managersStatus === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
        {managersStatus === 'error' && <p className="text-sm text-status-negative">매니저 목록을 불러오지 못했습니다.</p>}
        {managersStatus === 'ready' && managerList.length === 0 && (
          <p className="text-sm text-label-alternative">등록된 매니저가 없습니다.</p>
        )}
        {managersStatus === 'ready' && managerList.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-normal">
            {managerList.map((manager) => (
              <li key={manager.id}>
                <button
                  type="button"
                  onClick={() => openManagerPopup(manager)}
                  className="w-full py-2 text-left text-sm hover:text-primary-normal"
                >
                  {manager.position} ({formatPhoneNumber(manager.phoneNumber)})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPopup(null)}
        >
          <div
            className="w-full max-w-sm rounded-12 bg-background-elevated p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{popup.title}</h3>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="text-xs text-label-alternative underline"
              >
                닫기
              </button>
            </div>
            <div className="mt-3">
              {popup.status === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
              {popup.status === 'error' && <p className="text-sm text-status-negative">조회에 실패했습니다.</p>}
              {popup.status === 'ready' && !popup.isMember && (
                <p className="text-sm text-label-alternative">등록된 회원이 아닙니다.</p>
              )}
              {popup.status === 'ready' && popup.isMember && (
                <>
                  {popup.notableFindings ? (
                    <>
                      <p className="text-sm">
                        {truncateForDisplay(popup.notableFindings, NOTABLE_FINDING_DISPLAY_LIMIT)}
                      </p>
                      {popup.recordDate && (
                        <p className="mt-1 text-xs text-label-alternative">
                          {new Date(popup.recordDate).toLocaleDateString('ko-KR')} 문진 기준
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-label-alternative">특이사항 기록이 없습니다.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
