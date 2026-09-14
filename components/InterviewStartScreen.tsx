'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Member } from '@/lib/server/db/schema';
import type { MedicalRecordWithMemberName } from '@/lib/server/records/repository';

type DisplayRecord = Pick<
  MedicalRecordWithMemberName,
  'id' | 'recordDate' | 'memberName' | 'isCritical' | 'notableFindings'
>;

function MemberSelectionList() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectError, setSelectError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/members')
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setMembers(data.members);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  async function handleSelect(memberId: string) {
    setSelectError(null);
    try {
      const response = await fetch('/api/dashboard/select-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? '선택에 실패했습니다.');
      }
      router.push('/');
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : '선택에 실패했습니다.');
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-12 border border-line-normal bg-background-elevated p-6 shadow-sm">
      <h2 className="text-lg font-semibold">회원 선택</h2>
      {status === 'loading' && <p className="text-sm text-label-alternative">불러오는 중입니다...</p>}
      {status === 'error' && <p className="text-sm text-status-negative">회원 목록을 불러오지 못했습니다.</p>}
      {status === 'ready' && members.length === 0 && (
        <p className="text-sm text-label-alternative">등록된 회원이 없습니다.</p>
      )}
      {status === 'ready' && members.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-normal">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => handleSelect(member.id)}
                className="w-full py-2 text-left text-sm hover:text-primary-normal"
              >
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectError && <p className="text-sm text-status-negative">{selectError}</p>}
    </section>
  );
}

function RecordsTable({
  records,
  status,
}: {
  records: DisplayRecord[];
  status: 'loading' | 'ready' | 'error';
}) {
  if (status === 'loading') return <p className="p-6 text-sm text-label-alternative">불러오는 중입니다...</p>;
  if (status === 'error') return <p className="p-6 text-sm text-status-negative">데이터를 불러오지 못했습니다.</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">소속단체 문진 기록</h1>
      {records.length === 0 ? (
        <p className="text-sm text-label-alternative">아직 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-12 border border-line-normal bg-background-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-normal">
                <th className="p-3">일자</th>
                <th className="p-3">회원명</th>
                <th className="p-3">중대성 유무</th>
                <th className="p-3">특이사항</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-line-normal last:border-0">
                  <td className="p-3">{new Date(record.recordDate).toLocaleDateString('ko-KR')}</td>
                  <td className="p-3">{record.memberName}</td>
                  <td className="p-3">
                    {record.isCritical ? (
                      <span className="text-status-negative font-medium">있음</span>
                    ) : (
                      '없음'
                    )}
                  </td>
                  <td className="p-3">{record.notableFindings ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function InterviewStartScreen() {
  const [records, setRecords] = useState<DisplayRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/dashboard/records')
      .then((response) => {
        if (!response.ok) throw new Error('조회에 실패했습니다.');
        return response.json();
      })
      .then((data) => {
        setRecords(data.records);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <MemberSelectionList />
      <RecordsTable records={records} status={status} />
    </main>
  );
}
