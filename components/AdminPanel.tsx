'use client';

import { useState, type FormEvent } from 'react';

export function AdminPanel() {
  const [orgName, setOrgName] = useState('');
  const [orgResult, setOrgResult] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [organizationId, setOrganizationId] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'org:member' | 'org:admin'>('org:admin');
  const [memberResult, setMemberResult] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

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
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
  }

  async function handleAssignMember(event: FormEvent) {
    event.preventDefault();
    setMemberError(null);
    setMemberResult(null);
    try {
      const response = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, userId, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '역할 지정에 실패했습니다.');
      setMemberResult(`지정됨: ${data.membership.userId} → ${data.membership.role}`);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    }
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

      <form onSubmit={handleAssignMember} className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold">회원 단체 배정 / 매니져 임명</h2>
        <p className="text-sm text-label-alternative">
          대상 회원의 Clerk User ID는 Clerk 대시보드에서 확인할 수 있습니다.
        </p>
        <input
          type="text"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          placeholder="단체 ID (org_...)"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="회원 User ID (user_...)"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'org:member' | 'org:admin')}
          className="rounded-8 border border-line-normal p-2 text-sm"
        >
          <option value="org:admin">매니져</option>
          <option value="org:member">일반 회원</option>
        </select>
        <button type="submit" className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white">
          지정
        </button>
        {memberResult && <p className="text-sm text-status-positive">{memberResult}</p>}
        {memberError && <p className="text-sm text-status-negative">{memberError}</p>}
      </form>
    </main>
  );
}
