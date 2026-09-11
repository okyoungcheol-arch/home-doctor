'use client';

import { useEffect, useState } from 'react';
import type { MedicalRecord } from '@/lib/server/db/schema';

type DisplayRecord = Pick<
  MedicalRecord,
  'id' | 'recordDate' | 'phoneNumber' | 'isCritical' | 'historicalComparisonNote'
>;

export function ManagerDashboard() {
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

  if (status === 'loading') return <p className="p-6 text-sm text-label-alternative">불러오는 중입니다...</p>;
  if (status === 'error') return <p className="p-6 text-sm text-status-negative">데이터를 불러오지 못했습니다.</p>;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">소속단체 문진 기록</h1>
      {records.length === 0 ? (
        <p className="text-sm text-label-alternative">아직 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-12 border border-line-normal bg-background-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-normal">
                <th className="p-3">일자</th>
                <th className="p-3">전화번호</th>
                <th className="p-3">중대성 유무</th>
                <th className="p-3">과거비교 특이사항</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-line-normal last:border-0">
                  <td className="p-3">{new Date(record.recordDate).toLocaleDateString('ko-KR')}</td>
                  <td className="p-3">{record.phoneNumber}</td>
                  <td className="p-3">
                    {record.isCritical ? (
                      <span className="text-status-negative font-medium">있음</span>
                    ) : (
                      '없음'
                    )}
                  </td>
                  <td className="p-3">{record.historicalComparisonNote ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
