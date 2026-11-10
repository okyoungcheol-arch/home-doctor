'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type OrganizationOption = { id: string; name: string };

/**
 * 관리자 전용 — 매니저 화면(/dashboard)에서 어느 단체의 회원을 다룰지 고른다. 선택은 서버 세션에
 * 기록되고, `router.refresh()`로 레이아웃을 다시 렌더링해 새 단체의 회원 목록으로 바꾼다.
 */
export function ActingOrganizationSelect({
  organizations,
  currentOrganizationId,
}: {
  organizations: OrganizationOption[];
  currentOrganizationId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(organizationId: string) {
    if (!organizationId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/select-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? '단체 선택에 실패했습니다.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '단체 선택에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-6 pt-4">
      <label className="flex flex-col gap-1 text-sm">
        단체 선택 (관리자)
        <select
          value={currentOrganizationId ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={pending || organizations.length === 0}
          className="w-full rounded-8 border border-line-normal p-2 text-sm disabled:opacity-50"
        >
          <option value="" disabled>
            {organizations.length === 0 ? '등록된 단체가 없습니다' : '단체를 선택해 주세요'}
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-status-negative">{error}</p>}
    </div>
  );
}
