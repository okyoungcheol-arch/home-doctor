'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Organization = {
  id: string;
  name: string;
};

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

  function loadOrganizations() {
    return fetch('/api/admin/organizations')
      .then((response) =>
        response.json().then((data) => {
          if (!response.ok) throw new Error(data.error ?? '단체 목록을 불러오지 못했습니다.');
          setOrganizations(data.organizations);
          setOrganizationId((current) => current || data.organizations[0]?.id || '');
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
      await loadOrganizations();
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
    </main>
  );
}
