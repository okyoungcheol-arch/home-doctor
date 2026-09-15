'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Organization = {
  id: string;
  name: string;
};

type Member = {
  id: string;
  name: string;
  phoneNumber: string;
};

const NOTABLE_FINDING_DISPLAY_LIMIT = 200;

function truncateForDisplay(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function AdminPanel() {
  const [orgName, setOrgName] = useState('');
  const [orgResult, setOrgResult] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);

  const [organizationId, setOrganizationId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [position, setPosition] = useState('');
  const [managerResult, setManagerResult] = useState<string | null>(null);
  const [managerError, setManagerError] = useState<string | null>(null);

  const [statusOrgId, setStatusOrgId] = useState('');
  // orgId를 결과와 함께 묶어 두면, statusOrgId가 바뀐 직후(새 목록이 아직 도착하기 전) 렌더링에서
  // membersState.orgId !== statusOrgId 비교만으로 "로딩 중"을 판단할 수 있다 — effect 본문에서
  // setMembersStatus('loading')처럼 fetch 시작 전에 동기적으로 state를 리셋할 필요가 없어진다.
  const [membersState, setMembersState] = useState<{
    orgId: string;
    status: 'ready' | 'error';
    members: Member[];
  }>({ orgId: '', status: 'ready', members: [] });
  const members = membersState.orgId === statusOrgId ? membersState.members : [];
  const membersStatus = !statusOrgId ? 'idle' : membersState.orgId === statusOrgId ? membersState.status : 'loading';

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  // 다른 단체를 선택해 회원 목록이 바뀌면, 이전에 선택했던 회원 id가 새 목록에는 없을 수 있다 —
  // effect에서 setSelectedMemberId(null)로 동기 리셋하는 대신, "현재 목록에 실제로 있는 회원인가"로
  // 매번 판단한다.
  const validSelectedMemberId = members.some((m) => m.id === selectedMemberId) ? selectedMemberId : null;

  // 마찬가지로 memberId를 결과에 묶어서, 회원을 새로 클릭했을 때 이전 회원의 조회 결과가
  // 순간적으로 화면에 남아있지 않도록 한다(비교로 걸러냄, effect 리셋 불필요).
  const [notableFindingState, setNotableFindingState] = useState<{
    memberId: string;
    status: 'ready' | 'error';
    text: string | null;
    recordDate: string | null;
  } | null>(null);
  const notableFinding =
    notableFindingState?.memberId === validSelectedMemberId
      ? { text: notableFindingState.text, recordDate: notableFindingState.recordDate }
      : null;
  const notableFindingStatus = !validSelectedMemberId
    ? 'idle'
    : notableFindingState?.memberId === validSelectedMemberId
      ? notableFindingState.status
      : 'loading';

  function loadOrganizations() {
    return fetch('/api/admin/organizations')
      .then((response) =>
        response.json().then((data) => {
          if (!response.ok) throw new Error(data.error ?? '단체 목록을 불러오지 못했습니다.');
          setOrganizations(data.organizations);
          setOrganizationId((current) => current || data.organizations[0]?.id || '');
          setStatusOrgId((current) => current || data.organizations[0]?.id || '');
          setOrganizationsError(null);
        }),
      )
      .catch((err) => {
        setOrganizationsError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      })
      .finally(() => {
        setOrganizationsLoading(false);
      });
  }

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function handleCreateOrganization(event: FormEvent) {
    event.preventDefault();
    setOrgError(null);
    setOrgResult(null);
    try {
      const response = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '단체 생성에 실패했습니다.');
      setOrgResult(`생성됨: ${data.organization.name} (ID: ${data.organization.id})`);
      setOrgName('');
      // POST가 이미 새 단체 전체를 응답에 담아 주므로, 목록을 다시 fetch하지 않고 로컬 state에
      // 바로 반영한다(단체 목록이 서버에서 바뀔 다른 경로가 없으므로 재조회와 결과가 동일하다).
      setOrganizations((current) =>
        [...current, data.organization].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      );
      setOrganizationId((current) => current || data.organization.id);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }

  async function handleCreateManager(event: FormEvent) {
    event.preventDefault();
    setManagerError(null);
    setManagerResult(null);
    try {
      const response = await fetch('/api/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, phoneNumber, position }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '매니저 등록에 실패했습니다.');
      setManagerResult(`등록됨: ${data.manager.phoneNumber} (${data.manager.position})`);
      setPhoneNumber('');
      setPosition('');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }

  useEffect(() => {
    if (!statusOrgId) return;
    fetch(`/api/admin/members?organizationId=${encodeURIComponent(statusOrgId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('회원 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => {
        setMembersState({ orgId: statusOrgId, status: 'ready', members: data.members });
      })
      .catch(() => setMembersState({ orgId: statusOrgId, status: 'error', members: [] }));
  }, [statusOrgId]);

  function handleSelectMember(memberId: string) {
    setSelectedMemberId(memberId);
    fetch(`/api/admin/members/notable-finding?memberId=${encodeURIComponent(memberId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('특이사항을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data) => {
        setNotableFindingState({
          memberId,
          status: 'ready',
          text: data.notableFindings,
          recordDate: data.recordDate,
        });
      })
      .catch(() => setNotableFindingState({ memberId, status: 'error', text: null, recordDate: null }));
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">관리자</h1>

      <form onSubmit={handleCreateOrganization} className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">단체 생성</h2>
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="단체 이름"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <button type="submit" className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white">
          생성
        </button>
        {orgResult && <p className="text-sm text-status-positive">{orgResult}</p>}
        {orgError && <p className="text-sm text-status-negative">{orgError}</p>}
      </form>

      <form onSubmit={handleCreateManager} className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">매니저 등록</h2>
        {organizationsLoading ? (
          <p className="text-sm text-label-alternative">단체 목록을 불러오는 중입니다...</p>
        ) : organizationsError ? (
          <p className="text-sm text-status-negative">{organizationsError}</p>
        ) : (
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            required
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
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="전화번호"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <input
          type="text"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="직위 (예: 원장, 간호사)"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <button type="submit" className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white">
          등록
        </button>
        {managerResult && <p className="text-sm text-status-positive">{managerResult}</p>}
        {managerError && <p className="text-sm text-status-negative">{managerError}</p>}
      </form>

      <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">소속단체별 회원현황</h2>
        {organizationsLoading ? (
          <p className="text-sm text-label-alternative">단체 목록을 불러오는 중입니다...</p>
        ) : organizationsError ? (
          <p className="text-sm text-status-negative">{organizationsError}</p>
        ) : (
          <select
            value={statusOrgId}
            onChange={(e) => setStatusOrgId(e.target.value)}
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

        {membersStatus === 'loading' && <p className="text-sm text-label-alternative">회원 목록을 불러오는 중입니다...</p>}
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
                  onClick={() => handleSelectMember(member.id)}
                  className={`w-full py-2 text-left text-sm hover:text-primary-normal ${
                    selectedMemberId === member.id ? 'font-medium text-primary-normal' : ''
                  }`}
                >
                  {member.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {validSelectedMemberId && (
          <div className="rounded-8 border border-line-normal bg-background-normal p-3">
            {notableFindingStatus === 'loading' && (
              <p className="text-sm text-label-alternative">특이사항을 불러오는 중입니다...</p>
            )}
            {notableFindingStatus === 'error' && (
              <p className="text-sm text-status-negative">특이사항을 불러오지 못했습니다.</p>
            )}
            {notableFindingStatus === 'ready' && (
              <>
                {notableFinding?.text ? (
                  <>
                    <p className="text-sm">{truncateForDisplay(notableFinding.text, NOTABLE_FINDING_DISPLAY_LIMIT)}</p>
                    {notableFinding.recordDate && (
                      <p className="mt-1 text-xs text-label-alternative">
                        {new Date(notableFinding.recordDate).toLocaleDateString('ko-KR')} 문진 기준
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-label-alternative">특이사항 기록이 없습니다.</p>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
