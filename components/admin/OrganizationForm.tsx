'use client';

import { useState, type FormEvent } from 'react';

export function OrganizationForm() {
  const [orgName, setOrgName] = useState('');
  const [orgResult, setOrgResult] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

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

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">단체 생성</h1>
      <form
        onSubmit={handleCreateOrganization}
        className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm"
      >
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="단체 이름"
          required
          className="rounded-8 border border-line-normal p-2 text-sm"
        />
        <button
          type="submit"
          className="self-end rounded-full bg-primary-normal px-4 py-2 text-sm font-medium text-static-white"
        >
          생성
        </button>
        {orgResult && <p className="text-sm text-status-positive">{orgResult}</p>}
        {orgError && <p className="text-sm text-status-negative">{orgError}</p>}
      </form>
    </main>
  );
}
